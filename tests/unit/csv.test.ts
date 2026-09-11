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

  it("neutralizes formula prefixes after leading spaces or tabs without changing the source cell", () => {
    expect(csvText(["Input"], [["  =SUM(A1:A2)"], ["\t+danger"], [" -danger"], ["\t@mention"]])).toBe(
      "\uFEFFInput\r\n'  =SUM(A1:A2)\r\n'\t+danger\r\n' -danger\r\n'\t@mention\r\n",
    );
  });

  it("streams the BOM/header and each bounded row as separate UTF-8 chunks", async () => {
    const response = csvResponse("expenses", ["Description"], [["Diesel"], ["Pump"]], "2026-09-11");
    const reader = response.body?.getReader();
    const decode = new TextDecoder();
    if (!reader) throw new Error("CSV response must have a stream body");

    const header = (await reader.read()).value;
    expect(Array.from(header?.slice(0, 3) ?? [])).toEqual([0xef, 0xbb, 0xbf]);
    expect(decode.decode(header?.slice(3))).toBe("Description\r\n");
    expect(decode.decode((await reader.read()).value)).toBe("Diesel\r\n");
    expect(decode.decode((await reader.read()).value)).toBe("Pump\r\n");
  });
});
