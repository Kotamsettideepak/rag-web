import { memo, type ChangeEvent, type FormEvent } from "react";

interface ComposerProps {
  value: string;
  isSending: boolean;
  isDisabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const Composer = memo(function Composer({
  value,
  isSending,
  isDisabled,
  onChange,
  onSubmit,
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
        disabled={isDisabled || isSending || value.trim().length === 0}
      >
        {isSending ? "Thinking..." : "Send"}
      </button>
    </form>
  );
});
