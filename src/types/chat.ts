export type AttachmentKind = "pdf" | "image" | "video" | "audio" | "unknown";

export type MessageRole = "user" | "assistant";

export type UploadState = "local" | "uploading" | "processing" | "ready" | "failed";

export type JobStatus = "queued" | "processing" | "chat_ready" | "completed" | "failed";

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
  state?: "pending" | "streaming" | "complete";
}

export interface AskQuestionRequest {
  chat_id: string;
  message: string;
}

export interface AskQuestionResponse {
  answer: string;
}

export interface VoiceChatResponse {
  transcript: string;
  answer: string;
  audio_base64: string;
  audio_mime_type: string;
}

export type ChatStreamEventType = "start" | "chunk" | "done" | "error";

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  content?: string;
  answer?: string;
  message?: string;
}

export interface ChatSummary {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface StoredMessage {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface SavedUpload {
  id: string;
  chat_id: string;
  file_url: string;
  file_type: string;
  original_file_name: string;
  created_at: string;
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
  stage?: string;
  message: string;
  summary?: string;
  detail?: string;
  current_file?: string;
  current_kind?: string;
  progress_label?: string;
  progress_percent?: number;
  files: UploadJobFile[];
  metrics: JobMetrics;
  accepted: boolean;
}

export interface UploadStatusResponse {
  job_id: string;
  status: JobStatus;
  stage?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  chat_ready?: boolean;
  chat_ready_at?: string;
  completed_at?: string;
  file_count: number;
  files: UploadJobFile[];
  total_chunks?: number;
  indexed_chunks?: number;
  completed_chunks?: number;
  summary?: string;
  detail?: string;
  current_file?: string;
  current_kind?: string;
  progress_label?: string;
  progress_percent?: number;
  error?: string;
  metrics: JobMetrics;
}

export interface UploadStatusStreamEvent extends UploadStatusResponse {
  type: "status";
}

export interface CreateChatResponse {
  chat_id: string;
}

export interface ListChatsResponse {
  chats: ChatSummary[];
}

export interface ChatMessagesResponse {
  messages: StoredMessage[];
}

export interface ChatUploadsResponse {
  uploads: SavedUpload[];
}

export interface ClearContextResponse {
  message: string;
}

export interface DeleteChatResponse {
  message: string;
}
