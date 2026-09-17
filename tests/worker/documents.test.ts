import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../worker/index";
import type { Bindings } from "../../worker/types";

type DocumentDto = {
  id: string;
  expenseId: string;
  expenseDescription: string;
  expenseDate: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedBy: string | null;
  contentUrl: string;
  createdAt: string;
};

const MAX_BYTES = 10_485_760;
const jsonHeaders = { "content-type": "application/json" };

function fixtureBytes(kind: "jpeg" | "png" | "pdf", size?: number): Uint8Array {
  const signature =
    kind === "jpeg"
      ? [0xff, 0xd8, 0xff, 0xe0]
      : kind === "png"
        ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        : [...new TextEncoder().encode("%PDF-1.7\n")];
  const bytes = new Uint8Array(size ?? signature.length + 4);
  bytes.set(signature.slice(0, bytes.length));
  return bytes;
}

function receiptFile(
  kind: "jpeg" | "png" | "pdf" = "pdf",
  options: { name?: string; size?: number; type?: string } = {},
): File {
  const defaults = {
    jpeg: { name: "field-receipt.jpg", type: "image/jpeg" },
    png: { name: "field-receipt.png", type: "image/png" },
    pdf: { name: "field-receipt.pdf", type: "application/pdf" },
  }[kind];
  return new File([fixtureBytes(kind, options.size)], options.name ?? defaults.name, {
    type: options.type ?? defaults.type,
  });
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`http://example.com/api/v1${path}`, init);
}

async function upload(
  expenseId: string,
  file = receiptFile(),
  extra?: [string, string],
): Promise<Response> {
  const form = new FormData();
  form.append("expenseId", expenseId);
  form.append("file", file);
  if (extra) form.append(extra[0], extra[1]);
  return request("/documents", { method: "POST", body: form });
}

async function insertExpense(
  id = "expense-document-test",
  deletedAt: string | null = null,
): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO expenses (
      id, expense_date, description, amount_paise, paid_by_person_id,
      category_id, expense_class, is_shared, deleted_at
    ) VALUES (?, '2026-09-10', 'Document test expense', 12500,
      'person_satish', 'category_uncategorized', 'OPEX', 1, ?)`,
  )
    .bind(id, deletedAt)
    .run();
  return id;
}

async function uploadedDocument(expenseId: string): Promise<DocumentDto> {
  const response = await upload(expenseId);
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: DocumentDto };
  return body.data;
}

beforeEach(async () => {
  await insertExpense();
});

describe("document API", () => {
  it("accepts only the exact multipart expenseId and file fields", async () => {
    const missingFile = new FormData();
    missingFile.append("expenseId", "expense-document-test");
    const missing = await request("/documents", {
      method: "POST",
      body: missingFile,
    });
    const extra = await upload(
      "expense-document-test",
      receiptFile(),
      ["objectKey", "chosen/by/client"],
    );
    const malformed = await request("/documents", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ expenseId: "expense-document-test" }),
    });

    for (const response of [missing, extra, malformed]) {
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("accepts JPEG, PNG, and PDF only when MIME, extension, and magic agree", async () => {
    for (const kind of ["jpeg", "png", "pdf"] as const) {
      const response = await upload("expense-document-test", receiptFile(kind));
      expect(response.status).toBe(201);
    }

    const invalidFiles = [
      receiptFile("pdf", { name: "empty.pdf", size: 0 }),
      receiptFile("pdf", { name: "receipt.txt" }),
      receiptFile("pdf", { type: "image/png" }),
      new File([new Uint8Array([1, 2, 3, 4])], "receipt.pdf", {
        type: "application/pdf",
      }),
      receiptFile("jpeg", { name: "receipt.gif", type: "image/gif" }),
    ];
    for (const file of invalidFiles) {
      const response = await upload("expense-document-test", file);
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_DOCUMENT" },
      });
    }
  });

  it("accepts exactly 10 MiB and rejects 10 MiB plus one byte", async () => {
    const atLimit = await upload(
      "expense-document-test",
      receiptFile("pdf", { size: MAX_BYTES }),
    );
    expect(atLimit.status).toBe(201);

    const overLimit = await upload(
      "expense-document-test",
      receiptFile("pdf", { size: MAX_BYTES + 1 }),
    );
    expect(overLimit.status).toBe(413);
    await expect(overLimit.json()).resolves.toMatchObject({
      error: { code: "DOCUMENT_TOO_LARGE" },
    });
  });

  it("bounds the complete multipart envelope before parsing it", async () => {
    const oversizedName = `${"a".repeat(70_000)}.pdf`;
    const response = await upload(
      "expense-document-test",
      receiptFile("pdf", { name: oversizedName, size: MAX_BYTES }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DOCUMENT_TOO_LARGE" },
    });
    expect((await env.RECEIPTS.list()).objects).toHaveLength(0);
  });

  it("requires a live expense for new uploads", async () => {
    await insertExpense("expense-deleted", "2026-09-11T00:00:00.000Z");
    const missing = await upload("expense-missing");
    const deleted = await upload("expense-deleted");

    for (const response of [missing, deleted]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "EXPENSE_NOT_FOUND" },
      });
    }
    expect((await env.RECEIPTS.list()).objects).toHaveLength(0);
  });

  it("generates the object key on the server and returns no storage key in its DTO", async () => {
    const response = await upload(
      "expense-document-test",
      receiptFile("pdf", { name: "../../Pump bill.pdf" }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: DocumentDto & Record<string, unknown> };
    expect(body.data).toMatchObject({
      expenseId: "expense-document-test",
      fileName: "../../Pump bill.pdf",
      contentType: "application/pdf",
      contentUrl: expect.stringMatching(/^\/api\/v1\/documents\/[^/]+\/content$/),
    });
    expect(body.data).not.toHaveProperty("objectKey");
    expect(body.data).not.toHaveProperty("object_key");

    const stored = await env.RECEIPTS.list();
    expect(stored.objects).toHaveLength(1);
    expect(stored.objects[0]?.key).toMatch(
      /^receipts\/\d{4}\/\d{2}\/[0-9a-f-]{36}-Pump-bill\.pdf$/,
    );
  });

  it("compensates the R2 object when the atomic metadata and audit write fails", async () => {
    await env.DB.prepare(
      `CREATE TRIGGER block_document_audit
       BEFORE INSERT ON audit_log
       WHEN NEW.entity_type = 'document'
       BEGIN SELECT RAISE(ABORT, 'document audit blocked'); END`,
    ).run();
    try {
      const response = await upload("expense-document-test");
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "DOCUMENT_STORAGE_ERROR",
          message: "The receipt could not be stored",
        },
      });
      expect((await env.RECEIPTS.list()).objects).toHaveLength(0);
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM documents",
      ).first<number>("count");
      expect(count).toBe(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER block_document_audit").run();
    }
  });

  it("reports storage failure when D1 fails and R2 compensation cannot delete", async () => {
    await env.DB.prepare(
      `CREATE TRIGGER block_document_audit
       BEFORE INSERT ON audit_log
       WHEN NEW.entity_type = 'document'
       BEGIN SELECT RAISE(ABORT, 'document audit blocked'); END`,
    ).run();
    const undeletableBucket = new Proxy(env.RECEIPTS, {
      get(target, property) {
        if (property === "delete") {
          return async () => {
            throw new Error("simulated R2 compensation failure");
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const bindings = { ...env, RECEIPTS: undeletableBucket } satisfies Bindings;
    const form = new FormData();
    form.append("expenseId", "expense-document-test");
    form.append("file", receiptFile());

    try {
      const response = await app.request(
        "http://example.com/api/v1/documents",
        { method: "POST", body: form },
        bindings,
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "DOCUMENT_STORAGE_ERROR",
          message: "The receipt could not be stored safely",
        },
      });
      expect((await env.RECEIPTS.list()).objects).toHaveLength(1);
      expect(
        await env.DB.prepare("SELECT COUNT(*) AS count FROM documents").first<number>(
          "count",
        ),
      ).toBe(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER block_document_audit").run();
    }
  });

  it("rechecks the live expense in the atomic metadata write and compensates a race", async () => {
    const racingBucket = new Proxy(env.RECEIPTS, {
      get(target, property) {
        if (property === "put") {
          return async (...args: Parameters<R2Bucket["put"]>) => {
            const result = await target.put(...args);
            await env.DB.prepare(
              "UPDATE expenses SET deleted_at = ? WHERE id = ?",
            )
              .bind("2026-09-11T00:00:00.000Z", "expense-document-test")
              .run();
            return result;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const bindings = {
      ...env,
      RECEIPTS: racingBucket,
    } satisfies Bindings;
    const form = new FormData();
    form.append("expenseId", "expense-document-test");
    form.append("file", receiptFile());

    const response = await app.request(
      "http://example.com/api/v1/documents",
      { method: "POST", body: form },
      bindings,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "EXPENSE_NOT_FOUND" },
    });
    expect((await env.RECEIPTS.list()).objects).toHaveLength(0);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM documents").first<number>(
        "count",
      ),
    ).toBe(0);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_log WHERE entity_type = 'document'",
      ).first<number>("count"),
    ).toBe(0);
  });

  it("does not report a missing expense when race compensation cannot delete R2", async () => {
    const undeletableRacingBucket = new Proxy(env.RECEIPTS, {
      get(target, property) {
        if (property === "put") {
          return async (...args: Parameters<R2Bucket["put"]>) => {
            const result = await target.put(...args);
            await env.DB.prepare(
              "UPDATE expenses SET deleted_at = ? WHERE id = ?",
            )
              .bind("2026-09-11T00:00:00.000Z", "expense-document-test")
              .run();
            return result;
          };
        }
        if (property === "delete") {
          return async () => {
            throw new Error("simulated R2 compensation failure");
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const bindings = {
      ...env,
      RECEIPTS: undeletableRacingBucket,
    } satisfies Bindings;
    const form = new FormData();
    form.append("expenseId", "expense-document-test");
    form.append("file", receiptFile());

    const response = await app.request(
      "http://example.com/api/v1/documents",
      { method: "POST", body: form },
      bindings,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "DOCUMENT_STORAGE_ERROR",
        message: "The receipt could not be stored safely",
      },
    });
    expect((await env.RECEIPTS.list()).objects).toHaveLength(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM documents").first<number>(
        "count",
      ),
    ).toBe(0);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_log WHERE entity_type = 'document'",
      ).first<number>("count"),
    ).toBe(0);
  });

  it("returns the committed upload without a fallible post-commit document lookup", async () => {
    let documentLookups = 0;
    const lookupRejectingDb = new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare") {
          return (query: string) => {
            if (
              query.includes("FROM documents d") &&
              query.includes("WHERE d.id = ? LIMIT 1")
            ) {
              documentLookups += 1;
              throw new Error("simulated post-commit lookup failure");
            }
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const bindings = { ...env, DB: lookupRejectingDb } satisfies Bindings;
    const form = new FormData();
    form.append("expenseId", "expense-document-test");
    form.append("file", receiptFile());

    const response = await app.request(
      "http://example.com/api/v1/documents",
      { method: "POST", body: form },
      bindings,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: DocumentDto };
    expect(body.data).toMatchObject({
      expenseId: "expense-document-test",
      expenseDescription: "Document test expense",
      expenseDate: "2026-09-10",
      uploadedBy: "dev@vkb.local",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(documentLookups).toBe(0);
    expect((await env.RECEIPTS.list()).objects).toHaveLength(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM documents").first<number>(
        "count",
      ),
    ).toBe(1);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_log WHERE entity_type = 'document' AND action = 'CREATE'",
      ).first<number>("count"),
    ).toBe(1);
  });

  it("lists documents with bounded pagination and deterministic newest-first order", async () => {
    const first = await uploadedDocument("expense-document-test");
    const second = await uploadedDocument("expense-document-test");
    await env.DB.prepare("UPDATE documents SET created_at = ? WHERE id = ?")
      .bind("2026-09-10 08:00:00", first.id)
      .run();
    await env.DB.prepare("UPDATE documents SET created_at = ? WHERE id = ?")
      .bind("2026-09-10 09:00:00", second.id)
      .run();

    const response = await request(
      "/documents?expenseId=expense-document-test&page=1&pageSize=1",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<DocumentDto & Record<string, unknown>>;
      meta: { page: number; pageSize: number; total: number };
    };
    expect(body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(body.data.map((document) => document.id)).toEqual([second.id]);
    expect(body.data[0]).not.toHaveProperty("objectKey");

    const capped = await request("/documents?pageSize=1000");
    await expect(capped.json()).resolves.toMatchObject({
      meta: { page: 1, pageSize: 100, total: 2 },
    });
    const invalid = await request("/documents?page=0");
    expect(invalid.status).toBe(422);
  });

  it("streams authenticated content with private safe headers and survives expense soft deletion", async () => {
    const document = await uploadedDocument("expense-document-test");
    await env.DB.prepare(
      "UPDATE expenses SET deleted_at = '2026-09-12T00:00:00.000Z' WHERE id = ?",
    )
      .bind("expense-document-test")
      .run();

    const response = await request(`/documents/${document.id}/content`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe(String(document.fileSize));
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="field-receipt.pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("etag")).toMatch(/^".+"$/);
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 5)).toEqual(
      new TextEncoder().encode("%PDF-"),
    );
  });

  it("allows viewers to list and read while rejecting viewer upload and delete", async () => {
    const document = await uploadedDocument("expense-document-test");
    await env.DB.prepare(
      "INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)",
    )
      .bind("document_viewer", "Document Viewer", "viewer@vkb.test", "viewer")
      .run();
    const bindings = {
      ...env,
      ENVIRONMENT: "production",
      RECEIPTS: env.RECEIPTS,
    } satisfies Bindings;
    const headers = {
      "Cf-Access-Authenticated-User-Email": "viewer@vkb.test",
    };

    const list = await app.request(
      "http://example.com/api/v1/documents",
      { headers },
      bindings,
    );
    const content = await app.request(
      `http://example.com/api/v1/documents/${document.id}/content`,
      { headers },
      bindings,
    );
    const form = new FormData();
    form.append("expenseId", "expense-document-test");
    form.append("file", receiptFile());
    const create = await app.request(
      "http://example.com/api/v1/documents",
      { method: "POST", headers, body: form },
      bindings,
    );
    const deletion = await app.request(
      `http://example.com/api/v1/documents/${document.id}`,
      { method: "DELETE", headers },
      bindings,
    );

    expect(list.status).toBe(200);
    expect(content.status).toBe(200);
    expect(create.status).toBe(403);
    expect(deletion.status).toBe(403);
  });

  it("deletes R2 first, removes metadata atomically with one audit, and is repeat-safe", async () => {
    const document = await uploadedDocument("expense-document-test");
    const deleted = await request(`/documents/${document.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({
      data: { id: document.id, deleted: true },
    });
    expect((await env.RECEIPTS.list()).objects).toHaveLength(0);
    const stored = await env.DB.prepare(
      "SELECT id FROM documents WHERE id = ?",
    )
      .bind(document.id)
      .first();
    expect(stored).toBeNull();

    const repeated = await request(`/documents/${document.id}`, {
      method: "DELETE",
    });
    expect(repeated.status).toBe(404);
    const audits = await env.DB.prepare(
      "SELECT action, actor, before_json, after_json FROM audit_log WHERE entity_type = 'document' AND entity_id = ? ORDER BY rowid",
    )
      .bind(document.id)
      .all<{
        action: string;
        actor: string;
        before_json: string | null;
        after_json: string | null;
      }>();
    expect(audits.results.map((entry) => entry.action)).toEqual([
      "CREATE",
      "DELETE",
    ]);
    expect(audits.results[1]).toMatchObject({
      actor: "dev@vkb.local",
      before_json: expect.any(String),
      after_json: null,
    });
  });

  it("reports one winner when concurrent deletes race", async () => {
    const document = await uploadedDocument("expense-document-test");
    let deleteCalls = 0;
    let releaseDeletes: (() => void) | undefined;
    const bothDeletesStarted = new Promise<void>((resolve) => {
      releaseDeletes = resolve;
    });
    const racingBucket = new Proxy(env.RECEIPTS, {
      get(target, property) {
        if (property === "delete") {
          return async (...args: Parameters<R2Bucket["delete"]>) => {
            deleteCalls += 1;
            if (deleteCalls === 2) releaseDeletes?.();
            await bothDeletesStarted;
            return target.delete(...args);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const bindings = {
      ...env,
      RECEIPTS: racingBucket,
    } satisfies Bindings;

    const responses = await Promise.all([
      app.request(
        `http://example.com/api/v1/documents/${document.id}`,
        { method: "DELETE" },
        bindings,
      ),
      app.request(
        `http://example.com/api/v1/documents/${document.id}`,
        { method: "DELETE" },
        bindings,
      ),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 404]);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_log WHERE entity_type = 'document' AND entity_id = ? AND action = 'DELETE'",
      )
        .bind(document.id)
        .first<number>("count"),
    ).toBe(1);
  });
});
