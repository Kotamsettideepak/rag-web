export type attachment_kind = "pdf" | "image" | "video" | "audio" | "unknown";
export type upload_state = "local" | "uploading" | "processing" | "ready" | "failed";
export type upload_job_status = "queued" | "processing" | "chat_ready" | "completed" | "failed";

export interface upload_asset {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  kind: attachment_kind;
  status: upload_state;
}

export interface saved_upload {
  id: string;
  chat_id: string;
  file_url: string;
  file_type: string;
  original_file_name: string;
  created_at: string;
}

export interface upload_job_file {
  file_id: string;
  file_name: string;
  pages: number;
  status: string;
  error?: string;
}

export interface job_metrics {
  parse_duration_ms: number;
  chunk_duration_ms: number;
  embedding_duration_ms: number;
  storage_duration_ms: number;
  total_duration_ms: number;
  throughput_chunks_sec: number;
}

export interface upload_files_response {
  job_id: string;
  status: upload_job_status;
  stage?: string;
  message: string;
  summary?: string;
  detail?: string;
  progress_label?: string;
  progress_percent?: number;
  current_file?: string;
  current_kind?: string;
  files: upload_job_file[];
  metrics: job_metrics;
  accepted: boolean;
}

export interface upload_status_response {
  job_id: string;
  status: upload_job_status;
  stage?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  chat_ready?: boolean;
  chat_ready_at?: string;
  file_count: number;
  files: upload_job_file[];
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
  metrics: job_metrics;
}

export interface upload_status_event extends upload_status_response {
  type: "status";
}

export interface chat_uploads_response {
  uploads: saved_upload[];
}

export interface voice_chat_response {
  transcript: string;
}
