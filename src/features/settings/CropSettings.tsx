import { Leaf, Pencil, Plus, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { type CropInput, type SettingsCrop, useCropMutation, useSettingsCrops, useSettingsMutationPending } from "./api";
import { errorMessage } from "./errors";
import { FormActions, FormDialog, ReadOnlyNotice, RecordStatus, SectionHeading, SettingsEmpty, SettingsLoadError, SettingsLoading, StatusDialog } from "./SettingsSection";

function CropForm({ crop, onClose }: { crop?: SettingsCrop; onClose: () => void }) {
  const mutation = useCropMutation();
  const [name, setName] = useState(crop?.name ?? "");
  const [localName, setLocalName] = useState(crop?.localName ?? "");
  const [cropType, setCropType] = useState(crop?.cropType ?? "");
  const [active, setActive] = useState(crop?.active ?? true);
  const [nameError, setNameError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setNameError("Crop name is required"); return; }
    const input: CropInput = { name: name.trim(), localName: localName.trim() || null, cropType: cropType.trim() || null, active };
    mutation.mutate({ id: crop?.id, input }, { onSuccess: onClose });
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <div className="settings-form__grid">
        <Field autoFocus error={nameError} label="Crop name" onChange={(event) => setName(event.target.value)} value={name} />
        <Field label="Local name" onChange={(event) => setLocalName(event.target.value)} value={localName} />
        <Field label="Crop type" onChange={(event) => setCropType(event.target.value)} placeholder="For example: fruit or timber" value={cropType} />
      </div>
      {!crop ? <label className="settings-check"><input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" /><span><strong>Active crop</strong><small>Available for new plantation and expense records.</small></span></label> : null}
      <p className="settings-form__note">Renaming changes the current crop label shown wherever this reference is joined to historical data.</p>
      {mutation.error ? <p className="settings-form__error" role="alert">{errorMessage(mutation.error, "The crop could not be saved.")}</p> : null}
      <FormActions cancel={onClose} pending={mutation.isPending} saveLabel="Save crop" />
    </form>
  );
}

export function CropSettings({ canAdmin }: { canAdmin: boolean }) {
  const query = useSettingsCrops();
  const statusMutation = useCropMutation();
  const formPending = useSettingsMutationPending("crops");
  const [editing, setEditing] = useState<SettingsCrop | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<SettingsCrop | null>(null);
  const addAction = canAdmin ? <Button onClick={() => setEditing("new")}><Plus aria-hidden="true" size={17} />Add crop</Button> : undefined;
  return (
    <section aria-labelledby="crop-settings-title" className="settings-section">
      <SectionHeading action={addAction} description="Keep crop names and classifications consistent across plantation, harvest, and expense records." eyebrow="Plantation references" id="crop-settings-title" title="Crops" />
      {!canAdmin ? <ReadOnlyNotice /> : null}
      <p className="settings-disclosure"><Leaf aria-hidden="true" size={16} /> Inactive crops stay visible in historical plantation, harvest, and expense records.</p>
      {!deactivating && statusMutation.error ? <p className="settings-form__error" role="alert">{errorMessage(statusMutation.error, "The crop could not be reactivated.")}</p> : null}
      {query.isPending ? <SettingsLoading label="crops" /> : query.isError ? <SettingsLoadError error={query.error} retry={() => void query.refetch()} /> : query.data.length === 0 ? <SettingsEmpty action={addAction} noun="crop" /> : <div className="settings-records">{query.data.map((record) => <article className="settings-record" key={record.id}><div className="settings-record__icon"><Leaf aria-hidden="true" size={19} /></div><div className="settings-record__body"><div className="settings-record__title"><h3>{record.name}</h3><RecordStatus active={record.active} /></div><p>{[record.localName, record.cropType].filter(Boolean).join(" · ") || "No local name or crop type"}</p></div>{canAdmin ? <div className="settings-record__actions"><Button aria-label={`Edit ${record.name}`} onClick={() => setEditing(record)} size="compact" variant="secondary"><Pencil aria-hidden="true" size={14} />Edit</Button>{record.active ? <Button aria-label={`Deactivate ${record.name}`} onClick={() => { statusMutation.reset(); setDeactivating(record); }} size="compact" variant="ghost">Deactivate</Button> : <Button aria-label={`Reactivate ${record.name}`} disabled={statusMutation.isPending} onClick={() => { statusMutation.reset(); statusMutation.mutate({ id: record.id, input: { active: true } }); }} size="compact" variant="ghost"><RotateCcw aria-hidden="true" size={14} />Reactivate</Button>}</div> : null}</article>)}</div>}
      <FormDialog description={editing === "new" ? "Add a crop reference for operational records." : "Update the crop's current reference details."} onOpenChange={(open) => !open && setEditing(null)} open={editing !== null} pending={formPending} title={editing === "new" ? "Add crop" : `Edit ${editing?.name ?? "crop"}`}>{editing ? <CropForm crop={editing === "new" ? undefined : editing} key={editing === "new" ? "new" : editing.id} onClose={() => setEditing(null)} /> : null}</FormDialog>
      {deactivating ? <StatusDialog active consequences={<div className="settings-consequences"><p>Historical plantation, harvest, and expense records remain linked to this crop.</p></div>} error={statusMutation.error ? errorMessage(statusMutation.error, "The crop could not be deactivated.") : undefined} label={deactivating.name} noun="crop" onCancel={() => { statusMutation.reset(); setDeactivating(null); }} onConfirm={() => statusMutation.mutate({ id: deactivating.id, input: { active: false } }, { onSuccess: () => setDeactivating(null) })} open pending={statusMutation.isPending} /> : null}
    </section>
  );
}
