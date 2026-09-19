import { AlertCircle, CheckCircle2, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/error-state";
import { Field } from "../../components/ui/field";
import { Skeleton } from "../../components/ui/skeleton";
import { useCategories, useCreateExpense, usePeople, useUpdateExpense } from "./api";
import { todayInKolkata, toExpenseInput, validateExpense, type ExpenseFormErrors, type ExpenseFormValues } from "./schema";
import type { Expense, ExpenseClass } from "./types";
import { ReceiptUpload } from "../documents/ReceiptUpload";

type ExpenseFormProps = { expense?: Expense; mode: "create" | "edit"; onSaved?: (expense: Expense) => void };

function initialValues(expense?: Expense): ExpenseFormValues {
  return { expenseDate: expense?.expenseDate ?? todayInKolkata(), amount: expense ? String(expense.amountPaise / 100) : "", categoryId: expense?.categoryId ?? "", paidByPersonId: expense?.paidByPersonId ?? "", description: expense?.description ?? "", expenseClass: expense?.expenseClass ?? null, paidTo: expense?.paidTo ?? "", notes: expense?.notes ?? "", cropId: expense?.cropId ?? null, isShared: expense?.isShared ?? true };
}

function serverErrors(error: unknown): ExpenseFormErrors {
  if (!(error instanceof ApiError) || !Array.isArray(error.details?.issues)) return {};
  return Object.fromEntries(error.details.issues.flatMap((issue) => {
    if (!issue || typeof issue !== "object" || !("path" in issue) || !("message" in issue) || typeof issue.path !== "string" || typeof issue.message !== "string") return [];
    return [[issue.path, issue.message]];
  })) as ExpenseFormErrors;
}

export function ExpenseForm({ expense, mode, onSaved }: ExpenseFormProps) {
  const [values, setValues] = useState(() => initialValues(expense));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [savedExpense, setSavedExpense] = useState<Expense | undefined>();
  const categories = useCategories();
  const people = usePeople();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense(expense?.id ?? "");
  const mutation = mode === "create" ? createExpense : updateExpense;
  const activeCategories = useMemo(() => categories.data?.filter((category) => category.active) ?? [], [categories.data]);
  const activePeople = useMemo(() => people.data?.filter((person) => person.active) ?? [], [people.data]);

  const update = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const localErrors = validateExpense(values);
    if (Object.keys(localErrors).length) { setErrors(localErrors); return; }
    setErrors({});
    try {
      const result = await mutation.mutateAsync(toExpenseInput(values));
      setSavedExpense(result);
      onSaved?.(result);
    } catch (error) {
      const fieldErrors = serverErrors(error);
      setErrors(fieldErrors);
    }
  };

  const addAnother = () => { setValues(initialValues()); setErrors({}); setSavedExpense(undefined); };
  const submitLabel = mutation.isPending ? "Saving expense…" : mode === "create" ? "Save expense" : "Save changes";
  const receiptExpenseId = expense?.id ?? savedExpense?.id;

  if (categories.isError || people.isError) return <ErrorState title="We could not load entry options" description="Categories and people need to be available before an expense can be recorded." action={<Button onClick={() => { void categories.refetch(); void people.refetch(); }} variant="secondary">Try again</Button>} />;

  return <form className="expense-form" onSubmit={submit} noValidate>
    {savedExpense ? <div className="expense-form__saved" role="status"><CheckCircle2 aria-hidden="true" size={19} /><span><strong>Expense saved.</strong> The ledger and balances have been refreshed.</span><Button onClick={addAnother} variant="secondary">Add another</Button></div> : null}
    <section className="expense-form__core" aria-label="Expense details">
      <div className="expense-form__amount-row"><Field autoComplete="off" error={errors.amount} inputMode="decimal" label="Amount" onChange={(event) => update("amount", event.target.value)} placeholder="0.00" value={values.amount} /><Field error={errors.expenseDate} label="Date" onChange={(event) => update("expenseDate", event.target.value)} type="date" value={values.expenseDate} /></div>
      {categories.isLoading || people.isLoading ? <div className="expense-form__select-skeletons"><Skeleton /><Skeleton /></div> : <>
        <div className="field"><label className="field__label" htmlFor="expense-category">Category</label><select aria-invalid={Boolean(errors.categoryId)} aria-describedby={errors.categoryId ? "category-error" : undefined} className="field__input" id="expense-category" onChange={(event) => update("categoryId", event.target.value)} value={values.categoryId}><option value="">Select category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{errors.categoryId ? <span className="field__error" id="category-error">{errors.categoryId}</span> : null}</div>
        <fieldset aria-describedby={errors.paidByPersonId ? "expense-payer-error" : undefined} aria-invalid={Boolean(errors.paidByPersonId)} className="expense-form__payer"><legend>Paid by</legend><div>{activePeople.map((person) => <button aria-pressed={values.paidByPersonId === person.id} className="expense-form__payer-option" key={person.id} onClick={() => update("paidByPersonId", person.id)} type="button">{person.name}</button>)}</div>{errors.paidByPersonId ? <span className="field__error" id="expense-payer-error">{errors.paidByPersonId}</span> : null}</fieldset>
      </>}
      <Field error={errors.description} label="Description" onChange={(event) => update("description", event.target.value)} placeholder="What was purchased or paid?" value={values.description} />
    </section>
      <details className="expense-form__optional"><summary>More details <span>optional</span></summary><div className="expense-form__optional-body"><label className="field"><span className="field__label">Expense class</span><select className="field__input" onChange={(event) => update("expenseClass", (event.target.value || null) as ExpenseClass | null)} value={values.expenseClass ?? ""}><option value="">Unclassified</option><option value="OPEX">OPEX</option><option value="CAPEX">CAPEX</option></select></label><Field label="Paid to" onChange={(event) => update("paidTo", event.target.value)} placeholder="Supplier or recipient" value={values.paidTo} /><label className="field"><span className="field__label">Notes</span><textarea className="field__input expense-form__notes" onChange={(event) => update("notes", event.target.value)} placeholder="Add context for the farm team" value={values.notes} /></label><label className="expense-form__shared"><input checked={values.isShared} onChange={(event) => update("isShared", event.target.checked)} type="checkbox" /> Split this cost across farm partners</label></div></details>
    {receiptExpenseId ? <><aside className="expense-form__receipt"><Paperclip aria-hidden="true" size={17} /><span><strong>The expense is saved.</strong> Attach the bill below, or <Link to={`/documents/new?expenseId=${receiptExpenseId}`}>open it in Documents</Link>. A receipt error will not undo the ledger entry.</span></aside><ReceiptUpload expenseId={receiptExpenseId} key={receiptExpenseId} /></> : null}
    {mutation.isError && !Object.keys(errors).length ? <p className="expense-form__submit-error" role="alert"><AlertCircle aria-hidden="true" size={16} /> {mutation.error instanceof Error ? mutation.error.message : "Could not save this expense"}</p> : null}
    <div className="expense-form__actions"><Button disabled={mutation.isPending} type="submit">{submitLabel}</Button>{mode === "edit" ? <Link className="button button--secondary" to={`/expenses/${expense?.id}`}>Cancel</Link> : null}</div>
  </form>;
}
