import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpenText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ChatComposer } from "../components/chat/chat_composer";
import { ChatMessageList } from "../components/chat/chat_message_list";
import { Button } from "../components/ui/button";
import { app_routes } from "../constants/routes";
import { useChatStream } from "../hooks/use_chat_stream";
import { usePageLoading } from "../hooks/use_page_loading";
import { useToast } from "../hooks/use_toast";
import { sendVoiceChat } from "../requests/chat_request";
import { listTopics } from "../requests/topic_request";
import type { chat_history_message, chat_message } from "../types/chat";
import type { topic_summary } from "../types/topic";

function createLocalMessage(
  role: chat_message["role"],
  content: string,
  state: chat_message["state"] = "complete",
): chat_message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    state,
  };
}

function buildRecentHistory(messages: chat_message[]): chat_history_message[] {
  return [...messages]
    .filter((message) => message.content.trim() && message.state !== "pending")
    .slice(-5)
    .reverse()
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

export const TopicChatPage = memo(function TopicChatPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const streamQuestion = useChatStream();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const silenceAnimationRef = useRef<number | null>(null);
  const silenceAudioContextRef = useRef<AudioContext | null>(null);
  const lastSpeechAtRef = useRef<number>(0);

  const [topics, setTopics] = useState<topic_summary[]>([]);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<chat_message[]>([]);

  const isLoadingState = usePageLoading(isBootLoading);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      setIsBootLoading(true);
      try {
        const response = await listTopics();
        if (!isMounted) {
          return;
        }
        setTopics(response.topics);
      } catch (error) {
        pushToast(
          "Failed to load topic",
          error instanceof Error ? error.message : "Try again in a moment.",
          "danger",
        );
      } finally {
        if (isMounted) {
          setIsBootLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [pushToast]);

  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === topicId) ?? null,
    [topicId, topics],
  );

  const stopSilenceMonitor = useCallback(() => {
    if (silenceAnimationRef.current !== null) {
      window.cancelAnimationFrame(silenceAnimationRef.current);
      silenceAnimationRef.current = null;
    }
    if (silenceAudioContextRef.current) {
      void silenceAudioContextRef.current.close();
      silenceAudioContextRef.current = null;
    }
  }, []);

  const startSilenceMonitor = useCallback((stream: MediaStream, recorder: MediaRecorder) => {
    stopSilenceMonitor();
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const silenceMs = 3000;
    const speechThreshold = 0.02;
    lastSpeechAtRef.current = performance.now();
    silenceAudioContextRef.current = audioContext;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        energy += centered * centered;
      }
      const rms = Math.sqrt(energy / samples.length);
      const now = performance.now();
      if (rms >= speechThreshold) {
        lastSpeechAtRef.current = now;
      } else if (now - lastSpeechAtRef.current >= silenceMs) {
        if (recorder.state === "recording") {
          recorder.stop();
        }
        stopSilenceMonitor();
        return;
      }
      silenceAnimationRef.current = window.requestAnimationFrame(tick);
    };

    silenceAnimationRef.current = window.requestAnimationFrame(tick);
  }, [stopSilenceMonitor]);

  useEffect(() => {
    return () => {
      stopSilenceMonitor();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopSilenceMonitor]);

  const sendQuestion = useCallback(async () => {
    const nextQuestion = draft.trim();
    if (!nextQuestion || !topicId) {
      return;
    }

    const userMessage = createLocalMessage("user", nextQuestion);
    const assistantMessage = createLocalMessage("assistant", "", "pending");
    const recentMessages = buildRecentHistory(messages);

    setDraft("");
    setIsSending(true);
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      await streamQuestion(
        {
          topicId,
          recentMessages,
        },
        nextQuestion,
        {
          onMessage: (event) => {
            if (event.type === "chunk") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        state: "streaming",
                        content: `${message.content}${event.content || ""}`,
                      }
                    : message,
                ),
              );
            }
            if (event.type === "done") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        state: "complete",
                        content: event.answer || message.content,
                      }
                    : message,
                ),
              );
            }
          },
        },
      );
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                state: "complete",
                content:
                  error instanceof Error ? error.message : "Topic chat failed.",
              }
            : message,
        ),
      );
      pushToast(
        "Topic chat failed",
        error instanceof Error ? error.message : "Try again in a moment.",
        "danger",
      );
    } finally {
      setIsSending(false);
    }
  }, [draft, messages, pushToast, streamQuestion, topicId]);

  const handleMicToggle = useCallback(async () => {
    if (!topicId || isLoadingState) {
      return;
    }

    if (isRecording) {
      stopSilenceMonitor();
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", () => {
        stopSilenceMonitor();
        const blob = new Blob(recordedChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);

        void (async () => {
          try {
            const response = await sendVoiceChat(blob, { topicId });
            setDraft(response.transcript);
            setTimeout(() => {
              void (async () => {
                const nextQuestion = response.transcript.trim();
                if (!nextQuestion) {
                  return;
                }
                const userMessage = createLocalMessage("user", nextQuestion);
                const assistantMessage = createLocalMessage("assistant", "", "pending");
                const recentMessages = buildRecentHistory(messages);

                setDraft("");
                setIsSending(true);
                setMessages((current) => [...current, userMessage, assistantMessage]);

                try {
                  await streamQuestion(
                    {
                      topicId,
                      recentMessages,
                    },
                    nextQuestion,
                    {
                      onMessage: (event) => {
                        if (event.type === "chunk") {
                          setMessages((current) =>
                            current.map((message) =>
                              message.id === assistantMessage.id
                                ? {
                                    ...message,
                                    state: "streaming",
                                    content: `${message.content}${event.content || ""}`,
                                  }
                                : message,
                            ),
                          );
                        }
                        if (event.type === "done") {
                          setMessages((current) =>
                            current.map((message) =>
                              message.id === assistantMessage.id
                                ? {
                                    ...message,
                                    state: "complete",
                                    content: event.answer || message.content,
                                  }
                                : message,
                            ),
                          );
                        }
                      },
                    },
                  );
                } catch (error) {
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === assistantMessage.id
                        ? {
                            ...message,
                            state: "complete",
                            content:
                              error instanceof Error ? error.message : "Topic chat failed.",
                          }
                        : message,
                    ),
                  );
                  pushToast(
                    "Topic chat failed",
                    error instanceof Error ? error.message : "Try again in a moment.",
                    "danger",
                  );
                } finally {
                  setIsSending(false);
                }
              })();
            }, 0);
          } catch (error) {
            pushToast(
              "Voice chat failed",
              error instanceof Error ? error.message : "Try again in a moment.",
              "danger",
            );
          }
        })();
      });

      mediaRecorder.start();
      startSilenceMonitor(stream, mediaRecorder);
      setIsRecording(true);
    } catch (error) {
      pushToast(
        "Microphone unavailable",
        error instanceof Error ? error.message : "Please allow microphone access.",
        "danger",
      );
    }
  }, [isLoadingState, isRecording, messages, pushToast, startSilenceMonitor, stopSilenceMonitor, streamQuestion, topicId]);

  return (
    <div className="h-full overflow-hidden bg-slate-50">
      <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4 lg:px-6">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-3 shadow-card">
          <div className="mb-2 flex items-center justify-between gap-3 rounded-[1.4rem] border border-slate-200/80 bg-slate-50/90 px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <BookOpenText size={16} />
              </div>
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-semibold text-slate-900">
                  {activeTopic?.name || "Selected topic"}
                </p>
                <p className="m-0 text-xs text-slate-500">
                  Topic chat
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              className="gap-2 rounded-2xl px-3 text-sm"
              onClick={() => navigate(app_routes.chat)}
            >
              <ArrowLeft size={15} />
              Back
            </Button>
          </div>

          <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-3">
            <ChatMessageList messages={messages} isProcessing={false} isLoading={isLoadingState} />
          </div>

          <div className="border-t border-slate-200/70 pt-3">
            <ChatComposer
              value={draft}
              isSending={isSending}
              isRecording={isRecording}
              isSpeaking={false}
              disabled={!topicId || isSending || isLoadingState}
              showUpload={false}
              showVoice
              onChange={setDraft}
              onUpload={() => undefined}
              onMicToggle={() => void handleMicToggle()}
              onSend={() => void sendQuestion()}
            />
          </div>
        </section>
      </div>
    </div>
  );
});
