import { memo, useState } from "react";
import { BookOpenText, ChevronDown, LogOut } from "lucide-react";
import brandMark from "../assets/rag-logo.png";
import { useAuth } from "../hooks/use_auth";
import { Dropdown } from "../components/ui/dropdown";
import { UserAvatar } from "../components/ui/user_avatar";
import { Button } from "../components/ui/button";
import { TopicsModal } from "../components/topic/topics_modal";

export const Navbar = memo(function Navbar() {
  const { user, signOut } = useAuth();
  const [isTopicsOpen, setIsTopicsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur-md">
        <div className="flex h-nav items-center justify-between gap-4 px-5 lg:px-8">

          {/* Logo — visually larger but contained within h-nav */}
          <div className="flex h-full items-center">
            <img
              src={brandMark}
              alt="RAG AI"
              className="h-[calc(var(--spacing-nav)*0.88)] w-auto max-h-[3.75rem] object-contain transition-transform duration-300 hover:scale-105"
            />
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {/* Topics button */}
            <button
              onClick={() => setIsTopicsOpen(true)}
              className="group inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-sky-50 px-4 py-1.5 text-sm font-medium text-cyan-800 shadow-sm transition-all duration-200 hover:border-cyan-300 hover:from-cyan-100 hover:to-sky-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              <BookOpenText size={16} className="text-cyan-500 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-110" />
              Topics
            </button>

            {/* User dropdown trigger */}
            <Dropdown
              trigger={
                <span className="group inline-flex max-w-[17.5rem] items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3.5 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md">
                  <span className="transition-transform duration-200 group-hover:scale-105">
                    <UserAvatar name={user?.name} imageUrl={user?.picture} />
                  </span>
                  <span className="min-w-0 text-left">
                    <strong className="block truncate text-sm font-semibold leading-tight text-slate-800">
                      {user?.name || "User"}
                    </strong>
                    <span className="block truncate text-[11px] font-normal leading-tight text-slate-400">
                      {user?.email || "Signed in"}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className="shrink-0 text-slate-400 transition-transform duration-300 group-hover:rotate-180"
                  />
                </span>
              }
            >
              <Button
                variant="ghost"
                className="h-9 w-full justify-start gap-2.5 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600"
                onClick={signOut}
              >
                <LogOut size={15} />
                Log out
              </Button>
            </Dropdown>
          </div>

        </div>
      </header>
      <TopicsModal isOpen={isTopicsOpen} onClose={() => setIsTopicsOpen(false)} />
    </>
  );
});
