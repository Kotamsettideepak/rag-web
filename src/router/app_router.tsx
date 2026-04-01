import { memo } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { app_routes } from "../constants/routes";
import { AppLayout } from "../layout/app_layout";
import { AuthLayout } from "../layout/auth_layout";
import { RootLayout } from "../layout/root_layout";
import { ChatPage } from "../pages/chat_page";
import { NotFoundPage } from "../pages/not_found_page";
import { SignInPage } from "../pages/sign_in_page";
import { TopicChatPage } from "../pages/topic_chat";
import { ProtectedRoute } from "./protected_route";

export const AppRouter = memo(function AppRouter() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to={app_routes.chat} replace />} />
        <Route element={<AuthLayout />}>
          <Route path={app_routes.signIn} element={<SignInPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path={app_routes.chat} element={<ChatPage />} />
            <Route path={app_routes.topicChat} element={<TopicChatPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
});
