import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";

export type SettlementParticipant = {
  personId: string;
  name: string;
  paidPaise: number;
  expectedPaise: number;
  balancePaise: number;
};

export type RecommendedTransfer = {
  fromPersonId: string;
  toPersonId: string;
  amountPaise: number;
};

export type SettlementSummary = {
  totalSharedExpensePaise: number;
  participants: SettlementParticipant[];
  recommendedTransfers: RecommendedTransfer[];
};

export type Settlement = {
  id: string;
  fromPersonId: string;
  fromPersonName: string;
  toPersonId: string;
  toPersonName: string;
  amountPaise: number;
  settlementDate: string;
  remarks: string | null;
  createdAt: string;
};

export type SettlementInput = {
  fromPersonId: string;
  toPersonId: string;
  amount: string;
  settlementDate: string;
  remarks: string | null;
};

export function useSettlementSummary() {
  return useQuery({
    queryKey: [...queryKeys.settlements, "summary"],
    queryFn: () => apiFetch<SettlementSummary>("/api/v1/settlements/summary"),
  });
}

export function useSettlements() {
  return useQuery({
    queryKey: [...queryKeys.settlements, "history"],
    queryFn: () => apiFetch<Settlement[]>("/api/v1/settlements"),
  });
}

export function useRecordSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SettlementInput) => apiFetch<Settlement>("/api/v1/settlements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settlements }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenseContributionReport }),
      ]);
    },
  });
}
