import type {
  AskQuestionRequest,
  AskQuestionResponse,
  UploadFilesResponse,
} from '../types/chat'
import { apiRequest, apiBaseUrl } from './client'

const USE_MOCKS = !import.meta.env.VITE_ENABLE_BACKEND

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function uploadFiles(files: File[]): Promise<UploadFilesResponse[]> {
  if (USE_MOCKS) {
    await delay(700)

    return files.map((file) => ({
      fileId: crypto.randomUUID(),
      filename: file.name,
      status: 'ready',
    }))
  }

  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${apiBaseUrl}/files/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }

  return (await response.json()) as UploadFilesResponse[]
}

export async function askQuestion(
  payload: AskQuestionRequest,
): Promise<AskQuestionResponse> {
  if (USE_MOCKS) {
    await delay(900)

    const activeFileNote =
      payload.activeFileIds.length > 0
        ? `I would query the active collection for ${payload.activeFileIds.length} uploaded file(s)`
        : 'No uploaded files are active yet'

    return {
      answer: `${activeFileNote}. Tomorrow your backend can replace this mock by calling the RAG endpoint, retrieving relevant chunks, and returning a grounded answer for: "${payload.prompt}"`,
      sources:
        payload.activeFileIds.length > 0
          ? payload.activeFileIds.map((fileId) => `source:${fileId}`)
          : ['waiting-for-upload'],
    }
  }

  return apiRequest<AskQuestionResponse>('/chat/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
