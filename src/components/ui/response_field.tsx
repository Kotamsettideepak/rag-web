import { ChevronDown } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { formatTime } from "../../lib/date";
import type { chat_message } from "../../types/chat";
import { MarkdownContent } from "./markdown_content";

interface response_field_props {
  message: chat_message;
}

export const ResponseField = memo(function ResponseField({ message }: response_field_props) {
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const thinkingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (message.state !== "pending") {
      setIsThinkingOpen(true);
    }
  }, [message.state, message.id]);

  useEffect(() => {
    if (!isThinkingOpen) return;
    const node = thinkingRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [isThinkingOpen, message.thinking]);

  return (
    <article className="w-full max-w-5xl rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#0f6c83] pl-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f6c83]">
        <span>RAG-AI Curator</span>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      {message.state === "pending" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand [animation-delay:-0.2s]" />
              <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand [animation-delay:-0.1s]" />
              <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand" />
            </div>
            <span className="text-sm text-text-muted">Preparing a grounded answer...</span>
          </div>
          {message.thinking?.trim() ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsThinkingOpen((current) => !current)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Thinking
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${isThinkingOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isThinkingOpen ? (
                <div
                  ref={thinkingRef}
                  className="max-h-36 overflow-y-auto border-t border-slate-200 px-4 py-3 text-sm leading-6 text-slate-600"
                >
                  <p className="whitespace-pre-wrap">{message.thinking}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <MarkdownContent content={message.content || "..."} />
      )}
    </article>
  );
});
