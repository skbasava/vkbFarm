import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatCompactINR, formatINR } from "../../lib/format";
import type { Dashboard } from "./api";

function MoneyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value?: number; payload?: { label?: string } }> }) {
  if (!active || !payload?.[0]) return null;
  return <div className="chart-tooltip"><strong>{payload[0].payload?.label}</strong><span>{formatINR(payload[0].value ?? 0)}</span></div>;
}

export function ExpenseCharts({ dashboard }: { dashboard: Dashboard }) {
  const monthly = dashboard.monthlyExpenses.map((item) => ({ label: item.month, amount: item.amountPaise }));
  const categories = dashboard.categoryExpenses.map((item) => ({ label: item.categoryName, amount: item.amountPaise }));
  return <div className="dashboard-charts">
    <Card><CardHeader><CardTitle>Expense run-rate</CardTitle><p>Monthly costs, excluding deleted entries.</p></CardHeader><CardContent><figure aria-label="Monthly expense chart" role="img" className="dashboard-chart">{monthly.length ? <ResponsiveContainer height={220} width="100%"><BarChart data={monthly}><CartesianGrid stroke="#e4ecee" strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fill: "#62727a", fontSize: 11 }} /><YAxis tickFormatter={(value) => formatCompactINR(Number(value))} tick={{ fill: "#62727a", fontSize: 11 }} width={68} /><Tooltip content={<MoneyTooltip />} /><Bar dataKey="amount" fill="#057db8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <figcaption>No expense months to chart yet.</figcaption>}</figure></CardContent></Card>
    <Card><CardHeader><CardTitle>Cost concentration</CardTitle><p>Largest categories in the recorded ledger.</p></CardHeader><CardContent><figure aria-label="Expense category chart" role="img" className="dashboard-chart">{categories.length ? <ResponsiveContainer height={220} width="100%"><BarChart data={categories} layout="vertical" margin={{ left: 8 }}><CartesianGrid stroke="#e4ecee" strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(value) => formatCompactINR(Number(value))} tick={{ fill: "#62727a", fontSize: 11 }} /><YAxis dataKey="label" type="category" tick={{ fill: "#62727a", fontSize: 11 }} width={78} /><Tooltip content={<MoneyTooltip />} /><Bar dataKey="amount" fill="#17242b" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <figcaption>No expense categories to chart yet.</figcaption>}</figure></CardContent></Card>
  </div>;
}
