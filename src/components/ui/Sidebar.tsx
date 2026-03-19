import { memo } from 'react'
import type { ChatSessionSummary, UploadedAsset } from '../../types/chat'

interface SidebarProps {
  sessions: ChatSessionSummary[]
  activeSessionId: string
  uploads: UploadedAsset[]
  onNewChat: () => void
}

export const Sidebar = memo(function Sidebar({
  sessions,
  activeSessionId,
  uploads,
  onNewChat,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-logo">AI</div>
        <div className="brand-copy">
          <h1>Multimodal RAG</h1>
          <p>Frontend cockpit for tomorrow&apos;s FastAPI backend</p>
        </div>
      </div>

      <button type="button" className="primary-button" onClick={onNewChat}>
        + New workspace
      </button>

      <section className="sidebar-section">
        <div className="section-copy">
          <h2>Recent chats</h2>
          <p>Prepared for single-file or multi-file analysis</p>
        </div>

        <div className="chat-nav-list">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`chat-nav-item ${session.id === activeSessionId ? 'active' : ''}`}
            >
              <span className="chat-nav-title">{session.title}</span>
              <span className="meta-text">{session.summary}</span>
              <span className="timeline-pill">{session.lastUpdated}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-copy">
          <h2>System hints</h2>
          <p>UI contracts aligned with the flow in `plan.md`</p>
        </div>

        <div className="insight-list">
          <div className="insight-card">
            <strong>{uploads.length} files staged</strong>
            <span className="hint-text">
              Each upload can map to a future `file_id` and isolated vector collection.
            </span>
          </div>
          <div className="insight-card">
            <strong>Request layer ready</strong>
            <span className="hint-text">Swap mock adapters with real endpoints when backend lands.</span>
          </div>
          <div className="insight-card">
            <strong>ChatGPT-like layout</strong>
            <span className="hint-text">
              Sidebar, central transcript, upload-aware composer, responsive shell.
            </span>
          </div>
        </div>
      </section>
    </aside>
  )
})
