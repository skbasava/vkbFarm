import { createId } from "./ids";

const MAX_SAFE_FILENAME_LENGTH = 120;

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("");
}

export function sanitizeReceiptFilename(fileName: string): string {
  const clientBaseName = fileName.replace(/\\/g, "/").split("/").at(-1) ?? "";
  const baseName = stripControlCharacters(clientBaseName)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/-+\./g, ".")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, MAX_SAFE_FILENAME_LENGTH)
    .replace(/[.-]+$/g, "");

  return baseName || "receipt";
}

export function createReceiptObjectKey(
  fileName: string,
  now = new Date(),
  id = createId(),
): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `receipts/${year}/${month}/${id}-${sanitizeReceiptFilename(fileName)}`;
}
