import { memo } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { app_routes } from "../constants/routes";
import { useAuth } from "../hooks/use_auth";
import { PageLoader } from "../components/ui/page_loader";

export const ProtectedRoute = memo(function ProtectedRoute() {
  const location = useLocation();
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    return <PageLoader title="Checking session" description="Verifying your Google sign-in and workspace access." />;
  }

  if (!isAuthenticated) {
    return <Navigate to={app_routes.signIn} replace state={{ from: location }} />;
  }

  return <Outlet />;
});
