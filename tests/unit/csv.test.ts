import { describe, expect, it } from "vitest";
import { csvResponse, csvText } from "../../worker/utils/csv";

describe("CSV export utilities", () => {
  it("writes a BOM, stable headings, RFC 4180 quotes, and spreadsheet-safe cells", async () => {
    const text = csvText(
      ["Description", "Amount"],
      [["=SUM(A1:A2), \"quoted\"\nnext", "1250.5"], ["+danger", "-42"], ["@mention", "0"]],
    );

    expect(text).toBe(
      "\uFEFFDescription,Amount\r\n\"'=SUM(A1:A2), \"\"quoted\"\"\nnext\",1250.5\r\n'+danger,'-42\r\n'@mention,0\r\n",
    );

    const response = csvResponse("expenses", ["Description"], [["Diesel"]], "2026-09-11");
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="vkb-expenses-2026-09-11.csv"');
    // Response.text() decodes and consumes a UTF-8 BOM; csvText above verifies the wire prefix.
    expect(await response.text()).toBe("Description\r\nDiesel\r\n");
  });
});
