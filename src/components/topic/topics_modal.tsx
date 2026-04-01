import { memo, useEffect, useMemo, useState } from "react";
import { BookOpenText, Search, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { topic_chat_route } from "../../constants/routes";
import { useToast } from "../../hooks/use_toast";
import { listTopics } from "../../requests/topic_request";
import type { topic_summary } from "../../types/topic";
import { Button } from "../ui/button";

interface topics_modal_props {
  isOpen: boolean;
  onClose: () => void;
}

function statusTone(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "completed") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (normalized === "in progress") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function isTopicReady(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized === "completed";
}

export const TopicsModal = memo(function TopicsModal({
  isOpen,
  onClose,
}: topics_modal_props) {
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [topics, setTopics] = useState<topic_summary[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;
    void (async () => {
      setIsLoading(true);
      try {
        const response = await listTopics();
        if (!isMounted) {
          return;
        }
        setTopics(response.topics);
      } catch (error) {
        pushToast(
          "Failed to load topics",
          error instanceof Error ? error.message : "Try again in a moment.",
          "danger",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, pushToast]);

  const filteredTopics = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const readyTopics = topics.filter((topic) => isTopicReady(topic.status));
    if (!needle) {
      return readyTopics;
    }
    return readyTopics.filter((topic) => {
      return (
        topic.name.toLowerCase().includes(needle) ||
        topic.status.toLowerCase().includes(needle)
      );
    });
  }, [query, topics]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/28 px-4 py-16 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,255,0.96))] shadow-[0_35px_120px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f766e] to-[#2563eb] text-white shadow-lg shadow-cyan-100">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700/70">
                Topic Library
              </p>
              <h2 className="m-0 truncate text-xl font-semibold tracking-[-0.03em] text-slate-900">
                Explore prepared topics
              </h2>
              <p className="m-0 mt-1 text-sm text-slate-500">
                Open a compact topic workspace and start asking directly.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-2xl" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="border-b border-slate-200/70 px-5 py-4">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Search size={16} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search topics"
              className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        <div className="scrollbar-subtle max-h-[26rem] overflow-y-auto px-5 py-5">
          {isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-[1.5rem] border border-slate-200 bg-white/80 p-4">
                  <div className="h-3 w-28 rounded-full bg-slate-200" />
                  <div className="mt-3 h-4 w-2/3 rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredTopics.length === 0 ? (
            <div className="grid min-h-[14rem] place-items-center rounded-[1.8rem] border border-dashed border-slate-200 bg-white/70 p-6 text-center">
              <div>
                <p className="m-0 text-base font-semibold text-slate-700">No topics found</p>
                <p className="m-0 mt-2 text-sm text-slate-500">
                  Try a different search or create topics from the backend first.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(topic_chat_route(topic.id));
                  }}
                  className="group rounded-[1.5rem] border border-slate-200/80 bg-white/88 p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_16px_40px_rgba(14,116,144,0.12)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-cyan-50 group-hover:text-cyan-700">
                        <BookOpenText size={17} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-semibold text-slate-900">
                          {topic.name}
                        </p>
                        <p className="m-0 mt-1 text-xs text-slate-500">
                          Topic chat workspace
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(topic.status)}`}
                    >
                      {topic.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
