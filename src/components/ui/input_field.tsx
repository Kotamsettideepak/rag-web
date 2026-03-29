import { memo, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type input_field_props = InputHTMLAttributes<HTMLInputElement>;

export const InputField = memo(function InputField({ className, ...props }: input_field_props) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-border-soft bg-white/90 px-4 text-[#1d2942] outline-none transition-all duration-200 ease-out placeholder:text-text-subtle focus:border-brand focus:ring-2 focus:ring-brand/15",
        className,
      )}
      {...props}
    />
  );
});
