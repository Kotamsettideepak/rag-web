import { memo } from "react";

export const AdminPage = memo(function AdminPage() {
  return (
    <section className="rounded-[2rem] border border-border-soft bg-white/85 p-8 shadow-panel dark:border-slate-800 dark:bg-slate-950/80">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Admin</p>
      <h1 className="m-0 mt-3 text-3xl font-bold text-text dark:text-text-invert">This is Admin page</h1>
      <p className="mt-4 text-text-muted dark:text-slate-300">
        Backend-driven admin controls will be added here once the admin API and roles plan is ready.
      </p>
    </section>
  );
});
