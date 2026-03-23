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
    return "This chat is waiting for context.";
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
    return "Choose a file from the right sidebar to upload documents, images, audio, or video into this chat.";
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
          {message.state === "pending" ? (
            <div className="message-loader" aria-label="Waiting for response">
              <div className="message-loader-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="message-loader-copy">
                <strong>Working on it...</strong>
                <span>Searching your uploaded context and preparing the reply.</span>
              </div>
            </div>
          ) : (
            (message.state === "streaming" && message.content.length === 0
              ? "..."
              : message.content
            )
              .split("\n")
              .map((paragraph, index) => (
                <p key={`${message.id}-${index}`}>{paragraph}</p>
              ))
          )}
        </article>
      ))}
    </div>
  );
});
