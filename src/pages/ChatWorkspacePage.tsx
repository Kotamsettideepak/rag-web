import { memo, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Composer } from "../components/ui/Composer";
import { MessageList } from "../components/ui/MessageList";
import {
  clearContext,
  createChatSocket,
  createUploadStatusSocket,
  uploadFiles,
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

function buildStatusText(status: UploadStatusResponse | null, fallback: string) {
  if (!status) {
    return fallback;
  }

  if (status.status === "failed") {
    return status.error || "Processing failed.";
  }

  if (status.status === "completed") {
    return "Files are ready to chat.";
  }

  return "Processing files...";
}

export const ChatWorkspacePage = memo(function ChatWorkspacePage() {
  const [uploads, setUploads] = useState<UploadedAsset[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const uploadSocketRef = useRef<WebSocket | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  const isChatReady = jobStatus === "completed";
  const isProcessing = jobStatus === "queued" || jobStatus === "processing";

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
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
    chatSocketRef.current?.close();
    uploadSocketRef.current?.close();
    chatSocketRef.current = null;
    uploadSocketRef.current = null;
    activeAssistantMessageIdRef.current = null;
    setUploads([]);
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
    if (uploads.length === 0 || isSubmitting || isSending) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("Clearing saved context...");

    try {
      const response = await clearContext();
      resetLocalState();
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
      setFeedback("Upload accepted. Live processing updates connected.");
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
    setMessages((current) => [...current, createMessage("user", question)]);

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
      const assistantMessage = createMessage("assistant", "");
      assistantMessage.state = "streaming";
      activeAssistantMessageIdRef.current = assistantMessage.id;
      setMessages((current) => [...current, assistantMessage]);
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
        ...current,
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
        setFeedback("Processing files...");
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
      setMessages((current) => {
        if (current.length > 0) {
          return current;
        }
        return [
          createMessage(
            "assistant",
            event.summary || "Upload completed. Ask anything about your files.",
          ),
        ];
      });
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
            <p className="workspace-label">RAG Chat</p>
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
              disabled={uploads.length === 0 || isSubmitting || isSending}
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
          ) : (
            <p className="uploaded-files-empty">No files selected yet.</p>
          )}
        </section>

        {feedback ? <p className="status-text">{feedback}</p> : null}

        <section className="chat-panel">
          <div className="chat-scroll" ref={conversationRef}>
            <MessageList
              messages={messages}
              hasUploads={uploads.length > 0}
              isReady={isChatReady}
              isProcessing={isProcessing}
            />
          </div>

          <Composer
            value={draft}
            isSending={isSending}
            isDisabled={!isChatReady}
            onChange={setDraft}
            onSubmit={() => void handleChatSubmit()}
          />
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
