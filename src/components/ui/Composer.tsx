import { memo, type ChangeEvent, type FormEvent } from 'react'

interface ComposerProps {
  value: string
  isSending: boolean
  isListening: boolean
  isDisabled: boolean
  micSupported: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onOpenPicker: () => void
  onMicToggle: () => void
}

export const Composer = memo(function Composer({
  value,
  isSending,
  isListening,
  isDisabled,
  micSupported,
  onChange,
  onSubmit,
  onOpenPicker,
  onMicToggle,
}: ComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value)
  }

  return (
    <div className="composer-shell">
      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer-input-shell">
          <textarea
            value={value}
            onChange={handleChange}
            placeholder={
              isDisabled
                ? 'Upload a file first'
                : isListening
                  ? 'Listening... stop speaking for 3 seconds to auto-submit'
                  : 'Ask about your uploaded file'
            }
            disabled={isDisabled}
          />
        </div>

        <div className="composer-footer">
          <button type="button" className="attach-button" onClick={onOpenPicker}>
            Upload
          </button>
          <button
            type="button"
            className={`mic-button ${isListening ? 'active' : ''}`}
            onClick={onMicToggle}
            disabled={isDisabled || !micSupported}
          >
            {isListening ? 'Stop Mic' : 'Mic'}
          </button>
          <button
            type="submit"
            className="send-button"
            disabled={isDisabled || isSending || value.trim().length === 0}
          >
            {isSending ? 'Thinking...' : 'Send'}
          </button>
        </div>

        <p className="composer-note">
          {isDisabled
            ? 'Start by uploading PDF, image, video, or audio.'
            : micSupported
              ? 'Mic fills the text box live and submits after 3 seconds of silence.'
              : 'Mic is not supported in this browser. Text chat still works.'}
        </p>
      </form>
    </div>
  )
})
