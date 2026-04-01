import { api_client, websocket_base_url } from "./api_client";
import { getStoredToken } from "../lib/auth_storage";
import type {
  quiz_answer_response,
  quiz_history_response,
  quiz_session_detail,
} from "../types/quiz";

export async function startTopicQuiz(topicId: string, topics: string[]): Promise<quiz_session_detail> {
  const response = await api_client.post<quiz_session_detail>(`/topic/${topicId}/quiz/start`, {
    topics,
  });
  return response.data;
}

export async function listTopicQuizHistory(topicId: string): Promise<quiz_history_response> {
  const response = await api_client.get<quiz_history_response>(`/topic/${topicId}/quizzes`);
  return response.data;
}

export async function getTopicQuiz(quizId: string, includeAnswers = false): Promise<quiz_session_detail> {
  const response = await api_client.get<quiz_session_detail>(`/topic/quiz/${quizId}`, {
    params: {
      include_answers: includeAnswers ? "true" : "false",
    },
  });
  return response.data;
}

export async function submitTopicQuizAnswer(
  quizId: string,
  questionId: string,
  payload: {
    response: string;
    response_mode: string;
    elapsed_seconds: number;
  },
): Promise<quiz_answer_response> {
  const response = await api_client.post<quiz_answer_response>(
    `/topic/quiz/${quizId}/questions/${questionId}/answer`,
    payload,
  );
  return response.data;
}

export async function completeTopicQuiz(quizId: string): Promise<quiz_session_detail> {
  const response = await api_client.post<quiz_session_detail>(`/topic/quiz/${quizId}/complete`);
  return response.data;
}

export function openTopicQuizSocket(
  quizId: string,
  handlers: {
    onOpen?: () => void;
    onMessage?: (payload: { type: string; session?: quiz_session_detail; message?: string }) => void;
    onClose?: () => void;
    onError?: () => void;
  },
) {
  const socket = new WebSocket(
    `${websocket_base_url}/ws/topic-quiz/${quizId}?google_token=${encodeURIComponent(getStoredToken() ?? "")}`,
  );

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", () => handlers.onError?.());
  socket.addEventListener("message", (event) => {
    try {
      handlers.onMessage?.(JSON.parse(event.data) as { type: string; session?: quiz_session_detail; message?: string });
    } catch {
      handlers.onError?.();
    }
  });

  return socket;
}
