import { memo } from "react";
import { formatTime } from "../../lib/date";
import type { chat_message } from "../../types/chat";
import { MarkdownContent } from "./markdown_content";

interface response_field_props {
  message: chat_message;
}

export const ResponseField = memo(function ResponseField({ message }: response_field_props) {
  return (
    <article className="w-full max-w-5xl rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#0f6c83] pl-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f6c83]">
        <span>RAG-AI Curator</span>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      {message.state === "pending" ? (
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand [animation-delay:-0.2s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand [animation-delay:-0.1s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand" />
          </div>
          <span className="text-sm text-text-muted">Preparing a grounded answer...</span>
        </div>
      ) : (
        <MarkdownContent content={message.content || "..."} />
      )}
    </article>
  );
});
