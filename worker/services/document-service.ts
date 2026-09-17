import { ApiHttpError } from "../middleware/errors";
import {
  createDocumentStatements,
  deleteDocumentStatements,
  getLiveExpense,
  getStoredDocument,
  listStoredDocuments,
  type DocumentWrite,
  type StoredDocument,
} from "../repositories/document-repository";
import { createId } from "../utils/ids";
import {
  createReceiptObjectKey,
  sanitizeReceiptFilename,
} from "../utils/r2-keys";
import type { Bindings } from "../types";

const RECEIPT_KINDS = {
  jpeg: {
    contentType: "image/jpeg",
    extensions: ["jpg", "jpeg"],
    signature: [0xff, 0xd8, 0xff],
  },
  png: {
    contentType: "image/png",
    extensions: ["png"],
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  pdf: {
    contentType: "application/pdf",
    extensions: ["pdf"],
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
} as const;

export type DocumentDto = Omit<StoredDocument, "objectKey"> & {
  contentUrl: string;
};

function documentError(
  status: 413 | 422,
  code: "DOCUMENT_TOO_LARGE" | "INVALID_DOCUMENT",
  message: string,
): ApiHttpError {
  return new ApiHttpError(status, code, message);
}

function toDto(document: StoredDocument): DocumentDto {
  return {
    id: document.id,
    expenseId: document.expenseId,
    expenseDescription: document.expenseDescription,
    expenseDate: document.expenseDate,
    fileName: document.fileName,
    contentType: document.contentType,
    fileSize: document.fileSize,
    uploadedBy: document.uploadedBy,
    createdAt: document.createdAt,
    contentUrl: `/api/v1/documents/${encodeURIComponent(document.id)}/content`,
  };
}

export function documentMaximumBytes(value: string): number {
  const maximum = Number(value);
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new ApiHttpError(
      500,
      "DOCUMENT_CONFIGURATION_ERROR",
      "Receipt storage is not configured correctly",
    );
  }
  return maximum;
}

async function validateFile(file: File, maxBytes: number): Promise<void> {
  if (file.size === 0) {
    throw documentError(422, "INVALID_DOCUMENT", "The receipt file is empty");
  }
  if (file.size > maxBytes) {
    throw documentError(
      413,
      "DOCUMENT_TOO_LARGE",
      `The receipt exceeds the ${maxBytes} byte limit`,
    );
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const contentType = file.type.trim().toLowerCase();
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const kind = Object.values(RECEIPT_KINDS).find(
    (candidate) =>
      candidate.contentType === contentType &&
      candidate.extensions.some((allowed) => allowed === extension) &&
      candidate.signature.every((byte, index) => header[index] === byte),
  );
  if (!kind) {
    throw documentError(
      422,
      "INVALID_DOCUMENT",
      "Receipt type, extension, and file content must be JPEG, PNG, or PDF",
    );
  }
}

function notFound(): ApiHttpError {
  return new ApiHttpError(
    404,
    "DOCUMENT_NOT_FOUND",
    "The receipt was not found",
  );
}

function storageFailure(message: string): ApiHttpError {
  return new ApiHttpError(503, "DOCUMENT_STORAGE_ERROR", message);
}

async function compensateUpload(
  bucket: R2Bucket,
  objectKey: string,
  documentId: string,
  stage: "database_write" | "expense_race",
): Promise<void> {
  try {
    await bucket.delete(objectKey);
  } catch {
    console.error(
      JSON.stringify({
        event: "document_upload_compensation_failed",
        documentId,
        objectKey,
        stage,
      }),
    );
    throw storageFailure("The receipt could not be stored safely");
  }
}

export async function listDocuments(
  db: D1Database,
  input: { expenseId?: string; page: number; pageSize: number },
): Promise<{ data: DocumentDto[]; total: number }> {
  const result = await listStoredDocuments(db, input);
  return { data: result.data.map(toDto), total: result.total };
}

export async function createDocument(
  env: Pick<Bindings, "DB" | "RECEIPTS" | "DOCUMENT_MAX_BYTES">,
  input: { expenseId: string; file: File },
  actor: string,
): Promise<DocumentDto> {
  const expense = await getLiveExpense(env.DB, input.expenseId);
  if (!expense) {
    throw new ApiHttpError(
      404,
      "EXPENSE_NOT_FOUND",
      "The expense was not found",
    );
  }
  await validateFile(input.file, documentMaximumBytes(env.DOCUMENT_MAX_BYTES));

  const id = createId();
  const objectKey = createReceiptObjectKey(input.file.name);
  const write: DocumentWrite = {
    id,
    expenseId: input.expenseId,
    objectKey,
    fileName: input.file.name,
    contentType: input.file.type.trim().toLowerCase(),
    fileSize: input.file.size,
    uploadedBy: actor,
    createdAt: new Date().toISOString(),
  };

  try {
    await env.RECEIPTS.put(objectKey, input.file, {
      httpMetadata: {
        contentType: write.contentType,
        contentDisposition: `inline; filename="${sanitizeReceiptFilename(write.fileName)}"`,
        cacheControl: "private, no-store",
      },
    });
  } catch {
    throw storageFailure("The receipt could not be stored");
  }

  let writeResults: D1Result[];
  try {
    writeResults = await env.DB.batch(
      createDocumentStatements(env.DB, write, actor),
    );
  } catch {
    await compensateUpload(
      env.RECEIPTS,
      objectKey,
      id,
      "database_write",
    );
    throw storageFailure("The receipt could not be stored");
  }

  if (writeResults[0]?.meta.changes !== 1) {
    await compensateUpload(env.RECEIPTS, objectKey, id, "expense_race");
    throw new ApiHttpError(
      404,
      "EXPENSE_NOT_FOUND",
      "The expense was not found",
    );
  }

  return toDto({
    ...write,
    expenseDescription: expense.description,
    expenseDate: expense.expenseDate,
  });
}

export async function getDocumentContent(
  db: D1Database,
  bucket: R2Bucket,
  id: string,
): Promise<{ document: StoredDocument; object: R2ObjectBody }> {
  const document = await getStoredDocument(db, id);
  if (!document) throw notFound();
  let object: R2ObjectBody | null;
  try {
    object = await bucket.get(document.objectKey);
  } catch {
    throw storageFailure("The receipt content could not be read");
  }
  if (!object) {
    throw new ApiHttpError(
      404,
      "DOCUMENT_CONTENT_NOT_FOUND",
      "The receipt content was not found",
    );
  }
  return { document, object };
}

export async function deleteDocument(
  db: D1Database,
  bucket: R2Bucket,
  id: string,
  actor: string,
): Promise<{ id: string; deleted: true }> {
  const document = await getStoredDocument(db, id);
  if (!document) throw notFound();
  try {
    await bucket.delete(document.objectKey);
  } catch {
    throw storageFailure("The receipt could not be deleted");
  }
  let deleteResults: D1Result[];
  try {
    deleteResults = await db.batch(
      deleteDocumentStatements(db, document, actor),
    );
  } catch {
    throw storageFailure("The receipt record could not be deleted");
  }
  if (deleteResults[1]?.meta.changes !== 1) throw notFound();
  return { id, deleted: true };
}
