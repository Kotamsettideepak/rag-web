export type message_role = "user" | "assistant";
export type message_state = "pending" | "streaming" | "complete";

export interface chat_message {
  id: string;
  role: message_role;
  content: string;
  createdAt: string;
  state?: message_state;
}

export interface chat_history_message {
  role: message_role;
  content: string;
}

export interface stored_message {
  id: string;
  chat_id: string;
  role: message_role;
  content: string;
  created_at: string;
}

export interface chat_summary {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface create_chat_response {
  chat_id: string;
}

export interface list_chats_response {
  chats: chat_summary[];
}

export interface chat_messages_response {
  messages: stored_message[];
}

export interface delete_chat_response {
  message: string;
}

export interface ask_question_request {
  chat_id?: string;
  topic_id?: string;
  message: string;
  recent_messages?: chat_history_message[];
}

export interface ask_question_response {
  answer: string;
}

export type chat_stream_event_type = "start" | "chunk" | "done" | "error";

export interface chat_stream_event {
  type: chat_stream_event_type;
  content?: string;
  answer?: string;
  message?: string;
}
