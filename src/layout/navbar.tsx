import { memo } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import brandMark from "../assets/rag-logo.png";
import { useAuth } from "../hooks/use_auth";
import { Dropdown } from "../components/ui/dropdown";
import { UserAvatar } from "../components/ui/user_avatar";
import { Button } from "../components/ui/button";

export const Navbar = memo(function Navbar() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex h-nav items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex h-full items-center">
          <img src={brandMark} alt="RAG AI" className="h-12 w-auto object-contain lg:h-14" />
        </div>

        <Dropdown
          trigger={
            <span className="inline-flex max-w-[17.5rem] items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
              <UserAvatar name={user?.name} imageUrl={user?.picture} />
              <span className="min-w-0 text-left">
                <strong className="block truncate text-sm text-[#16213d]">{user?.name || "User"}</strong>
                <span className="block truncate text-xs text-text-subtle">{user?.email || "Signed in"}</span>
              </span>
              <ChevronDown size={15} className="shrink-0 text-text-subtle" />
            </span>
          }
        >
          <div className="space-y-1">
            <Button variant="ghost" className="h-10 w-full justify-start rounded-xl px-3 text-sm" onClick={signOut}>
              <LogOut size={16} />
              <span className="ml-2">Log out</span>
            </Button>
          </div>
        </Dropdown>
      </div>
    </header>
  );
});
