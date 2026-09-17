import { Hono } from "hono";
import { ApiHttpError } from "../middleware/errors";
import { getIdentity } from "../middleware/identity";
import { requireRole } from "../middleware/roles";
import {
  createDocument,
  deleteDocument,
  documentMaximumBytes,
  getDocumentContent,
  listDocuments,
} from "../services/document-service";
import type { AppEnv } from "../types";
import { sanitizeReceiptFilename } from "../utils/r2-keys";

type IterableFormData = FormData & {
  forEach(callback: (value: File | string, key: string) => void): void;
};

const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function supportsIteration(form: FormData): form is IterableFormData {
  const candidate: object = form;
  return "forEach" in candidate && typeof candidate.forEach === "function";
}

function validationError(message: string): ApiHttpError {
  return new ApiHttpError(422, "VALIDATION_ERROR", message);
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw validationError(`${field} must be a positive integer`);
  }
  return parsed;
}

function parseListQuery(url: URL): {
  expenseId?: string;
  page: number;
  pageSize: number;
} {
  const allowed = new Set(["expenseId", "page", "pageSize"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw validationError(`Unknown query field: ${key}`);
    if (url.searchParams.getAll(key).length !== 1) {
      throw validationError(`${key} must be provided once`);
    }
  }
  const rawExpenseId = url.searchParams.get("expenseId");
  const expenseId = rawExpenseId?.trim();
  if (rawExpenseId !== null && !expenseId) {
    throw validationError("expenseId must not be empty");
  }
  return {
    ...(expenseId ? { expenseId } : {}),
    page: positiveInteger(
      url.searchParams.get("page") ?? undefined,
      1,
      "page",
    ),
    pageSize: Math.min(
      positiveInteger(
        url.searchParams.get("pageSize") ?? undefined,
        25,
        "pageSize",
      ),
      100,
    ),
  };
}

async function parseUpload(
  request: Request,
  maxFileBytes: number,
): Promise<{ expenseId: string; file: File }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    throw validationError("Request body must be multipart form data");
  }
  let form: FormData;
  try {
    const maxBodyBytes = maxFileBytes + MAX_MULTIPART_OVERHEAD_BYTES;
    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null) {
      const parsedLength = Number(declaredLength);
      if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
        throw validationError("Content-Length must be a non-negative integer");
      }
      if (parsedLength > maxBodyBytes) {
        throw new ApiHttpError(
          413,
          "DOCUMENT_TOO_LARGE",
          "The receipt upload envelope is too large",
        );
      }
    }

    const reader = request.body?.getReader();
    if (!reader) throw validationError("Request body must not be empty");
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBodyBytes) {
        await reader.cancel();
        throw new ApiHttpError(
          413,
          "DOCUMENT_TOO_LARGE",
          "The receipt upload envelope is too large",
        );
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    form = await new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    }).formData();
  } catch (error) {
    if (error instanceof ApiHttpError) throw error;
    throw validationError("Request body must be valid multipart form data");
  }
  if (!supportsIteration(form)) {
    throw validationError("Multipart fields could not be inspected safely");
  }
  const keys: string[] = [];
  form.forEach((_value, key) => keys.push(key));
  if (
    keys.length !== 2 ||
    form.getAll("expenseId").length !== 1 ||
    form.getAll("file").length !== 1 ||
    keys.some((key) => key !== "expenseId" && key !== "file")
  ) {
    throw validationError("Provide exactly expenseId and file");
  }
  const expenseId = form.get("expenseId");
  const file = form.get("file");
  if (typeof expenseId !== "string" || !expenseId.trim()) {
    throw validationError("expenseId must not be empty");
  }
  if (!(file instanceof File) || !file.name.trim()) {
    throw validationError("file must be an uploaded file with a name");
  }
  return { expenseId: expenseId.trim(), file };
}

export const documentRoutes = new Hono<AppEnv>();

documentRoutes.get("/", async (c) => {
  const input = parseListQuery(new URL(c.req.url));
  const result = await listDocuments(c.env.DB, input);
  return c.json({
    data: result.data,
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  });
});

documentRoutes.post("/", requireRole("editor"), async (c) => {
  const input = await parseUpload(
    c.req.raw,
    documentMaximumBytes(c.env.DOCUMENT_MAX_BYTES),
  );
  const document = await createDocument(c.env, input, getIdentity(c).email);
  return c.json({ data: document }, 201);
});

documentRoutes.get("/:id/content", async (c) => {
  const { document, object } = await getDocumentContent(
    c.env.DB,
    c.env.RECEIPTS,
    c.req.param("id"),
  );
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", document.contentType);
  headers.set("Content-Length", String(object.size));
  headers.set(
    "Content-Disposition",
    `inline; filename="${sanitizeReceiptFilename(document.fileName)}"`,
  );
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
});

documentRoutes.delete("/:id", requireRole("editor"), async (c) => {
  const result = await deleteDocument(
    c.env.DB,
    c.env.RECEIPTS,
    c.req.param("id"),
    getIdentity(c).email,
  );
  return c.json({ data: result });
});
