export interface quiz_session_summary {
  id: string;
  topic_id: string;
  topic_name: string;
  status: string;
  display_state: string;
  report_status: string;
  question_count_per_topic: number;
  requested_topics_count: number;
  generated_questions: number;
  answered_questions: number;
  started_at: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface quiz_topic_item {
  id: string;
  name: string;
  status: string;
  sequence: number;
  generated_questions: number;
  matched_chapters: string[];
  notes?: string;
}

export interface quiz_question_evaluation {
  score: number;
  level: string;
  is_correct: boolean;
  feedback: string;
  improvement_note: string;
}

export interface quiz_question {
  id: string;
  quiz_topic_item_id: string;
  requested_topic: string;
  sequence: number;
  prompt: string;
  question_type: string;
  chapter_name?: string;
  status: string;
  evaluation_status: string;
  user_answer?: string;
  response_mode?: string;
  elapsed_seconds?: number;
  submitted_at?: string;
  evaluation?: quiz_question_evaluation;
  correct_answer?: string;
  supporting_context?: string;
}

export interface quiz_report {
  overall_score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export interface quiz_session_detail {
  session: quiz_session_summary;
  topic_items: quiz_topic_item[];
  questions: quiz_question[];
  report?: quiz_report;
}

export interface quiz_history_response {
  quizzes: quiz_session_summary[];
}

export interface quiz_answer_response {
  question: quiz_question;
}
