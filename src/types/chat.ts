export type AttachmentKind = 'pdf' | 'image' | 'video' | 'audio' | 'unknown'

export type MessageRole = 'user' | 'assistant'

export interface UploadedAsset {
  id: string
  name: string
  size: number
  mimeType: string
  kind: AttachmentKind
  previewUrl?: string
  status: 'local' | 'uploading' | 'ready' | 'failed'
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  sources?: string[]
  state?: 'streaming' | 'complete'
}

export interface ChatSessionSummary {
  id: string
  title: string
  lastUpdated: string
  summary: string
}

export interface AskQuestionRequest {
  prompt: string
  activeFileIds: string[]
}

export interface AskQuestionResponse {
  answer: string
  sources: string[]
}

export interface UploadFilesResponse {
  fileId: string
  filename: string
  status: 'queued' | 'ready'
}
