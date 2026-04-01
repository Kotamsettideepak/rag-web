import { memo } from "react";
import { Mic, Paperclip, SendHorizontal, Square } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";

interface voice_action_group_props {
  isRecording: boolean;
  isSpeaking: boolean;
  isSending: boolean;
  canSend: boolean;
  disabled: boolean;
  showUpload?: boolean;
  showVoice?: boolean;
  onUpload: () => void;
  onMicToggle: () => void;
  onSend: () => void;
}

export const VoiceActionGroup = memo(function VoiceActionGroup({
  isRecording,
  isSpeaking,
  isSending,
  canSend,
  disabled,
  showUpload = true,
  showVoice = true,
  onUpload,
  onMicToggle,
  onSend,
}: voice_action_group_props) {
  const micTooltip = isSpeaking
    ? "Stop speaking"
    : isRecording
      ? "Stop recording and send your question"
      : "Recording auto-sends after 3 seconds of silence.";

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 md:flex-nowrap">
      {showUpload ? (
        <Tooltip content="Upload files">
          <Button variant="secondary" size="icon" onClick={onUpload} disabled={disabled}>
            <Paperclip size={18} />
          </Button>
        </Tooltip>
      ) : null}
      {showVoice ? (
        <Tooltip content={micTooltip}>
          <Button variant={isRecording || isSpeaking ? "danger" : "secondary"} size="icon" onClick={onMicToggle} disabled={disabled}>
            {isRecording || isSpeaking ? <Square size={18} /> : <Mic size={18} />}
          </Button>
        </Tooltip>
      ) : null}
      <Button className="gap-2 whitespace-nowrap" onClick={onSend} disabled={!canSend || disabled}>
        <SendHorizontal size={18} />
        {isSending ? "Sending..." : "Send"}
      </Button>
    </div>
  );
});
