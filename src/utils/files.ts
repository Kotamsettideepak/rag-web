import type { AttachmentKind } from '../types/chat'

const pdfExtensions = ['.pdf']
const imagePrefixes = ['image/']
const videoPrefixes = ['video/']
const audioPrefixes = ['audio/']

export const acceptedFileTypes = '.pdf,image/*,video/*,audio/*'

export function inferAttachmentKind(file: File): AttachmentKind {
  const mimeType = file.type.toLowerCase()
  const lowerName = file.name.toLowerCase()

  if (pdfExtensions.some((extension) => lowerName.endsWith(extension))) {
    return 'pdf'
  }

  if (imagePrefixes.some((prefix) => mimeType.startsWith(prefix))) {
    return 'image'
  }

  if (videoPrefixes.some((prefix) => mimeType.startsWith(prefix))) {
    return 'video'
  }

  if (audioPrefixes.some((prefix) => mimeType.startsWith(prefix))) {
    return 'audio'
  }

  return 'unknown'
}

export function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }

  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function formatRelativeLabel(dateText: string): string {
  const date = new Date(dateText)

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function buildPreviewUrl(file: File, kind: AttachmentKind): string | undefined {
  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    return URL.createObjectURL(file)
  }

  return undefined
}

export function revokePreviewUrl(url?: string) {
  if (url) {
    URL.revokeObjectURL(url)
  }
}
