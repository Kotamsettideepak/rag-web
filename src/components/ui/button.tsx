import { memo, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface button_props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = memo(function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: button_props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand text-white shadow-card hover:bg-brand-deep",
        variant === "secondary" &&
          "border border-border-soft bg-white/92 text-[#24304a] hover:bg-slate-50",
        variant === "ghost" && "text-text-muted hover:bg-slate-100/80",
        variant === "danger" && "bg-danger text-white hover:bg-red-700",
        size === "sm" && "min-h-[2.25rem] px-3 text-sm",
        size === "md" && "min-h-[2.75rem] px-4",
        size === "lg" && "min-h-[3rem] px-5",
        size === "icon" && "h-11 w-11 rounded-2xl",
        className,
      )}
      {...props}
    />
  );
});
