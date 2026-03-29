import { memo, type PropsWithChildren } from "react";
import { cn } from "../../lib/cn";

interface alert_props extends PropsWithChildren {
  variant?: "info" | "success" | "warning" | "danger";
}

export const Alert = memo(function Alert({ children, variant = "info" }: alert_props) {
  return (
    <div
      className={cn(
        "rounded-3xl border px-4 py-3 text-sm shadow-sm",
        variant === "info" && "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200",
        variant === "success" &&
          "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200",
        variant === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
        variant === "danger" && "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
      )}
    >
      {children}
    </div>
  );
});
