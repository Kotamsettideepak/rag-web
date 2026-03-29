import type { attachment_kind, saved_upload, upload_asset } from "../types/upload";

const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
const videoExtensions = [".mp4", ".webm", ".mov", ".mkv", ".avi"];
const audioExtensions = [".mp3", ".wav", ".ogg", ".m4a", ".aac"];

export const accepted_file_types = ".pdf,image/*,video/*,audio/*";

export function inferAttachmentKind(file: File): attachment_kind {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return "pdf";
  }
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return "unknown";
}

export function inferSavedAttachmentKind(upload: saved_upload): attachment_kind {
  const fileType = upload.file_type.toLowerCase();
  const fileName = upload.original_file_name.toLowerCase();
  const fileUrl = upload.file_url.toLowerCase();

  if (fileType.includes("pdf") || fileName.endsWith(".pdf") || fileUrl.includes(".pdf")) {
    return "pdf";
  }
  if (fileType.startsWith("image/") || imageExtensions.some((extension) => fileName.endsWith(extension))) {
    return "image";
  }
  if (fileType.startsWith("video/") || videoExtensions.some((extension) => fileName.endsWith(extension))) {
    return "video";
  }
  if (fileType.startsWith("audio/") || audioExtensions.some((extension) => fileName.endsWith(extension))) {
    return "audio";
  }

  return "unknown";
}

export function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function createUploadAsset(file: File): upload_asset {
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
