import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { ErrorState } from "../../components/ui/error-state";
import { formatDate, formatINR } from "../../lib/format";
import { reportQuery, useReports, type ReportDates } from "./api";
import { ReportFilters } from "./ReportFilters";

function exportPath(type: string, dates: ReportDates): string {
  const query = reportQuery(dates);
  return `/api/v1/reports/export/${type}${query ? `?${query}` : ""}`;
}

export default function ReportsPage() {
  const [draftDates, setDraftDates] = useState<ReportDates>({});
  const [dates, setDates] = useState<ReportDates>({});
  const reports = useReports(dates);
  if (reports.expenses.isError || reports.harvests.isError || reports.cashflow.isError || reports.contributions.isError) return <section className="reports-page"><ErrorState title="We could not load reports" /></section>;
  const cashflow = reports.cashflow.data;
  return <section className="reports-page"><header className="reports-page__heading"><div className="page-intro"><span>Ledger exports · verified source rows</span><h2>Reports</h2><p>Filter by farm dates, inspect source data, and export a spreadsheet-safe CSV.</p></div><ReportFilters dates={draftDates} onChange={setDraftDates} onApply={() => setDates(draftDates)} /></header>
    <div className="report-cashflow"><Card><CardHeader><CardTitle>Cash flow</CardTitle></CardHeader><CardContent>{cashflow ? <><strong>{formatINR(cashflow.netCashFlowPaise)}</strong><p>Revenue {formatINR(cashflow.revenuePaise)} · expenses {formatINR(cashflow.expensePaise)}</p></> : <p>Loading cash flow…</p>}</CardContent></Card><Card><CardHeader><CardTitle>Shared contribution</CardTitle></CardHeader><CardContent><strong>{reports.contributions.data ? formatINR(reports.contributions.data.totalSharedExpensePaise) : "Loading…"}</strong><p>Settlements remain calculated by the shared ledger.</p></CardContent></Card></div>
    <div className="report-export-links"><a href={exportPath("expenses", dates)}>Download expenses CSV</a><a href="/api/v1/reports/export/settlements">Download settlements CSV</a><a href="/api/v1/reports/export/plantation">Download plantation CSV</a><a href={exportPath("harvest", dates)}>Download harvest CSV</a></div>
    <section className="report-list"><h3>Expense report</h3>{reports.expenses.data?.length ? <ul>{reports.expenses.data.map((row) => <li key={row.id}><span>{formatDate(row.expenseDate)}</span><strong>{row.description}</strong><em>{row.categoryName ?? "Uncategorized"}</em><b>{formatINR(row.amountPaise)}</b></li>)}</ul> : <p>No expenses match these dates.</p>}</section>
    <section className="report-list"><h3>Harvest report</h3>{reports.harvests.data?.length ? <ul>{reports.harvests.data.map((row) => <li key={row.id}><span>{row.harvestDate ? formatDate(row.harvestDate) : "Date unavailable"}</span><strong>{row.cropName}</strong><em>{row.buyer ?? "No buyer recorded"}</em><b>{formatINR(row.revenuePaise)}</b></li>)}</ul> : <p>No harvests match these dates.</p>}</section>
  </section>;
}
