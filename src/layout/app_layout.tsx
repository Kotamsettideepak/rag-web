import { memo } from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "./navbar";

export const AppLayout = memo(function AppLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />
      <main className="h-[calc(100vh-4.5rem)] overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
});
