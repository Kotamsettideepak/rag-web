export const app_routes = {
  root: "/",
  signIn: "/sign-in",
  chat: "/chat",
  topicChat: "/topics/:topicId",
} as const;

export function topic_chat_route(topicId: string) {
  return `/topics/${encodeURIComponent(topicId)}`;
}
