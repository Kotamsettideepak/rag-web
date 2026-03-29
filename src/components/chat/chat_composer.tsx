import { memo, useCallback, type FormEvent } from "react";
import { InputField } from "../ui/input_field";
import { VoiceActionGroup } from "./voice_action_group";

interface chat_composer_props {
  value: string;
  isSending: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onUpload: () => void;
  onMicToggle: () => void;
  onSpeakToggle: () => void;
  onSend: () => void;
}

export const ChatComposer = memo(function ChatComposer({
  value,
  isSending,
  isRecording,
  isSpeaking,
  disabled,
  onChange,
  onUpload,
  onMicToggle,
  onSpeakToggle,
  onSend,
}: chat_composer_props) {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSend();
    },
    [onSend],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="smooth-transition flex min-w-0 flex-col gap-3 rounded-[2rem] border border-slate-200/80 bg-white/90 p-3 shadow-card lg:flex-row lg:items-center"
    >
      <InputField
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 w-full flex-1"
        placeholder={disabled ? "Wait for upload processing to finish" : "Message RAG-AI Curator..."}
      />
      <VoiceActionGroup
        isRecording={isRecording}
        isSpeaking={isSpeaking}
        isSending={isSending}
        canSend={value.trim().length > 0}
        disabled={disabled}
        onUpload={onUpload}
        onMicToggle={onMicToggle}
        onSpeakToggle={onSpeakToggle}
        onSend={onSend}
      />
    </form>
  );
});
