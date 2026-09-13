import { Card, CardContent } from "../../components/ui/card";
import { formatINR, formatWeight } from "../../lib/format";
import type { HarvestSummary as Summary } from "./api";

export function HarvestSummary({ summary }: { summary: Summary }) {
  return <div className="harvest-summary">
    <Card className="harvest-summary__revenue"><CardContent><span>Harvest revenue</span><strong>{formatINR(summary.revenuePaise)}</strong><small>All recorded sales</small></CardContent></Card>
    <Card><CardContent><span>Total quantity</span><strong>{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(summary.totalQuantity))}</strong><small>Across {summary.recordCount} records</small></CardContent></Card>
    <Card><CardContent><span>Net harvested weight</span><strong>{formatWeight(Number(summary.totalNetWeightKg))}</strong><small>Field weight after deductions</small></CardContent></Card>
    <Card><CardContent><span>Average sale price</span><strong>{formatINR(summary.averagePricePaisePerKg)}</strong><small>Per kg, weighted by harvest</small></CardContent></Card>
  </div>;
}
