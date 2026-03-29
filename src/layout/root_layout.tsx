import { memo } from "react";
import { Outlet } from "react-router-dom";

export const RootLayout = memo(function RootLayout() {
  return (
    <div className="h-screen overflow-hidden bg-page-grid">
      <Outlet />
    </div>
  );
});
