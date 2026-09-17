import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";

export type AppRole = "admin" | "editor" | "viewer";
export type ExpenseClass = "CAPEX" | "OPEX";

type ReferenceRecord = {
  id: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SettingsPerson = ReferenceRecord & {
  name: string;
  email: string | null;
  farmRole: string;
  appRole: AppRole;
  participatesInSharedExpenses: boolean;
  participant: boolean;
};

export type SettingsCategory = ReferenceRecord & {
  name: string;
  defaultExpenseClass: ExpenseClass | null;
};

export type SettingsCrop = ReferenceRecord & {
  name: string;
  localName: string | null;
  cropType: string | null;
};

export type SettingsFarmArea = ReferenceRecord & {
  code: string;
  name: string;
  description: string | null;
};

export type PersonInput = {
  name: string;
  email: string | null;
  farmRole: string;
  appRole: AppRole;
  participatesInSharedExpenses: boolean;
  active: boolean;
};

export type CategoryInput = {
  name: string;
  defaultExpenseClass: ExpenseClass | null;
  active: boolean;
};

export type CropInput = {
  name: string;
  localName: string | null;
  cropType: string | null;
  active: boolean;
};

export type FarmAreaInput = {
  code: string;
  name: string;
  description: string | null;
  active: boolean;
};

const paths = {
  people: "/api/v1/people",
  categories: "/api/v1/categories",
  crops: "/api/v1/plantation/crops",
  areas: "/api/v1/plantation/farm-areas",
};

const mutationKeys = {
  people: ["settings", "people", "mutation"] as const,
  categories: ["settings", "categories", "mutation"] as const,
  crops: ["settings", "crops", "mutation"] as const,
  areas: ["settings", "areas", "mutation"] as const,
};

export type SettingsResource = keyof typeof mutationKeys;

export function useSettingsMutationPending(resource: SettingsResource) {
  return useIsMutating({ mutationKey: mutationKeys[resource] }) > 0;
}

async function fetchAllInactiveAware<T>(path: string): Promise<T[]> {
  const records: T[] = [];
  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "100",
      includeInactive: "true",
    });
    const next = await apiFetch<T[]>(`${path}?${params.toString()}`);
    records.push(...next);
    if (next.length < 100) return records;
  }
}

function request<T>(path: string, method: "PATCH" | "POST", input: unknown) {
  return apiFetch<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

async function invalidateFamilies(
  client: ReturnType<typeof useQueryClient>,
  families: readonly (readonly unknown[])[],
) {
  await Promise.all(
    families.map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

const peopleInvalidations = [
  queryKeys.people,
  queryKeys.identity,
  ["expenses"] as const,
  queryKeys.settlements,
  queryKeys.dashboard,
  queryKeys.expenseContributionReport,
  queryKeys.reportsRoot,
] as const;

const categoryInvalidations = [
  queryKeys.categories,
  ["expenses"] as const,
  queryKeys.dashboard,
  queryKeys.reportsRoot,
] as const;

const cropInvalidations = [
  queryKeys.plantation,
  queryKeys.harvestsRoot,
  ["expenses"] as const,
  queryKeys.dashboard,
  queryKeys.reportsRoot,
] as const;

const areaInvalidations = [
  queryKeys.plantation,
  queryKeys.dashboard,
  queryKeys.reportsRoot,
] as const;

export function useSettingsPeople() {
  return useQuery({
    queryKey: [...queryKeys.people, "settings", "all"] as const,
    queryFn: () => fetchAllInactiveAware<SettingsPerson>(paths.people),
  });
}

export function useSettingsCategories() {
  return useQuery({
    queryKey: [...queryKeys.categories, "settings", "all"] as const,
    queryFn: () => fetchAllInactiveAware<SettingsCategory>(paths.categories),
  });
}

export function useSettingsCrops() {
  return useQuery({
    queryKey: [...queryKeys.plantation, "crops", "settings", "all"] as const,
    queryFn: () => fetchAllInactiveAware<SettingsCrop>(paths.crops),
  });
}

export function useSettingsFarmAreas() {
  return useQuery({
    queryKey: [...queryKeys.plantation, "areas", "settings", "all"] as const,
    queryFn: () => fetchAllInactiveAware<SettingsFarmArea>(paths.areas),
  });
}

function useReferenceMutation<TInput, TResult>(
  path: string,
  invalidations: readonly (readonly unknown[])[],
  mutationKey: readonly unknown[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn: ({ id, input }: { id?: string; input: TInput }) =>
      request<TResult>(id ? `${path}/${id}` : path, id ? "PATCH" : "POST", input),
    onSuccess: () => invalidateFamilies(client, invalidations),
  });
}

export function usePersonMutation() {
  return useReferenceMutation<Partial<PersonInput>, SettingsPerson>(paths.people, peopleInvalidations, mutationKeys.people);
}

export function useCategoryMutation() {
  return useReferenceMutation<Partial<CategoryInput>, SettingsCategory>(paths.categories, categoryInvalidations, mutationKeys.categories);
}

export function useCropMutation() {
  return useReferenceMutation<Partial<CropInput>, SettingsCrop>(paths.crops, cropInvalidations, mutationKeys.crops);
}

export function useFarmAreaMutation() {
  return useReferenceMutation<Partial<FarmAreaInput>, SettingsFarmArea>(paths.areas, areaInvalidations, mutationKeys.areas);
}
