import { memo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageSquarePlus,
  Trash2,
} from "lucide-react";
import { formatDateTime } from "../../lib/date";
import type { chat_summary } from "../../types/chat";
import { Button } from "../ui/button";

interface chat_sidebar_props {
  chats: chat_summary[];
  activeChatId: string | null;
  isOpen: boolean;
  isLoading?: boolean;
  onToggle: () => void;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  isBusy?: boolean;
}

export const ChatSidebar = memo(function ChatSidebar({
  chats,
  activeChatId,
  isOpen,
  isLoading = false,
  onToggle,
  onCreateChat,
  onSelectChat,
  onDeleteChat,
  isBusy = false,
}: chat_sidebar_props) {
  return (
    <aside
      className={`smooth-transition flex h-full min-h-0 flex-col overflow-hidden border-b border-r border-slate-200/70 bg-white/78 p-3 backdrop-blur md:border-b-0 ${
        isOpen ? "w-full md:w-sidebar" : "w-full md:w-20"
      }`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        {isOpen ? (
          <Button
            className="mb-5 w-full gap-2 rounded-[1.65rem]"
            onClick={onCreateChat}
            disabled={isBusy}
          >
            <MessageSquarePlus size={18} />
            New chat
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onToggle}>
          {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </Button>
      </div>

      {isOpen ? (
        <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {isLoading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`chat-skeleton-${index}`}
              className="animate-pulse rounded-3xl border border-slate-200/80 bg-white/70 p-3"
              >
                <div className="h-4 w-2/3 rounded-full bg-slate-200" />
                <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-100" />
              </div>
            ))
          : null}
        {!isLoading && chats.length === 0 && isOpen ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/55 px-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Inbox size={22} />
            </div>
            <p className="mb-0 mt-4 text-sm font-semibold text-[#1f2b44]">
              No chats yet
            </p>
            <p className="mb-0 mt-2 text-xs leading-6 text-text-subtle">
              Create a new chat to start asking questions on your uploaded context.
            </p>
          </div>
        ) : null}
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            className={`smooth-transition rounded-3xl border p-3 text-left ${
              activeChatId === chat.id
                ? "border-brand/30 bg-brand-soft/55"
                : "border-transparent bg-white/65 hover:border-slate-200 hover:bg-white"
            }`}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className="flex items-start justify-between gap-2">
              {isOpen ? (
                <div className="min-w-0">
                  <p className="m-0 truncate font-semibold text-[#1f2b44]">
                    {chat.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-text-subtle">
                    {formatDateTime(chat.created_at)}
                  </p>
                </div>
              ) : null}
              {isOpen ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-2xl text-text-subtle"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              ) : null}
            </div>
          </button>
        ))}
        </div>
      ) : (
        <div className="flex-1" />
      )}
    </aside>
  );
});
