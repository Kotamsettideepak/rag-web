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
} from "../requests/chat";
import type {
  AttachmentKind,
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
import {
  acceptedFileTypes,
  buildPreviewUrl,
  formatFileSize,
  inferAttachmentKind,
  inferSavedAttachmentKind,
  revokePreviewUrl,
} from "../utils/files";

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
    case "chat_ready":
      return "Your first indexed chunks are ready. You can start chatting while indexing continues.";
    case "extracting":
      return "Extracting data from your files.";
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
    case "chat_ready":
      return "Chat Ready";
    case "extracting":
      return "Extracting";
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

function formatKindLabel(kind: AttachmentKind) {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    default:
      return "File";
  }
}

function getSavedUploadName(upload: SavedUpload) {
  return upload.original_file_name?.trim() || "Untitled upload";
}

function getSavedUploadKind(upload: SavedUpload): AttachmentKind {
  return inferSavedAttachmentKind(
    upload.file_type || "",
    upload.original_file_name || "",
    upload.file_url || "",
  );
}

function renderAssetPreview(kind: AttachmentKind, previewUrl: string | undefined, title: string) {
  if (!previewUrl || kind === "pdf" || kind === "unknown") {
    return (
      <div className={`asset-preview-fallback kind-${kind}`}>
        <span>{formatKindLabel(kind)}</span>
      </div>
    );
  }

  if (kind === "image") {
    return <img className="asset-preview-image" src={previewUrl} alt={title} loading="lazy" />;
  }

  if (kind === "video") {
    return <video className="asset-preview-video" src={previewUrl} controls preload="metadata" />;
  }

  if (kind === "audio") {
    return (
      <div className="asset-preview-audio-shell">
        <div className="asset-preview-fallback kind-audio">
          <span>Audio</span>
        </div>
        <audio className="asset-preview-audio" src={previewUrl} controls preload="metadata" />
      </div>
    );
  }

  return (
    <div className="asset-preview-fallback">
      <span>{formatKindLabel(kind)}</span>
    </div>
  );
}

function toInitialJobSnapshot(response: UploadFilesResponse): UploadStatusResponse {
  const now = new Date().toISOString();
  return {
    job_id: response.job_id,
    status: response.status,
    stage: response.stage,
    created_at: now,
    updated_at: now,
    chat_ready: response.status === "chat_ready" || response.status === "completed",
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
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState<Record<string, string>>({});
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

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;
  const hasSource =
    uploads.length > 0 || savedUploads.length > 0;
  const isChatReady = jobStatus === "chat_ready" || jobStatus === "completed" || jobStatus === null;
  const isProcessing = jobStatus === "queued" || jobStatus === "processing";
  const hasPendingUploads = uploads.length > 0;
  const hasStartedConversation = messages.length > 0;
  const canAddSource = !hasStartedConversation || (jobStatus === "failed" && savedUploads.length === 0);

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
      setIsSourceModalOpen(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const nextPreviewUrls: Record<string, string> = {};
    for (const upload of uploads) {
      const previewUrl = buildPreviewUrl(upload.file, upload.kind);
      if (previewUrl) {
        nextPreviewUrls[upload.id] = previewUrl;
      }
    }

    setUploadPreviewUrls(nextPreviewUrls);

    return () => {
      for (const previewUrl of Object.values(nextPreviewUrls)) {
        revokePreviewUrl(previewUrl);
      }
    };
  }, [uploads]);

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
    setJobStatus("completed");
    setJobSnapshot(null);
    setIsSourceModalOpen(false);

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

  function openSourceModal() {
    setIsSourceModalOpen(true);
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
    const MAX_IMAGES = 3;
    const normalizedFiles =
      firstKind === "pdf" && sameKindFiles.length > 1
        ? sameKindFiles.slice(0, 1)
        : firstKind === "image" && sameKindFiles.length > MAX_IMAGES
          ? sameKindFiles.slice(0, MAX_IMAGES)
          : sameKindFiles;
    const skippedCount = selectedFiles.length - sameKindFiles.length;

    setUploads(normalizedFiles.map(createAsset));
    setIsSourceModalOpen(false);

    if (firstKind === "pdf" && sameKindFiles.length > 1) {
      setFeedback("Only one PDF can be uploaded at a time. Kept the first PDF only.");
      return;
    }

    if (firstKind === "image" && sameKindFiles.length > MAX_IMAGES) {
      setFeedback(
        `Only ${MAX_IMAGES} images can be uploaded at a time. Kept the first ${MAX_IMAGES} images.`,
      );
      return;
    }

    if (skippedCount > 0) {
      setFeedback(
        `Kept ${normalizedFiles.length} ${firstKind} file${normalizedFiles.length === 1 ? "" : "s"} and skipped ${skippedCount} mismatched file${skippedCount === 1 ? "" : "s"}.`,
      );
      return;
    }

    setFeedback(
      `${normalizedFiles.length} file${normalizedFiles.length === 1 ? "" : "s"} selected for this chat.`,
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

  async function handleDeleteChat(chatId: string, event?: React.MouseEvent) {
    if (event) {
      event.stopPropagation();
    }

    if (isSubmitting || isSending || !chatId) {
      return;
    }

    const chatToDelete = chats.find((chat) => chat.id === chatId);
    const confirmed = window.confirm(
      `Delete "${chatToDelete?.title || "this chat"}"? This will remove its messages, uploaded files, and vector context.`,
    );
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("Deleting chat...");

    try {
      const response = await deleteChat(chatId);
      const remainingChats = chats.filter((chat) => chat.id !== chatId);
      setChats(remainingChats);
      
      if (chatId === activeChatId) {
        setMessages([]);
        setUploads([]);
        setSavedUploads([]);
        setDraft("");
        setJobStatus(null);
        setJobSnapshot(null);
        
        const nextChatId = remainingChats[0]?.id || null;
        setActiveChatId(nextChatId);
        if (nextChatId) {
          await selectChat(nextChatId, remainingChats);
        }
      }
      setFeedback(response.message);
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

    if (event.status === "chat_ready") {
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "ready" })),
      );
      if (activeChatId) {
        void getChatUploads(activeChatId)
          .then((response) => setSavedUploads(response.uploads))
          .catch(() => {});
      }
      return;
    }

    if (event.status === "completed") {
      uploadSocketRef.current?.close();
      setUploads([]);
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
      current.map((upload) => ({
        ...upload,
        status: event.status === "chat_ready" ? "ready" : "processing",
      })),
    );
  }

  return (
    <div className="app-shell">
      {!googleClientId ? (
        <section className="auth-hero">
          <div className="auth-brand-panel">
            <p className="auth-kicker">RAG-ai</p>
            <h1>Configuration needed before sign-in</h1>
            <p className="auth-lead">
              RAG-ai keeps your chats, files, and retrieval context organized in one private workspace.
            </p>
            <div className="auth-feature-list">
              <div className="auth-feature-card">
                <strong>Private by chat</strong>
                <span>Every conversation stays scoped to its own uploaded context.</span>
              </div>
              <div className="auth-feature-card">
                <strong>Built for mixed media</strong>
                <span>Work across PDFs, images, audio, and video sources.</span>
              </div>
            </div>
          </div>

          <div className="auth-card auth-card-accent">
            <p className="auth-kicker">Setup</p>
            <h2>Google login is not ready yet</h2>
            <p>Add `VITE_GOOGLE_CLIENT_ID` in the frontend env and `GOOGLE_CLIENT_ID` in the backend env.</p>
          </div>
        </section>
      ) : !isReady ? (
        <section className="auth-hero">
          <div className="auth-brand-panel">
            <p className="auth-kicker">RAG-ai</p>
            <h1>Your multimodal knowledge workspace</h1>
            <p className="auth-lead">
              Ask better questions over your own documents and media with chat-specific retrieval.
            </p>
            <div className="auth-stat-row">
              <div className="auth-stat-card">
                <strong>Scoped retrieval</strong>
                <span>Each chat uses only its own stored context.</span>
              </div>
              <div className="auth-stat-card">
                <strong>One workspace</strong>
                <span>Search, upload, and chat in one focused flow.</span>
              </div>
            </div>
          </div>

          <div className="auth-card auth-card-accent">
            <p className="auth-kicker">Loading</p>
            <h2>Preparing secure sign-in</h2>
            <p>Connecting Google authentication and getting RAG-ai ready for your workspace.</p>
          </div>
        </section>
      ) : !isAuthenticated ? (
        <section className="auth-hero">
          <div className="auth-brand-panel">
            <p className="auth-kicker">RAG-ai</p>
            <h1>Chat with your own knowledge, not the whole internet.</h1>
            <p className="auth-lead">
              Upload files, keep each conversation isolated, and explore answers grounded in your own content.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-card">
                <strong>Context-aware chats</strong>
                <span>Each chat keeps its own files, messages, and retrieval boundary.</span>
              </div>
              <div className="auth-feature-card">
                <strong>Multimodal ingestion</strong>
                <span>Use PDFs, images, audio, and video in one place.</span>
              </div>
              <div className="auth-feature-card">
                <strong>Fast answers</strong>
                <span>Get grounded responses from stored chunks instead of guessing.</span>
              </div>
            </div>
          </div>

          <div className="auth-card auth-card-accent">
            <p className="auth-kicker">Welcome</p>
            <h2>Sign in to enter RAG-ai</h2>
            <p>Your chats, files, and retrieval context are isolated per Google account.</p>
            <div ref={googleButtonRef} className="google-button-slot" />
          </div>
        </section>
      ) : (
      <div className={`chat-layout with-sidebar ${!activeChatId ? "initial-state" : "active-chat"}`}>
        <aside className="chat-sidebar">
          <div className="sidebar-user-card">
            <div className="sidebar-user-meta">
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>
            </div>
            <button type="button" className="secondary-button sidebar-logout" onClick={signOut}>
              Logout
            </button>
          </div>

          <button
            type="button"
            className="primary-button sidebar-button"
            onClick={() => void handleCreateChat()}
            disabled={isSubmitting || isSending}
          >
            New Chat
          </button>

          <div className="chat-history-list">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-history-item ${activeChatId === chat.id ? "active" : ""}`}
                onClick={() => void selectChat(chat.id)}
              >
                <div className="chat-history-item-top">
                  <strong title={chat.title}>{chat.title}</strong>
                  <button
                    type="button"
                    className="delete-chat-item"
                    onClick={(e) => void handleDeleteChat(chat.id, e)}
                    title="Delete chat"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
                <span>{new Date(chat.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="chat-main middle-section">
          {activeChatId ? (
            <>
              <header className="workspace-header mini">
                <div className="workspace-heading">
                  <p className="workspace-label">Current Chat</p>
                  <h1>{activeChat?.title || "Workspace"}</h1>
                </div>
              </header>

              {jobSnapshot && !isChatReady ? (
                <section className={`processing-gate ${jobSnapshot.status === "processing" ? "active" : ""}`}>
                  <div className="processing-indicator" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="processing-copy">
                    <strong>{formatStageTitle(jobSnapshot.stage)}</strong>
                    <span>{jobSnapshot.summary || "Processing your content."}</span>
                  </div>
                </section>
              ) : null}

              {feedback ? <p className="status-text">{feedback}</p> : null}

              <section className="chat-panel">
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
              </section>
            </>
          ) : (
            <section className="welcome-hero">
              <div className="welcome-copy">
                <p className="workspace-label">RAG-AI</p>
                <h1>Welcome to RAG-AI</h1>
                <p>
                  Upload documents and media to start grounded conversations.
                </p>
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
                  <strong>Isolated Context</strong>
                  <span>Each chat keeps its own files and search boundaries.</span>
                </div>
                <div className="welcome-card">
                  <strong>Multimodal</strong>
                  <span>Work with PDFs, Audio, Video, and Images.</span>
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
        </main>

        {activeChatId && (
          <aside className="chat-right">
            <header className="right-header">
              <p className="workspace-label">Files & Context</p>
              {canAddSource ? (
                <div className="right-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => openSourceModal()}
                    title="Add source"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </header>

            <div className="right-content">
              {hasPendingUploads ? (
                <section className="right-section">
                  <div className="right-section-head">
                    <strong>Selected files</strong>
                    <span>{uploads.length} ready to upload. Selecting a different format replaces this staged set.</span>
                  </div>
                  <div className="asset-grid vertical">
                    {uploads.map((upload) => (
                      <article key={upload.id} className="asset-card mini-horizontal">
                        <div className="asset-preview mini">
                          {renderAssetPreview(upload.kind, uploadPreviewUrls[upload.id], upload.name)}
                        </div>
                        <div className="asset-card-body">
                          <strong title={upload.name}>{upload.name}</strong>
                          <div className="asset-meta">
                            <span>{formatKindLabel(upload.kind)} • {formatFileSize(upload.size)}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="right-upload-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleUploadSubmit()}
                      disabled={!hasPendingUploads || isSubmitting || isSending || isProcessing}
                    >
                      {isSubmitting ? "Uploading..." : "Upload files"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setUploads([])}
                      disabled={isSubmitting || isSending || isProcessing}
                    >
                      Clear
                    </button>
                  </div>
                </section>
              ) : savedUploads.length > 0 ? (
                <section className="right-section">
                  <div className="right-section-head">
                    <strong>Saved files</strong>
                    <span>{savedUploads.length} in this chat</span>
                  </div>
                  <div className="asset-grid vertical">
                    {savedUploads.map((upload) => (
                      <article key={upload.id} className="asset-card mini-horizontal">
                        <div className="asset-preview mini">
                          {renderAssetPreview(
                            getSavedUploadKind(upload),
                            upload.file_url,
                            getSavedUploadName(upload),
                          )}
                        </div>
                        <div className="asset-card-body">
                          <strong title={getSavedUploadName(upload)}>{getSavedUploadName(upload)}</strong>
                          <div className="asset-meta">
                            <span>{formatKindLabel(getSavedUploadKind(upload))}</span>
                            <a
                              className="asset-link-small"
                              href={upload.file_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="right-empty">
                  <strong>No files uploaded yet.</strong>
                  <p>Use the plus button above to pick files from your device.</p>
                </div>
              )}
            </div>
          </aside>
        )}

        {isSourceModalOpen ? (
          <div className="source-modal-backdrop" onClick={() => setIsSourceModalOpen(false)}>
            <section
              className="source-modal"
              onClick={(event) => event.stopPropagation()}
              aria-modal="true"
              role="dialog"
              aria-labelledby="source-modal-title"
            >
              <div className="source-modal-head">
                <div>
                  <p className="workspace-label">Add Source</p>
                  <h2 id="source-modal-title">Choose one source type</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setIsSourceModalOpen(false)}
                  title="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>

              <div className="source-modal-body">
                <p>Select files from your system. Only one file format is accepted at a time, so a new selection replaces the previous staged format.</p>
                <p>PDF uploads are limited to 300 pages maximum, and only one PDF can be uploaded at a time.</p>
                <p>Image uploads are limited to <strong>3 images</strong> at a time.</p>
                <p>Video uploads must be less than 1 hour and less than 150 MB.</p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={openFilePicker}
                  disabled={isSubmitting || isSending || isProcessing}
                >
                  Select from device
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
});
