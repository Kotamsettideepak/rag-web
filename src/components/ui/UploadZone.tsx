import { memo, type DragEvent } from 'react'
import type { UploadedAsset } from '../../types/chat'
import { formatFileSize } from '../../utils/files'

interface UploadZoneProps {
  uploads: UploadedAsset[]
  isDragging: boolean
  onOpenPicker: () => void
  onRemoveUpload: (id: string) => void
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

function previewForFile(upload: UploadedAsset) {
  if (upload.kind === 'image' && upload.previewUrl) {
    return <img src={upload.previewUrl} alt={upload.name} />
  }

  if (upload.kind === 'video' && upload.previewUrl) {
    return <video src={upload.previewUrl} muted playsInline />
  }

  if (upload.kind === 'audio' && upload.previewUrl) {
    return <audio className="audio-preview" controls src={upload.previewUrl} />
  }

  const copy =
    upload.kind === 'pdf'
      ? 'PDF preview will connect to your parser flow tomorrow.'
      : 'File accepted and ready for backend processing.'

  return <div className="preview-placeholder">{copy}</div>
}

function iconForKind(kind: UploadedAsset['kind']) {
  switch (kind) {
    case 'pdf':
      return 'PDF'
    case 'image':
      return 'IMG'
    case 'video':
      return 'VID'
    case 'audio':
      return 'AUD'
    default:
      return 'FILE'
  }
}

export const UploadZone = memo(function UploadZone({
  uploads,
  isDragging,
  onOpenPicker,
  onRemoveUpload,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: UploadZoneProps) {
  return (
    <section
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="upload-zone-head">
        <div className="upload-zone-title">
          <div className="upload-zone-icon">+</div>
          <div className="section-copy">
            <h3>Upload documents and media</h3>
            <p>
              Drag files here or add them from the composer. Supported: PDF, image,
              video, audio.
            </p>
          </div>
        </div>

        <button type="button" className="ghost-button" onClick={onOpenPicker}>
          Choose files
        </button>
      </div>

      <div className="upload-chip-list">
        <span className="upload-chip">PDF parsing ready</span>
        <span className="upload-chip">Whisper-ready audio</span>
        <span className="upload-chip">Video to transcript flow</span>
        <span className="upload-chip">Image question answering</span>
      </div>

      {uploads.length > 0 && (
        <div className="files-grid">
          {uploads.map((upload) => (
            <article key={upload.id} className="file-card">
              <div className="file-card-head">
                <div className="file-card-title-row">
                  <div className="file-icon">{iconForKind(upload.kind)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="file-name">{upload.name}</div>
                    <div className="upload-meta-row">
                      <span className="file-meta">{formatFileSize(upload.size)}</span>
                      <span className="file-meta">{upload.status}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="remove-button"
                  aria-label={`Remove ${upload.name}`}
                  onClick={() => onRemoveUpload(upload.id)}
                >
                  ×
                </button>
              </div>

              <div className="file-preview">{previewForFile(upload)}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
})
