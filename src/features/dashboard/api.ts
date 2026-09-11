import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";

export type SettlementParticipant = { personId: string; name: string; paidPaise: number; expectedPaise: number; balancePaise: number };
export type SettlementSummary = { totalSharedExpensePaise: number; participants: SettlementParticipant[]; recommendedTransfers: Array<{ fromPersonId: string; toPersonId: string; amountPaise: number }> };
export type Dashboard = {
  totals: { expensePaise: number; currentMonthExpensePaise: number; currentYearExpensePaise: number; capexPaise: number; opexPaise: number; revenuePaise: number; netCashFlowPaise: number };
  contributions: SettlementSummary;
  monthlyExpenses: Array<{ month: string; amountPaise: number }>;
  categoryExpenses: Array<{ categoryId: string | null; categoryName: string; amountPaise: number }>;
  recentExpenses: Array<{ id: string; expenseDate: string; description: string; amountPaise: number; paidByPersonName: string; categoryName: string | null; expenseClass: "CAPEX" | "OPEX" | null }>;
  recentHarvests: Array<{ id: string; cropName: string; harvestDate: string | null; quantity: number | null; revenuePaise: number; buyer: string | null }>;
  plantationSummary: { totalQuantity: number; cropCount: number; areaCount: number };
};

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: () => apiFetch<Dashboard>("/api/v1/dashboard") });
}
