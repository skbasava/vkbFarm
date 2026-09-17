import { Pencil, Plus, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import {
  type AppRole,
  type PersonInput,
  type SettingsPerson,
  usePersonMutation,
  useSettingsMutationPending,
  useSettingsPeople,
} from "./api";
import { errorMessage, fieldErrorsFromApi } from "./errors";
import {
  FormActions,
  FormDialog,
  ReadOnlyNotice,
  RecordStatus,
  SectionHeading,
  SettingsEmpty,
  SettingsLoadError,
  SettingsLoading,
  StatusDialog,
} from "./SettingsSection";

type PersonFormProps = {
  person?: SettingsPerson;
  onClose: () => void;
};

function PersonForm({ onClose, person }: PersonFormProps) {
  const mutation = usePersonMutation();
  const [name, setName] = useState(person?.name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [farmRole, setFarmRole] = useState(person?.farmRole ?? "owner");
  const [appRole, setAppRole] = useState<AppRole>(person?.appRole ?? "viewer");
  const [shared, setShared] = useState(person?.participatesInSharedExpenses ?? true);
  const [active, setActive] = useState(person?.active ?? true);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const errors = {
    ...fieldErrorsFromApi(mutation.error, ["name", "email", "farmRole"] as const),
    ...clientErrors,
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.reset();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Name is required";
    if (!farmRole.trim()) nextErrors.farmRole = "Farm role is required";
    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const input: Partial<PersonInput> = {
      name: name.trim(),
      email: email.trim() || null,
      farmRole: farmRole.trim(),
      appRole,
      participatesInSharedExpenses: shared,
    };
    if (!person) input.active = active;
    mutation.mutate(
      { id: person?.id, input },
      { onSuccess: onClose },
    );
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <div className="settings-form__grid">
        <Field autoFocus error={errors.name} label="Name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
        <Field error={errors.email} label="Email" onChange={(event) => setEmail(event.target.value)} placeholder="Optional for non-login participants" type="email" value={email} />
        <Field error={errors.farmRole} hint="For example: owner, manager, worker" label="Farm role" maxLength={80} onChange={(event) => setFarmRole(event.target.value)} value={farmRole} />
        <label className="settings-select-field">
          <span>Application role</span>
          <select aria-label="Application role" onChange={(event) => setAppRole(event.target.value as AppRole)} value={appRole}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <label className="settings-check">
        <input checked={shared} onChange={(event) => setShared(event.target.checked)} type="checkbox" />
        <span><strong>Shared expense participant</strong><small>Include this person in current shared-settlement calculations while active.</small></span>
      </label>
      {!person ? (
        <label className="settings-check">
          <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
          <span><strong>Active person</strong><small>Active people may appear in new farm records and, when configured, can sign in.</small></span>
        </label>
      ) : null}
      {mutation.error ? <p className="settings-form__error" role="alert">{errorMessage(mutation.error, "The person could not be saved.")}</p> : null}
      <FormActions cancel={onClose} pending={mutation.isPending} saveLabel="Save person" />
    </form>
  );
}

export function PeopleSettings({ canAdmin }: { canAdmin: boolean }) {
  const query = useSettingsPeople();
  const statusMutation = usePersonMutation();
  const formPending = useSettingsMutationPending("people");
  const [editing, setEditing] = useState<SettingsPerson | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<SettingsPerson | null>(null);

  const addAction = canAdmin ? <Button onClick={() => setEditing("new")}><Plus aria-hidden="true" size={17} />Add person</Button> : undefined;

  return (
    <section aria-labelledby="people-settings-title" className="settings-section">
      <SectionHeading
        action={addAction}
        description="Manage farm participation, application access, and the people available to shared expenses."
        eyebrow="Access & participation"
        id="people-settings-title"
        title="People"
      />
      {!canAdmin ? <ReadOnlyNotice /> : null}
      <p className="settings-disclosure"><ShieldCheck aria-hidden="true" size={16} /> People are retained for audit and historical expense attribution. Deactivation never erases past records.</p>
      {!deactivating && statusMutation.error ? <p className="settings-form__error" role="alert">{errorMessage(statusMutation.error, "The person could not be reactivated.")}</p> : null}
      {query.isPending ? <SettingsLoading label="people" /> : query.isError ? <SettingsLoadError error={query.error} retry={() => void query.refetch()} /> : query.data.length === 0 ? <SettingsEmpty action={addAction} noun="person" /> : (
        <div className="settings-records">
          {query.data.map((record) => (
            <article className="settings-record" key={record.id}>
              <div className="settings-record__icon"><Users aria-hidden="true" size={19} /></div>
              <div className="settings-record__body">
                <div className="settings-record__title"><h3>{record.name}</h3><RecordStatus active={record.active} /></div>
                <p>{record.email ?? "No login email"}</p>
                <div className="settings-record__meta">
                  <span>{record.farmRole}</span>
                  <span>{record.appRole}</span>
                  <span>{record.participatesInSharedExpenses ? "Shared participant" : "Not in shared settlements"}</span>
                </div>
              </div>
              {canAdmin ? (
                <div className="settings-record__actions">
                  <Button aria-label={`Edit ${record.name}`} onClick={() => setEditing(record)} size="compact" variant="secondary"><Pencil aria-hidden="true" size={14} />Edit</Button>
                  {record.active ? (
                    <Button aria-label={`Deactivate ${record.name}`} onClick={() => { statusMutation.reset(); setDeactivating(record); }} size="compact" variant="ghost">Deactivate</Button>
                  ) : (
                    <Button aria-label={`Reactivate ${record.name}`} disabled={statusMutation.isPending} onClick={() => { statusMutation.reset(); statusMutation.mutate({ id: record.id, input: { active: true } }); }} size="compact" variant="ghost"><RotateCcw aria-hidden="true" size={14} />Reactivate</Button>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      <FormDialog
        description={editing === "new" ? "Add a farm participant and choose their application access." : "Update the current person details. Historical records will show the current name."}
        onOpenChange={(open) => !open && setEditing(null)}
        open={editing !== null}
        pending={formPending}
        title={editing === "new" ? "Add person" : `Edit ${editing?.name ?? "person"}`}
      >
        {editing ? <PersonForm key={editing === "new" ? "new" : editing.id} onClose={() => setEditing(null)} person={editing === "new" ? undefined : editing} /> : null}
      </FormDialog>
      {deactivating ? (
        <StatusDialog
          active
          consequences={<div className="settings-consequences"><p>Deactivation can remove production login access for this email and removes the person from current shared-settlement participation.</p><p>Historical records remain retained and continue to identify this person.</p></div>}
          error={statusMutation.error ? errorMessage(statusMutation.error, "The person could not be deactivated.") : undefined}
          label={deactivating.name}
          noun="person"
          onCancel={() => { statusMutation.reset(); setDeactivating(null); }}
          onConfirm={() => statusMutation.mutate({ id: deactivating.id, input: { active: false } }, { onSuccess: () => setDeactivating(null) })}
          open
          pending={statusMutation.isPending}
        />
      ) : null}
    </section>
  );
}
