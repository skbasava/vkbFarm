import { createId } from "../utils/ids";

export type StoredDocument = {
  id: string;
  expenseId: string;
  expenseDescription: string;
  expenseDate: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedBy: string | null;
  createdAt: string;
};

export type DocumentWrite = Omit<
  StoredDocument,
  "expenseDescription" | "expenseDate"
>;

export type LiveExpense = {
  description: string;
  expenseDate: string;
};

type DocumentRow = {
  id: string;
  expense_id: string;
  expense_description: string;
  expense_date: string;
  object_key: string;
  file_name: string;
  content_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

const DOCUMENT_SELECT = `
  SELECT d.id, d.expense_id, e.description AS expense_description,
    e.expense_date, d.object_key, d.file_name, d.content_type,
    d.file_size, d.uploaded_by, d.created_at
  FROM documents d
  JOIN expenses e ON e.id = d.expense_id`;

function mapDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    expenseId: row.expense_id,
    expenseDescription: row.expense_description,
    expenseDate: row.expense_date,
    objectKey: row.object_key,
    fileName: row.file_name,
    contentType: row.content_type,
    fileSize: row.file_size,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export async function getLiveExpense(
  db: D1Database,
  expenseId: string,
): Promise<LiveExpense | null> {
  const row = await db
    .prepare(
      `SELECT description, expense_date AS expenseDate
       FROM expenses WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(expenseId)
    .first<LiveExpense>();
  return row ?? null;
}

export async function getStoredDocument(
  db: D1Database,
  id: string,
): Promise<StoredDocument | null> {
  const row = await db
    .prepare(`${DOCUMENT_SELECT} WHERE d.id = ? LIMIT 1`)
    .bind(id)
    .first<DocumentRow>();
  return row ? mapDocument(row) : null;
}

export async function listStoredDocuments(
  db: D1Database,
  input: { expenseId?: string; page: number; pageSize: number },
): Promise<{ data: StoredDocument[]; total: number }> {
  const where = input.expenseId ? "WHERE d.expense_id = ?" : "";
  const params = input.expenseId ? [input.expenseId] : [];
  const offset = (input.page - 1) * input.pageSize;
  const [count, list] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM documents d ${where}`)
      .bind(...params)
      .first<{ total: number }>(),
    db
      .prepare(
        `${DOCUMENT_SELECT} ${where} ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, input.pageSize, offset)
      .all<DocumentRow>(),
  ]);
  return {
    data: list.results.map(mapDocument),
    total: count?.total ?? 0,
  };
}

function auditSnapshot(document: DocumentWrite): string {
  return JSON.stringify({
    id: document.id,
    expenseId: document.expenseId,
    fileName: document.fileName,
    contentType: document.contentType,
    fileSize: document.fileSize,
    uploadedBy: document.uploadedBy,
    createdAt: document.createdAt,
  });
}

export function createDocumentStatements(
  db: D1Database,
  document: DocumentWrite,
  actor: string,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO documents (
          id, expense_id, object_key, file_name, content_type, file_size,
          uploaded_by, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        FROM expenses
        WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(
        document.id,
        document.expenseId,
        document.objectKey,
        document.fileName,
        document.contentType,
        document.fileSize,
        document.uploadedBy,
        document.createdAt,
        document.expenseId,
      ),
    db
      .prepare(
        `INSERT INTO audit_log (
          id, entity_type, entity_id, action, actor, before_json, after_json
        )
        SELECT ?, 'document', ?, 'CREATE', ?, NULL, ?
        FROM documents WHERE id = ?`,
      )
      .bind(
        createId(),
        document.id,
        actor,
        auditSnapshot(document),
        document.id,
      ),
  ];
}

export function deleteDocumentStatements(
  db: D1Database,
  document: StoredDocument,
  actor: string,
): D1PreparedStatement[] {
  const before = JSON.stringify({
    id: document.id,
    expenseId: document.expenseId,
    fileName: document.fileName,
    contentType: document.contentType,
    fileSize: document.fileSize,
    uploadedBy: document.uploadedBy,
    createdAt: document.createdAt,
  });
  return [
    db
      .prepare(
        `INSERT INTO audit_log (
          id, entity_type, entity_id, action, actor, before_json, after_json
        )
        SELECT ?, 'document', ?, 'DELETE', ?, ?, NULL
        FROM documents WHERE id = ?`,
      )
      .bind(createId(), document.id, actor, before, document.id),
    db.prepare("DELETE FROM documents WHERE id = ?").bind(document.id),
  ];
}
