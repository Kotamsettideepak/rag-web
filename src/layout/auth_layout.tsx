import { memo } from "react";
import { Outlet } from "react-router-dom";

export const AuthLayout = memo(function AuthLayout() {
  return <Outlet />;
});
