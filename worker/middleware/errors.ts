import { HTTPException } from "hono/http-exception";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiFailure } from "../../src/types/api";
import type { AppEnv } from "../types";

export class ApiHttpError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly status: ContentfulStatusCode;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function failure(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const error: ApiFailure["error"] = details ? { code, message, details } : { code, message };
  return c.json({ error }, status);
}

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof ApiHttpError) {
    return failure(c, error.status, error.code, error.message, error.details);
  }
  if (error instanceof HTTPException) {
    return failure(c, error.status, "HTTP_ERROR", error.message);
  }

  console.error(JSON.stringify({ event: "unexpected_error", name: error.name }));
  return failure(c, 500, "INTERNAL_ERROR", "An unexpected error occurred");
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  failure(c, 404, "NOT_FOUND", "The requested resource was not found");
