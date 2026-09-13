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
  const quantity = (value: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
  return <div className="harvest-charts">
    <Card><CardHeader><CardTitle>Monthly crop revenue</CardTitle><p>Dated sales, grouped by crop and farm month.</p></CardHeader><CardContent><figure className="harvest-chart">{data.length ? <><div aria-hidden="true"><ResponsiveContainer height={236} width="100%"><BarChart data={data}><CartesianGrid stroke="#dce7ea" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#62727a", fontSize: 10 }} tickLine={false} /><YAxis axisLine={false} tickFormatter={(value) => formatCompactINR(Number(value))} tickLine={false} width={66} /><Tooltip formatter={(value) => formatINR(Number(value))} /><Bar dataKey="revenue" fill="#057db8" radius={[5, 5, 1, 1]} /></BarChart></ResponsiveContainer></div><figcaption className="sr-only">Monthly crop revenue chart. Dated sales by crop and month.</figcaption><ul aria-label="Monthly crop revenue values" className="sr-only">{data.map((row) => <li key={row.label}>{row.label}: {formatINR(row.revenue)}</li>)}</ul></> : <figcaption>No dated harvests to chart yet.</figcaption>}</figure></CardContent></Card>
    <Card><CardHeader><CardTitle>Quantity over time</CardTitle><p>Recorded yield counts across the same dated periods.</p></CardHeader><CardContent><figure className="harvest-chart">{data.length ? <><div aria-hidden="true"><ResponsiveContainer height={236} width="100%"><LineChart data={data}><CartesianGrid stroke="#dce7ea" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#62727a", fontSize: 10 }} tickLine={false} /><YAxis axisLine={false} tick={{ fill: "#62727a", fontSize: 10 }} tickLine={false} width={42} /><Tooltip formatter={(value) => quantity(Number(value))} /><Line dataKey="quantity" dot={{ fill: "#f8faf9", r: 4, stroke: "#057db8", strokeWidth: 2 }} stroke="#057db8" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer></div><figcaption className="sr-only">Harvest quantity over time chart. Yield count by crop and month.</figcaption><ul aria-label="Harvest quantity over time values" className="sr-only">{data.map((row) => <li key={row.label}>{row.label}: {quantity(row.quantity)}</li>)}</ul></> : <figcaption>No dated harvests to chart yet.</figcaption>}</figure></CardContent></Card>
  </div>;
}
