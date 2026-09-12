import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettlementPage from "./SettlementPage";

const summary = {
  totalSharedExpensePaise: 1_600_000,
  participants: [
    { personId: "person_mahesh", name: "Mahesh", paidPaise: 600_000, expectedPaise: 800_000, balancePaise: -200_000 },
    { personId: "person_satish", name: "Satish", paidPaise: 1_000_000, expectedPaise: 800_000, balancePaise: 200_000 },
  ],
  recommendedTransfers: [{ fromPersonId: "person_mahesh", toPersonId: "person_satish", amountPaise: 200_000 }],
};

const history = [{
  id: "settlement-1",
  fromPersonId: "person_mahesh",
  fromPersonName: "Mahesh",
  toPersonId: "person_satish",
  toPersonName: "Satish",
  amountPaise: 50_000,
  settlementDate: "2026-09-11",
  remarks: "UPI",
  createdAt: "2026-09-11T09:00:00.000Z",
}];

function response(url: string): Response {
  if (url === "/api/v1/identity") return new Response(JSON.stringify({ data: { email: "satish@vkb.test", role: "admin" } }), { status: 200 });
  if (url === "/api/v1/settlements/summary") return new Response(JSON.stringify({ data: summary }), { status: 200 });
  return new Response(JSON.stringify({ data: history }), { status: 200 });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SettlementPage /></QueryClientProvider>);
}

describe("SettlementPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("explains contribution, expected share, owing, receiving, recommendation, and chronological history", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => Promise.resolve(response(String(url))));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Settlements" })).toBeVisible();
    expect(screen.getByText("₹16,000")).toBeVisible();
    expect(screen.getByText("Mahesh owes ₹2,000")).toBeVisible();
    expect(screen.getByText("Satish receives ₹2,000")).toBeVisible();
    expect(screen.getByText("Mahesh pays Satish")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Expected share" })).toBeVisible();
    expect(screen.getByText("UPI")).toBeVisible();
  });

  it("records a settlement through the shared API and refreshes settlement data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url) === "/api/v1/settlements" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ data: { ...history[0], id: "settlement-2" } }), { status: 201 }));
      }
      return Promise.resolve(response(String(url)));
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Mahesh owes ₹2,000");

    const paymentDate = (screen.getByLabelText("Payment date") as HTMLInputElement).value;
    await user.selectOptions(screen.getByLabelText("From"), "person_mahesh");
    await user.selectOptions(screen.getByLabelText("To"), "person_satish");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "500.00");
    await user.click(screen.getByRole("button", { name: "Record payment" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/v1/settlements", expect.objectContaining({ method: "POST", body: JSON.stringify({ fromPersonId: "person_mahesh", toPersonId: "person_satish", amount: "500.00", settlementDate: paymentDate, remarks: null }) })));
  });
});
