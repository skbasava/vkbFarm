import { Archive, BadgeIndianRupee, Pencil, Plus, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import {
  type CategoryInput,
  type ExpenseClass,
  type SettingsCategory,
  useCategoryMutation,
  useSettingsCategories,
  useSettingsMutationPending,
} from "./api";
import { errorMessage } from "./errors";
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

function CategoryForm({ category, onClose }: { category?: SettingsCategory; onClose: () => void }) {
  const mutation = useCategoryMutation();
  const [name, setName] = useState(category?.name ?? "");
  const [expenseClass, setExpenseClass] = useState<ExpenseClass | "">(category?.defaultExpenseClass ?? "");
  const [active, setActive] = useState(category?.active ?? true);
  const [nameError, setNameError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError("Category name is required");
      return;
    }
    const input: CategoryInput = {
      name: name.trim(),
      defaultExpenseClass: expenseClass || null,
      active,
    };
    mutation.mutate({ id: category?.id, input }, { onSuccess: onClose });
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <Field autoFocus error={nameError} label="Category name" onChange={(event) => setName(event.target.value)} value={name} />
      <label className="settings-select-field">
        <span>Default expense class</span>
        <select aria-label="Default expense class" onChange={(event) => setExpenseClass(event.target.value as ExpenseClass | "")} value={expenseClass}>
          <option value="">No default</option>
          <option value="CAPEX">CAPEX</option>
          <option value="OPEX">OPEX</option>
        </select>
      </label>
      {!category ? (
        <label className="settings-check">
          <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
          <span><strong>Active category</strong><small>Available when entering new expenses.</small></span>
        </label>
      ) : null}
      <p className="settings-form__note">Renaming changes the current label shown on historical records; it does not create an immutable name snapshot.</p>
      {mutation.error ? <p className="settings-form__error" role="alert">{errorMessage(mutation.error, "The category could not be saved.")}</p> : null}
      <FormActions cancel={onClose} pending={mutation.isPending} saveLabel="Save category" />
    </form>
  );
}

export function CategorySettings({ canAdmin }: { canAdmin: boolean }) {
  const query = useSettingsCategories();
  const statusMutation = useCategoryMutation();
  const formPending = useSettingsMutationPending("categories");
  const [editing, setEditing] = useState<SettingsCategory | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<SettingsCategory | null>(null);
  const addAction = canAdmin ? <Button onClick={() => setEditing("new")}><Plus aria-hidden="true" size={17} />Add category</Button> : undefined;

  return (
    <section aria-labelledby="category-settings-title" className="settings-section">
      <SectionHeading action={addAction} description="Maintain the expense labels and default accounting class used during entry." eyebrow="Finance references" id="category-settings-title" title="Expense Categories" />
      {!canAdmin ? <ReadOnlyNotice /> : null}
      <p className="settings-disclosure"><Archive aria-hidden="true" size={16} /> Categories remain linked to historical transactions. Deactivation only removes them from new expense choices. Renaming changes the current label shown on historical records; it does not preserve an immutable snapshot.</p>
      {!deactivating && statusMutation.error ? <p className="settings-form__error" role="alert">{errorMessage(statusMutation.error, "The category could not be reactivated.")}</p> : null}
      {query.isPending ? <SettingsLoading label="expense categories" /> : query.isError ? <SettingsLoadError error={query.error} retry={() => void query.refetch()} /> : query.data.length === 0 ? <SettingsEmpty action={addAction} noun="category" /> : (
        <div className="settings-records">
          {query.data.map((record) => (
            <article className="settings-record" key={record.id}>
              <div className="settings-record__icon"><BadgeIndianRupee aria-hidden="true" size={19} /></div>
              <div className="settings-record__body">
                <div className="settings-record__title"><h3>{record.name}</h3><RecordStatus active={record.active} /></div>
                <p>{record.defaultExpenseClass ? `Defaults to ${record.defaultExpenseClass}` : "No default expense class"}</p>
              </div>
              {canAdmin ? (
                <div className="settings-record__actions">
                  <Button aria-label={`Edit ${record.name}`} onClick={() => setEditing(record)} size="compact" variant="secondary"><Pencil aria-hidden="true" size={14} />Edit</Button>
                  {record.active ? <Button aria-label={`Deactivate ${record.name}`} onClick={() => { statusMutation.reset(); setDeactivating(record); }} size="compact" variant="ghost">Deactivate</Button> : <Button aria-label={`Reactivate ${record.name}`} disabled={statusMutation.isPending} onClick={() => { statusMutation.reset(); statusMutation.mutate({ id: record.id, input: { active: true } }); }} size="compact" variant="ghost"><RotateCcw aria-hidden="true" size={14} />Reactivate</Button>}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      <FormDialog description={editing === "new" ? "Create a label for future expense entry." : "Update the category's current display label and default class."} onOpenChange={(open) => !open && setEditing(null)} open={editing !== null} pending={formPending} title={editing === "new" ? "Add expense category" : `Edit ${editing?.name ?? "category"}`}>
        {editing ? <CategoryForm category={editing === "new" ? undefined : editing} key={editing === "new" ? "new" : editing.id} onClose={() => setEditing(null)} /> : null}
      </FormDialog>
      {deactivating ? <StatusDialog active consequences={<div className="settings-consequences"><p>Historical expenses remain linked to this category and show its current label.</p></div>} error={statusMutation.error ? errorMessage(statusMutation.error, "The category could not be deactivated.") : undefined} label={deactivating.name} noun="category" onCancel={() => { statusMutation.reset(); setDeactivating(null); }} onConfirm={() => statusMutation.mutate({ id: deactivating.id, input: { active: false } }, { onSuccess: () => setDeactivating(null) })} open pending={statusMutation.isPending} /> : null}
    </section>
  );
}
