import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";

export type DocumentRecord = {
  id: string;
  expenseId: string;
  expenseDescription: string;
  expenseDate: string;
  fileName: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  fileSize: number;
  uploadedBy: string | null;
  createdAt: string;
  contentUrl: string;
};

export type DocumentListResult = {
  data: DocumentRecord[];
  meta: { page: number; pageSize: number; total: number };
};

export type DocumentExpenseOption = {
  id: string;
  expenseDate: string;
  description: string;
};

export const documentKeys = {
  all: queryKeys.documents,
  list: (expenseId?: string, page = 1, pageSize = 25) =>
    [...queryKeys.documents, "list", { expenseId, page, pageSize }] as const,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function fetchDocumentList(
  expenseId: string | undefined,
  page: number,
  pageSize: number,
): Promise<DocumentListResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (expenseId) params.set("expenseId", expenseId);
  let response: Response;
  try {
    response = await fetch(`/api/v1/documents?${params.toString()}`);
  } catch {
    const isOffline = offline();
    throw new ApiError({
      status: 0,
      code: isOffline ? "OFFLINE" : "NETWORK_ERROR",
      message: isOffline ? "You appear to be offline" : "Unable to reach the server",
      offline: isOffline,
    });
  }
  const body = (await response.json().catch(() => undefined)) as unknown;
  if (
    !response.ok ||
    !isRecord(body) ||
    !Array.isArray(body.data) ||
    !isRecord(body.meta)
  ) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    throw new ApiError({
      status: response.status,
      code: typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      message:
        typeof error?.message === "string"
          ? error.message
          : "Could not load receipts",
    });
  }
  return body as DocumentListResult;
}

export function useDocuments(
  expenseId?: string,
  page = 1,
  pageSize = 25,
) {
  return useQuery({
    queryKey: documentKeys.list(expenseId, page, pageSize),
    queryFn: () => fetchDocumentList(expenseId, page, pageSize),
  });
}

async function fetchAllExpenseOptions(): Promise<DocumentExpenseOption[]> {
  const expenses: DocumentExpenseOption[] = [];
  for (let page = 1; ; page += 1) {
    const next = await apiFetch<DocumentExpenseOption[]>(
      `/api/v1/expenses?page=${page}&pageSize=100&sortBy=expenseDate&sortOrder=desc`,
    );
    expenses.push(...next);
    if (next.length < 100) return expenses;
  }
}

export function useDocumentExpenseOptions() {
  return useQuery({
    queryKey: ["expenses", "document-options"],
    queryFn: fetchAllExpenseOptions,
  });
}

function xhrError(xhr: XMLHttpRequest): ApiError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(xhr.responseText) as unknown;
  } catch {
    parsed = undefined;
  }
  const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined;
  return new ApiError({
    status: xhr.status,
    code: typeof error?.code === "string" ? error.code : "UPLOAD_FAILED",
    message:
      typeof error?.message === "string"
        ? error.message
        : "The receipt could not be uploaded",
  });
}

function uploadDocument(
  input: { expenseId: string; file: File },
  onProgress: (percentage: number) => void,
): Promise<DocumentRecord> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/documents");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => {
      const isOffline = offline();
      reject(
        new ApiError({
          status: 0,
          code: isOffline ? "OFFLINE" : "NETWORK_ERROR",
          message: isOffline
            ? "You appear to be offline. The selected file is ready to retry."
            : "Unable to reach the server. The selected file is ready to retry.",
          offline: isOffline,
        }),
      );
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(xhrError(xhr));
        return;
      }
      try {
        const parsed = JSON.parse(xhr.responseText) as unknown;
        if (!isRecord(parsed) || !isRecord(parsed.data)) {
          reject(
            new ApiError({
              status: xhr.status,
              code: "INVALID_RESPONSE",
              message: "The server returned an invalid upload response",
            }),
          );
          return;
        }
        resolve(parsed.data as DocumentRecord);
      } catch {
        reject(
          new ApiError({
            status: xhr.status,
            code: "INVALID_RESPONSE",
            message: "The server returned an invalid upload response",
          }),
        );
      }
    };
    const form = new FormData();
    form.append("expenseId", input.expenseId);
    form.append("file", input.file);
    xhr.send(form);
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { expenseId: string; file: File }) => {
      setProgress(null);
      return uploadDocument(input, setProgress);
    },
    onSuccess: async (_document, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["expenses"] }),
        queryClient.invalidateQueries({ queryKey: ["expenses", "detail", input.expenseId] }),
      ]);
    },
  });
  return { ...mutation, progress };
}

export function useDeleteDocument(expenseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: true }>(`/api/v1/documents/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["expenses", "detail", expenseId] }),
      ]);
    },
  });
}
