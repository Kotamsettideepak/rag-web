import { memo } from "react";

interface progress_bar_props {
  value: number;
}

export const ProgressBar = memo(function ProgressBar({ value }: progress_bar_props) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <span
        className="block h-full rounded-full bg-gradient-to-r from-brand to-cyan-500 transition-all"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
});
