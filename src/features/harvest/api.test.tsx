import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../lib/query-keys";
import { useCreateHarvest, useDeleteHarvest, useUpdateHarvest } from "./api";

describe("harvest mutation invalidation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refetches active harvest summary, dashboard, and reports observers after every mutation", async () => {
    const summaryQuery = vi.fn(async () => "summary");
    const dashboardQuery = vi.fn(async () => "dashboard");
    const reportsQuery = vi.fn(async () => "reports");
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: { id: "harvest-1" } }))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

    function Harness() {
      useQuery({ queryKey: ["harvests", "summary", {}], queryFn: summaryQuery });
      useQuery({ queryKey: queryKeys.dashboard, queryFn: dashboardQuery });
      useQuery({ queryKey: queryKeys.reports({ year: "2026" }), queryFn: reportsQuery });
      const create = useCreateHarvest();
      const update = useUpdateHarvest("harvest-1");
      const remove = useDeleteHarvest();
      return <>
        <button onClick={() => create.mutate({ cropId: "banana", harvestDate: "2026-09-01", netWeightKg: "1", salePricePerKg: "1" })}>Create</button>
        <button onClick={() => update.mutate({ notes: "Updated" })}>Update</button>
        <button onClick={() => remove.mutate("harvest-1")}>Delete</button>
      </>;
    }

    render(<Harness />, { wrapper });
    await waitFor(() => expect(summaryQuery).toHaveBeenCalledTimes(1));
    expect(dashboardQuery).toHaveBeenCalledTimes(1);
    expect(reportsQuery).toHaveBeenCalledTimes(1);
    const user = userEvent.setup();
    for (const [button, expectedCalls] of [["Create", 2], ["Update", 3], ["Delete", 4]] as const) {
      await user.click(screen.getByRole("button", { name: button }));
      await waitFor(() => expect(summaryQuery).toHaveBeenCalledTimes(expectedCalls));
      expect(dashboardQuery).toHaveBeenCalledTimes(expectedCalls);
      expect(reportsQuery).toHaveBeenCalledTimes(expectedCalls);
    }
  });
});
