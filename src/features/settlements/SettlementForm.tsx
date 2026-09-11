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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fromPersonId || !toPersonId || !amount || !settlementDate) {
      setFormError("Choose both people, an amount, and a payment date.");
      return;
    }
    if (fromPersonId === toPersonId) {
      setFormError("Choose two different people for this payment.");
      return;
    }
    setFormError(undefined);
    onRecord({ fromPersonId, toPersonId, amount, settlementDate, remarks: remarks.trim() || null });
  };

  return <form className="settlement-form" onSubmit={submit}>
    <div className="settlement-form__intro"><span className="settlement-eyebrow"><BadgeCheck aria-hidden="true" size={14} /> Record a payment</span><p>Record money actually transferred between owners. It adjusts the balance, never the shared expense ledger.</p></div>
    <div className="settlement-form__grid"><label className="field"><span className="field__label">From</span><select aria-label="From" className="field__input" onChange={(event) => setFromPersonId(event.target.value)} value={fromPersonId}><option value="">Select payer</option>{participants.map((participant) => <option key={participant.personId} value={participant.personId}>{participant.name}</option>)}</select></label><label className="field"><span className="field__label">To</span><select aria-label="To" className="field__input" onChange={(event) => setToPersonId(event.target.value)} value={toPersonId}><option value="">Select receiver</option>{participants.map((participant) => <option key={participant.personId} value={participant.personId}>{participant.name}</option>)}</select></label><Field label="Amount" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required type="text" value={amount} /><Field label="Payment date" onChange={(event) => setSettlementDate(event.target.value)} required type="date" value={settlementDate} /></div>
    <label className="field"><span className="field__label">Remarks <em>optional</em></span><input className="field__input" maxLength={500} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. UPI reference" value={remarks} /></label>
    {formError || error ? <p className="settlement-form__error" role="alert"><AlertCircle aria-hidden="true" size={16} />{formError ?? error}</p> : null}
    <div className="settlement-form__actions"><Button disabled={isPending} type="submit">{isPending ? "Recording…" : "Record payment"}</Button></div>
  </form>;
}
