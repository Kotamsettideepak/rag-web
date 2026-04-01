import { api_client, websocket_base_url } from "./api_client";
import { getStoredToken } from "../lib/auth_storage";
import type {
  ask_question_request,
  ask_question_response,
  chat_messages_response,
  chat_stream_event,
  create_chat_response,
  delete_chat_response,
  list_chats_response,
} from "../types/chat";
import type { chat_uploads_response, voice_chat_response } from "../types/upload";

const use_mocks = !import.meta.env.VITE_ENABLE_BACKEND;

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function createChat(title: string): Promise<create_chat_response> {
  if (use_mocks) {
    await delay(200);
    return { chat_id: crypto.randomUUID() };
  }

  const response = await api_client.post<create_chat_response>("/chat/create", { title });
  return response.data;
}

export async function listChats(): Promise<list_chats_response> {
  if (use_mocks) {
    await delay(200);
    return { chats: [] };
  }

  const response = await api_client.get<list_chats_response>("/chat/list");
  return response.data;
}

export async function getChatMessages(chatId: string): Promise<chat_messages_response> {
  if (use_mocks) {
    await delay(200);
    return { messages: [] };
  }

  const response = await api_client.get<chat_messages_response>(`/chat/${chatId}/messages`);
  return response.data;
}

export async function getChatUploads(chatId: string): Promise<chat_uploads_response> {
  if (use_mocks) {
    await delay(200);
    return { uploads: [] };
  }

  const response = await api_client.get<chat_uploads_response>(`/chat/${chatId}/uploads`);
  return response.data;
}

export async function deleteChat(chatId: string): Promise<delete_chat_response> {
  if (use_mocks) {
    await delay(200);
    return { message: "Chat deleted successfully" };
  }

  const response = await api_client.delete<delete_chat_response>(`/chat/${chatId}`);
  return response.data;
}

export async function askQuestion(payload: ask_question_request): Promise<ask_question_response> {
  if (use_mocks) {
    await delay(300);
    return { answer: `Mocked answer for "${payload.message}"` };
  }

  const response = await api_client.post<ask_question_response>("/chat", payload);
  return response.data;
}

export async function sendVoiceChat(
  audio: Blob,
  target: { chatId?: string; topicId?: string },
  signal?: AbortSignal,
): Promise<voice_chat_response> {
  if (use_mocks) {
    await delay(500);
    return { transcript: "Mock transcript from voice input" };
  }

  const formData = new FormData();
  formData.append("audio", audio, "voice-question.webm");
  if (target.chatId?.trim()) {
    formData.append("chat_id", target.chatId.trim());
  }
  if (target.topicId?.trim()) {
    formData.append("topic_id", target.topicId.trim());
  }

  const response = await api_client.post<voice_chat_response>("/voice/chat", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
      ...(getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {}),
    },
    signal,
  });
  return response.data;
}

export function openChatSocket(handlers: {
  onOpen?: () => void;
  onMessage?: (event: chat_stream_event) => void;
  onClose?: () => void;
  onError?: () => void;
}) {
  const socket = new WebSocket(
    `${websocket_base_url}/ws?google_token=${encodeURIComponent(getStoredToken() ?? "")}`,
  );

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", () => handlers.onError?.());
  socket.addEventListener("message", (event) => {
    try {
      handlers.onMessage?.(JSON.parse(event.data) as chat_stream_event);
    } catch {
      handlers.onError?.();
    }
  });

  return socket;
}
