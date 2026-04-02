import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Layers } from "lucide-react";
import { Button } from "../components/ui/button";
import { storage_keys } from "../constants/storage_keys";
import { useAuth } from "../hooks/use_auth";
import { useChatStream } from "../hooks/use_chat_stream";
import { usePageLoading } from "../hooks/use_page_loading";
import { useSidebar } from "../hooks/use_sidebar";
import { useToast } from "../hooks/use_toast";
import {
  accepted_file_types,
  createUploadAsset,
  validateNormalChatSelection,
} from "../lib/files";
import {
  createChat,
  deleteChat,
  getChatMessages,
  getChatUploads,
  listChats,
  sendVoiceChat,
} from "../requests/chat_request";
import {
  openUploadStatusSocket,
  uploadFiles,
} from "../requests/upload_request";
import type {
  chat_history_message,
  chat_message,
  chat_summary,
  stored_message,
} from "../types/chat";
import type {
  saved_upload,
  upload_asset,
  upload_job_status,
  upload_status_event,
  upload_status_response,
} from "../types/upload";
import { ChatComposer } from "../components/chat/chat_composer";
import { ChatMessageList } from "../components/chat/chat_message_list";
import { ChatSidebar } from "../components/chat/chat_sidebar";
import { ChatUploadPanel } from "../components/chat/chat_upload_panel";

function mapStoredMessage(message: stored_message): chat_message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    thinking: "",
    createdAt: message.created_at,
    state: "complete",
  };
}

function createLocalMessage(
  role: chat_message["role"],
  content: string,
  state: chat_message["state"] = "complete",
): chat_message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    thinking: "",
    createdAt: new Date().toISOString(),
    state,
  };
}

function buildRecentHistory(messages: chat_message[]): chat_history_message[] {
  return [...messages]
    .filter((message) => message.content.trim() && message.state !== "pending")
    .slice(-5)
    .reverse()
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function buildStatusText(
  status: Pick<upload_status_response, "status" | "stage" | "error" | "summary" | "detail"> | null,
  fallback: string,
) {
  if (!status) {
    return fallback;
  }

  if (status.detail?.trim()) {
    return status.detail;
  }

  switch (status.status) {
    case "queued":
      return "Queued. Waiting to start processing.";
    case "processing":
      return "Preparing your files for AI processing.";
    case "chat_ready":
      return "Your first indexed chunks are ready. You can start chatting while indexing continues.";
    case "completed":
      return "Your files are ready. You can start chatting now.";
    case "failed":
      return status.error || "Processing failed.";
    default:
      return status.summary || fallback;
  }
}

function toInitialJobSnapshot(response: {
  job_id: string;
  status: upload_job_status;
  stage?: string;
  summary?: string;
  detail?: string;
  progress_label?: string;
  progress_percent?: number;
  current_file?: string;
  current_kind?: string;
  files: upload_status_response["files"];
  metrics: upload_status_response["metrics"];
  message: string;
}): upload_status_response {
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

export const ChatPage = memo(function ChatPage() {
  const { isAuthenticated } = useAuth();
  const { pushToast } = useToast();
  const { isOpen: isSidebarOpen, toggle: toggleSidebar } = useSidebar(true);
  const streamQuestion = useChatStream();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const uploadCompletionTimerRef = useRef<number | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const silenceAnimationRef = useRef<number | null>(null);
  const silenceAudioContextRef = useRef<AudioContext | null>(null);
  const lastSpeechAtRef = useRef<number>(0);

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [draft, setDraft] = useState("");
  const [chats, setChats] = useState<chat_summary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return window.localStorage.getItem(storage_keys.activeChatId);
  });
  const [messages, setMessages] = useState<chat_message[]>([]);
  const [isUploadGuideOpen, setIsUploadGuideOpen] = useState(false);
  const [uploads, setUploads] = useState<upload_asset[]>([]);
  const [savedUploads, setSavedUploads] = useState<saved_upload[]>([]);
  const [jobStatus, setJobStatus] = useState<upload_job_status | null>(null);
  const [jobSnapshot, setJobSnapshot] = useState<upload_status_response | null>(
    null,
  );

  const stopSilenceMonitor = useCallback(() => {
    if (silenceAnimationRef.current !== null) {
      window.cancelAnimationFrame(silenceAnimationRef.current);
      silenceAnimationRef.current = null;
    }
    if (silenceAudioContextRef.current) {
      void silenceAudioContextRef.current.close();
      silenceAudioContextRef.current = null;
    }
  }, []);

  const startSilenceMonitor = useCallback((stream: MediaStream, recorder: MediaRecorder) => {
    stopSilenceMonitor();
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const silenceMs = 3000;
    const speechThreshold = 0.02;
    lastSpeechAtRef.current = performance.now();
    silenceAudioContextRef.current = audioContext;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        energy += centered * centered;
      }
      const rms = Math.sqrt(energy / samples.length);
      const now = performance.now();
      if (rms >= speechThreshold) {
        lastSpeechAtRef.current = now;
      } else if (now-lastSpeechAtRef.current >= silenceMs) {
        if (recorder.state === "recording") {
          setStatusText("No speech detected for 3 seconds. Sending voice question...");
          recorder.stop();
        }
        stopSilenceMonitor();
        return;
      }
      silenceAnimationRef.current = window.requestAnimationFrame(tick);
    };

    silenceAnimationRef.current = window.requestAnimationFrame(tick);
  }, [stopSilenceMonitor]);

  const isChatReady =
    jobStatus === "chat_ready" || jobStatus === "completed" || jobStatus === null;
  const isProcessing = jobStatus === "queued" || jobStatus === "processing";
  const isLoadingState = usePageLoading(isBootLoading);

  const loadChatDetails = useCallback(async (chatId: string) => {
    const [messageResponse, uploadResponse] = await Promise.all([
      getChatMessages(chatId),
      getChatUploads(chatId),
    ]);
    setMessages(messageResponse.messages.map(mapStoredMessage));
    setSavedUploads(uploadResponse.uploads);
    setUploads([]);
    setJobStatus(uploadResponse.uploads.length > 0 ? "completed" : null);
    setJobSnapshot(null);
  }, []);

  const loadChats = useCallback(
    async (preferredChatId?: string | null) => {
      setIsBootLoading(true);
      try {
        const response = await listChats();
        setChats(response.chats);
        const requestedChatId = preferredChatId ?? window.localStorage.getItem(storage_keys.activeChatId);
        const nextChatId =
          requestedChatId && response.chats.some((chat) => chat.id === requestedChatId)
            ? requestedChatId
            : null;
        if (nextChatId) {
          setActiveChatId(nextChatId);
          window.localStorage.setItem(storage_keys.activeChatId, nextChatId);
          await loadChatDetails(nextChatId);
        } else {
          setActiveChatId(null);
          window.localStorage.removeItem(storage_keys.activeChatId);
          setMessages([]);
          setSavedUploads([]);
          setUploads([]);
          setJobStatus(null);
          setJobSnapshot(null);
          setStatusText("");
        }
      } catch (error) {
        pushToast(
          "Failed to load chats",
          error instanceof Error ? error.message : "Try again in a moment.",
          "danger",
        );
      } finally {
        setIsBootLoading(false);
      }
    },
    [loadChatDetails, pushToast],
  );

  useEffect(() => {
    if (isAuthenticated) {
      void loadChats();
    }
  }, [isAuthenticated, loadChats]);

  useEffect(() => {
    return () => {
      if (uploadCompletionTimerRef.current) {
        window.clearTimeout(uploadCompletionTimerRef.current);
      }
      stopSilenceMonitor();
      uploadSocketRef.current?.close();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis.cancel();
    };
  }, [stopSilenceMonitor]);

  const selectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId);
      window.localStorage.setItem(storage_keys.activeChatId, chatId);
      setStatusText(
        `Loaded "${chats.find((chat) => chat.id === chatId)?.title || "chat"}".`,
      );
      try {
        await loadChatDetails(chatId);
      } catch (error) {
        pushToast(
          "Failed to open chat",
          error instanceof Error ? error.message : "Try again.",
          "danger",
        );
      }
    },
    [chats, loadChatDetails, pushToast],
  );

  const handleCreateChat = useCallback(async () => {
    const enteredTitle = window.prompt("Enter a chat name");

    if (enteredTitle === null) {
      return;
    }

    const nextTitle = enteredTitle.trim();

    setIsWorking(true);
    try {
      const response = await createChat(nextTitle);
      pushToast("Chat created", "A fresh chat workspace is ready.", "success");
      await loadChats(response.chat_id);
    } catch (error) {
      pushToast(
        "Unable to create chat",
        error instanceof Error ? error.message : "Try again in a moment.",
        "danger",
      );
    } finally {
      setIsWorking(false);
    }
  }, [loadChats, pushToast]);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      if (!window.confirm("Delete this chat and its uploaded context?")) {
        return;
      }

      setIsWorking(true);
      try {
        await deleteChat(chatId);
        const remainingChats = chats.filter((chat) => chat.id !== chatId);
        setChats(remainingChats);
        const nextChatId = remainingChats[0]?.id ?? null;
        setActiveChatId(nextChatId);
        if (nextChatId) {
          window.localStorage.setItem(storage_keys.activeChatId, nextChatId);
          await loadChats(nextChatId);
        } else {
          window.localStorage.removeItem(storage_keys.activeChatId);
          setMessages([]);
          setSavedUploads([]);
          setUploads([]);
          setJobStatus(null);
          setJobSnapshot(null);
          setStatusText("");
        }
        pushToast(
          "Chat deleted",
          "The chat and its context were removed.",
          "success",
        );
      } catch (error) {
        pushToast(
          "Unable to delete chat",
          error instanceof Error ? error.message : "Try again in a moment.",
          "danger",
        );
      } finally {
        setIsWorking(false);
      }
    },
    [chats, loadChats, pushToast],
  );

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []);
      const validationError = validateNormalChatSelection(selectedFiles);
      if (validationError) {
        pushToast("Upload constraints", validationError, "warning");
        event.target.value = "";
        return;
      }
      const nextUploads = selectedFiles.map(createUploadAsset);
      if (nextUploads.length === 0) {
        return;
      }
      setUploads(nextUploads);
      setStatusText(
        `${nextUploads.length} file${nextUploads.length === 1 ? "" : "s"} selected for upload.`,
      );
      event.target.value = "";
    },
    [pushToast],
  );

  const handleUploadClick = useCallback(() => {
    setIsUploadGuideOpen(true);
  }, []);

  const handleUploadSocketMessage = useCallback(
    async (event: upload_status_event) => {
      if (uploadCompletionTimerRef.current) {
        window.clearTimeout(uploadCompletionTimerRef.current);
        uploadCompletionTimerRef.current = null;
      }

      setJobStatus(event.status);
      setJobSnapshot(event);
      setStatusText(buildStatusText(event, "Processing upload..."));

      if (event.status === "chat_ready") {
        setUploads((current) =>
          current.map((upload) => ({
            ...upload,
            status: "ready",
          })),
        );
        if (activeChatId) {
          const uploadResponse = await getChatUploads(activeChatId);
          setSavedUploads(uploadResponse.uploads);
        }
        return;
      }

      if (event.status === "completed") {
        uploadSocketRef.current?.close();
        uploadSocketRef.current = null;
        setUploads([]);
        if (activeChatId) {
          const uploadResponse = await getChatUploads(activeChatId);
          setSavedUploads(uploadResponse.uploads);
        }
        uploadCompletionTimerRef.current = window.setTimeout(() => {
          setJobSnapshot(null);
          uploadCompletionTimerRef.current = null;
        }, 1800);
        pushToast("Upload completed", "Your chat context is ready.", "success");
        return;
      }

      if (event.status === "failed") {
        uploadSocketRef.current?.close();
        uploadSocketRef.current = null;
        setUploads((current) =>
          current.map((upload) => ({
            ...upload,
            status: "failed",
          })),
        );
        pushToast(
          "Upload failed",
          event.error || "The backend reported a processing failure.",
          "danger",
        );
        return;
      }

      setUploads((current) =>
        current.map((upload) => ({
          ...upload,
          status: event.status === "chat_ready" ? "ready" : "processing",
        })),
      );
    },
    [activeChatId, pushToast],
  );

  const handleUploadSubmit = useCallback(async () => {
    if (!activeChatId || uploads.length === 0) {
      pushToast(
        "Select a chat first",
        "Create or choose a chat before uploading files.",
        "warning",
      );
      return;
    }

    setIsWorking(true);
    setJobStatus("queued");
    setJobSnapshot(null);
    setStatusText("Uploading files...");
    setUploads((current) =>
      current.map((upload) => ({ ...upload, status: "uploading" })),
    );
    try {
      const response = await uploadFiles(
        uploads.map((upload) => upload.file),
        activeChatId,
      );
      setJobStatus(response.status);
      setJobSnapshot(toInitialJobSnapshot(response));
      setUploads((current) =>
        current.map((upload) => ({ ...upload, status: "processing" })),
      );
      setStatusText(buildStatusText(response, "Upload accepted."));
      uploadSocketRef.current?.close();
      uploadSocketRef.current = openUploadStatusSocket({
        jobId: response.job_id,
        onMessage: (event) => {
          void handleUploadSocketMessage(event);
        },
        onError: () => {
          setStatusText("Live upload status connection failed.");
          setJobStatus("failed");
          setJobSnapshot(null);
          setUploads((current) =>
            current.map((upload) => ({ ...upload, status: "failed" })),
          );
          pushToast(
            "Upload tracking lost",
            "Live progress updates stopped unexpectedly.",
            "warning",
          );
        },
      });
    } catch (error) {
      setJobStatus("failed");
      pushToast(
        "Upload failed",
        error instanceof Error ? error.message : "Try again in a moment.",
        "danger",
      );
    } finally {
      setIsWorking(false);
    }
  }, [activeChatId, handleUploadSocketMessage, pushToast, uploads]);

  const speakText = useCallback((text: string) => {
    const spokenText = text.trim();
    if (!spokenText) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.onend = () => {
      if (currentUtteranceRef.current === utterance) {
        currentUtteranceRef.current = null;
      }
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      if (currentUtteranceRef.current === utterance) {
        currentUtteranceRef.current = null;
      }
      setIsSpeaking(false);
    };
    currentUtteranceRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendQuestion = useCallback(
    async (question: string, options?: { speakResponse?: boolean }) => {
      const nextQuestion = question.trim();
      if (!nextQuestion) {
        return;
      }
      const speakResponse = options?.speakResponse ?? false;

      if (isSpeaking) {
        currentUtteranceRef.current = null;
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }

      if (!activeChatId || !isChatReady) {
        pushToast(
          "Select a chat first",
          !activeChatId
            ? "Choose an existing chat before sending a question."
            : "Wait for chat readiness before sending a question.",
          "warning",
        );
        return;
      }

      const userMessage = createLocalMessage("user", nextQuestion);
      const assistantMessage = createLocalMessage("assistant", "", "pending");
      const recentMessages = buildRecentHistory(messages);

      setDraft("");
      setIsSending(true);
      setMessages((currentMessages) => [
        ...currentMessages,
        userMessage,
        assistantMessage,
      ]);

      try {
        await streamQuestion(
          {
            chatId: activeChatId ?? undefined,
            recentMessages,
          },
          nextQuestion,
          {
          onOpen: () => {
            setStatusText("Streaming answer...");
          },
          onMessage: (event) => {
            if (event.type === "start") {
              return;
            }
            if (event.type === "thinking") {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        thinking: `${message.thinking || ""}${event.thinking || ""}`,
                      }
                    : message,
                ),
              );
              return;
            }
            if (event.type === "chunk") {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        state: "streaming",
                        thinking: "",
                        content: `${message.content}${event.content || ""}`,
                      }
                    : message,
                ),
              );
            }
            if (event.type === "done") {
              const finalAnswer = (event.answer || "").trim();
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        state: "complete",
                        thinking: "",
                        content: event.answer || message.content,
                      }
                    : message,
                ),
              );
              setStatusText("Response ready.");
              if (speakResponse && finalAnswer) {
                speakText(finalAnswer);
              }
            }
          },
        });
      } catch (error) {
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  state: "complete",
                  thinking: "",
                  content:
                    error instanceof Error
                      ? error.message
                      : "Chat request failed.",
                }
              : message,
          ),
        );
        pushToast(
          "Chat failed",
          error instanceof Error ? error.message : "Try again in a moment.",
          "danger",
        );
      } finally {
        setIsSending(false);
      }
    },
    [activeChatId, isChatReady, isSpeaking, pushToast, speakText, streamQuestion],
  );

  const handleSend = useCallback(async () => {
    await sendQuestion(draft, { speakResponse: false });
  }, [draft, sendQuestion]);

  const handleMicToggle = useCallback(async () => {
    if (isSpeaking) {
      currentUtteranceRef.current = null;
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setStatusText("Speech stopped.");
      return;
    }

    if (!activeChatId || !isChatReady) {
      pushToast(
        "Select a chat first",
        !activeChatId
          ? "Voice questions need an active chat workspace."
          : "Wait for chat readiness before using voice questions.",
        "warning",
      );
      return;
    }

    if (isRecording) {
      stopSilenceMonitor();
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", () => {
        stopSilenceMonitor();
        const blob = new Blob(recordedChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);

        void (async () => {
          try {
            const response = await sendVoiceChat(blob, {
              chatId: activeChatId ?? undefined,
            });
            setDraft(response.transcript);
            await sendQuestion(response.transcript, { speakResponse: true });
          } catch (error) {
            pushToast(
              "Voice chat failed",
              error instanceof Error ? error.message : "Try again in a moment.",
              "danger",
            );
          }
        })();
      });

      mediaRecorder.start();
      startSilenceMonitor(stream, mediaRecorder);
      setIsRecording(true);
      setStatusText("Recording started. It auto-sends after 3 seconds of silence.");
    } catch (error) {
      pushToast(
        "Microphone unavailable",
        error instanceof Error
          ? error.message
          : "Please allow microphone access.",
        "danger",
      );
    }
  }, [activeChatId, isRecording, isSpeaking, isChatReady, pushToast, sendQuestion, startSilenceMonitor, stopSilenceMonitor]);

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={accepted_file_types}
        multiple
        onChange={handleFileSelect}
      />

      {/* LEFT: Chat history sidebar */}
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        isOpen={isSidebarOpen}
        isLoading={isLoadingState}
        onToggle={toggleSidebar}
        onCreateChat={() => void handleCreateChat()}
        onSelectChat={(chatId) => void selectChat(chatId)}
        onDeleteChat={(chatId) => void handleDeleteChat(chatId)}
        isBusy={isWorking || isSending}
      />

      {/* CENTER: Chat messages + composer */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden p-3 smooth-transition">
        <div className="min-h-0 flex-1 overflow-hidden rounded-[2rem] bg-transparent">
          <div className="scrollbar-subtle h-full overflow-y-auto p-3">
            <ChatMessageList
              messages={messages}
              isProcessing={isProcessing}
              isLoading={isLoadingState}
            />
          </div>
        </div>

        <div className="border-t pt-2">
          <ChatComposer
            value={draft}
            isSending={isSending}
            isRecording={isRecording}
            isSpeaking={isSpeaking}
            disabled={!isChatReady || isProcessing || isWorking}
            showUpload
            onChange={setDraft}
            onUpload={handleUploadClick}
            onMicToggle={() => void handleMicToggle()}
            onSend={() => void handleSend()}
          />
        </div>
      </section>

      {/* RIGHT: Context files panel */}
      <aside className="smooth-transition flex w-72 shrink-0 flex-col gap-0 overflow-hidden border-l border-slate-200/70 bg-white/78 backdrop-blur xl:w-80">
        {/* Panel header */}
        <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Layers size={16} />
          </div>
          <div>
            <p className="m-0 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Context files
            </p>
            <p className="m-0 text-sm font-semibold text-[#1f2b44]">
              {uploads.length > 0 ? "Selected uploads" : "Saved uploads"}
            </p>
          </div>
        </div>

        {/* Panel body */}
        <div className="scrollbar-subtle flex flex-1 flex-col overflow-y-auto p-4">
          {statusText ? (
            <p className="mb-3 text-xs leading-5 text-slate-500">{statusText}</p>
          ) : null}
          <ChatUploadPanel
            uploads={uploads}
            savedUploads={savedUploads}
            jobSnapshot={jobSnapshot}
            onUploadSubmit={() => void handleUploadSubmit()}
            onClearUploads={() => setUploads([])}
            isBusy={isWorking || isSending}
          />
        </div>
      </aside>

      {isUploadGuideOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-brand">Upload constraints</p>
                <h2 className="m-0 mt-2 text-2xl font-semibold text-[#1f2b44]">Normal chat upload rules</h2>
              </div>
              <Button variant="ghost" onClick={() => setIsUploadGuideOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mt-5 space-y-4 text-sm leading-6 text-text-muted">
              <p className="m-0">
                Select files from your system. Only one file format is accepted at a time, so a new selection replaces the previous staged format.
              </p>
              <p className="m-0">
                PDF uploads are limited to 300 pages maximum, and only one PDF can be uploaded at a time.
              </p>
              <p className="m-0">
                Image uploads are limited to 3 images at a time.
              </p>
              <p className="m-0">
                Video uploads must be less than 30 min and less than 150 MB.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setIsUploadGuideOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setIsUploadGuideOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
