import { memo } from "react";
import type { chat_message } from "../../types/chat";
import { QuestionField } from "../ui/question_field";
import { ResponseField } from "../ui/response_field";

interface chat_message_list_props {
  messages: chat_message[];
  isProcessing: boolean;
  isLoading?: boolean;
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  isProcessing,
  isLoading = false,
}: chat_message_list_props) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`message-skeleton-${index}`}
            className={`animate-pulse rounded-[2rem] border border-slate-200/70 bg-white/78 p-4 ${
              index % 2 === 0 ? "ml-auto w-[82%]" : "w-[76%]"
            }`}
          >
            <div className="h-3 w-24 rounded-full bg-slate-200" />
            <div className="mt-4 h-4 w-full rounded-full bg-slate-100" />
            <div className="mt-3 h-4 w-4/5 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="grid min-h-[24rem] place-items-center p-8 text-center">
        <div className="max-w-3xl">
          <h2 className="m-0 text-[3.2rem] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#10255f]">
            {isProcessing ? "Indexing your knowledge layer" : "How can I assist your research?"}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[1.1rem] leading-9 text-[#485a77]">
            {isProcessing ? "Your uploads are processing" : "Ask your first question"}
            {isProcessing
              ? ". The chat unlocks as soon as your indexed context is ready."
              : ". I can work over your uploaded portfolio, reports, and research archives once you start the conversation."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) =>
        message.role === "user" ? (
          <QuestionField key={message.id} message={message} />
        ) : (
          <ResponseField key={message.id} message={message} />
        ),
      )}
    </div>
  );
});
