import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ChatStreamEvent,
  ClearContextResponse,
  VoiceChatResponse,
  UploadFilesResponse,
  UploadStatusResponse,
  UploadStatusStreamEvent,
} from "../types/chat";
import { apiBaseUrl, apiRequest, websocketBaseUrl } from "./client";

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

export async function uploadFiles(files: File[]): Promise<UploadFilesResponse> {
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
  for (const file of files) {
    formData.append("file", file);
  }

  const response = await fetch(`${apiBaseUrl}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (status ${response.status})`);
  }

  return (await response.json()) as UploadFilesResponse;
}

export async function uploadYouTubeUrl(url: string): Promise<UploadFilesResponse> {
  if (USE_MOCKS) {
    await delay(500);
    const jobId = crypto.randomUUID();
    mockJobs.set(jobId, {
      createdAt: Date.now(),
      fileCount: 1,
    });

    return {
      job_id: jobId,
      status: "queued",
      stage: "queued",
      message: "YouTube link accepted. Processing in background.",
      files: [
        {
          file_id: crypto.randomUUID(),
          file_name: url,
          pages: 0,
          status: "queued",
        },
      ],
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

  const response = await fetch(`${apiBaseUrl}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_kind: "youtube",
      url,
    }),
  });

  if (!response.ok) {
    throw new Error(`YouTube processing failed (status ${response.status})`);
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
      answer: `Mocked RAG response for: "${payload.question}"`,
    };
  }

  return apiRequest<AskQuestionResponse>("/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendVoiceChat(
  audio: Blob,
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

  const response = await fetch(`${apiBaseUrl}/voice/chat`, {
    method: "POST",
    body: formData,
    signal,
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
  const socket = new WebSocket(`${websocketBaseUrl}/ws`);

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
