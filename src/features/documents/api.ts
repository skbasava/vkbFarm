import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
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
  signal: AbortSignal,
): Promise<DocumentRecord> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      xhr.upload.onprogress = null;
      xhr.onabort = null;
      xhr.onerror = null;
      xhr.onload = null;
    };
    const settle = () => {
      if (settled) return false;
      settled = true;
      cleanup();
      return true;
    };
    const fail = (error: ApiError) => {
      if (settle()) reject(error);
    };
    const succeed = (document: DocumentRecord) => {
      if (settle()) resolve(document);
    };
    const abort = () => xhr.abort();
    xhr.open("POST", "/api/v1/documents");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onabort = () => {
      fail(
        new ApiError({
          status: 0,
          code: "UPLOAD_ABORTED",
          message: "The receipt upload was cancelled",
        }),
      );
    };
    xhr.onerror = () => {
      const isOffline = offline();
      fail(
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
        fail(xhrError(xhr));
        return;
      }
      try {
        const parsed = JSON.parse(xhr.responseText) as unknown;
        if (!isRecord(parsed) || !isRecord(parsed.data)) {
          fail(
            new ApiError({
              status: xhr.status,
              code: "INVALID_RESPONSE",
              message: "The server returned an invalid upload response",
            }),
          );
          return;
        }
        succeed(parsed.data as DocumentRecord);
      } catch {
        fail(
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
    if (signal.aborted) {
      fail(
        new ApiError({
          status: 0,
          code: "UPLOAD_ABORTED",
          message: "The receipt upload was cancelled",
        }),
      );
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(form);
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: (input: { expenseId: string; file: File }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setProgress(null);
      return uploadDocument(input, setProgress, controller.signal).finally(() => {
        if (controllerRef.current === controller) controllerRef.current = undefined;
      });
    },
    onSuccess: async (_document, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["expenses"] }),
        queryClient.invalidateQueries({ queryKey: ["expenses", "detail", input.expenseId] }),
      ]);
    },
  });
  const resetMutation = mutation.reset;
  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = undefined;
    setProgress(null);
    resetMutation();
  }, [resetMutation]);
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = undefined;
    },
    [],
  );
  return { ...mutation, abort, progress };
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
