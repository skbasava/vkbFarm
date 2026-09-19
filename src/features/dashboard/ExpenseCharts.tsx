import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatCompactINR, formatINR } from "../../lib/format";
import type { Dashboard } from "./api";

function MoneyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value?: number; payload?: { label?: string } }> }) {
  if (!active || !payload?.[0]) return null;
  return <div className="chart-tooltip"><strong>{payload[0].payload?.label}</strong><span>{formatINR(payload[0].value ?? 0)}</span></div>;
}

function useMobileCharts(): boolean {
  const query = "(max-width: 759px)";
  const [isMobile, setIsMobile] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function ExpenseCharts({ dashboard }: { dashboard: Dashboard }) {
  const monthly = dashboard.monthlyExpenses.map((item) => ({ label: item.month, amount: item.amountPaise }));
  const categories = dashboard.categoryExpenses.map((item) => ({ label: item.categoryName, amount: item.amountPaise }));
  const mobile = useMobileCharts();
  if (mobile) {
    const latest = monthly.at(-1);
    const leading = categories[0];
    return <section className="dashboard-mobile-summary" aria-label="Mobile expense summary"><h3>Mobile expense summary</h3><p>{latest ? `Latest period: ${latest.label} · ${formatINR(latest.amount)}` : "No expense months to summarise yet."}</p><p>{leading ? `Largest category: ${leading.label} · ${formatINR(leading.amount)}` : "No expense categories to summarise yet."}</p></section>;
  }
  return <div className="dashboard-charts">
    <Card><CardHeader><CardTitle>Expense run-rate</CardTitle><p>Monthly costs, excluding deleted entries.</p></CardHeader><CardContent><figure className="dashboard-chart">{monthly.length ? <><div aria-hidden="true"><ResponsiveContainer height={220} width="100%"><BarChart accessibilityLayer={false} data={monthly}><CartesianGrid stroke="#e4ecee" strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fill: "#52636b", fontSize: 11 }} /><YAxis tickFormatter={(value) => formatCompactINR(Number(value))} tick={{ fill: "#52636b", fontSize: 11 }} width={68} /><Tooltip content={<MoneyTooltip />} /><Bar dataKey="amount" fill="#057db8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div><figcaption className="sr-only">Monthly expense chart. Recorded spending by month.</figcaption><ul aria-label="Monthly expense values" className="sr-only">{monthly.map((row) => <li key={row.label}>{row.label}: {formatINR(row.amount)}</li>)}</ul></> : <figcaption>No expense months to chart yet.</figcaption>}</figure></CardContent></Card>
    <Card><CardHeader><CardTitle>Cost concentration</CardTitle><p>Largest categories in the recorded ledger.</p></CardHeader><CardContent><figure className="dashboard-chart">{categories.length ? <><div aria-hidden="true"><ResponsiveContainer height={220} width="100%"><BarChart accessibilityLayer={false} data={categories} layout="vertical" margin={{ left: 8 }}><CartesianGrid stroke="#e4ecee" strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(value) => formatCompactINR(Number(value))} tick={{ fill: "#52636b", fontSize: 11 }} /><YAxis dataKey="label" type="category" tick={{ fill: "#52636b", fontSize: 11 }} width={78} /><Tooltip content={<MoneyTooltip />} /><Bar dataKey="amount" fill="#17242b" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div><figcaption className="sr-only">Expense category chart. Recorded spending by category.</figcaption><ul aria-label="Expense category values" className="sr-only">{categories.map((row) => <li key={row.label}>{row.label}: {formatINR(row.amount)}</li>)}</ul></> : <figcaption>No expense categories to chart yet.</figcaption>}</figure></CardContent></Card>
  </div>;
}
