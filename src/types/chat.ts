export type AttachmentKind = "pdf" | "image" | "video" | "audio" | "unknown";

export type MessageRole = "user" | "assistant";

export type UploadState = "local" | "uploading" | "processing" | "ready" | "failed";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface UploadedAsset {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  kind: AttachmentKind;
  status: UploadState;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  sources?: string[];
  state?: "streaming" | "complete";
}

export interface AskQuestionRequest {
  question: string;
}

export interface AskQuestionResponse {
  answer: string;
}

export type ChatStreamEventType = "start" | "chunk" | "done" | "error";

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  content?: string;
  answer?: string;
  message?: string;
}

export interface UploadJobFile {
  file_id: string;
  file_name: string;
  pages: number;
  status: string;
  error?: string;
}

export interface JobMetrics {
  parse_duration_ms: number;
  chunk_duration_ms: number;
  embedding_duration_ms: number;
  storage_duration_ms: number;
  total_duration_ms: number;
  throughput_chunks_sec: number;
}

export interface UploadFilesResponse {
  job_id: string;
  status: JobStatus;
  message: string;
  summary?: string;
  files: UploadJobFile[];
  metrics: JobMetrics;
  accepted: boolean;
}

export interface UploadStatusResponse {
  job_id: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  file_count: number;
  files: UploadJobFile[];
  summary?: string;
  error?: string;
  metrics: JobMetrics;
}

export interface UploadStatusStreamEvent extends UploadStatusResponse {
  type: "status";
}

export interface ClearContextResponse {
  message: string;
}
