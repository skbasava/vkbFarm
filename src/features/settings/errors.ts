import { ApiError } from "../../lib/api-client";

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function fieldErrorsFromApi<const TField extends string>(
  error: unknown,
  allowedFields: readonly TField[],
): Partial<Record<TField, string>> {
  const mapped: Partial<Record<TField, string>> = {};
  if (!(error instanceof ApiError) || !Array.isArray(error.details?.issues)) return mapped;

  const allowed = new Set<string>(allowedFields);
  for (const issue of error.details.issues.slice(0, 50)) {
    if (!isRecord(issue) || typeof issue.path !== "string" || typeof issue.message !== "string") continue;
    if (!allowed.has(issue.path) || issue.message.length === 0) continue;
    const field = issue.path as TField;
    if (mapped[field] === undefined) mapped[field] = issue.message;
    if (Object.keys(mapped).length === allowedFields.length) break;
  }
  return mapped;
}
