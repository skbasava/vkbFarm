import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatDate, formatINR } from "../../lib/format";
import type { Dashboard } from "./api";

export function RecentActivity({ dashboard }: { dashboard: Dashboard }) {
  const transfer = dashboard.contributions.recommendedTransfers[0];
  const people = new Map(dashboard.contributions.participants.map((person) => [person.personId, person.name]));
  const plantation = dashboard.plantationSummary;
  return <div className="dashboard-activity">
    <Card className="dashboard-settlement"><CardHeader><span>Shared ledger</span><CardTitle>Settlement position</CardTitle></CardHeader><CardContent>{transfer ? <p><strong>{people.get(transfer.fromPersonId)} owes {people.get(transfer.toPersonId)} {formatINR(transfer.amountPaise)}</strong><br /><span>{people.get(transfer.toPersonId)} receives {formatINR(transfer.amountPaise)}</span><span> when {people.get(transfer.fromPersonId)} pays this transfer.</span></p> : <p><strong>Shared contributions are settled.</strong><br />No payment is needed at this time.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Plantation pulse</CardTitle></CardHeader><CardContent><p className="plantation-pulse">{plantation.totalQuantity ? `${plantation.totalQuantity.toLocaleString("en-IN")} plants across ${plantation.cropCount} ${plantation.cropCount === 1 ? "crop" : "crops"} and ${plantation.areaCount} ${plantation.areaCount === 1 ? "area" : "areas"}` : "No plantation inventory has been recorded yet."}</p></CardContent></Card>
    <Card className="recent-activity"><CardHeader><CardTitle>Recent expenses</CardTitle></CardHeader><CardContent>{dashboard.recentExpenses.length ? <ul>{dashboard.recentExpenses.map((expense) => <li key={expense.id}><div><strong>{expense.description}</strong><span>{formatDate(expense.expenseDate)} · {expense.paidByPersonName}{expense.categoryName ? ` · ${expense.categoryName}` : ""}</span></div><b>{formatINR(expense.amountPaise)}</b></li>)}</ul> : <p>No expenses yet. New ledger entries will appear here.</p>}</CardContent></Card>
    <Card className="recent-activity"><CardHeader><CardTitle>Recent harvests</CardTitle></CardHeader><CardContent>{dashboard.recentHarvests.length ? <ul>{dashboard.recentHarvests.map((harvest) => <li key={harvest.id}><div><strong>{harvest.cropName}</strong><span>{harvest.harvestDate ? formatDate(harvest.harvestDate) : "Date unavailable"}</span>{harvest.buyer ? <span>{harvest.buyer}</span> : null}</div><b>{formatINR(harvest.revenuePaise)}</b></li>)}</ul> : <p>No harvest revenue has been recorded yet.</p>}</CardContent></Card>
  </div>;
}
