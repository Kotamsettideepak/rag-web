import { memo } from "react";
import { Link } from "react-router-dom";
import { app_routes } from "../constants/routes";

export const NotFoundPage = memo(function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-lg rounded-[2rem] border border-border-soft bg-white/85 p-8 text-center shadow-panel dark:border-slate-800 dark:bg-slate-950/80">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">404</p>
        <h1 className="m-0 mt-3 text-4xl font-bold text-text dark:text-text-invert">Page not found</h1>
        <p className="mt-4 text-text-muted dark:text-slate-300">
          The page you requested does not exist or the route has changed.
        </p>
        <Link
          to={app_routes.chat}
          className="mt-6 inline-flex min-h-[2.75rem] items-center justify-center rounded-full bg-slate-950 px-5 font-semibold text-white shadow-card transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Go to chat
        </Link>
      </div>
    </div>
  );
});
