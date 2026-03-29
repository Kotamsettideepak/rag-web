import { api_client, websocket_base_url } from "./api_client";
import type { upload_files_response, upload_status_event, upload_status_response } from "../types/upload";

const use_mocks = !import.meta.env.VITE_ENABLE_BACKEND;

const mock_jobs = new Map<
  string,
  {
    createdAt: number;
    fileCount: number;
  }
>();

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function uploadFiles(files: File[], chatId: string): Promise<upload_files_response> {
  if (use_mocks) {
    await delay(400);
    const jobId = crypto.randomUUID();
    mock_jobs.set(jobId, { createdAt: Date.now(), fileCount: files.length });
    return {
      job_id: jobId,
      status: "queued",
      stage: "queued",
      message: "Upload accepted.",
      summary: "Upload accepted. Processing started.",
      detail: "Your files are queued and the pipeline is preparing them for chat.",
      progress_label: "Waiting to start",
      progress_percent: 5,
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

  const formData = new FormData();
  formData.append("chat_id", chatId);
  files.forEach((file) => {
    formData.append("file", file);
  });

  const response = await api_client.post<upload_files_response>("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function getUploadStatus(jobId: string): Promise<upload_status_response> {
  if (use_mocks) {
    await delay(200);
    const job = mock_jobs.get(jobId);
    if (!job) {
      throw new Error("Job not found");
    }
    const elapsed = Date.now() - job.createdAt;
    const isDone = elapsed > 3600;
    return {
      job_id: jobId,
      status: elapsed < 1200 ? "queued" : isDone ? "completed" : "processing",
      stage: elapsed < 1200 ? "queued" : isDone ? "completed" : "embedding",
      created_at: new Date(job.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
      file_count: job.fileCount,
      files: Array.from({ length: job.fileCount }, (_, index) => ({
        file_id: `${jobId}-${index}`,
        file_name: `File ${index + 1}`,
        pages: isDone ? 3 : 0,
        status: isDone ? "completed" : "processing",
      })),
      summary: isDone ? "Files ready for chat." : "Processing uploaded content.",
      detail: isDone ? "Upload completed and the chat is ready." : "Extraction and embedding are running.",
      progress_label: isDone ? "Ready" : "Processing",
      progress_percent: isDone ? 100 : Math.min(95, Math.floor(elapsed / 40)),
      metrics: {
        parse_duration_ms: 900,
        chunk_duration_ms: 240,
        embedding_duration_ms: 1600,
        storage_duration_ms: 320,
        total_duration_ms: isDone ? 3200 : elapsed,
        throughput_chunks_sec: 3.4,
      },
    };
  }

  const response = await api_client.get<upload_status_response>(`/status/${jobId}`);
  return response.data;
}

export function openUploadStatusSocket(handlers: {
  jobId: string;
  onOpen?: () => void;
  onMessage?: (event: upload_status_event) => void;
  onClose?: () => void;
  onError?: () => void;
}) {
  const socket = new WebSocket(`${websocket_base_url}/ws/status/${handlers.jobId}`);

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", () => handlers.onError?.());
  socket.addEventListener("message", (event) => {
    try {
      handlers.onMessage?.(JSON.parse(event.data) as upload_status_event);
    } catch {
      handlers.onError?.();
    }
  });

  return socket;
}
