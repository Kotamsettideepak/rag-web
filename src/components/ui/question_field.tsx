import { memo } from "react";
import { formatTime } from "../../lib/date";
import type { chat_message } from "../../types/chat";

interface question_field_props {
  message: chat_message;
}

export const QuestionField = memo(function QuestionField({ message }: question_field_props) {
  return (
    <article className="ml-auto w-full max-w-3xl rounded-[1.8rem] bg-[#f4f7fb] p-5 text-slate-900 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7a93]">
        <span>You</span>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      <p className="m-0 whitespace-pre-wrap text-[1.05rem] leading-8 text-[#25324b]">{message.content}</p>
    </article>
  );
});
