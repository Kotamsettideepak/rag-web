import { memo, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../auth/googleAuth";
import { Composer } from "../components/ui/Composer";
import { MessageList } from "../components/ui/MessageList";
import {
  createChat,
  createChatSocket,
  createUploadStatusSocket,
  deleteChat,
  getChatMessages,
  getChatUploads,
  listChats,
  sendVoiceChat,
  uploadFiles,
  uploadYouTubeUrl,
} from "../requests/chat";
import type {
  ChatMessage,
  ChatStreamEvent,
  ChatSummary,
  JobStatus,
  SavedUpload,
  StoredMessage,
  UploadedAsset,
  UploadFilesResponse,
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

function mapStoredMessage(message: StoredMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    state: "complete",
  };
}

function buildStatusText(
  status: Pick<UploadStatusResponse, "status" | "stage" | "error" | "summary" | "detail"> | null,
  fallback: string,
) {
  if (!status) {
    return fallback;
  }

  if (status.detail?.trim()) {
    return status.detail;
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
      return fallback;
  }
}

function formatStageTitle(stage?: string) {
  switch (stage) {
    case "queued":
      return "Queued";
    case "processing":
      return "Preparing";
    case "extracting":
      return "Extracting";
    case "downloading":
      return "Downloading Video";
    case "transcribing":
      return "Transcribing Audio";
    case "chunking":
      return "Building Chunks";
    case "embedding":
      return "Generating Embeddings";
    case "storing":
      return "Saving to Vector DB";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Processing";
  }
}

function toInitialJobSnapshot(response: UploadFilesResponse): UploadStatusResponse {
  const now = new Date().toISOString();
  return {
    job_id: response.job_id,
    status: response.status,
    stage: response.stage,
    created_at: now,
    updated_at: now,
    file_count: response.files.length,
    files: response.files,
    summary: response.summary ?? response.message,
    detail: response.detail,
    current_file: response.current_file,
    current_kind: response.current_kind,
    progress_label: response.progress_label,
    progress_percent: response.progress_percent,
    metrics: response.metrics,
  };
}

export const ChatWorkspacePage = memo(function ChatWorkspacePage() {
  const { user, isReady, isAuthenticated, googleClientId, renderGoogleButton, signOut } = useAuth();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadedAsset[]>([]);
  const [savedUploads, setSavedUploads] = useState<SavedUpload[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobSnapshot, setJobSnapshot] = useState<UploadStatusResponse | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [youtubeUrl, setYouTubeUrl] = useState("");
  const [remoteSourceLabel, setRemoteSourceLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const uploadSocketRef = useRef<WebSocket | null>(null);
  const uploadCompletionTimerRef = useRef<number | null>(null);
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
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const hasSource = uploads.length > 0 || remoteSourceLabel.trim().length > 0;
  const isChatReady = jobStatus === "completed";
  const isProcessing = jobStatus === "queued" || jobStatus === "processing";

  useEffect(() => {
    document.title = "RAG-AI";
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void loadChatsAndMaybeSelect();
    } else {
      setChats([]);
      setActiveChatId(null);
      setUploads([]);
      setSavedUploads([]);
      setMessages([]);
      setFeedback("");
      setJobStatus(null);
      setJobSnapshot(null);
      setRemoteSourceLabel("");
      setYouTubeUrl("");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isReady || isAuthenticated) {
      return;
    }

    renderGoogleButton(googleButtonRef.current);
  }, [isAuthenticated, isReady, renderGoogleButton]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (uploadCompletionTimerRef.current) {
        window.clearTimeout(uploadCompletionTimerRef.current);
      }
      stopVoiceCapture();
      stopPlaybackAudio();
      voiceAbortRef.current?.abort();
      chatSocketRef.current?.close();
      uploadSocketRef.current?.close();
    };
  }, []);

  async function loadChatsAndMaybeSelect(nextChatId?: string) {
    try {
      const response = await listChats();
      setChats(response.chats);

      const targetChatId = nextChatId || activeChatId || response.chats[0]?.id || null;
      if (targetChatId) {
        await selectChat(targetChatId, response.chats);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to load chats.");
    }
  }

  async function selectChat(chatId: string, availableChats = chats) {
    setActiveChatId(chatId);
    setUploads([]);
    setSavedUploads([]);
    setRemoteSourceLabel("");
    setYouTubeUrl("");
    setJobStatus("completed");
    setJobSnapshot(null);

    try {
      const [messageResponse, uploadResponse] = await Promise.all([
        getChatMessages(chatId),
        getChatUploads(chatId),
      ]);
      setMessages(messageResponse.messages.map(mapStoredMessage));
      setSavedUploads(uploadResponse.uploads);
      const activeChat = availableChats.find((chat) => chat.id === chatId);
      setFeedback(activeChat ? `Switched to "${activeChat.title}".` : "Chat loaded.");
    } catch (error) {
      setMessages([]);
      setSavedUploads([]);
      setJobSnapshot(null);
      setFeedback(error instanceof Error ? error.message : "Failed to load messages.");
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
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

    setUploads(sameKindFiles.map(createAsset));
    setRemoteSourceLabel("");

    if (skippedCount > 0) {
      setFeedback(
        `Kept ${sameKindFiles.length} ${firstKind} file${sameKindFiles.length === 1 ? "" : "s"} and skipped ${skippedCount} mismatched file${skippedCount === 1 ? "" : "s"}.`,
      );
      return;
    }

    setFeedback(
      `${sameKindFiles.length} file${sameKindFiles.length === 1 ? "" : "s"} selected for this chat.`,
    );
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFilesSelected(event.target.files);
    event.target.value = "";
  }

  async function handleCreateChat() {
    const title = window.prompt("Enter a chat title", "New Chat");
    if (title === null) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createChat(title);
      await loadChatsAndMaybeSelect(response.chat_id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to create chat.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteChat() {
    if (isSubmitting || isSending || !activeChatId) {
      return;
    }

    const activeChat = chats.find((chat) => chat.id === activeChatId);
    const confirmed = window.confirm(
      `Delete "${activeChat?.title || "this chat"}"? This will remove its messages, uploaded files, and vector context.`,
    );
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("Deleting chat...");

    try {
      const response = await deleteChat(activeChatId);
      const remainingChats = chats.filter((chat) => chat.id !== activeChatId);
      setChats(remainingChats);
      setMessages([]);
      setUploads([]);
      setSavedUploads([]);
      setRemoteSourceLabel("");
      setDraft("");
      setYouTubeUrl("");
      setJobStatus(null);
      setJobSnapshot(null);
      setFeedback(response.message);

      const nextChatId = remainingChats[0]?.id || null;
      setActiveChatId(nextChatId);
      if (nextChatId) {
        await selectChat(nextChatId, remainingChats);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete chat.";
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUploadSubmit() {
    if (uploads.length === 0 || isSubmitting || !activeChatId) {
      return;
    }

    setIsSubmitting(true);
    setJobStatus("queued");
    setJobSnapshot(null);
    setFeedback("Uploading files...");
    setUploads((current) =>
      current.map((upload) => ({ ...upload, status: "uploading" })),
    );

    try {
      const response = await uploadFiles(uploads.map((upload) => upload.file), activeChatId);
      setJobStatus(response.status);
      setJobSnapshot(toInitialJobSnapshot(response));
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "processing" })),
      );
      setFeedback(buildStatusText(response, "Upload accepted."));
      connectUploadStatusSocket(response.job_id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed. Please try again.";
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "failed" })),
      );
      setJobStatus("failed");
      setJobSnapshot(null);
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleYouTubeSubmit() {
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl || isSubmitting || isSending || isProcessing || !activeChatId) {
      return;
    }

    setUploads([]);
    setRemoteSourceLabel(trimmedUrl);
    setJobStatus("queued");
    setJobSnapshot(null);
    setIsSubmitting(true);
    setFeedback("Submitting YouTube link...");

    try {
      const response = await uploadYouTubeUrl(trimmedUrl, activeChatId);
      setJobStatus(response.status);
      setJobSnapshot(toInitialJobSnapshot(response));
      setFeedback(buildStatusText(response, "Processing YouTube video..."));
      connectUploadStatusSocket(response.job_id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "YouTube processing failed. Please try again.";
      setJobStatus("failed");
      setJobSnapshot(null);
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChatSubmit() {
    const question = draft.trim();
    if (!question || isSending || !isChatReady || !activeChatId) {
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
      await sendQuestionOverSocket(activeChatId, question);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat request failed. Please try again.";
      setMessages((current) => [
        ...current.filter((entry) => entry.state !== "pending"),
        createMessage("assistant", `Request failed: ${message}`),
      ]);
      setIsSending(false);
    }
  }

  async function handleVoiceToggle() {
    if (!isChatReady || !activeChatId) {
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
    if (audioBlob.size === 0 || !activeChatId) {
      setFeedback("Recorded audio was empty.");
      return;
    }

    setIsSending(true);
    setFeedback("Transcribing and answering...");
    const controller = new AbortController();
    voiceAbortRef.current = controller;
    setMessages((current) => [...current, createPendingAssistantMessage()]);

    try {
      const response = await sendVoiceChat(audioBlob, activeChatId, controller.signal);
      setMessages((current) => {
        const nextMessages = current.filter(
          (entry) => !(entry.role === "assistant" && entry.state === "pending"),
        );
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
      setMessages((current) => [
        ...current.filter((entry) => !(entry.role === "assistant" && entry.state === "pending")),
        createMessage("assistant", `Voice request failed: ${message}`),
      ]);
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
        ...current.filter((message) => !(message.role === "assistant" && message.state === "pending")),
        createMessage("assistant", `Request failed: ${errorMessage}`),
      ]);
    }
  }

  async function sendQuestionOverSocket(chatId: string, question: string) {
    const socket = await ensureSocket();
    socket.send(
      JSON.stringify({
        type: "question",
        chat_id: chatId,
        question,
      }),
    );
  }

  function connectUploadStatusSocket(nextJobId: string) {
    if (uploadCompletionTimerRef.current) {
      window.clearTimeout(uploadCompletionTimerRef.current);
      uploadCompletionTimerRef.current = null;
    }
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
        setJobSnapshot(null);
        setUploads((current) =>
          current.map((upload) => ({ ...upload, status: "failed" })),
        );
      },
    });

    uploadSocketRef.current = socket;
  }

  function handleUploadSocketMessage(event: UploadStatusStreamEvent) {
    if (uploadCompletionTimerRef.current) {
      window.clearTimeout(uploadCompletionTimerRef.current);
      uploadCompletionTimerRef.current = null;
    }

    setJobStatus(event.status);
    setJobSnapshot(event);
    setFeedback(buildStatusText(event, "Processing upload..."));

    if (event.status === "completed") {
      uploadSocketRef.current?.close();
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "ready" })),
      );
      if (activeChatId) {
        void getChatUploads(activeChatId)
          .then((response) => setSavedUploads(response.uploads))
          .catch(() => {});
      }
      uploadCompletionTimerRef.current = window.setTimeout(() => {
        setJobSnapshot(null);
        uploadCompletionTimerRef.current = null;
      }, 1800);
      return;
    }

    if (event.status === "failed") {
      uploadSocketRef.current?.close();
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "failed" })),
      );
      setMessages((current) => [
        ...current,
        createMessage("assistant", `Upload failed: ${event.error || "Unknown error."}`),
      ]);
      return;
    }

    setUploads((current) =>
      current.map((upload) => ({ ...upload, status: "processing" })),
    );
  }

  return (
    <div className="app-shell">
      {!googleClientId ? (
        <div className="auth-card">
          <h1>Google login setup is incomplete</h1>
          <p>Add `VITE_GOOGLE_CLIENT_ID` in the frontend env and `GOOGLE_CLIENT_ID` in the backend env.</p>
        </div>
      ) : !isReady ? (
        <div className="auth-card">
          <h1>Loading Google sign-in...</h1>
          <p>Preparing secure login for your chats and uploaded context.</p>
        </div>
      ) : !isAuthenticated ? (
        <div className="auth-card">
          <h1>Sign in to continue</h1>
          <p>Your chats, files, and retrieval context are now isolated per Google account.</p>
          <div ref={googleButtonRef} className="google-button-slot" />
        </div>
      ) : (
      <div className="chat-layout with-sidebar">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-top">
            <div className="sidebar-user-card">
              <div className="sidebar-user-meta">
                <strong>{user?.name}</strong>
                <span>{user?.email}</span>
              </div>
              <button type="button" className="secondary-button sidebar-logout" onClick={signOut}>
                Logout
              </button>
            </div>
          </div>

          <div className="chat-sidebar-top">
            <button
              type="button"
              className="primary-button sidebar-button"
              onClick={() => void handleCreateChat()}
              disabled={isSubmitting || isSending}
            >
              New Chat
            </button>
          </div>

          <div className="chat-history-list">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`chat-history-item ${activeChatId === chat.id ? "active" : ""}`}
                onClick={() => void selectChat(chat.id)}
              >
                <strong>{chat.title}</strong>
                <span>{new Date(chat.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="chat-main">
          {activeChatId ? (
            <>
              <header className="workspace-header">
                <div>
                  <p className="workspace-label">RAG-AI</p>
                  <h1>Multi-chat RAG workspace</h1>
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
                    className="secondary-button danger-button"
                    onClick={() => void handleDeleteChat()}
                    disabled={isSubmitting || isSending}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleUploadSubmit()}
                    disabled={uploads.length === 0 || isSubmitting || isSending || isProcessing}
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
                    {isChatReady ? "Chat context files" : "Selected files"}
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
                ) : savedUploads.length > 0 ? (
                  <div className="uploaded-file-list">
                    {savedUploads.map((upload) => (
                      <a
                        key={upload.id}
                        className="file-pill file-pill-link"
                        href={upload.file_url}
                        target="_blank"
                        rel="noreferrer"
                        title={upload.original_file_name || upload.file_url}
                      >
                        {upload.original_file_name || upload.file_type}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="uploaded-files-empty">No new files selected for this chat.</p>
                )}
              </section>

              {jobSnapshot ? (
                <section className={`processing-gate ${jobSnapshot.status === "processing" ? "active" : ""}`}>
                  <div className="processing-indicator" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="processing-copy">
                    <strong>{formatStageTitle(jobSnapshot.stage)}</strong>
                    <span>{jobSnapshot.summary || "Processing your content."}</span>
                    {jobSnapshot.detail ? <span>{jobSnapshot.detail}</span> : null}
                    {jobSnapshot.current_file ? (
                      <span>
                        Working on: <strong>{jobSnapshot.current_file}</strong>
                        {jobSnapshot.current_kind ? ` (${jobSnapshot.current_kind})` : ""}
                      </span>
                    ) : null}
                    {jobSnapshot.progress_label ? <span>{jobSnapshot.progress_label}</span> : null}
                    <div className="processing-progress">
                      <div className="processing-progress-bar">
                        <span style={{ width: `${jobSnapshot.progress_percent || 0}%` }} />
                      </div>
                      <strong>{jobSnapshot.progress_percent || 0}%</strong>
                    </div>
                    {jobSnapshot.files.length > 0 ? (
                      <div className="processing-file-list">
                        {jobSnapshot.files.map((file) => (
                          <div key={file.file_id} className="processing-file-row">
                            <span>{file.file_name}</span>
                            <span className={`processing-file-status ${file.status}`}>{file.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {feedback ? <p className="status-text">{feedback}</p> : null}

              {!isProcessing ? (
                <section className="chat-panel">
                  <>
                    <div className="chat-scroll" ref={conversationRef}>
                      <MessageList
                        messages={messages}
                        hasUploads={hasSource || messages.length > 0}
                        isReady={!!activeChatId}
                        isProcessing={isProcessing}
                      />
                    </div>

                    <Composer
                      value={draft}
                      isSending={isSending}
                      isDisabled={isProcessing}
                      isRecording={isRecording}
                      onChange={setDraft}
                      onSubmit={() => void handleChatSubmit()}
                      onVoiceToggle={() => void handleVoiceToggle()}
                    />
                  </>
                </section>
              ) : null}
            </>
          ) : (
            <section className="welcome-hero">
              <div className="welcome-copy">
                <p className="workspace-label">RAG-AI</p>
                <h1>Welcome to RAG-AI</h1>
                <p>
                  Upload PDFs, audio, video, images, or YouTube links into dedicated chat spaces
                  and get grounded answers from your own content.
                </p>
                <div className="welcome-tagline">Search less. Understand faster. Stay inside your context.</div>
                <button
                  type="button"
                  className="primary-button welcome-button"
                  onClick={() => void handleCreateChat()}
                  disabled={isSubmitting || isSending}
                >
                  Start a New Chat
                </button>
              </div>

              <div className="welcome-panel">
                <div className="welcome-card">
                  <strong>Chat-based context</strong>
                  <span>Each chat keeps its own files, messages, and vector search boundaries.</span>
                </div>
                <div className="welcome-card">
                  <strong>Multimodal input</strong>
                  <span>Work with documents, audio, video, images, and YouTube content in one place.</span>
                </div>
                <div className="welcome-card">
                  <strong>Grounded answers</strong>
                  <span>Responses combine recent chat history with retrieved chunks from your uploaded data.</span>
                </div>
              </div>
            </section>
          )}

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
      )}
    </div>
  );
});
