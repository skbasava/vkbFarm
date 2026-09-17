import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertCircle, ExternalLink, FileText, Image, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { formatDate } from "../../lib/format";
import { useDeleteDocument, type DocumentRecord } from "./api";

function safeContentUrl(document: DocumentRecord): string | undefined {
  const expected = `/api/v1/documents/${encodeURIComponent(document.id)}/content`;
  try {
    const origin = window.location.origin;
    const parsed = new URL(document.contentUrl, origin);
    if (
      parsed.origin !== origin ||
      parsed.pathname !== expected ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }
    return parsed.pathname;
  } catch {
    return undefined;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReceiptPreview({
  canDelete,
  document,
}: {
  canDelete: boolean;
  document: DocumentRecord;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deletion = useDeleteDocument(document.expenseId);
  const contentUrl = safeContentUrl(document);
  const isImage = document.contentType === "image/jpeg" || document.contentType === "image/png";

  return (
    <article className="receipt-card">
      <div className="receipt-card__preview">
        {contentUrl && isImage ? (
          <img alt={`Receipt ${document.fileName}`} loading="lazy" src={contentUrl} />
        ) : contentUrl && document.contentType === "application/pdf" ? (
          <iframe loading="lazy" src={contentUrl} title={`Preview ${document.fileName}`} />
        ) : (
          <div className="receipt-card__unavailable"><FileText aria-hidden="true" size={25} /><span>Preview unavailable</span></div>
        )}
        <span className="receipt-card__type">{isImage ? <Image aria-hidden="true" size={13} /> : <FileText aria-hidden="true" size={13} />}{document.contentType === "application/pdf" ? "PDF" : "Image"}</span>
      </div>
      <div className="receipt-card__body">
        <div><strong>{document.fileName}</strong><span>{formatSize(document.fileSize)} · {formatDate(document.expenseDate)}</span></div>
        <p>{document.expenseDescription}</p>
        <div className="receipt-card__actions">
          {contentUrl ? <a className="button button--secondary button--compact" href={contentUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={14} /> Open</a> : null}
          {canDelete ? (
            <AlertDialog.Root
              onOpenChange={(open) => {
                if (!deletion.isPending) setConfirmOpen(open);
              }}
              open={confirmOpen}
            >
              <AlertDialog.Trigger asChild>
                <Button aria-label={`Delete receipt ${document.fileName}`} size="compact" variant="ghost"><Trash2 aria-hidden="true" size={15} /> Delete</Button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay className="dialog__overlay" />
                <AlertDialog.Content className="dialog__content delete-receipt-dialog">
                  <AlertDialog.Title>Delete this receipt?</AlertDialog.Title>
                  <AlertDialog.Description>Remove “{document.fileName}” from the farm record. This cannot be undone.</AlertDialog.Description>
                  {deletion.isError ? <p className="receipt-upload__error" role="alert"><AlertCircle aria-hidden="true" size={16} /> {deletion.error instanceof Error ? deletion.error.message : "The receipt could not be deleted"}</p> : null}
                  <div className="delete-receipt-dialog__actions">
                    <AlertDialog.Cancel asChild><Button disabled={deletion.isPending} variant="secondary">Keep receipt</Button></AlertDialog.Cancel>
                    <AlertDialog.Action asChild><Button disabled={deletion.isPending} onClick={(event) => { event.preventDefault(); deletion.mutate(document.id, { onSuccess: () => setConfirmOpen(false) }); }} variant="destructive">{deletion.isPending ? "Deleting…" : "Delete receipt"}</Button></AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          ) : null}
        </div>
      </div>
    </article>
  );
}
