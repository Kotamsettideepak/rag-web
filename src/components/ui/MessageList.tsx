import { memo } from "react";
import type { ChatMessage } from "../../types/chat";
import { formatRelativeLabel } from "../../utils/files";

interface MessageListProps {
  messages: ChatMessage[];
  hasUploads: boolean;
  isReady: boolean;
  isProcessing: boolean;
}

function labelForRole(role: ChatMessage["role"]) {
  return role === "assistant" ? "AI" : "You";
}

function emptyTitle(hasUploads: boolean, isReady: boolean, isProcessing: boolean) {
  if (!hasUploads) {
    return "Choose files to begin.";
  }

  if (isProcessing) {
    return "Processing uploaded files.";
  }

  if (!isReady) {
    return "Submit files to start ingestion.";
  }

  return "Ask anything about your uploaded files.";
}

function emptyCopy(hasUploads: boolean, isReady: boolean, isProcessing: boolean) {
  if (!hasUploads) {
    return "After submit, the app will process files in the background and keep only the filenames visible.";
  }

  if (isProcessing) {
    return "The chat input will unlock automatically once background ingestion finishes.";
  }

  if (!isReady) {
    return "Your selected filenames stay at the top. Submit to create embeddings and load chat context.";
  }

  return "The chat is ready. Ask questions about the uploaded content.";
}

export const MessageList = memo(function MessageList({
  messages,
  hasUploads,
  isReady,
  isProcessing,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-card">
          <h2>{emptyTitle(hasUploads, isReady, isProcessing)}</h2>
          <p>{emptyCopy(hasUploads, isReady, isProcessing)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <article key={message.id} className={`message-bubble ${message.role}`}>
          <div className="message-head">
            <span>{labelForRole(message.role)}</span>
            <span className="message-time">{formatRelativeLabel(message.createdAt)}</span>
          </div>
          {message.content.split("\n").map((paragraph, index) => (
            <p key={`${message.id}-${index}`}>{paragraph}</p>
          ))}
        </article>
      ))}
    </div>
  );
});
