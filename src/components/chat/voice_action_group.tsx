import { memo } from "react";
import { Mic, Paperclip, SendHorizontal, Square, Volume2 } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";

interface voice_action_group_props {
  isRecording: boolean;
  isSpeaking: boolean;
  isSending: boolean;
  canSend: boolean;
  disabled: boolean;
  onUpload: () => void;
  onMicToggle: () => void;
  onSpeakToggle: () => void;
  onSend: () => void;
}

export const VoiceActionGroup = memo(function VoiceActionGroup({
  isRecording,
  isSpeaking,
  isSending,
  canSend,
  disabled,
  onUpload,
  onMicToggle,
  onSpeakToggle,
  onSend,
}: voice_action_group_props) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 md:flex-nowrap">
      <Tooltip content="Upload files">
        <Button variant="secondary" size="icon" onClick={onUpload} disabled={disabled}>
          <Paperclip size={18} />
        </Button>
      </Tooltip>
      <Tooltip content={isRecording ? "Stop recording" : "Start recording"}>
        <Button variant={isRecording ? "danger" : "secondary"} size="icon" onClick={onMicToggle} disabled={disabled}>
          <Mic size={18} />
        </Button>
      </Tooltip>
      <Tooltip content={isSpeaking ? "Stop speaking" : "Speak latest response"}>
        <Button variant={isSpeaking ? "danger" : "secondary"} size="icon" onClick={onSpeakToggle} disabled={disabled}>
          {isSpeaking ? <Square size={18} /> : <Volume2 size={18} />}
        </Button>
      </Tooltip>
      <Button className="gap-2 whitespace-nowrap" onClick={onSend} disabled={!canSend || disabled}>
        <SendHorizontal size={18} />
        {isSending ? "Sending..." : "Send"}
      </Button>
    </div>
  );
});
