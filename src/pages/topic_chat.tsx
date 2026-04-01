import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, History, Mic, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ChatComposer } from "../components/chat/chat_composer";
import { ChatMessageList } from "../components/chat/chat_message_list";
import { Button } from "../components/ui/button";
import { app_routes } from "../constants/routes";
import { useChatStream } from "../hooks/use_chat_stream";
import { usePageLoading } from "../hooks/use_page_loading";
import { useToast } from "../hooks/use_toast";
import { sendVoiceChat } from "../requests/chat_request";
import { completeTopicQuiz, getTopicQuiz, listTopicQuizHistory, openTopicQuizSocket, startTopicQuiz, submitTopicQuizAnswer } from "../requests/quiz_request";
import { listTopics } from "../requests/topic_request";
import type { chat_history_message, chat_message } from "../types/chat";
import type { quiz_question, quiz_session_detail, quiz_session_summary } from "../types/quiz";
import type { topic_summary } from "../types/topic";

function createLocalMessage(role: chat_message["role"], content: string, state: chat_message["state"] = "complete"): chat_message {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString(), state };
}

function buildRecentHistory(messages: chat_message[]): chat_history_message[] {
  return [...messages].filter((m) => m.content.trim() && m.state !== "pending").slice(-5).reverse().map((m) => ({ role: m.role, content: m.content.trim() }));
}

function parseQuizTopics(value: string) {
  return value.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean);
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function questionKey(question: quiz_question | null) {
  return question?.id ?? "none";
}

function firstOpenQuestionIndex(questions: quiz_question[]) {
  const index = questions.findIndex((question) => !question.user_answer?.trim());
  return index >= 0 ? index : 0;
}

export const TopicChatPage = memo(function TopicChatPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const streamQuestion = useChatStream();
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [topics, setTopics] = useState<topic_summary[]>([]);
  const [messages, setMessages] = useState<chat_message[]>([]);
  const [draft, setDraft] = useState("");
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [quizInput, setQuizInput] = useState("");
  const [quizHistory, setQuizHistory] = useState<quiz_session_summary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isQuizStarting, setIsQuizStarting] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<quiz_session_detail | null>(null);
  const [quizView, setQuizView] = useState<"chat" | "quiz">("chat");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizAnswerDraft, setQuizAnswerDraft] = useState("");
  const [questionCountdown, setQuestionCountdown] = useState(20);
  const [questionReadyForNext, setQuestionReadyForNext] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isQuizCompleting, setIsQuizCompleting] = useState(false);

  const isLoadingState = usePageLoading(isBootLoading);
  const activeTopic = useMemo(() => topics.find((topic) => topic.id === topicId) ?? null, [topicId, topics]);
  const activeQuestion = useMemo(() => activeQuiz?.questions[currentQuestionIndex] ?? null, [activeQuiz, currentQuestionIndex]);
  const currentQuestionAnswered = Boolean(activeQuestion?.user_answer?.trim());
  const hasPreviousQuestion = currentQuestionIndex > 0;
  const hasNextQuestion = Boolean(activeQuiz && currentQuestionIndex < activeQuiz.questions.length - 1);
  const canFinishQuiz = Boolean(activeQuiz && activeQuiz.questions.length > 0 && activeQuiz.session.answered_questions >= activeQuiz.session.generated_questions);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      setIsBootLoading(true);
      try {
        const response = await listTopics();
        if (isMounted) setTopics(response.topics);
      } catch (error) {
        pushToast("Failed to load topic", error instanceof Error ? error.message : "Try again in a moment.", "danger");
      } finally {
        if (isMounted) setIsBootLoading(false);
      }
    })();
    return () => { isMounted = false; socketRef.current?.close(); mediaRecorderRef.current?.stop(); mediaStreamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, [pushToast]);

  useEffect(() => {
    setCurrentQuestionIndex((current) => {
      if (!activeQuiz || activeQuiz.questions.length === 0) return 0;
      return Math.min(current, activeQuiz.questions.length - 1);
    });
  }, [activeQuiz]);

  useEffect(() => {
    setQuizAnswerDraft(activeQuestion?.user_answer ?? "");
    setQuestionCountdown(20);
    setQuestionReadyForNext(Boolean(activeQuestion?.user_answer));
    if (!activeQuestion || activeQuestion.user_answer) return;
    const timer = window.setInterval(() => {
      setQuestionCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setQuestionReadyForNext(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [questionKey(activeQuestion)]);

  const openQuizStream = useCallback((quizId: string) => {
    socketRef.current?.close();
    socketRef.current = openTopicQuizSocket(quizId, {
      onMessage: (payload) => payload.session && setActiveQuiz(payload.session),
      onError: () => pushToast("Quiz stream disconnected", "Trying to keep your quiz synced.", "warning"),
    });
  }, [pushToast]);

  useEffect(() => {
    if (!activeQuiz || activeQuiz.session.status === "completed") {
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }
    openQuizStream(activeQuiz.session.id);
    return () => { socketRef.current?.close(); socketRef.current = null; };
  }, [activeQuiz?.session.id, activeQuiz?.session.status, openQuizStream]);

  const loadHistory = useCallback(async () => {
    if (!topicId) return;
    setIsHistoryLoading(true);
    try {
      const response = await listTopicQuizHistory(topicId);
      setQuizHistory(response.quizzes);
    } catch (error) {
      pushToast("Failed to load quiz history", error instanceof Error ? error.message : "Try again in a moment.", "danger");
    } finally {
      setIsHistoryLoading(false);
    }
  }, [pushToast, topicId]);

  const sendQuestion = useCallback(async () => {
    const question = draft.trim();
    if (!question || !topicId) return;
    const userMessage = createLocalMessage("user", question);
    const assistantMessage = createLocalMessage("assistant", "", "pending");
    setDraft("");
    setIsSending(true);
    setMessages((current) => [...current, userMessage, assistantMessage]);
    try {
      await streamQuestion({ topicId, recentMessages: buildRecentHistory(messages) }, question, {
        onMessage: (event) => {
          if (event.type === "chunk") {
            setMessages((current) => current.map((message) => message.id === assistantMessage.id ? { ...message, state: "streaming", content: `${message.content}${event.content || ""}` } : message));
          }
          if (event.type === "done") {
            setMessages((current) => current.map((message) => message.id === assistantMessage.id ? { ...message, state: "complete", content: event.answer || message.content } : message));
          }
        },
      });
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantMessage.id ? { ...message, state: "complete", content: error instanceof Error ? error.message : "Topic chat failed." } : message));
      pushToast("Topic chat failed", error instanceof Error ? error.message : "Try again in a moment.", "danger");
    } finally {
      setIsSending(false);
    }
  }, [draft, messages, pushToast, streamQuestion, topicId]);

  const transcribeVoice = useCallback(async (target: "chat" | "quiz") => {
    if (!topicId) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data); });
      recorder.addEventListener("stop", () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);
        void (async () => {
          try {
            const response = await sendVoiceChat(blob, { topicId });
            if (target === "chat") setDraft(response.transcript);
            else setQuizAnswerDraft(response.transcript);
          } catch (error) {
            pushToast("Voice input failed", error instanceof Error ? error.message : "Try again in a moment.", "danger");
          }
        })();
      });
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      pushToast("Microphone unavailable", error instanceof Error ? error.message : "Please allow microphone access.", "danger");
    }
  }, [isRecording, pushToast, topicId]);

  const handleQuizStart = useCallback(async () => {
    if (!topicId) return;
    const requestedTopics = parseQuizTopics(quizInput);
    if (requestedTopics.length < 5) {
      pushToast("Minimum 5 topics required", "Please enter at least 5 quiz topics.", "warning");
      return;
    }
    setIsQuizStarting(true);
    try {
      const detail = await startTopicQuiz(topicId, requestedTopics);
      setActiveQuiz(detail);
      setCurrentQuestionIndex(firstOpenQuestionIndex(detail.questions));
      setQuizView("quiz");
      setQuizInput("");
      setIsQuizModalOpen(false);
      openQuizStream(detail.session.id);
      void loadHistory();
    } catch (error) {
      pushToast("Failed to start quiz", error instanceof Error ? error.message : "Try again in a moment.", "danger");
    } finally {
      setIsQuizStarting(false);
    }
  }, [loadHistory, openQuizStream, pushToast, quizInput, topicId]);

  const openHistoryQuiz = useCallback(async (quizId: string) => {
    try {
      const detail = await getTopicQuiz(quizId, true);
      setActiveQuiz(detail);
      setCurrentQuestionIndex(firstOpenQuestionIndex(detail.questions));
      setQuizView("quiz");
      setIsQuizModalOpen(false);
      if (detail.session.status !== "completed") openQuizStream(detail.session.id);
    } catch (error) {
      pushToast("Failed to open quiz", error instanceof Error ? error.message : "Try again in a moment.", "danger");
    }
  }, [openQuizStream, pushToast]);

  const handleNextQuestion = useCallback(async () => {
    if (!activeQuiz || !activeQuestion) return;
    if (currentQuestionAnswered) {
      if (hasNextQuestion) setCurrentQuestionIndex((current) => current + 1);
      return;
    }
    if (!questionReadyForNext || !quizAnswerDraft.trim()) return;
    setIsSubmittingAnswer(true);
    try {
      const response = await submitTopicQuizAnswer(activeQuiz.session.id, activeQuestion.id, { response: quizAnswerDraft.trim(), response_mode: "typed", elapsed_seconds: 20 - questionCountdown });
      setActiveQuiz((current) => current ? { ...current, session: { ...current.session, answered_questions: Math.min(current.session.answered_questions + 1, current.questions.length) }, questions: current.questions.map((question) => question.id === response.question.id ? response.question : question) } : current);
      if (hasNextQuestion) setCurrentQuestionIndex((current) => current + 1);
    } catch (error) {
      pushToast("Failed to save answer", error instanceof Error ? error.message : "Try again in a moment.", "danger");
    } finally {
      setIsSubmittingAnswer(false);
    }
  }, [activeQuestion, activeQuiz, currentQuestionAnswered, hasNextQuestion, pushToast, questionCountdown, questionReadyForNext, quizAnswerDraft]);

  const handleCompleteQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    setIsQuizCompleting(true);
    try {
      setActiveQuiz(await completeTopicQuiz(activeQuiz.session.id));
      void loadHistory();
    } catch (error) {
      pushToast("Failed to complete quiz", error instanceof Error ? error.message : "Try again in a moment.", "danger");
    } finally {
      setIsQuizCompleting(false);
    }
  }, [activeQuiz, loadHistory, pushToast]);

  return (
    <div className="h-full overflow-hidden bg-slate-50">
      <div className="mx-auto flex h-full max-w-7xl flex-col px-4 py-4 lg:px-6">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-3 shadow-card">
          <div className="mb-2 flex items-center justify-between gap-3 rounded-[1.4rem] border border-slate-200/80 bg-slate-50/90 px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <BookOpenText size={16} />
              </div>
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-semibold text-slate-900">{activeTopic?.name || "Selected topic"}</p>
                <p className="m-0 text-xs text-slate-500">{quizView === "quiz" ? "Topic quiz workspace" : "Topic chat"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="rounded-2xl px-4" onClick={() => { setIsQuizModalOpen(true); void loadHistory(); }}>
                QUIZ
              </Button>
              <Button variant="ghost" className="gap-2 rounded-2xl px-3 text-sm" onClick={() => navigate(app_routes.chat)}>
                <ArrowLeft size={15} />
                Back
              </Button>
            </div>
          </div>

          <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-3">
            {quizView === "chat" ? (
              <ChatMessageList messages={messages} isProcessing={false} isLoading={isLoadingState} />
            ) : !activeQuiz ? (
              <div className="grid min-h-[24rem] place-items-center p-8 text-center">
                <div className="max-w-2xl">
                  <h2 className="m-0 text-[2.4rem] font-extrabold leading-tight tracking-[-0.03em] text-[#10255f]">
                    Generate a focused quiz from this topic
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-[1.02rem] leading-8 text-[#4b5d79]">
                    Start a quiz from the selected topic and questions will appear here as soon as each topic batch is ready.
                  </p>
                  <div className="mt-6 flex justify-center gap-3">
                    <Button onClick={() => { setIsQuizModalOpen(true); void loadHistory(); }}>QUIZ</Button>
                    <Button variant="secondary" onClick={() => setQuizView("chat")}>Back To Chat</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="lg:sticky lg:top-0 lg:self-start">
                  <div className="rounded-[1.5rem] border border-slate-200/80 bg-slate-50/70 p-4">
                    <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Topic Quiz</p>
                    <h2 className="mt-2 text-[1.6rem] font-bold text-[#12244d]">{activeQuiz.session.topic_name}</h2>
                    <p className="m-0 mt-2 text-sm leading-7 text-slate-500">
                      {activeQuiz.session.generated_questions} questions ready across {activeQuiz.session.requested_topics_count} requested topics
                    </p>

                    <div className="mt-4 flex flex-col gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setIsQuizModalOpen(true); void loadHistory(); }}>
                        <History size={15} />
                        History
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setQuizView("chat")}>
                        Back To Chat
                      </Button>
                    </div>

                    <div className="mt-5 space-y-2">
                      {activeQuiz.topic_items.map((item) => (
                        <div key={item.id} className="rounded-[1rem] border border-slate-200 bg-white px-3 py-2">
                          <p className="m-0 text-sm font-semibold text-slate-800">{item.name}</p>
                          <p className="m-0 mt-1 text-xs text-slate-500">{formatStatus(item.status)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>

                <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                  {activeQuiz.questions.length === 0 ? (
                    <div className="grid min-h-[18rem] place-items-center rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-8 text-center">
                      <div className="max-w-xl">
                        <h3 className="m-0 text-[1.5rem] font-semibold text-[#12244d]">Questions are being prepared</h3>
                        <p className="mt-3 text-sm leading-7 text-slate-500">
                          Stay here and new questions will appear automatically when each requested topic is ready.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="m-0 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}
                            </p>
                            <p className="m-0 mt-1 text-sm text-slate-500">
                              {activeQuestion?.requested_topic}{activeQuestion?.chapter_name ? ` - ${activeQuestion.chapter_name}` : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              {formatStatus(activeQuiz.session.display_state)}
                            </span>
                            <p className="m-0 mt-2 text-sm font-semibold text-[#12244d]">
                              {currentQuestionAnswered ? "Answer saved" : questionReadyForNext ? "Next unlocked" : `Next in ${questionCountdown}s`}
                            </p>
                          </div>
                        </div>

                        <h3 className="mt-4 text-[1.35rem] font-semibold leading-8 text-[#12244d]">{activeQuestion?.prompt}</h3>

                        <div className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50/70 p-4">
                          <label className="text-sm font-semibold text-slate-700">Your answer</label>
                          <textarea
                            value={quizAnswerDraft}
                            disabled={currentQuestionAnswered}
                            onChange={(event) => setQuizAnswerDraft(event.target.value)}
                            className="mt-2 min-h-[12rem] w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100"
                            placeholder="Type your answer here..."
                          />
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <Button variant="secondary" size="sm" className="gap-2" disabled={currentQuestionAnswered} onClick={() => void transcribeVoice("quiz")}>
                              <Mic size={15} />
                              {isRecording ? "Recording..." : "Speak Answer"}
                            </Button>
                            <p className="m-0 text-xs text-slate-500">
                              {currentQuestionAnswered ? "Your answer is saved and waiting for evaluation." : questionReadyForNext ? "You can move to the next question now." : "Wait for the 20 second timer to unlock next."}
                            </p>
                          </div>
                        </div>

                        {activeQuestion?.evaluation ? (
                          <div className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-4">
                            <p className="m-0 text-sm font-semibold text-slate-700">
                              Evaluation: <span className="text-[#10255f]">{activeQuestion.evaluation.score}/100 - {formatStatus(activeQuestion.evaluation.level)}</span>
                            </p>
                            <p className="m-0 mt-2 text-sm leading-7 text-slate-600">{activeQuestion.evaluation.feedback}</p>
                            {activeQuestion.evaluation.improvement_note ? (
                              <p className="m-0 mt-2 text-sm leading-7 text-slate-500">Improve: {activeQuestion.evaluation.improvement_note}</p>
                            ) : null}
                          </div>
                        ) : activeQuestion?.evaluation_status === "processing" || activeQuestion?.evaluation_status === "queued" ? (
                          <div className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-4">
                            <p className="m-0 text-sm leading-7 text-slate-600">
                              Evaluation is running in the background. You can continue with the quiz while the backend processes this answer.
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-between gap-3">
                          <Button variant="secondary" size="sm" disabled={!hasPreviousQuestion} onClick={() => setCurrentQuestionIndex((current) => Math.max(current - 1, 0))}>
                            Previous
                          </Button>
                          <div className="flex gap-2">
                            {canFinishQuiz ? (
                              <Button onClick={() => void handleCompleteQuiz()} disabled={isQuizCompleting}>
                                {isQuizCompleting ? "Finishing..." : "Finish Quiz"}
                              </Button>
                            ) : null}
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={(!currentQuestionAnswered && (!questionReadyForNext || !quizAnswerDraft.trim())) || isSubmittingAnswer || !hasNextQuestion}
                              onClick={() => void handleNextQuestion()}
                            >
                              {isSubmittingAnswer ? "Saving..." : currentQuestionAnswered ? "Next" : "Save & Next"}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {activeQuiz.report ? (
                        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                          <h3 className="m-0 text-[1.15rem] font-semibold text-[#12244d]">Quiz Report</h3>
                          <p className="mt-2 text-sm leading-7 text-slate-600">{activeQuiz.report.summary}</p>
                          <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <div className="rounded-[1.25rem] bg-slate-50 p-4">
                              <p className="m-0 text-sm font-semibold text-slate-700">Strengths</p>
                              <div className="mt-2 space-y-2">{activeQuiz.report.strengths.map((item) => <p key={item} className="m-0 text-sm leading-6 text-slate-600">{item}</p>)}</div>
                            </div>
                            <div className="rounded-[1.25rem] bg-slate-50 p-4">
                              <p className="m-0 text-sm font-semibold text-slate-700">Weaknesses</p>
                              <div className="mt-2 space-y-2">{activeQuiz.report.weaknesses.map((item) => <p key={item} className="m-0 text-sm leading-6 text-slate-600">{item}</p>)}</div>
                            </div>
                            <div className="rounded-[1.25rem] bg-slate-50 p-4">
                              <p className="m-0 text-sm font-semibold text-slate-700">Recommendations</p>
                              <div className="mt-2 space-y-2">{activeQuiz.report.recommendations.map((item) => <p key={item} className="m-0 text-sm leading-6 text-slate-600">{item}</p>)}</div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {quizView === "chat" ? (
            <div className="border-t border-slate-200/70 pt-3">
              <ChatComposer value={draft} isSending={isSending} isRecording={isRecording} isSpeaking={false} disabled={!topicId || isSending || isLoadingState} showUpload={false} showVoice onChange={setDraft} onUpload={() => undefined} onMicToggle={() => void transcribeVoice("chat")} onSend={() => void sendQuestion()} />
            </div>
          ) : null}
        </section>
      </div>

      {isQuizModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 px-4">
          <div className="w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Topic Quiz</p>
                <h2 className="mt-1 text-[1.75rem] font-bold text-[#12244d]">Build a quiz from {activeTopic?.name || "this topic"}</h2>
                <p className="m-0 mt-2 text-sm leading-7 text-slate-500">Enter at least 5 quiz topics or subtopics. Questions are saved first and then sent to the frontend when ready.</p>
              </div>
              <button type="button" className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" onClick={() => setIsQuizModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <label className="text-sm font-semibold text-slate-700">Quiz topics</label>
                <textarea value={quizInput} onChange={(event) => setQuizInput(event.target.value)} placeholder={"OOPs\nThreads\nMultithreading\nExceptions\nThread pools"} className="mt-2 min-h-[14rem] w-full rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
                <p className="mt-2 text-xs text-slate-500">Separate topics with commas or new lines. Minimum 5.</p>
                <div className="mt-4 flex gap-3">
                  <Button onClick={() => void handleQuizStart()} disabled={isQuizStarting}>{isQuizStarting ? "Starting..." : "Start Quiz"}</Button>
                  <Button variant="secondary" onClick={() => setQuizView("quiz")} disabled={!activeQuiz}>Open Current Quiz</Button>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="m-0 text-sm font-semibold text-slate-900">Quiz history</p>
                    <p className="m-0 text-xs text-slate-500">Reopen previous attempts for this topic</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void loadHistory()}>Refresh</Button>
                </div>

                <div className="mt-4 max-h-[18rem] space-y-3 overflow-y-auto pr-1">
                  {isHistoryLoading ? (
                    <p className="m-0 text-sm text-slate-500">Loading history...</p>
                  ) : quizHistory.length === 0 ? (
                    <p className="m-0 text-sm text-slate-500">No quiz attempts yet.</p>
                  ) : (
                    quizHistory.map((quiz) => (
                      <button key={quiz.id} type="button" onClick={() => void openHistoryQuiz(quiz.id)} className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
                        <p className="m-0 text-sm font-semibold text-slate-900">{quiz.generated_questions} questions - {formatStatus(quiz.status)}</p>
                        <p className="m-0 mt-1 text-xs text-slate-500">Created {new Date(quiz.created_at).toLocaleString()}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
