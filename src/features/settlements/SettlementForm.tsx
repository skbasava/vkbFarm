import { AlertCircle, BadgeCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import type { SettlementInput, SettlementParticipant } from "./api";

type SettlementFormProps = {
  participants: SettlementParticipant[];
  suggestedFromPersonId?: string;
  suggestedToPersonId?: string;
  isPending: boolean;
  error?: string;
  onRecord: (input: SettlementInput) => void;
};

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function SettlementForm({ participants, suggestedFromPersonId = "", suggestedToPersonId = "", isPending, error, onRecord }: SettlementFormProps) {
  const [fromPersonId, setFromPersonId] = useState(suggestedFromPersonId);
  const [toPersonId, setToPersonId] = useState(suggestedToPersonId);
  const [amount, setAmount] = useState("");
  const [settlementDate, setSettlementDate] = useState(todayLocal);
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; from?: string; settlementDate?: string; to?: string }>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = {
      from: fromPersonId ? undefined : "Choose who made the payment.",
      to: toPersonId ? undefined : "Choose who received the payment.",
      amount: amount ? undefined : "Enter the payment amount.",
      settlementDate: settlementDate ? undefined : "Choose the payment date.",
    };
    if (Object.values(missing).some(Boolean)) {
      setFieldErrors(missing);
      setFormError("Choose both people, an amount, and a payment date.");
      return;
    }
    if (fromPersonId === toPersonId) {
      setFieldErrors({ from: "Choose two different people.", to: "Choose two different people." });
      setFormError("Choose two different people for this payment.");
      return;
    }
    setFieldErrors({});
    setFormError(undefined);
    onRecord({ fromPersonId, toPersonId, amount, settlementDate, remarks: remarks.trim() || null });
  };

  return <form className="settlement-form" noValidate onSubmit={submit}>
    <div className="settlement-form__intro"><span className="settlement-eyebrow"><BadgeCheck aria-hidden="true" size={14} /> Record a payment</span><p>Record money actually transferred between owners. It adjusts the balance, never the shared expense ledger.</p></div>
    <div className="settlement-form__grid"><div className="field"><label className="field__label" htmlFor="settlement-from">From</label><select aria-describedby={fieldErrors.from ? "settlement-from-error" : undefined} aria-invalid={Boolean(fieldErrors.from)} className="field__input" id="settlement-from" onChange={(event) => { setFromPersonId(event.target.value); setFieldErrors((current) => ({ ...current, from: undefined })); }} value={fromPersonId}><option value="">Select payer</option>{participants.map((participant) => <option key={participant.personId} value={participant.personId}>{participant.name}</option>)}</select>{fieldErrors.from ? <span className="field__error" id="settlement-from-error">{fieldErrors.from}</span> : null}</div><div className="field"><label className="field__label" htmlFor="settlement-to">To</label><select aria-describedby={fieldErrors.to ? "settlement-to-error" : undefined} aria-invalid={Boolean(fieldErrors.to)} className="field__input" id="settlement-to" onChange={(event) => { setToPersonId(event.target.value); setFieldErrors((current) => ({ ...current, to: undefined })); }} value={toPersonId}><option value="">Select receiver</option>{participants.map((participant) => <option key={participant.personId} value={participant.personId}>{participant.name}</option>)}</select>{fieldErrors.to ? <span className="field__error" id="settlement-to-error">{fieldErrors.to}</span> : null}</div><Field error={fieldErrors.amount} label="Amount" inputMode="decimal" onChange={(event) => { setAmount(event.target.value); setFieldErrors((current) => ({ ...current, amount: undefined })); }} placeholder="0.00" required type="text" value={amount} /><Field error={fieldErrors.settlementDate} label="Payment date" onChange={(event) => { setSettlementDate(event.target.value); setFieldErrors((current) => ({ ...current, settlementDate: undefined })); }} required type="date" value={settlementDate} /></div>
    <label className="field"><span className="field__label">Remarks <em>optional</em></span><input className="field__input" maxLength={500} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. UPI reference" value={remarks} /></label>
    {formError || error ? <p className="settlement-form__error" role="alert"><AlertCircle aria-hidden="true" size={16} />{formError ?? error}</p> : null}
    <div className="settlement-form__actions"><Button disabled={isPending} type="submit">{isPending ? "Recording…" : "Record payment"}</Button></div>
  </form>;
}
