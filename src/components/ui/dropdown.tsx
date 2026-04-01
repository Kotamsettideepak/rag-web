import { memo, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface dropdown_props extends PropsWithChildren {
  trigger: ReactNode;
  align?: "left" | "right";
}

export const Dropdown = memo(function Dropdown({ trigger, align = "right", children }: dropdown_props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsMounted(false), 200);
    } else {
      setIsMounted(true);
      requestAnimationFrame(() => setIsOpen(true));
    }
  };

  return (
    <div ref={rootRef} className="relative ml-auto">
      <style>{`
        @keyframes dropdown-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes dropdown-out {
          from { opacity: 1; transform: translateY(0)   scale(1);    }
          to   { opacity: 0; transform: translateY(-6px) scale(0.97); }
        }
        .dropdown-panel-open  { animation: dropdown-in  0.18s cubic-bezier(0.16,1,0.3,1) forwards; }
        .dropdown-panel-close { animation: dropdown-out 0.15s cubic-bezier(0.4,0,1,1)    forwards; }
      `}</style>

      <button
        type="button"
        className="smooth-transition rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        onClick={handleToggle}
      >
        {trigger}
      </button>

      {isMounted && (
        <div
          className={cn(
            "absolute top-[calc(100%+0.75rem)] z-40 min-w-[13rem] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.03]",
            isOpen ? "dropdown-panel-open" : "dropdown-panel-close",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {/* Header accent strip */}
          <div className="h-0.5 w-full bg-gradient-to-r from-brand via-cyan-400 to-brand-soft rounded-t-2xl" />
          <div className="p-2">
            {children}
          </div>
        </div>
      )}
    </div>
  );
});
