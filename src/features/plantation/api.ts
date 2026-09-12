import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";

export type PlantationCrop = { id: string; name: string; active: boolean };
export type FarmArea = { id: string; code: string; name: string; active: boolean };
export type PlantationInput = { cropId: string; farmAreaId: string; quantity: number; plantingDate: string; notes?: string | null };
export type PlantationUpdateInput = Omit<PlantationInput, "plantingDate"> & { plantingDate: string | null };
export type PlantationCohort = PlantationUpdateInput & { id: string; cropName: string; farmAreaCode: string; farmAreaName: string; source: string | null; createdAt: string; updatedAt: string };
export type PlantationSummary = { areas: FarmArea[]; rows: Array<{ cropId: string; cropName: string; quantities: Record<string, number>; totalQuantity: number }>; areaTotals: Record<string, number>; totalQuantity: number; cohortCount: number; cohorts: PlantationCohort[] };

const keys = { all: ["plantation"] as const, summary: ["plantation", "summary"] as const };

export function usePlantationSummary() {
  return useQuery({ queryKey: keys.summary, queryFn: () => apiFetch<PlantationSummary>("/api/v1/plantation/summary") });
}

async function fetchAllActiveOptions<T>(path: string): Promise<T[]> {
  const options: T[] = [];
  for (let page = 1; ; page += 1) {
    const next = await apiFetch<T[]>(`${path}?page=${page}&pageSize=100`);
    options.push(...next);
    if (next.length < 100) return options;
  }
}

export function usePlantationCrops() {
  return useQuery({ queryKey: ["plantation", "crops", "all-active"], queryFn: () => fetchAllActiveOptions<PlantationCrop>("/api/v1/plantation/crops") });
}

export function useFarmAreas() {
  return useQuery({ queryKey: ["plantation", "areas", "all-active"], queryFn: () => fetchAllActiveOptions<FarmArea>("/api/v1/plantation/farm-areas") });
}

export function useCreatePlantation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PlantationInput) => apiFetch("/api/v1/plantation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: keys.all }), client.invalidateQueries({ queryKey: queryKeys.dashboard }), client.invalidateQueries({ queryKey: queryKeys.reports() })]);
    },
  });
}

export function useUpdatePlantation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PlantationUpdateInput) => apiFetch(`/api/v1/plantation/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: keys.all }), client.invalidateQueries({ queryKey: queryKeys.dashboard }), client.invalidateQueries({ queryKey: queryKeys.reports() })]);
    },
  });
}
