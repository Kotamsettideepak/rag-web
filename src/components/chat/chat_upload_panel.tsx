import { memo } from "react";
import { FileAudio, FileImage, FileText, FileVideo } from "lucide-react";
import { formatFileSize, inferSavedAttachmentKind } from "../../lib/files";
import type { saved_upload, upload_asset } from "../../types/upload";
import { Button } from "../ui/button";

interface chat_upload_panel_props {
  uploads: upload_asset[];
  savedUploads: saved_upload[];
  onUploadSubmit: () => void;
  onClearUploads: () => void;
  isBusy: boolean;
}

function iconForKind(kind: string) {
  if (kind === "pdf") {
    return <FileText size={18} />;
  }
  if (kind === "image") {
    return <FileImage size={18} />;
  }
  if (kind === "video") {
    return <FileVideo size={18} />;
  }
  return <FileAudio size={18} />;
}

export const ChatUploadPanel = memo(function ChatUploadPanel({
  uploads,
  savedUploads,
  onUploadSubmit,
  onClearUploads,
  isBusy,
}: chat_upload_panel_props) {
  if (uploads.length === 0 && savedUploads.length === 0) {
    return null;
  }

  return (
    <section className="smooth-transition rounded-[2rem] border border-slate-200/80 bg-white/88 p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-text-subtle">Context files</p>
          <h3 className="mt-1 text-lg font-semibold text-[#1f2b44]">
            {uploads.length > 0 ? "Selected uploads" : "Saved uploads"}
          </h3>
        </div>
        {uploads.length > 0 ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClearUploads} disabled={isBusy}>
              Clear
            </Button>
            <Button onClick={onUploadSubmit} disabled={isBusy}>
              Upload files
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className="smooth-transition flex items-center gap-3 rounded-3xl border border-slate-200/80 bg-white/74 p-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              {iconForKind(upload.kind)}
            </div>
            <div className="min-w-0">
              <p className="m-0 truncate font-medium text-[#1f2b44]">{upload.name}</p>
              <p className="mt-1 text-sm text-text-subtle">{formatFileSize(upload.size)}</p>
            </div>
          </div>
        ))}
        {savedUploads.map((upload) => {
          const kind = inferSavedAttachmentKind(upload);
          return (
            <a
              key={upload.id}
              href={upload.file_url}
              target="_blank"
              rel="noreferrer"
              className="smooth-transition flex items-center gap-3 rounded-3xl border border-slate-200/80 bg-white/74 p-3 hover:border-brand"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                {iconForKind(kind)}
              </div>
              <div className="min-w-0">
                <p className="m-0 truncate font-medium text-[#1f2b44]">{upload.original_file_name}</p>
                <p className="mt-1 text-sm text-text-subtle">Open file</p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
});
