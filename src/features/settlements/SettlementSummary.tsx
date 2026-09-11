import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatINR } from "../../lib/format";
import type { SettlementSummary as SettlementSummaryData } from "./api";

type SettlementSummaryProps = { summary: SettlementSummaryData };

function balanceSentence(name: string, balancePaise: number): string {
  if (balancePaise > 0) return `${name} receives ${formatINR(balancePaise)}`;
  if (balancePaise < 0) return `${name} owes ${formatINR(Math.abs(balancePaise))}`;
  return `${name} is settled`;
}

export function SettlementSummary({ summary }: SettlementSummaryProps) {
  const names = new Map(summary.participants.map((participant) => [participant.personId, participant.name]));
  const transfer = summary.recommendedTransfers[0];

  return <>
    <section className="settlement-kpis" aria-label="Shared expense overview">
      <Card className="settlement-kpi settlement-kpi--total">
        <CardContent><span>Shared expenses to date</span><strong>{formatINR(summary.totalSharedExpensePaise)}</strong><p>Calculated only from active owner contributions.</p></CardContent>
      </Card>
      <Card className="settlement-kpi">
        <CardContent><span>Participants</span><strong>{summary.participants.length}</strong><p>Equal shares, settled in paise.</p></CardContent>
      </Card>
    </section>

    <Card className="settlement-position">
      <CardHeader><div><span className="settlement-eyebrow"><CircleDollarSign aria-hidden="true" size={14} /> Member positions</span><CardTitle>Who has paid their share?</CardTitle></div><p>Payments recorded below reduce the outstanding balance; they do not change the expense total.</p></CardHeader>
      <CardContent><div className="settlement-position__table" role="table" aria-label="Participant settlement positions"><div className="settlement-position__head" role="row"><span role="columnheader">Participant</span><span role="columnheader">Contributed</span><span role="columnheader">Expected share</span><span role="columnheader">Position</span></div>{summary.participants.map((participant) => {
        const owes = participant.balancePaise < 0;
        const receives = participant.balancePaise > 0;
        return <div className="settlement-position__row" key={participant.personId} role="row"><strong role="cell">{participant.name}</strong><span role="cell"><small>Contributed</small>{formatINR(participant.paidPaise)}</span><span role="cell"><small>Expected share</small>{formatINR(participant.expectedPaise)}</span><span className={`settlement-balance${owes ? " settlement-balance--owes" : receives ? " settlement-balance--receives" : " settlement-balance--settled"}`} role="cell">{owes ? <ArrowUpRight aria-hidden="true" size={16} /> : receives ? <ArrowDownLeft aria-hidden="true" size={16} /> : <HandCoins aria-hidden="true" size={16} />}<b>{balanceSentence(participant.name, participant.balancePaise)}</b></span></div>;
      })}</div></CardContent>
    </Card>

    <Card className="settlement-recommendation">
      <CardContent>{transfer ? <><span className="settlement-eyebrow"><HandCoins aria-hidden="true" size={14} /> Next recommended payment</span><div><strong>{names.get(transfer.fromPersonId)} pays {names.get(transfer.toPersonId)}</strong><b>{formatINR(transfer.amountPaise)}</b></div><p>This one transfer is the next deterministic step toward a settled ledger.</p></> : <><span className="settlement-eyebrow"><HandCoins aria-hidden="true" size={14} /> Shared balance</span><div><strong>Everyone is settled</strong><b>₹0</b></div><p>No transfer is needed for the recorded shared expenses.</p></>}</CardContent>
    </Card>
  </>;
}
