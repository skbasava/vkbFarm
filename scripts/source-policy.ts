import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const CANONICAL_WORKBOOK_NAME = "VKB-Farm-Expense-tracker.xlsx";
export const CANONICAL_WORKBOOK_SHA256 = "655b77c344356bd9b201e616cf8c2766ec63495414c6673e02271471d5e8e67a";

export async function workbookChecksum(workbookPath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(workbookPath)).digest("hex");
}

export async function canonicalizePotentialPath(input: string): Promise<string> {
  const resolved = path.resolve(input);
  let existing = resolved;
  const suffix: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(existing);
      return path.join(real, ...suffix.reverse());
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      suffix.push(path.basename(existing));
      existing = parent;
    }
  }
}

export async function validateWorkbookPath(
  workbookPath: string,
  options: { allowUnapprovedSource?: boolean } = {},
): Promise<{ absolutePath: string; checksum: string; approvedSource: boolean }> {
  if (!workbookPath.trim()) throw new Error("An explicit workbook path is required");
  const absolutePath = await canonicalizePotentialPath(workbookPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || path.extname(absolutePath).toLocaleLowerCase("en-IN") !== ".xlsx") {
    throw new Error("Workbook path must identify an .xlsx file");
  }
  const checksum = await workbookChecksum(absolutePath);
  const approvedSource = checksum === CANONICAL_WORKBOOK_SHA256;
  if (!approvedSource && !options.allowUnapprovedSource) {
    throw new Error("Workbook does not match the approved checksum; use --allow-unapproved-source only for explicit fixtures or noncanonical testing");
  }
  return { absolutePath, checksum, approvedSource };
}
