import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";

export type ReportDates = { dateFrom?: string; dateTo?: string };
export type ExpenseReport = { id: string; expenseDate: string; description: string; amountPaise: number; paidByPersonName: string; categoryName: string | null; expenseClass: "CAPEX" | "OPEX" | null; paidTo: string | null; isShared: boolean; notes: string | null };
export type HarvestReport = { id: string; cropName: string; harvestDate: string | null; quantity: number | null; revenuePaise: number; buyer: string | null; notes: string | null };
export type CashflowReport = { expensePaise: number; revenuePaise: number; netCashFlowPaise: number };
export type ContributionReport = { totalSharedExpensePaise: number; participants: Array<{ personId: string; name: string; paidPaise: number; expectedPaise: number; balancePaise: number }>; recommendedTransfers: Array<{ fromPersonId: string; toPersonId: string; amountPaise: number }> };

export function reportQuery(dates: ReportDates): string {
  const params = new URLSearchParams();
  if (dates.dateFrom) params.set("dateFrom", dates.dateFrom);
  if (dates.dateTo) params.set("dateTo", dates.dateTo);
  return params.toString();
}

function reportPath(name: string, dates: ReportDates): string {
  const query = reportQuery(dates);
  return `/api/v1/reports/${name}${query ? `?${query}` : ""}`;
}

export function useReports(dates: ReportDates) {
  return {
    expenses: useQuery({ queryKey: [...queryKeys.reports(dates), "expenses"], queryFn: () => apiFetch<ExpenseReport[]>(reportPath("expenses", dates)) }),
    harvests: useQuery({ queryKey: [...queryKeys.reports(dates), "harvest"], queryFn: () => apiFetch<HarvestReport[]>(reportPath("harvest", dates)) }),
    cashflow: useQuery({ queryKey: [...queryKeys.reports(dates), "cashflow"], queryFn: () => apiFetch<CashflowReport>(reportPath("cashflow", dates)) }),
    contributions: useQuery({ queryKey: [...queryKeys.expenseContributionReport, dates], queryFn: () => apiFetch<ContributionReport>(reportPath("contributions", dates)) }),
  };
}
