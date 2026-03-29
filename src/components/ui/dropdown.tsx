import { memo, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface dropdown_props extends PropsWithChildren {
  trigger: ReactNode;
  align?: "left" | "right";
}

export const Dropdown = memo(function Dropdown({ trigger, align = "right", children }: dropdown_props) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        className="smooth-transition rounded-full"
        onClick={() => setIsOpen((currentState) => !currentState)}
      >
        {trigger}
      </button>
      {isOpen ? (
        <div
          className={cn(
            "absolute top-[calc(100%+0.65rem)] z-40 min-w-[11rem] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
});
