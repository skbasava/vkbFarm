const FORMULA_PREFIX = /^[=+\-@]/;

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Encodes a bounded rectangular report as UTF-8 BOM CSV for spreadsheet downloads. */
export function csvText(
  headings: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return `\uFEFF${[headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function csvResponse(
  exportType: string,
  headings: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
  date: string,
): Response {
  return new Response(csvText(headings, rows), {
    headers: {
      "content-disposition": `attachment; filename="vkb-${exportType}-${date}.csv"`,
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
