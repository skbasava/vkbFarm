import { ArrowRight, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatDate, formatINR } from "../../lib/format";
import type { Settlement } from "./api";

export function SettlementHistory({ settlements }: { settlements: Settlement[] }) {
  return <Card className="settlement-history"><CardHeader><div><span className="settlement-eyebrow"><CalendarDays aria-hidden="true" size={14} /> Payment history</span><CardTitle>Recorded transfers</CardTitle></div><p>Newest payment first.</p></CardHeader><CardContent>{settlements.length ? <ol>{settlements.map((settlement) => <li key={settlement.id}><span>{formatDate(settlement.settlementDate)}</span><strong>{settlement.fromPersonName}<ArrowRight aria-hidden="true" size={15} />{settlement.toPersonName}</strong><b>{formatINR(settlement.amountPaise)}</b>{settlement.remarks ? <em>{settlement.remarks}</em> : null}</li>)}</ol> : <div className="settlement-history__empty">No payments have been recorded yet.</div>}</CardContent></Card>;
}
