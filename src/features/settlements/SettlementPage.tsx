import { Landmark } from "lucide-react";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { canManageExpenses, useIdentity } from "../../lib/identity";
import { SettlementForm } from "./SettlementForm";
import { SettlementHistory } from "./SettlementHistory";
import { useRecordSettlement, useSettlements, useSettlementSummary } from "./api";
import { SettlementSummary } from "./SettlementSummary";

export default function SettlementPage() {
  const summary = useSettlementSummary();
  const history = useSettlements();
  const identity = useIdentity();
  const recordSettlement = useRecordSettlement();
  const suggestedTransfer = summary.data?.recommendedTransfers[0];
  const canRecord = canManageExpenses(identity.data);

  if (summary.isLoading || history.isLoading || identity.isLoading) {
    return <section aria-label="Loading settlements" className="settlement-page settlement-page--loading"><Skeleton className="settlement-page__skeleton-title" /><Skeleton /><Skeleton /></section>;
  }
  if (summary.isError || history.isError || identity.isError || !summary.data || !history.data) {
    return <section className="settlement-page"><ErrorState title="We could not load settlements" /></section>;
  }

  return <section className="settlement-page"><header className="settlement-page__heading"><div className="page-intro"><span><Landmark aria-hidden="true" size={14} /> Shared ledger · exact balances</span><h2>Settlements</h2><p>Turn shared farm contributions into clear, auditable payment steps.</p></div></header><SettlementSummary summary={summary.data} /><div className="settlement-page__lower">{canRecord ? <section className="settlement-record"><SettlementForm error={recordSettlement.error?.message} isPending={recordSettlement.isPending} onRecord={(input) => recordSettlement.mutate(input)} participants={summary.data.participants} suggestedFromPersonId={suggestedTransfer?.fromPersonId} suggestedToPersonId={suggestedTransfer?.toPersonId} /></section> : <section className="settlement-readonly">You can review settlement balances and payment history. An editor can record a payment.</section>}<SettlementHistory settlements={history.data} /></div></section>;
}
