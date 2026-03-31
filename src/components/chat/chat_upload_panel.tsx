import { memo } from "react";
import {
  AlertCircle,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Layers,
} from "lucide-react";
import { formatFileSize, inferSavedAttachmentKind } from "../../lib/files";
import type { saved_upload, upload_asset, upload_status_response } from "../../types/upload";
import { Button } from "../ui/button";
import { ProgressBar } from "../ui/progress_bar";

interface chat_upload_panel_props {
  uploads: upload_asset[];
  savedUploads: saved_upload[];
  jobSnapshot: upload_status_response | null;
  onUploadSubmit: () => void;
  onClearUploads: () => void;
  isBusy: boolean;
}

function iconForKind(kind: string) {
  if (kind === "pdf") return <FileText size={16} />;
  if (kind === "image") return <FileImage size={16} />;
  if (kind === "video") return <FileVideo size={16} />;
  return <FileAudio size={16} />;
}

function labelForKind(kind: string) {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  return "Audio";
}

function formatJobSummary(snapshot: upload_status_response | null) {
  if (!snapshot) return "";
  return snapshot.detail || snapshot.summary || "Processing upload…";
}

export const ChatUploadPanel = memo(function ChatUploadPanel({
  uploads,
  savedUploads,
  jobSnapshot,
  onUploadSubmit,
  onClearUploads,
  isBusy,
}: chat_upload_panel_props) {
  const hasContent =
    uploads.length > 0 || savedUploads.length > 0 || jobSnapshot !== null;

  if (!hasContent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Layers size={20} />
        </div>
        <p className="m-0 text-xs font-semibold uppercase tracking-widest text-slate-400">
          No context yet
        </p>
        <p className="mb-0 mt-1 text-xs leading-6 text-slate-400">
          Upload files from the composer to see indexing progress and saved context here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress bar section — only shown when a job is active */}
      {jobSnapshot ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1f2b44]">
              <AlertCircle size={15} className="text-brand" />
              <span>{jobSnapshot.progress_label || "Processing upload"}</span>
            </div>
            <span className="text-xs font-semibold tabular-nums text-slate-500">
              {jobSnapshot.progress_percent || 0}%
            </span>
          </div>
          <ProgressBar value={jobSnapshot.progress_percent || 0} />
          <p className="mb-0 mt-2 text-xs leading-5 text-slate-500">
            {formatJobSummary(jobSnapshot)}
          </p>
        </div>
      ) : null}

      {/* Actions for pending uploads */}
      {uploads.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Selected ({uploads.length})
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClearUploads} disabled={isBusy}>
              Clear
            </Button>
            <Button size="sm" onClick={onUploadSubmit} disabled={isBusy}>
              Upload
            </Button>
          </div>
        </div>
      ) : null}

      {/* Pending file list */}
      {uploads.length > 0 ? (
        <div className="flex flex-col gap-2">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="smooth-transition flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                {iconForKind(upload.kind)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-medium text-[#1f2b44]">
                  {upload.name}
                </p>
                <p className="m-0 text-xs text-slate-400">{formatFileSize(upload.size)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {labelForKind(upload.kind)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Saved uploads list */}
      {savedUploads.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Saved ({savedUploads.length})
          </p>
          {savedUploads.map((upload) => {
            const kind = inferSavedAttachmentKind(upload);
            return (
              <a
                key={upload.id}
                href={upload.file_url}
                target="_blank"
                rel="noreferrer"
                className="smooth-transition group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2.5 hover:border-brand/40 hover:bg-brand-soft/30"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  {iconForKind(kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium text-[#1f2b44]">
                    {upload.original_file_name}
                  </p>
                  <p className="m-0 text-xs text-slate-400 group-hover:text-brand">
                    Open file ↗
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {labelForKind(kind)}
                </span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
