import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";

export type HarvestCrop = { id: string; name: string; active: boolean };
export type Harvest = {
  id: string;
  cropId: string;
  cropName: string;
  cropActive: boolean;
  harvestDate: string | null;
  quantity: string | null;
  grossWeightKg: string | null;
  netWeightKg: string | null;
  averageWeightKg: string | null;
  salePricePaisePerKg: number | null;
  calculatedRevenuePaise: number | null;
  actualRevenuePaise: number | null;
  revenueOverrideReason: string | null;
  buyer: string | null;
  notes: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};
export type HarvestInput = {
  cropId: string;
  harvestDate: string;
  quantity?: string;
  grossWeightKg?: string;
  netWeightKg: string;
  averageWeightKg?: string;
  salePricePerKg: string;
  actualRevenue?: string | null;
  revenueOverrideReason?: string | null;
  buyer?: string | null;
  notes?: string | null;
};
export type HarvestUpdateInput = Partial<Omit<HarvestInput, "harvestDate" | "quantity" | "grossWeightKg" | "averageWeightKg">> & {
  harvestDate?: string | null;
  quantity?: string | null;
  grossWeightKg?: string | null;
  averageWeightKg?: string | null;
};
export type HarvestSummary = {
  recordCount: number;
  totalQuantity: string;
  totalNetWeightKg: string;
  revenuePaise: number;
  averagePricePaisePerKg: number;
  undatedCount: number;
  undatedRevenuePaise: number;
  monthlyCropRevenue: Array<{
    month: string;
    cropName: string;
    revenuePaise: number;
    quantity: string;
    netWeightKg: string;
  }>;
};
export type HarvestFilters = { cropId?: string; dateFrom?: string; dateTo?: string; month?: string; year?: string };

const keys = {
  all: ["harvests"] as const,
  list: (filters: HarvestFilters) => ["harvests", "list", filters] as const,
  summary: (filters: HarvestFilters) => ["harvests", "summary", filters] as const,
};

function query(filters: HarvestFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

async function allCrops(): Promise<HarvestCrop[]> {
  const crops: HarvestCrop[] = [];
  for (let page = 1; ; page += 1) {
    const result = await apiFetch<HarvestCrop[]>(`/api/v1/plantation/crops?page=${page}&pageSize=100&includeInactive=true`);
    crops.push(...result);
    if (result.length < 100) return crops;
  }
}

export function useHarvestCrops() {
  return useQuery({ queryKey: ["harvests", "crops", "all"], queryFn: allCrops });
}

export function useHarvests(filters: HarvestFilters) {
  const suffix = query(filters);
  return useQuery({ queryKey: keys.list(filters), queryFn: () => apiFetch<Harvest[]>(`/api/v1/harvests${suffix ? `?${suffix}` : ""}`) });
}

export function useHarvestSummary(filters: HarvestFilters) {
  const suffix = query(filters);
  return useQuery({ queryKey: keys.summary(filters), queryFn: () => apiFetch<HarvestSummary>(`/api/v1/harvests/summary${suffix ? `?${suffix}` : ""}`) });
}

async function invalidateHarvestDependents(client: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.all }),
    client.invalidateQueries({ queryKey: queryKeys.dashboard }),
    client.invalidateQueries({ queryKey: queryKeys.reports() }),
  ]);
}

export function useCreateHarvest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HarvestInput) => apiFetch<Harvest>("/api/v1/harvests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: () => invalidateHarvestDependents(client),
  });
}

export function useUpdateHarvest(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HarvestUpdateInput) => apiFetch<Harvest>(`/api/v1/harvests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: () => invalidateHarvestDependents(client),
  });
}

export function useDeleteHarvest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/api/v1/harvests/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateHarvestDependents(client),
  });
}
