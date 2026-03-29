import { memo } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import type { toast_item } from "../../types/ui";

interface toast_viewport_props {
  toasts: toast_item[];
  onClose: (id: string) => void;
}

export const ToastViewport = memo(function ToastViewport({ toasts, onClose }: toast_viewport_props) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto rounded-3xl border p-4 shadow-card backdrop-blur",
            toast.variant === "info" && "border-cyan-200 bg-white/95 dark:border-cyan-900 dark:bg-slate-950/95",
            toast.variant === "success" && "border-green-200 bg-green-50/95 dark:border-green-900 dark:bg-green-950/60",
            toast.variant === "warning" && "border-amber-200 bg-amber-50/95 dark:border-amber-900 dark:bg-amber-950/60",
            toast.variant === "danger" && "border-red-200 bg-red-50/95 dark:border-red-900 dark:bg-red-950/60",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 font-semibold text-text dark:text-text-invert">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-sm text-text-muted dark:text-slate-300">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-full p-1 text-text-subtle transition hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => onClose(toast.id)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});
