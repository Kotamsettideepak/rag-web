import { api_client } from "./api_client";
import type { list_topics_response } from "../types/topic";

const use_mocks = !import.meta.env.VITE_ENABLE_BACKEND;

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function listTopics(): Promise<list_topics_response> {
  if (use_mocks) {
    await delay(200);
    return { topics: [] };
  }

  const response = await api_client.get<list_topics_response>("/topic/list");
  return response.data;
}
