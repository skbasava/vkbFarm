const FORMULA_PREFIX = /^\s*[=+\-@]/;
type CsvValue = string | number | null | undefined;
type CsvRow = readonly CsvValue[];

function csvCell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function csvLine(row: CsvRow): string {
  return row.map(csvCell).join(",");
}

/** Encodes a bounded rectangular report as UTF-8 BOM CSV for spreadsheet downloads. */
export function csvText(
  headings: readonly string[],
  rows: Iterable<CsvRow>,
): string {
  let text = `\uFEFF${csvLine(headings)}\r\n`;
  for (const row of rows) text += `${csvLine(row)}\r\n`;
  return text;
}

export function csvResponse(
  exportType: string,
  headings: readonly string[],
  rows: Iterable<CsvRow>,
  date: string,
): Response {
  const encoder = new TextEncoder();
  const iterator = rows[Symbol.iterator]();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`\uFEFF${csvLine(headings)}\r\n`));
    },
    pull(controller) {
      const next = iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${csvLine(next.value)}\r\n`));
    },
    cancel() {
      iterator.return?.();
    },
  });
  return new Response(stream, {
    headers: {
      "content-disposition": `attachment; filename="vkb-${exportType}-${date}.csv"`,
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
