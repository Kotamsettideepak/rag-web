import { useCallback } from "react";
import { openChatSocket } from "../requests/chat_request";
import type { chat_stream_event } from "../types/chat";

interface stream_handlers {
  onOpen?: () => void;
  onMessage?: (event: chat_stream_event) => void;
}

export function useChatStream() {
  return useCallback((chatId: string, question: string, handlers: stream_handlers = {}) => {
    return new Promise<void>((resolve, reject) => {
      let didFinish = false;

      const socket = openChatSocket({
        onOpen: () => {
          handlers.onOpen?.();
          socket.send(
            JSON.stringify({
              type: "ask",
              chat_id: chatId,
              question,
            }),
          );
        },
        onMessage: (event) => {
          handlers.onMessage?.(event);
          if (event.type === "done") {
            didFinish = true;
            socket.close();
            resolve();
          }
          if (event.type === "error") {
            didFinish = true;
            socket.close();
            reject(new Error(event.message || "Streaming failed"));
          }
        },
        onClose: () => {
          if (!didFinish) {
            reject(new Error("Chat connection closed before the response finished."));
          }
        },
        onError: () => {
          if (!didFinish) {
            reject(new Error("Chat connection failed."));
          }
        },
      });
    });
  }, []);
}
