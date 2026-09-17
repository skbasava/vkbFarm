import { describe, expect, it } from "vitest";
import {
  createReceiptObjectKey,
  sanitizeReceiptFilename,
} from "../../worker/utils/r2-keys";

describe("receipt R2 keys", () => {
  it("normalizes filenames without allowing client path segments", () => {
    expect(sanitizeReceiptFilename("../../Kaveri bill (final).PDF")).toBe(
      "Kaveri-bill-final.PDF",
    );
    expect(sanitizeReceiptFilename("..\\..\\\u0000 खेत receipt.jpeg")).toBe(
      "receipt.jpeg",
    );
  });

  it("uses a server UUID and UTC year/month prefix", () => {
    expect(
      createReceiptObjectKey(
        "Pump invoice.pdf",
        new Date("2026-01-01T00:15:00+05:30"),
        "123e4567-e89b-12d3-a456-426614174000",
      ),
    ).toBe(
      "receipts/2025/12/123e4567-e89b-12d3-a456-426614174000-Pump-invoice.pdf",
    );
  });
});
