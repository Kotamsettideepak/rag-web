import { memo, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Composer } from "../components/ui/Composer";
import { MessageList } from "../components/ui/MessageList";
import {
  clearContext,
  createChatSocket,
  createUploadStatusSocket,
  sendVoiceChat,
  uploadFiles,
  uploadYouTubeUrl,
} from "../requests/chat";
import type {
  ChatStreamEvent,
  ChatMessage,
  JobStatus,
  UploadedAsset,
  UploadStatusResponse,
  UploadStatusStreamEvent,
} from "../types/chat";
import { acceptedFileTypes, inferAttachmentKind } from "../utils/files";

function createAsset(file: File): UploadedAsset {
  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    kind: inferAttachmentKind(file),
    status: "local",
  };
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    state: "complete",
  };
}

function createPendingAssistantMessage(copy = ""): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: copy,
    createdAt: new Date().toISOString(),
    state: "pending",
  };
}

function buildStatusText(
  status: Pick<UploadStatusResponse, "status" | "stage" | "error" | "summary"> | null,
  fallback: string,
) {
  if (!status) {
    return fallback;
  }

  if (status.summary?.trim()) {
    return status.summary;
  }

  switch (status.stage) {
    case "queued":
      return "Queued. Waiting to start processing.";
    case "processing":
      return "Preparing your files for AI processing.";
    case "extracting":
      return "Extracting data from your files.";
    case "downloading":
      return "Downloading and preparing the video audio.";
    case "transcribing":
      return "Transcribing audio into searchable text.";
    case "chunking":
      return "Normalizing and organizing the extracted content.";
    case "embedding":
      return "Creating embeddings for semantic search.";
    case "storing":
      return "Saving everything to the vector database.";
    case "completed":
      return "Your files are ready. You can start chatting now.";
    case "failed":
      return status.error || "Processing failed.";
    default:
      break;
  }

  if (status.status === "failed") {
    return status.error || "Processing failed.";
  }

  if (status.status === "completed") {
    return "Your files are ready. You can start chatting now.";
  }

  return "Processing your files.";
}

export const ChatWorkspacePage = memo(function ChatWorkspacePage() {
  const [uploads, setUploads] = useState<UploadedAsset[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [youtubeUrl, setYouTubeUrl] = useState("");
  const [remoteSourceLabel, setRemoteSourceLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const uploadSocketRef = useRef<WebSocket | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceDeadlineRef = useRef<number | null>(null);
  const hasDetectedSpeechRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);

  const hasSource = uploads.length > 0 || remoteSourceLabel.trim().length > 0;
  const isChatReady = jobStatus === "completed";
  const isProcessing = jobStatus === "queued" || jobStatus === "processing";

  useEffect(() => {
    document.title = "RAG-AI";
  }, []);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      stopVoiceCapture();
      stopPlaybackAudio();
      voiceAbortRef.current?.abort();
      chatSocketRef.current?.close();
      uploadSocketRef.current?.close();
      chatSocketRef.current = null;
      uploadSocketRef.current = null;
    };
  }, []);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function resetLocalState() {
    stopVoiceCapture();
    stopPlaybackAudio();
    voiceAbortRef.current?.abort();
    chatSocketRef.current?.close();
    uploadSocketRef.current?.close();
    chatSocketRef.current = null;
    uploadSocketRef.current = null;
    activeAssistantMessageIdRef.current = null;
    setUploads([]);
    setRemoteSourceLabel("");
    setMessages([]);
    setDraft("");
    setJobStatus(null);
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const selectedFiles = Array.from(fileList);
    const firstKind = inferAttachmentKind(selectedFiles[0]);
    const sameKindFiles = selectedFiles.filter(
      (file) => inferAttachmentKind(file) === firstKind,
    );
    const skippedCount = selectedFiles.length - sameKindFiles.length;

    resetLocalState();
    setUploads(sameKindFiles.map(createAsset));
    setRemoteSourceLabel("");

    if (skippedCount > 0) {
      setFeedback(
        `Kept ${sameKindFiles.length} ${firstKind} file${sameKindFiles.length === 1 ? "" : "s"} and skipped ${skippedCount} mismatched file${skippedCount === 1 ? "" : "s"}.`,
      );
      return;
    }

    setFeedback(
      `${sameKindFiles.length} file${sameKindFiles.length === 1 ? "" : "s"} selected. Submit to start background processing.`,
    );
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFilesSelected(event.target.files);
    event.target.value = "";
  }

  async function clearWorkspace() {
    if (!hasSource || isSubmitting || isSending) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("Clearing saved context...");

    try {
      const response = await clearContext();
      resetLocalState();
      setYouTubeUrl("");
      setFeedback(response.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear saved context.";
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUploadSubmit() {
    if (uploads.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("Uploading files...");
    setUploads((current) =>
      current.map((upload) => ({ ...upload, status: "uploading" })),
    );
    setMessages([]);

    try {
      const response = await uploadFiles(uploads.map((upload) => upload.file));
      setJobStatus(response.status);
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "processing" })),
      );
      setFeedback(buildStatusText(response, "Upload accepted. Live processing updates connected."));
      connectUploadStatusSocket(response.job_id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed. Please try again.";
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "failed" })),
      );
      setJobStatus("failed");
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChatSubmit() {
    const question = draft.trim();
    if (!question || isSending || !isChatReady) {
      return;
    }

    setDraft("");
    setIsSending(true);
    setMessages((current) => [
      ...current,
      createMessage("user", question),
      createPendingAssistantMessage(),
    ]);

    try {
      await sendQuestionOverSocket(question);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat request failed. Please try again.";
      setMessages((current) => [
        ...current,
        createMessage("assistant", `Request failed: ${message}`),
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleYouTubeSubmit() {
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl || isSubmitting || isSending || isProcessing) {
      return;
    }

    resetLocalState();
    setRemoteSourceLabel(trimmedUrl);
    setJobStatus("queued");
    setIsSubmitting(true);
    setFeedback("Submitting YouTube link...");

    try {
      const response = await uploadYouTubeUrl(trimmedUrl);
      setJobStatus(response.status);
      setFeedback(buildStatusText(response, "Processing YouTube video..."));
      connectUploadStatusSocket(response.job_id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "YouTube processing failed. Please try again.";
      setJobStatus("failed");
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVoiceToggle() {
    if (!isChatReady) {
      return;
    }

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    stopPlaybackAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      hasDetectedSpeechRef.current = false;
      silenceDeadlineRef.current = null;

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", () => {
        const recordedBlob = new Blob(recordedChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        stopVoiceCapture();
        void handleVoiceSubmit(recordedBlob);
      });

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);
      setupSilenceDetection(stream);
      setIsRecording(true);
      setFeedback("Listening... pause for 3 seconds to send automatically.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to access microphone.";
      setFeedback(message);
    }
  }

  async function handleVoiceSubmit(audioBlob: Blob) {
    if (audioBlob.size === 0) {
      setFeedback("Recorded audio was empty.");
      return;
    }

    setIsSending(true);
    setFeedback("Transcribing and answering...");
    const controller = new AbortController();
    voiceAbortRef.current = controller;
    setMessages((current) => [...current, createPendingAssistantMessage()]);

    try {
      const response = await sendVoiceChat(audioBlob, controller.signal);
      setMessages((current) => {
        const nextMessages = [...current];
        const pendingIndex = nextMessages.findIndex(
          (message) => message.role === "assistant" && message.state === "pending",
        );
        if (pendingIndex >= 0) {
          nextMessages.splice(pendingIndex, 1);
        }
        return [
          ...nextMessages,
          createMessage("user", response.transcript),
          createMessage("assistant", response.answer),
        ];
      });

      if (response.audio_base64) {
        stopPlaybackAudio();
        const audio = new Audio(
          `data:${response.audio_mime_type};base64,${response.audio_base64}`,
        );
        currentAudioRef.current = audio;
        audio.addEventListener("ended", () => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null;
          }
        });
        void audio.play();
      }

      setFeedback("Voice response ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Voice chat failed. Please try again.";
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((current) =>
          current.filter((message) => !(message.role === "assistant" && message.state === "pending")),
        );
        setFeedback("Voice request interrupted. Listening again.");
        return;
      }
      setMessages((current) => {
        const nextMessages = current.filter(
          (entry) => !(entry.role === "assistant" && entry.state === "pending"),
        );
        return [...nextMessages, createMessage("assistant", `Voice request failed: ${message}`)];
      });
      setFeedback(message);
    } finally {
      voiceAbortRef.current = null;
      setIsSending(false);
    }
  }

  function setupSilenceDetection(stream: MediaStream) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const samples = new Uint8Array(analyser.fftSize);
    const silenceGapMs = 3000;
    const speechThreshold = 0.02;

    const inspect = () => {
      const currentAnalyser = analyserRef.current;
      if (!currentAnalyser || !mediaRecorderRef.current) {
        return;
      }

      currentAnalyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const rms = Math.sqrt(sumSquares / samples.length);
      const now = Date.now();
      if (rms > speechThreshold) {
        hasDetectedSpeechRef.current = true;
        silenceDeadlineRef.current = now + silenceGapMs;
      } else if (
        hasDetectedSpeechRef.current &&
        silenceDeadlineRef.current !== null &&
        now >= silenceDeadlineRef.current
      ) {
        mediaRecorderRef.current.stop();
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(inspect);
    };

    silenceDeadlineRef.current = Date.now() + silenceGapMs;
    animationFrameRef.current = window.requestAnimationFrame(inspect);
  }

  function stopVoiceCapture() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    mediaRecorderRef.current = null;
    hasDetectedSpeechRef.current = false;
    silenceDeadlineRef.current = null;
    setIsRecording(false);
  }

  function stopPlaybackAudio() {
    if (!currentAudioRef.current) {
      return;
    }

    currentAudioRef.current.pause();
    currentAudioRef.current.currentTime = 0;
    currentAudioRef.current = null;
  }

  function ensureSocket(): Promise<WebSocket> {
    const existing = chatSocketRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      return Promise.resolve(existing);
    }

    if (existing && existing.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        const handleOpen = () => {
          existing.removeEventListener("open", handleOpen);
          existing.removeEventListener("error", handleError);
          resolve(existing);
        };
        const handleError = () => {
          existing.removeEventListener("open", handleOpen);
          existing.removeEventListener("error", handleError);
          reject(new Error("WebSocket connection failed."));
        };
        existing.addEventListener("open", handleOpen);
        existing.addEventListener("error", handleError, { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const socket = createChatSocket({
        onOpen: () => {
          setFeedback("Live chat connected.");
          resolve(socket);
        },
        onMessage: handleSocketMessage,
        onClose: () => {
          chatSocketRef.current = null;
        },
        onError: () => {
          reject(new Error("WebSocket connection failed."));
        },
      });

      chatSocketRef.current = socket;
    });
  }

  function handleSocketMessage(event: ChatStreamEvent) {
    if (event.type === "start") {
      setMessages((current) => {
        const nextMessages = [...current];
        const pendingIndex = nextMessages.findIndex(
          (message) => message.role === "assistant" && message.state === "pending",
        );

        if (pendingIndex >= 0) {
          nextMessages[pendingIndex] = {
            ...nextMessages[pendingIndex],
            content: "",
            state: "streaming",
          };
          activeAssistantMessageIdRef.current = nextMessages[pendingIndex].id;
          return nextMessages;
        }

        const assistantMessage = createMessage("assistant", "");
        assistantMessage.state = "streaming";
        activeAssistantMessageIdRef.current = assistantMessage.id;
        return [...nextMessages, assistantMessage];
      });
      return;
    }

    if (event.type === "chunk") {
      const targetId = activeAssistantMessageIdRef.current;
      if (!targetId) {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === targetId
            ? {
                ...message,
                content: message.content + (event.content || ""),
                state: "streaming",
              }
            : message,
        ),
      );
      return;
    }

    if (event.type === "done") {
      const targetId = activeAssistantMessageIdRef.current;
      activeAssistantMessageIdRef.current = null;
      setIsSending(false);
      setFeedback("Response streamed successfully.");

      if (!targetId) {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === targetId
            ? {
                ...message,
                content: event.answer || message.content,
                state: "complete",
              }
            : message,
        ),
      );
      return;
    }

    if (event.type === "error") {
      activeAssistantMessageIdRef.current = null;
      setIsSending(false);
      const errorMessage = event.message || "Streaming failed.";
      setFeedback(errorMessage);
      setMessages((current) => [
        ...current.filter(
          (message) => !(message.role === "assistant" && message.state === "pending"),
        ),
        createMessage("assistant", `Request failed: ${errorMessage}`),
      ]);
    }
  }

  async function sendQuestionOverSocket(question: string) {
    const socket = await ensureSocket();
    socket.send(
      JSON.stringify({
        type: "question",
        question,
      }),
    );
  }

  function connectUploadStatusSocket(nextJobId: string) {
    uploadSocketRef.current?.close();

    const socket = createUploadStatusSocket(nextJobId, {
      onOpen: () => {
        setFeedback("Connecting to live processing updates...");
      },
      onMessage: handleUploadSocketMessage,
      onClose: () => {
        uploadSocketRef.current = null;
      },
      onError: () => {
        setFeedback("Live upload status connection failed.");
        setJobStatus("failed");
        setUploads((current) =>
          current.map((upload) => ({ ...upload, status: "failed" })),
        );
      },
    });

    uploadSocketRef.current = socket;
  }

  function handleUploadSocketMessage(event: UploadStatusStreamEvent) {
    setJobStatus(event.status);
    setFeedback(buildStatusText(event, "Processing upload..."));

    if (event.status === "completed") {
      uploadSocketRef.current?.close();
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "ready" })),
      );
      return;
    }

    if (event.status === "failed") {
      uploadSocketRef.current?.close();
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "failed" })),
      );
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          `Upload failed: ${event.error || "Unknown error."}`,
        ),
      ]);
      return;
    }

    setUploads((current) =>
      current.map((upload) => ({ ...upload, status: "processing" })),
    );
  }

  return (
    <div className="app-shell">
      <div className="chat-layout">
        <header className="workspace-header">
          <div>
            <p className="workspace-label">RAG-AI</p>
            <h1>Upload, process, chat</h1>
          </div>

          <div className="workspace-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={openFilePicker}
              disabled={isSubmitting || isSending}
            >
              {uploads.length > 0 ? "Replace files" : "Choose files"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void clearWorkspace()}
              disabled={!hasSource || isSubmitting || isSending}
            >
              Clear
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleUploadSubmit()}
              disabled={
                uploads.length === 0 || isSubmitting || isSending || isProcessing
              }
            >
              {isSubmitting ? "Submitting..." : isProcessing ? "Processing..." : "Submit"}
            </button>
          </div>
        </header>

        <section className="youtube-input-row">
          <input
            type="url"
            className="youtube-input"
            placeholder="Paste a YouTube link"
            value={youtubeUrl}
            onChange={(event) => setYouTubeUrl(event.target.value)}
            disabled={isSubmitting || isSending || isProcessing}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleYouTubeSubmit()}
            disabled={!youtubeUrl.trim() || isSubmitting || isSending || isProcessing}
          >
            {isSubmitting && remoteSourceLabel ? "Processing..." : "Process Video"}
          </button>
        </section>

        <section className="uploaded-files-bar">
          <div className="uploaded-files-top">
            <div className="uploaded-files-title">
              {isChatReady ? "Uploaded files" : "Selected files"}
            </div>
            {jobStatus ? (
              <span className={`status-pill ${jobStatus}`}>{jobStatus}</span>
            ) : null}
          </div>

          {uploads.length > 0 ? (
            <div className="uploaded-file-list">
              {uploads.map((upload) => (
                <span key={upload.id} className="file-pill">
                  {upload.name}
                </span>
              ))}
            </div>
          ) : remoteSourceLabel ? (
            <div className="uploaded-file-list">
              <span className="file-pill">{remoteSourceLabel}</span>
            </div>
          ) : (
            <p className="uploaded-files-empty">No files selected yet.</p>
          )}
        </section>

        {feedback ? <p className="status-text">{feedback}</p> : null}

        <section className="chat-panel">
          <div className="chat-scroll" ref={conversationRef}>
            <MessageList
              messages={messages}
              hasUploads={hasSource}
              isReady={isChatReady}
              isProcessing={isProcessing}
            />
          </div>

          {isChatReady ? (
            <Composer
              value={draft}
              isSending={isSending}
              isDisabled={!isChatReady}
              isRecording={isRecording}
              onChange={setDraft}
              onSubmit={() => void handleChatSubmit()}
              onVoiceToggle={() => void handleVoiceToggle()}
            />
          ) : (
            <div className={`processing-gate ${isProcessing ? "active" : ""}`}>
              <div className="processing-indicator" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="processing-copy">
                <strong>
                  {isProcessing
                    ? "Building your RAG knowledge base..."
                    : "Upload files to unlock chat."}
                </strong>
                <span>
                  {isProcessing
                    ? feedback || "We are extracting data, organizing it, creating embeddings, and saving it to the database."
                    : "Once processing finishes, the chat input will appear here."}
                </span>
              </div>
            </div>
          )}
        </section>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden-input"
          accept={acceptedFileTypes}
          multiple
          onChange={handleInputChange}
        />
      </div>
    </div>
  );
});
