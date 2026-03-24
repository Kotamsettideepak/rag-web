import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ChatMessagesResponse,
  ChatUploadsResponse,
  ChatStreamEvent,
  ClearContextResponse,
  CreateChatResponse,
  DeleteChatResponse,
  ListChatsResponse,
  VoiceChatResponse,
  UploadFilesResponse,
  UploadStatusResponse,
  UploadStatusStreamEvent,
} from "../types/chat";
import { apiBaseUrl, apiRequest, getAuthToken, websocketBaseUrl } from "./client";

const USE_MOCKS = !import.meta.env.VITE_ENABLE_BACKEND;

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

const mockJobs = new Map<
  string,
  {
    createdAt: number;
    fileCount: number;
  }
>();

export async function createChat(title: string): Promise<CreateChatResponse> {
  if (USE_MOCKS) {
    await delay(200);
    return { chat_id: crypto.randomUUID() };
  }

  return apiRequest<CreateChatResponse>("/chat/create", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function listChats(): Promise<ListChatsResponse> {
  if (USE_MOCKS) {
    await delay(200);
    return { chats: [] };
  }

  return apiRequest<ListChatsResponse>("/chat/list");
}

export async function getChatMessages(chatId: string): Promise<ChatMessagesResponse> {
  if (USE_MOCKS) {
    await delay(200);
    return { messages: [] };
  }

  return apiRequest<ChatMessagesResponse>(`/chat/${chatId}/messages`);
}

export async function getChatUploads(chatId: string): Promise<ChatUploadsResponse> {
  if (USE_MOCKS) {
    await delay(200);
    return { uploads: [] };
  }

  return apiRequest<ChatUploadsResponse>(`/chat/${chatId}/uploads`);
}

export async function deleteChat(chatId: string): Promise<DeleteChatResponse> {
  if (USE_MOCKS) {
    await delay(200);
    return { message: "Chat deleted successfully" };
  }

  return apiRequest<DeleteChatResponse>(`/chat/${chatId}`, {
    method: "DELETE",
  });
}

export async function uploadFiles(files: File[], chatId: string): Promise<UploadFilesResponse> {
  if (USE_MOCKS) {
    await delay(500);
    const jobId = crypto.randomUUID();
    mockJobs.set(jobId, {
      createdAt: Date.now(),
      fileCount: files.length,
    });

    return {
      job_id: jobId,
      status: "queued",
      stage: "queued",
      message: "Upload accepted. Processing in background.",
      summary: "Upload accepted. Processing in background.",
      detail: "Your files are queued and waiting for a worker to begin processing.",
      progress_label: "Waiting to start",
      progress_percent: 2,
      files: files.map((file) => ({
        file_id: crypto.randomUUID(),
        file_name: file.name,
        pages: 0,
        status: "queued",
      })),
      metrics: {
        parse_duration_ms: 0,
        chunk_duration_ms: 0,
        embedding_duration_ms: 0,
        storage_duration_ms: 0,
        total_duration_ms: 0,
        throughput_chunks_sec: 0,
      },
      accepted: true,
    };
  }

  if (files.length === 0) {
    throw new Error("No files to upload");
  }

  const formData = new FormData();
  formData.append("chat_id", chatId);
  for (const file of files) {
    formData.append("file", file);
  }

  const response = await fetch(`${apiBaseUrl}/upload`, {
    method: "POST",
    body: formData,
    headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
  });

  if (!response.ok) {
    let message = `Upload failed (status ${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      const detail = payload?.error?.trim();
      if (detail) {
        message = detail;
      }
    } catch {
      // Keep the fallback message when the backend body is not JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as UploadFilesResponse;
}

export async function getUploadStatus(jobId: string): Promise<UploadStatusResponse> {
  if (USE_MOCKS) {
    await delay(400);
    const job = mockJobs.get(jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    const elapsed = Date.now() - job.createdAt;
    const isDone = elapsed > 3500;
    const status = elapsed < 1200 ? "queued" : isDone ? "completed" : "processing";

    return {
      job_id: jobId,
      status,
      stage: status === "queued" ? "queued" : isDone ? "completed" : "processing",
      created_at: new Date(job.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
      started_at: new Date(job.createdAt + 200).toISOString(),
      completed_at: isDone ? new Date(job.createdAt + 3600).toISOString() : undefined,
      file_count: job.fileCount,
      files: Array.from({ length: job.fileCount }, (_, index) => ({
        file_id: `${jobId}-${index}`,
        file_name: `File ${index + 1}`,
        pages: isDone ? 3 : 0,
        status: isDone ? "completed" : "processing",
      })),
      summary: isDone
        ? "Upload completed. The files are ready for chat."
        : "Background processing is running.",
      detail: isDone
        ? "Everything finished successfully and the content is ready for chat."
        : "The backend is moving through extraction, chunking, embedding, and storage.",
      progress_label: isDone ? "Ready for chat" : "Processing upload",
      progress_percent: isDone ? 100 : Math.min(90, Math.floor(elapsed / 40)),
      metrics: {
        parse_duration_ms: isDone ? 900 : 0,
        chunk_duration_ms: isDone ? 220 : 0,
        embedding_duration_ms: isDone ? 1800 : 0,
        storage_duration_ms: isDone ? 310 : 0,
        total_duration_ms: isDone ? 3230 : elapsed,
        throughput_chunks_sec: isDone ? 3.7 : 0,
      },
    };
  }

  return apiRequest<UploadStatusResponse>(`/status/${jobId}`);
}

export function createUploadStatusSocket(
  jobId: string,
  handlers: {
    onOpen?: () => void;
    onMessage?: (event: UploadStatusStreamEvent) => void;
    onClose?: () => void;
    onError?: () => void;
  } = {},
): WebSocket {
  const socket = new WebSocket(`${websocketBaseUrl}/ws/status/${jobId}`);

  socket.addEventListener("open", () => {
    handlers.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data) as UploadStatusStreamEvent;
      handlers.onMessage?.(parsed);
    } catch {
      handlers.onError?.();
    }
  });

  socket.addEventListener("close", () => {
    handlers.onClose?.();
  });

  socket.addEventListener("error", () => {
    handlers.onError?.();
  });

  return socket;
}

export async function askQuestion(
  payload: AskQuestionRequest,
): Promise<AskQuestionResponse> {
  if (USE_MOCKS) {
    await delay(900);
    return {
      answer: `Mocked RAG response for: "${payload.message}"`,
    };
  }

  return apiRequest<AskQuestionResponse>("/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendVoiceChat(
  audio: Blob,
  chatId: string,
  signal?: AbortSignal,
): Promise<VoiceChatResponse> {
  if (USE_MOCKS) {
    await delay(900);
    return {
      transcript: "Mock transcript",
      answer: "Mock voice answer",
      audio_base64: "",
      audio_mime_type: "audio/mpeg",
    };
  }

  const formData = new FormData();
  formData.append("audio", audio, "voice-question.webm");
  formData.append("chat_id", chatId);

  const response = await fetch(`${apiBaseUrl}/voice/chat`, {
    method: "POST",
    body: formData,
    signal,
    headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Voice chat failed (status ${response.status})`);
  }

  return (await response.json()) as VoiceChatResponse;
}

export function createChatSocket(
  handlers: {
    onOpen?: () => void;
    onMessage?: (event: ChatStreamEvent) => void;
    onClose?: () => void;
    onError?: () => void;
  } = {},
): WebSocket {
  const socket = new WebSocket(
    `${websocketBaseUrl}/ws?google_token=${encodeURIComponent(getAuthToken() || "")}`,
  );

  socket.addEventListener("open", () => {
    handlers.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data) as ChatStreamEvent;
      handlers.onMessage?.(parsed);
    } catch {
      handlers.onMessage?.({
        type: "error",
        message: "Received an invalid websocket payload.",
      });
    }
  });

  socket.addEventListener("close", () => {
    handlers.onClose?.();
  });

  socket.addEventListener("error", () => {
    handlers.onError?.();
  });

  return socket;
}

export async function clearContext(): Promise<ClearContextResponse> {
  if (USE_MOCKS) {
    await delay(300);
    mockJobs.clear();
    return {
      message: "Saved context cleared successfully",
    };
  }

  return apiRequest<ClearContextResponse>("/context", {
    method: "DELETE",
  });
}
