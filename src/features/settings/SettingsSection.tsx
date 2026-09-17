import type { ReactNode } from "react";
import { AlertTriangle, Archive, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { errorMessage } from "./errors";

export function SectionHeading({
  action,
  description,
  eyebrow,
  id,
  title,
}: {
  action?: ReactNode;
  description: string;
  eyebrow: string;
  id: string;
  title: string;
}) {
  return (
    <header className="settings-section__heading">
      <div>
        <span>{eyebrow}</span>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function ReadOnlyNotice() {
  return (
    <p className="settings-readonly">
      Read-only configuration access. An administrator manages these records.
    </p>
  );
}

export function RecordStatus({ active }: { active: boolean }) {
  return (
    <span className={`settings-status settings-status--${active ? "active" : "inactive"}`}>
      <span aria-hidden="true" />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function SettingsLoading({ label }: { label: string }) {
  return (
    <div aria-label={`Loading ${label}`} className="settings-loading" role="status">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}

export function SettingsLoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      action={<Button onClick={retry} variant="secondary">Try again</Button>}
      description={errorMessage(error, "The configuration records could not be loaded.")}
    />
  );
}

export function SettingsEmpty({ action, noun }: { action?: ReactNode; noun: string }) {
  return (
    <EmptyState
      action={action}
      description={`Add the first ${noun} when the farm is ready.`}
      title={`No ${noun}s configured`}
    />
  );
}

export function FormDialog({
  children,
  description,
  onOpenChange,
  open,
  pending,
  title,
}: {
  children: ReactNode;
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  title: string;
}) {
  return (
    <Dialog onOpenChange={(next) => !pending && onOpenChange(next)} open={open}>
      <DialogContent aria-busy={pending} className="settings-dialog">
        <div className="settings-dialog__intro">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function StatusDialog({
  active,
  consequences,
  error,
  label,
  noun,
  onCancel,
  onConfirm,
  open,
  pending,
}: {
  active: boolean;
  consequences: ReactNode;
  error?: string;
  label: string;
  noun: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
}) {
  const action = active ? "Deactivate" : "Reactivate";
  return (
    <Dialog onOpenChange={(next) => !next && !pending && onCancel()} open={open}>
      <DialogContent className="settings-dialog settings-status-dialog">
        <div className="settings-dialog__intro">
          <span className="settings-dialog__warning"><AlertTriangle aria-hidden="true" size={18} /></span>
          <DialogTitle>{action} {label}?</DialogTitle>
          <DialogDescription>
            {active
              ? `This removes ${label} from new ${noun} choices without deleting the record.`
              : `This makes ${label} available for new ${noun} activity again.`}
          </DialogDescription>
        </div>
        {consequences}
        {error ? <p className="settings-form__error" role="alert">{error}</p> : null}
        <div className="settings-form__actions">
          <Button disabled={pending} onClick={onCancel} variant="secondary">Cancel</Button>
          <Button disabled={pending} onClick={onConfirm} variant={active ? "destructive" : "primary"}>
            {active ? <Archive aria-hidden="true" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
            {pending ? "Saving…" : `${action} ${noun}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FormActions({ cancel, pending, saveLabel }: { cancel: () => void; pending: boolean; saveLabel: string }) {
  return (
    <div className="settings-form__actions">
      <Button disabled={pending} onClick={cancel} variant="secondary">Cancel</Button>
      <Button disabled={pending} type="submit">{pending ? "Saving…" : saveLabel}</Button>
    </div>
  );
}
