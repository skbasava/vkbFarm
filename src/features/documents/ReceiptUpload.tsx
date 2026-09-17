import { AlertCircle, CheckCircle2, FileUp, UploadCloud, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useUploadDocument } from "./api";

const MAX_BYTES = 10_485_760;
const MIME_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

function fileIssue(file: File): string | undefined {
  if (file.size === 0) return "Choose a non-empty receipt file.";
  if (file.size > MAX_BYTES) return "Receipt files must be 10 MiB or smaller.";
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!MIME_EXTENSIONS[file.type]?.includes(extension)) {
    return "Choose a JPEG, PNG, or PDF whose extension matches its type.";
  }
  return undefined;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReceiptUpload({ expenseId }: { expenseId: string }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<{
    expenseId: string;
    file?: File;
    issue?: string;
    uploadedName?: string;
  }>(() => ({ expenseId }));
  const upload = useUploadDocument();
  const file = selection.expenseId === expenseId ? selection.file : undefined;
  const issue = selection.expenseId === expenseId ? selection.issue : undefined;
  const uploadedName = selection.expenseId === expenseId
    ? selection.uploadedName
    : undefined;
  const abortUpload = upload.abort;

  useEffect(() => {
    abortUpload();
    if (inputRef.current) inputRef.current.value = "";
  }, [abortUpload, expenseId]);

  const choose = (next?: File) => {
    if (upload.isPending) return;
    upload.reset();
    if (!next) {
      setSelection({ expenseId });
      return;
    }
    const nextIssue = fileIssue(next);
    setSelection({
      expenseId,
      ...(nextIssue ? { issue: nextIssue } : { file: next }),
    });
  };

  const startUpload = async () => {
    if (!file) return;
    const currentName = file.name;
    try {
      await upload.mutateAsync({ expenseId, file });
      setSelection({ expenseId, uploadedName: currentName });
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      // Mutation state owns the retryable error while `file` remains selected.
    }
  };

  return (
    <section className="receipt-upload" aria-labelledby={`${inputId}-title`}>
      <div className="receipt-upload__heading">
        <span className="receipt-upload__icon"><FileUp aria-hidden="true" size={19} /></span>
        <div>
          <h3 id={`${inputId}-title`}>Attach receipt</h3>
          <p>JPEG, PNG, or PDF · maximum 10 MiB</p>
        </div>
      </div>
      <label
        aria-disabled={upload.isPending}
        className="receipt-upload__drop"
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (upload.isPending) return;
          choose(event.dataTransfer.files.item(0) ?? undefined);
        }}
      >
        <UploadCloud aria-hidden="true" size={24} />
        <span><strong>Drop a farm bill here</strong> or choose a file</span>
        <input
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          aria-label="Choose receipt file"
          className="sr-only"
          disabled={upload.isPending}
          id={inputId}
          onChange={(event) => choose(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />
      </label>
      {file ? (
        <div className="receipt-upload__selection">
          <div><strong>{file.name}</strong><span>{formatSize(file.size)} · ready to upload</span></div>
          <Button aria-label={`Remove ${file.name}`} disabled={upload.isPending} onClick={() => choose()} size="icon" variant="ghost"><X aria-hidden="true" size={17} /></Button>
        </div>
      ) : null}
      {issue ? <p className="receipt-upload__error" role="alert"><AlertCircle aria-hidden="true" size={16} /> {issue}</p> : null}
      {upload.isError && (!(upload.error instanceof Error) || !("code" in upload.error) || upload.error.code !== "UPLOAD_ABORTED") ? <p className="receipt-upload__error" role="alert"><AlertCircle aria-hidden="true" size={16} /> {upload.error instanceof Error ? upload.error.message : "The receipt could not be uploaded"}</p> : null}
      {uploadedName ? <p className="receipt-upload__success" role="status"><CheckCircle2 aria-hidden="true" size={16} /> {uploadedName} is safely attached.</p> : null}
      {upload.isPending && upload.progress !== null ? (
        <div className="receipt-upload__progress" role="status">
          <span style={{ width: `${upload.progress}%` }} />
          <strong>{upload.progress}% uploaded</strong>
        </div>
      ) : null}
      {file ? (
        <Button disabled={upload.isPending} onClick={() => void startUpload()}>
          {upload.isPending
            ? "Uploading receipt…"
            : upload.isError
              ? "Try upload again"
              : "Upload receipt"}
        </Button>
      ) : null}
    </section>
  );
}
