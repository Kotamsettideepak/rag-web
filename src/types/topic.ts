export interface topic_summary {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface list_topics_response {
  topics: topic_summary[];
}
