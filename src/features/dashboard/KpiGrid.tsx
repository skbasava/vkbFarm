import { Card, CardContent } from "../../components/ui/card";
import { formatCompactINR, formatINR } from "../../lib/format";
import type { Dashboard } from "./api";

export function KpiGrid({ dashboard }: { dashboard: Dashboard }) {
  const { totals, plantationSummary } = dashboard;
  const values = [
    { label: "Total spend", value: formatCompactINR(totals.expensePaise), detail: "All recorded farm costs" },
    { label: "Net cash flow", value: formatINR(totals.netCashFlowPaise), detail: "Revenue less expenses", emphasis: totals.netCashFlowPaise >= 0 },
    { label: "Plantation", value: plantationSummary.totalQuantity.toLocaleString("en-IN"), detail: "Plants in inventory" },
    { label: "Harvest revenue", value: formatINR(totals.revenuePaise), detail: "Recorded sale revenue" },
  ];
  return <div className="dashboard-kpis">{values.map((item) => <Card className={`dashboard-kpi${item.emphasis ? " dashboard-kpi--positive" : ""}`} key={item.label}><CardContent><h3>{item.label}</h3><strong>{item.value}</strong><span>{item.detail}</span></CardContent></Card>)}</div>;
}
