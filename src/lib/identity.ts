import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";
import { queryKeys } from "./query-keys";

export type ApplicationIdentity = { email: string; role: "admin" | "editor" | "viewer" };

export function canManageExpenses(identity?: ApplicationIdentity): boolean {
  return identity?.role === "admin" || identity?.role === "editor";
}

export function useIdentity() {
  return useQuery({ queryKey: queryKeys.identity, queryFn: () => apiFetch<ApplicationIdentity>("/api/v1/identity") });
}
