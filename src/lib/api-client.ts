import type { ApiFailure, ApiObject } from "../types/api";

export class ApiError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly offline: boolean;
  readonly status: number;

  constructor({
    status,
    code,
    message,
    details,
    offline = false,
  }: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    offline?: boolean;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.offline = offline;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiFailure(value: unknown): value is ApiFailure {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  return typeof value.error.code === "string" && typeof value.error.message === "string";
}

function isApiObject<T>(value: unknown): value is ApiObject<T> {
  return isRecord(value) && "data" in value;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function parseBody(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body.length === 0) return undefined;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

/** Requests a VKB API endpoint and returns the shared envelope's data payload. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    const offline = isOffline();
    throw new ApiError({
      status: 0,
      code: offline ? "OFFLINE" : "NETWORK_ERROR",
      message: offline ? "You appear to be offline" : "Unable to reach the server",
      offline,
    });
  }

  const body = await parseBody(response);
  if (!response.ok) {
    if (isApiFailure(body)) {
      throw new ApiError({ status: response.status, ...body.error });
    }

    throw new ApiError({
      status: response.status,
      code: "REQUEST_FAILED",
      message: "The request could not be completed",
    });
  }

  if (!isApiObject<T>(body)) {
    throw new ApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "The server returned an invalid response",
    });
  }

  return body.data;
}
