import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AlertCircle } from "lucide-react";
import { storage_keys } from "../constants/storage_keys";
import { useAuth } from "../hooks/use_auth";
import { useChatStream } from "../hooks/use_chat_stream";
import { usePageLoading } from "../hooks/use_page_loading";
import { useSidebar } from "../hooks/use_sidebar";
import { useToast } from "../hooks/use_toast";
import { buildChatTitle } from "../lib/date";
import { accepted_file_types, createUploadAsset } from "../lib/files";
import {
  createChat,
  deleteChat,
  getChatMessages,
  getChatUploads,
  listChats,
  sendVoiceChat,
} from "../requests/chat_request";
import { openUploadStatusSocket, uploadFiles } from "../requests/upload_request";
import type { chat_message, chat_summary, stored_message } from "../types/chat";
import type { saved_upload, upload_asset, upload_job_status, upload_status_event, upload_status_response } from "../types/upload";
import { ChatComposer } from "../components/chat/chat_composer";
import { ChatMessageList } from "../components/chat/chat_message_list";
import { ChatSidebar } from "../components/chat/chat_sidebar";
import { ChatUploadPanel } from "../components/chat/chat_upload_panel";
import { Alert } from "../components/ui/alert";
import { ProgressBar } from "../components/ui/progress_bar";

function mapStoredMessage(message: stored_message): chat_message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    state: "complete",
  };
}

function createLocalMessage(role: chat_message["role"], content: string, state: chat_message["state"] = "complete"): chat_message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    state,
  };
}

function formatJobSummary(snapshot: upload_status_response | null) {
  if (!snapshot) {
    return "";
  }
  return snapshot.detail || snapshot.summary || "Processing upload.";
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
  const [uploads, setUploads] = useState<upload_asset[]>([]);
  const [savedUploads, setSavedUploads] = useState<saved_upload[]>([]);
  const [jobStatus, setJobStatus] = useState<upload_job_status | null>(null);
  const [jobSnapshot, setJobSnapshot] = useState<upload_status_response | null>(null);

  const isProcessing = jobStatus === "queued" || jobStatus === "processing";
  const isLoadingState = usePageLoading(isBootLoading);
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim()),
    [messages],
  );

  const loadChatDetails = useCallback(
    async (chatId: string) => {
      const [messageResponse, uploadResponse] = await Promise.all([getChatMessages(chatId), getChatUploads(chatId)]);
      setMessages(messageResponse.messages.map(mapStoredMessage));
      setSavedUploads(uploadResponse.uploads);
      setUploads([]);
      setJobStatus(uploadResponse.uploads.length > 0 ? "completed" : null);
      setJobSnapshot(null);
    },
    [],
  );

  const loadChats = useCallback(
    async (preferredChatId?: string | null) => {
      setIsBootLoading(true);
      try {
        const response = await listChats();
        setChats(response.chats);
        const nextChatId = preferredChatId || activeChatId || response.chats[0]?.id || null;
        if (nextChatId) {
          setActiveChatId(nextChatId);
          window.localStorage.setItem(storage_keys.activeChatId, nextChatId);
          await loadChatDetails(nextChatId);
        } else {
          setMessages([]);
          setSavedUploads([]);
          setJobStatus(null);
          setJobSnapshot(null);
        }
      } catch (error) {
        pushToast("Failed to load chats", error instanceof Error ? error.message : "Try again in a moment.", "danger");
      } finally {
        setIsBootLoading(false);
      }
    },
    [activeChatId, loadChatDetails, pushToast],
  );

  useEffect(() => {
    if (isAuthenticated) {
      void loadChats();
    }
  }, [isAuthenticated, loadChats]);

  useEffect(() => {
    return () => {
      uploadSocketRef.current?.close();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis.cancel();
    };
  }, []);

  const selectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId);
      window.localStorage.setItem(storage_keys.activeChatId, chatId);
      setStatusText(`Loaded "${chats.find((chat) => chat.id === chatId)?.title || "chat"}".`);
      try {
        await loadChatDetails(chatId);
      } catch (error) {
        pushToast("Failed to open chat", error instanceof Error ? error.message : "Try again.", "danger");
      }
    },
    [chats, loadChatDetails, pushToast],
  );

  const handleCreateChat = useCallback(async () => {
    setIsWorking(true);
    try {
      const response = await createChat(buildChatTitle());
      pushToast("Chat created", "A fresh chat workspace is ready.", "success");
      await loadChats(response.chat_id);
    } catch (error) {
      pushToast("Unable to create chat", error instanceof Error ? error.message : "Try again in a moment.", "danger");
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
          await loadChats(nextChatId);
        } else {
          setMessages([]);
          setSavedUploads([]);
          setUploads([]);
          setJobStatus(null);
          setJobSnapshot(null);
        }
        pushToast("Chat deleted", "The chat and its context were removed.", "success");
      } catch (error) {
        pushToast("Unable to delete chat", error instanceof Error ? error.message : "Try again in a moment.", "danger");
      } finally {
        setIsWorking(false);
      }
    },
    [chats, loadChats, pushToast],
  );

  const handleFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    const nextUploads = selectedFiles.map(createUploadAsset);
    if (nextUploads.length === 0) {
      return;
    }
    setUploads(nextUploads);
    setStatusText(`${nextUploads.length} file${nextUploads.length === 1 ? "" : "s"} selected for upload.`);
    event.target.value = "";
  }, []);

  const handleUploadSocketMessage = useCallback(
    async (event: upload_status_event) => {
      setJobStatus(event.status);
      setJobSnapshot(event);
      setStatusText(formatJobSummary(event));

      if (event.status === "chat_ready" || event.status === "completed") {
        uploadSocketRef.current?.close();
        setUploads([]);
        if (activeChatId) {
          const uploadResponse = await getChatUploads(activeChatId);
          setSavedUploads(uploadResponse.uploads);
        }
        pushToast("Upload completed", "Your chat context is ready.", "success");
      }

      if (event.status === "failed") {
        uploadSocketRef.current?.close();
        pushToast("Upload failed", event.error || "The backend reported a processing failure.", "danger");
      }
    },
    [activeChatId, pushToast],
  );

  const handleUploadSubmit = useCallback(async () => {
    if (!activeChatId || uploads.length === 0) {
      pushToast("Select a chat first", "Create or choose a chat before uploading files.", "warning");
      return;
    }

    setIsWorking(true);
    setJobStatus("queued");
    try {
      const response = await uploadFiles(
        uploads.map((upload) => upload.file),
        activeChatId,
      );
      setJobStatus(response.status);
      setJobSnapshot({
        job_id: response.job_id,
        status: response.status,
        stage: response.stage,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_count: response.files.length,
        files: response.files,
        summary: response.summary,
        detail: response.detail,
        progress_label: response.progress_label,
        progress_percent: response.progress_percent,
        metrics: response.metrics,
      });
      setStatusText(response.detail || response.summary || response.message);
      uploadSocketRef.current?.close();
      uploadSocketRef.current = openUploadStatusSocket({
        jobId: response.job_id,
        onMessage: (event) => {
          void handleUploadSocketMessage(event);
        },
        onError: () => {
          pushToast("Upload tracking lost", "Live progress updates stopped unexpectedly.", "warning");
        },
      });
    } catch (error) {
      setJobStatus("failed");
      pushToast("Upload failed", error instanceof Error ? error.message : "Try again in a moment.", "danger");
    } finally {
      setIsWorking(false);
    }
  }, [activeChatId, handleUploadSocketMessage, pushToast, uploads]);

  const sendQuestion = useCallback(
    async (question: string) => {
      const nextQuestion = question.trim();
      if (!nextQuestion) {
        return;
      }

      let targetChatId = activeChatId;
      if (!targetChatId) {
        const response = await createChat(buildChatTitle());
        targetChatId = response.chat_id;
        await loadChats(targetChatId);
      }

      if (!targetChatId) {
        return;
      }

      const userMessage = createLocalMessage("user", nextQuestion);
      const assistantMessage = createLocalMessage("assistant", "", "pending");

      setDraft("");
      setIsSending(true);
      setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);

      try {
        await streamQuestion(targetChatId, nextQuestion, {
          onOpen: () => {
            setStatusText("Streaming answer...");
          },
          onMessage: (event) => {
            if (event.type === "start") {
              return;
            }
            if (event.type === "chunk") {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        state: "streaming",
                        content: `${message.content}${event.content || ""}`,
                      }
                    : message,
                ),
              );
            }
            if (event.type === "done") {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        state: "complete",
                        content: event.answer || message.content,
                      }
                    : message,
                ),
              );
              setStatusText("Response ready.");
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
                  content: error instanceof Error ? error.message : "Chat request failed.",
                }
              : message,
          ),
        );
        pushToast("Chat failed", error instanceof Error ? error.message : "Try again in a moment.", "danger");
      } finally {
        setIsSending(false);
      }
    },
    [activeChatId, loadChats, pushToast, streamQuestion],
  );

  const handleSend = useCallback(async () => {
    await sendQuestion(draft);
  }, [draft, sendQuestion]);

  const handleMicToggle = useCallback(async () => {
    if (!activeChatId) {
      pushToast("Create a chat first", "Voice questions need an active chat workspace.", "warning");
      return;
    }

    if (isRecording) {
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
        const blob = new Blob(recordedChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);

        void (async () => {
          try {
            const response = await sendVoiceChat(blob, activeChatId);
            setDraft(response.transcript);
            await sendQuestion(response.transcript);
          } catch (error) {
            pushToast("Voice chat failed", error instanceof Error ? error.message : "Try again in a moment.", "danger");
          }
        })();
      });

      mediaRecorder.start();
      setIsRecording(true);
      setStatusText("Recording started. Click the mic again to stop and send.");
    } catch (error) {
      pushToast("Microphone unavailable", error instanceof Error ? error.message : "Please allow microphone access.", "danger");
    }
  }, [activeChatId, isRecording, pushToast, sendQuestion]);

  const handleSpeakToggle = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!latestAssistantMessage?.content) {
      pushToast("No response to read", "Ask a question first, then use the speak control.", "warning");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(latestAssistantMessage.content);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [isSpeaking, latestAssistantMessage, pushToast]);

  return (
    <div className="soft-app-panel smooth-transition grid h-full grid-cols-1 overflow-hidden rounded-none border-x-0 border-b-0 md:grid-cols-[auto_minmax(0,1fr)]">
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

      <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-4 lg:p-6">
        <div className="min-w-0">
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[1.05rem] font-bold tracking-[-0.02em] text-[#17358b]">RAG-AI Curator</p>
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.24em] text-[#0f6c83]">Knowledge Layer</p>
              <p className="mt-2 text-text-muted">RAG Intelligence Engine</p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={accepted_file_types}
            multiple
            onChange={handleFileSelect}
          />

          {statusText ? <Alert variant={jobStatus === "failed" ? "danger" : "info"}>{statusText}</Alert> : null}

          {jobSnapshot ? (
            <div className="rounded-[2rem] border border-slate-200/80 bg-white/82 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1f2b44]">
                  <AlertCircle size={16} className="text-brand" />
                  <span>{jobSnapshot.progress_label || "Processing upload"}</span>
                </div>
                <span className="text-sm text-text-subtle">{jobSnapshot.progress_percent || 0}%</span>
              </div>
              <ProgressBar value={jobSnapshot.progress_percent || 0} />
              <p className="mb-0 mt-3 text-sm text-text-muted">{formatJobSummary(jobSnapshot)}</p>
            </div>
          ) : null}

          <ChatUploadPanel
            uploads={uploads}
            savedUploads={savedUploads}
            onUploadSubmit={() => void handleUploadSubmit()}
            onClearUploads={() => setUploads([])}
            isBusy={isWorking || isSending}
          />
        </div>

        <div className="min-h-0 min-w-0 overflow-hidden rounded-[2rem] bg-transparent">
          <div className="scrollbar-subtle h-full overflow-y-auto p-4 lg:p-5">
            <ChatMessageList messages={messages} isProcessing={isProcessing} isLoading={isLoadingState} />
          </div>
        </div>

        <div className="min-w-0 shrink-0">
          <ChatComposer
            value={draft}
            isSending={isSending}
            isRecording={isRecording}
            isSpeaking={isSpeaking}
            disabled={isProcessing || isWorking}
            onChange={setDraft}
            onUpload={() => fileInputRef.current?.click()}
            onMicToggle={() => void handleMicToggle()}
            onSpeakToggle={handleSpeakToggle}
            onSend={() => void handleSend()}
          />
        </div>
      </section>
    </div>
  );
});
