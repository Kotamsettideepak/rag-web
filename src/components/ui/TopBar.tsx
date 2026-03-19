import { memo } from 'react'

interface TopBarProps {
  uploadCount: number
  backendEnabled: boolean
}

export const TopBar = memo(function TopBar({
  uploadCount,
  backendEnabled,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <h2>Ask questions about your uploaded content</h2>
        <p>
          Upload PDFs, images, audio, or video now. The UI is already shaped for the
          RAG pipeline you&apos;ll wire tomorrow.
        </p>
      </div>

      <div className="header-actions">
        <div className="status-badge">
          <span className="status-dot" />
          {backendEnabled ? 'Backend connected' : 'Frontend mock mode'}
        </div>
        <button type="button" className="secondary-button">
          {uploadCount} active upload{uploadCount === 1 ? '' : 's'}
        </button>
      </div>
    </header>
  )
})
