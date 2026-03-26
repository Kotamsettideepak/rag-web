import { memo, type ChangeEvent, type FormEvent } from "react";

interface ComposerProps {
  value: string;
  isSending: boolean;
  isDisabled: boolean;
  isRecording?: boolean;
  canStop?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onVoiceToggle?: () => void;
}

export const Composer = memo(function Composer({
  value,
  isSending,
  isDisabled,
  isRecording = false,
  canStop = false,
  onChange,
  onSubmit,
  onStop,
  onVoiceToggle,
}: ComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <button
        type="button"
        className="send-button"
        disabled={isDisabled}
        onClick={onVoiceToggle}
      >
        {isRecording ? "Listening..." : "Speak"}
      </button>

      <input
        className="composer-input"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={
          isDisabled
            ? "Wait for background processing to finish"
            : "Ask about your uploaded files"
        }
        disabled={isDisabled}
      />

      <button
        type="submit"
        className="send-button"
        aria-label={isSending ? "Sending message" : "Send message"}
        title={isSending ? "Sending message" : "Send message"}
        disabled={isDisabled || isSending || value.trim().length === 0}
      >
        {isSending ? (
          "..."
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22 11 13 2 9 22 2z" />
          </svg>
        )}
      </button>

      {canStop ? (
        <button
          type="button"
          className="send-button stop-button"
          aria-label="Stop response"
          title="Stop response"
          onClick={onStop}
        >
          Stop
        </button>
      ) : null}
    </form>
  );
});
