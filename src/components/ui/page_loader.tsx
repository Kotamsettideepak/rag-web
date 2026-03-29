import { memo } from "react";

interface page_loader_props {
  title?: string;
  description?: string;
}

export const PageLoader = memo(function PageLoader({
  title = "Loading workspace",
  description = "Preparing your session and application shell.",
}: page_loader_props) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[2rem] border border-border-soft bg-white/90 p-8 text-center shadow-panel backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto mb-5 flex h-12 w-12 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
        <h1 className="m-0 text-2xl font-bold text-text dark:text-text-invert">{title}</h1>
        <p className="mt-2 text-sm text-text-muted dark:text-slate-300">{description}</p>
      </div>
    </div>
  );
});
