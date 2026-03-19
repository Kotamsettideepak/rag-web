import { memo } from 'react'
import type { ChatMessage } from '../../types/chat'
import { formatRelativeLabel } from '../../utils/files'

interface MessageListProps {
  messages: ChatMessage[]
  hasUploads: boolean
}

function avatarLabel(role: ChatMessage['role']) {
  return role === 'assistant' ? 'AI' : 'You'
}

export const MessageList = memo(function MessageList({
  messages,
  hasUploads,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-simple">
          <h3>{hasUploads ? 'Ask anything about your uploaded file.' : 'Upload a file to start a new chat.'}</h3>
          <p>
            {hasUploads
              ? 'Type your question or use the mic.'
              : 'Click Upload to add PDF, image, video, or audio, then start chatting.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="conversation-inner">
      {messages.map((message) => (
        <article key={message.id} className={`simple-message ${message.role}`}>
          <div className="simple-message-head">
            <span>{avatarLabel(message.role)}</span>
            <span className="message-meta">{formatRelativeLabel(message.createdAt)}</span>
          </div>
          {message.content.split('\n').map((paragraph, index) => (
            <p key={`${message.id}-${index}`}>{paragraph}</p>
          ))}
        </article>
      ))}
    </div>
  )
})
