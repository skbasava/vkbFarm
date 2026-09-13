import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatCompactINR, formatINR } from "../../lib/format";
import type { HarvestSummary } from "./api";

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(2000, Number(monthNumber) - 1, 1)) + ` '${year?.slice(2)}`;
}

export function HarvestCharts({ summary }: { summary: HarvestSummary }) {
  const data = summary.monthlyCropRevenue.map((row) => ({
    label: `${monthLabel(row.month)} · ${row.cropName}`,
    revenue: row.revenuePaise,
    quantity: Number(row.quantity),
  }));
  return <div className="harvest-charts">
    <Card><CardHeader><CardTitle>Monthly crop revenue</CardTitle><p>Dated sales, grouped by crop and farm month.</p></CardHeader><CardContent><figure aria-label="Monthly crop revenue chart" role="img" className="harvest-chart">{data.length ? <ResponsiveContainer height={236} width="100%"><BarChart data={data}><CartesianGrid stroke="#dce7ea" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#62727a", fontSize: 10 }} tickLine={false} /><YAxis axisLine={false} tickFormatter={(value) => formatCompactINR(Number(value))} tickLine={false} width={66} /><Tooltip formatter={(value) => formatINR(Number(value))} /><Bar dataKey="revenue" fill="#057db8" radius={[5, 5, 1, 1]} /></BarChart></ResponsiveContainer> : <figcaption>No dated harvests to chart yet.</figcaption>}</figure></CardContent></Card>
    <Card><CardHeader><CardTitle>Quantity over time</CardTitle><p>Recorded yield counts across the same dated periods.</p></CardHeader><CardContent><figure aria-label="Harvest quantity over time chart" role="img" className="harvest-chart">{data.length ? <ResponsiveContainer height={236} width="100%"><LineChart data={data}><CartesianGrid stroke="#dce7ea" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#62727a", fontSize: 10 }} tickLine={false} /><YAxis axisLine={false} tick={{ fill: "#62727a", fontSize: 10 }} tickLine={false} width={42} /><Tooltip formatter={(value) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(value))} /><Line dataKey="quantity" dot={{ fill: "#f8faf9", r: 4, stroke: "#057db8", strokeWidth: 2 }} stroke="#057db8" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer> : <figcaption>No dated harvests to chart yet.</figcaption>}</figure></CardContent></Card>
  </div>;
}
