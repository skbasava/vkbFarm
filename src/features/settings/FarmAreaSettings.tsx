import { MapPinned, Pencil, Plus, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { type FarmAreaInput, type SettingsFarmArea, useFarmAreaMutation, useSettingsFarmAreas, useSettingsMutationPending } from "./api";
import { errorMessage, fieldErrorsFromApi } from "./errors";
import { FormActions, FormDialog, ReadOnlyNotice, RecordStatus, SectionHeading, SettingsEmpty, SettingsLoadError, SettingsLoading, StatusDialog } from "./SettingsSection";

function FarmAreaForm({ area, onClose }: { area?: SettingsFarmArea; onClose: () => void }) {
  const mutation = useFarmAreaMutation();
  const [code, setCode] = useState(area?.code ?? "");
  const [name, setName] = useState(area?.name ?? "");
  const [description, setDescription] = useState(area?.description ?? "");
  const [active, setActive] = useState(area?.active ?? true);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const errors = {
    ...fieldErrorsFromApi(mutation.error, ["code", "name", "description"] as const),
    ...clientErrors,
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.reset();
    const nextErrors: Record<string, string> = {};
    if (!code.trim()) nextErrors.code = "Area code is required";
    if (!name.trim()) nextErrors.name = "Area name is required";
    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const input: Partial<FarmAreaInput> = { code: code.trim(), name: name.trim(), description: description.trim() || null };
    if (!area) input.active = active;
    mutation.mutate({ id: area?.id, input }, { onSuccess: onClose });
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <div className="settings-form__grid">
        <Field autoFocus error={errors.code} label="Area code" maxLength={40} onChange={(event) => setCode(event.target.value)} value={code} />
        <Field error={errors.name} label="Area name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
        <Field error={errors.description} label="Description" maxLength={500} onChange={(event) => setDescription(event.target.value)} value={description} />
      </div>
      {!area ? <label className="settings-check"><input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" /><span><strong>Active farm area</strong><small>Available for new plantation records.</small></span></label> : null}
      <p className="settings-form__note">Renaming changes the current area label shown on historical records. Existing records remain retained.</p>
      {mutation.error ? <p className="settings-form__error" role="alert">{errorMessage(mutation.error, "The farm area could not be saved.")}</p> : null}
      <FormActions cancel={onClose} pending={mutation.isPending} saveLabel="Save farm area" />
    </form>
  );
}

export function FarmAreaSettings({ canAdmin }: { canAdmin: boolean }) {
  const query = useSettingsFarmAreas();
  const statusMutation = useFarmAreaMutation();
  const formPending = useSettingsMutationPending("areas");
  const [editing, setEditing] = useState<SettingsFarmArea | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<SettingsFarmArea | null>(null);
  const addAction = canAdmin ? <Button onClick={() => setEditing("new")}><Plus aria-hidden="true" size={17} />Add farm area</Button> : undefined;
  return (
    <section aria-labelledby="farm-area-settings-title" className="settings-section">
      <SectionHeading action={addAction} description="Name the physical areas used to organise crop cohorts and plantation summaries." eyebrow="Land references" id="farm-area-settings-title" title="Farm Areas" />
      {!canAdmin ? <ReadOnlyNotice /> : null}
      <p className="settings-disclosure"><MapPinned aria-hidden="true" size={16} /> Deactivated areas remain attached to historical plantation records and reports.</p>
      {!deactivating && statusMutation.error ? <p className="settings-form__error" role="alert">{errorMessage(statusMutation.error, "The farm area could not be reactivated.")}</p> : null}
      {query.isPending ? <SettingsLoading label="farm areas" /> : query.isError ? <SettingsLoadError error={query.error} retry={() => void query.refetch()} /> : query.data.length === 0 ? <SettingsEmpty action={addAction} noun="farm area" /> : <div className="settings-records">{query.data.map((record) => <article className="settings-record" key={record.id}><div className="settings-record__icon"><MapPinned aria-hidden="true" size={19} /></div><div className="settings-record__body"><div className="settings-record__title"><h3><span className="settings-record__code">{record.code}</span>{record.name}</h3><RecordStatus active={record.active} /></div><p>{record.description ?? "No area description"}</p></div>{canAdmin ? <div className="settings-record__actions"><Button aria-label={`Edit ${record.code}`} onClick={() => setEditing(record)} size="compact" variant="secondary"><Pencil aria-hidden="true" size={14} />Edit</Button>{record.active ? <Button aria-label={`Deactivate ${record.code}`} onClick={() => { statusMutation.reset(); setDeactivating(record); }} size="compact" variant="ghost">Deactivate</Button> : <Button aria-label={`Reactivate ${record.code}`} disabled={statusMutation.isPending} onClick={() => { statusMutation.reset(); statusMutation.mutate({ id: record.id, input: { active: true } }); }} size="compact" variant="ghost"><RotateCcw aria-hidden="true" size={14} />Reactivate</Button>}</div> : null}</article>)}</div>}
      <FormDialog description={editing === "new" ? "Add a physical farm reference." : "Update the area's current code and description."} onOpenChange={(open) => !open && setEditing(null)} open={editing !== null} pending={formPending} title={editing === "new" ? "Add farm area" : `Edit ${editing?.code ?? "farm area"}`}>{editing ? <FarmAreaForm area={editing === "new" ? undefined : editing} key={editing === "new" ? "new" : editing.id} onClose={() => setEditing(null)} /> : null}</FormDialog>
      {deactivating ? <StatusDialog active consequences={<div className="settings-consequences"><p>Historical plantation records and reports remain linked to this area.</p></div>} error={statusMutation.error ? errorMessage(statusMutation.error, "The farm area could not be deactivated.") : undefined} label={deactivating.code} noun="farm area" onCancel={() => { statusMutation.reset(); setDeactivating(null); }} onConfirm={() => statusMutation.mutate({ id: deactivating.id, input: { active: false } }, { onSuccess: () => setDeactivating(null) })} open pending={statusMutation.isPending} /> : null}
    </section>
  );
}
