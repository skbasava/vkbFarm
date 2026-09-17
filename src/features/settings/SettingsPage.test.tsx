import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage";

type Role = "admin" | "editor" | "viewer";

const person = {
  id: "person-1",
  name: "Satish",
  email: "satish@vkb.test",
  farmRole: "owner",
  appRole: "admin" as const,
  participatesInSharedExpenses: true,
  participant: true,
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const category = {
  id: "category-1",
  name: "Farm labour",
  defaultExpenseClass: "OPEX" as const,
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const crop = {
  id: "crop-1",
  name: "Banana",
  localName: "Baale",
  cropType: "Fruit",
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const area = {
  id: "area-1",
  code: "MT",
  name: "Main tract",
  description: "Northern field",
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function ok(data: unknown, meta?: { page: number; pageSize: number; total: number }) {
  return Promise.resolve(new Response(JSON.stringify(meta ? { data, meta } : { data }), { status: 200 }));
}

function failure(status: number, code: string, message: string) {
  return Promise.resolve(new Response(JSON.stringify({ error: { code, message } }), { status }));
}

function installFetch(role: Role = "admin") {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url === "/api/v1/identity") return ok({ email: `${role}@vkb.test`, role });
    if (init?.method === "POST" || init?.method === "PATCH") return ok({ id: "saved" });
    if (url.startsWith("/api/v1/people?")) return ok([person], { page: 1, pageSize: 100, total: 1 });
    if (url.startsWith("/api/v1/categories?")) return ok([category], { page: 1, pageSize: 100, total: 1 });
    if (url.startsWith("/api/v1/plantation/crops?")) return ok([crop], { page: 1, pageSize: 100, total: 1 });
    if (url.startsWith("/api/v1/plantation/farm-areas?")) return ok([area], { page: 1, pageSize: 100, total: 1 });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/settings"]}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function requestBody(spy: ReturnType<typeof installFetch>, path: string, method: string) {
  const call = spy.mock.calls.find(([url, init]) => String(url) === path && init?.method === method);
  expect(call, `${method} ${path} was not requested`).toBeDefined();
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

describe("SettingsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("provides five keyboard-navigable configuration sections", async () => {
    installFetch();
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "People" })).toBeVisible();
    expect(screen.getByRole("region", { name: "People" })).toBeVisible();
    const navigation = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(5);
    const peopleTab = within(navigation).getByRole("button", { name: "People" });
    peopleTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(navigation).getByRole("button", { name: "Expense Categories" })).toHaveFocus();
    expect(await screen.findByRole("heading", { name: "Expense Categories" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Expense Categories" })).toBeVisible();
    await user.keyboard("{End}");
    expect(within(navigation).getByRole("button", { name: "Application" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Application" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Application" })).toBeVisible();
    await user.keyboard("{Home}");
    expect(within(navigation).getByRole("button", { name: "People" })).toHaveFocus();
  });

  it("loads every 100-row page including inactive records for every managed list", async () => {
    const endpoints = [
      { button: "People", prefix: "/api/v1/people?", tail: { ...person, id: "person-101", name: "Inactive person", active: false } },
      { button: "Expense Categories", prefix: "/api/v1/categories?", tail: { ...category, id: "category-101", name: "Inactive category", active: false } },
      { button: "Crops", prefix: "/api/v1/plantation/crops?", tail: { ...crop, id: "crop-101", name: "Inactive crop", active: false } },
      { button: "Farm Areas", prefix: "/api/v1/plantation/farm-areas?", tail: { ...area, id: "area-101", code: "ZZ", name: "Inactive area", active: false } },
    ];
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/v1/identity") return ok({ email: "admin@vkb.test", role: "admin" });
      const endpoint = endpoints.find(({ prefix }) => url.startsWith(prefix));
      if (!endpoint) return Promise.reject(new Error(`Unexpected request: ${url}`));
      const page = new URL(url, "https://farm.test").searchParams.get("page");
      const first = Array.from({ length: 100 }, (_, index) => ({ ...endpoint.tail, id: `${endpoint.button}-${index}`, name: `${endpoint.button} ${index}`, active: true }));
      return page === "1"
        ? ok(first, { page: 1, pageSize: 100, total: 101 })
        : ok([endpoint.tail], { page: 2, pageSize: 100, total: 101 });
    });
    const user = userEvent.setup();
    renderPage();

    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });
    for (const endpoint of endpoints) {
      await user.click(within(navigation).getByRole("button", { name: endpoint.button }));
      expect(await screen.findByText(endpoint.tail.name)).toBeVisible();
      expect(screen.getByRole("region", { name: endpoint.button })).toBeVisible();
    }
    for (const { prefix } of endpoints) {
      const resourceCalls = calls.filter((url) => url.startsWith(prefix));
      expect(resourceCalls).toHaveLength(2);
      expect(resourceCalls.every((url) => url.includes("pageSize=100") && url.includes("includeInactive=true"))).toBe(true);
    }
  });

  it("submits valid person fields and resets a stale dialog when switching sections", async () => {
    const fetchSpy = installFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Satish");
    const cropSection = within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("button", { name: "Crops" });

    await user.click(screen.getByRole("button", { name: "Add person" }));
    await user.type(screen.getByLabelText("Name"), "Mahesh");
    await user.type(screen.getByLabelText("Email"), "MAHESH@VKB.TEST");
    await user.clear(screen.getByLabelText("Farm role"));
    await user.type(screen.getByLabelText("Farm role"), "manager");
    await user.selectOptions(screen.getByLabelText("Application role"), "editor");
    await user.click(screen.getByRole("button", { name: "Save person" }));

    await waitFor(() => expect(requestBody(fetchSpy, "/api/v1/people", "POST")).toEqual({
      name: "Mahesh",
      email: "MAHESH@VKB.TEST",
      farmRole: "manager",
      appRole: "editor",
      participatesInSharedExpenses: true,
      active: true,
    }));

    await user.click(screen.getByRole("button", { name: "Add person" }));
    fireEvent.click(cropSection);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits category, crop, and farm-area payloads with nullable optional values", async () => {
    const fetchSpy = installFetch();
    const user = userEvent.setup();
    renderPage();
    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });

    await user.click(within(navigation).getByRole("button", { name: "Expense Categories" }));
    await user.click(await screen.findByRole("button", { name: "Add category" }));
    await user.type(screen.getByLabelText("Category name"), "Irrigation");
    await user.selectOptions(screen.getByLabelText("Default expense class"), "CAPEX");
    await user.click(screen.getByRole("button", { name: "Save category" }));
    await waitFor(() => expect(requestBody(fetchSpy, "/api/v1/categories", "POST")).toEqual({ name: "Irrigation", defaultExpenseClass: "CAPEX", active: true }));

    await user.click(within(navigation).getByRole("button", { name: "Crops" }));
    await user.click(await screen.findByRole("button", { name: "Add crop" }));
    await user.type(screen.getByLabelText("Crop name"), "Arecanut");
    await user.click(screen.getByRole("button", { name: "Save crop" }));
    await waitFor(() => expect(requestBody(fetchSpy, "/api/v1/plantation/crops", "POST")).toEqual({ name: "Arecanut", localName: null, cropType: null, active: true }));

    await user.click(within(navigation).getByRole("button", { name: "Farm Areas" }));
    await user.click(await screen.findByRole("button", { name: "Add farm area" }));
    await user.type(screen.getByLabelText("Area code"), "SR");
    await user.type(screen.getByLabelText("Area name"), "South ridge");
    await user.click(screen.getByRole("button", { name: "Save farm area" }));
    await waitFor(() => expect(requestBody(fetchSpy, "/api/v1/plantation/farm-areas", "POST")).toEqual({ code: "SR", name: "South ridge", description: null, active: true }));
  });

  it("rejects blank required values in every create form without sending writes", async () => {
    const fetchSpy = installFetch();
    const user = userEvent.setup();
    renderPage();
    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });
    const cases = [
      { section: "People", open: "Add person", save: "Save person", clear: "Farm role", errors: ["Name is required", "Farm role is required"] },
      { section: "Expense Categories", open: "Add category", save: "Save category", errors: ["Category name is required"] },
      { section: "Crops", open: "Add crop", save: "Save crop", errors: ["Crop name is required"] },
      { section: "Farm Areas", open: "Add farm area", save: "Save farm area", errors: ["Area code is required", "Area name is required"] },
    ];

    for (const testCase of cases) {
      await user.click(within(navigation).getByRole("button", { name: testCase.section }));
      await user.click(await screen.findByRole("button", { name: testCase.open }));
      if (testCase.clear) await user.clear(screen.getByLabelText(testCase.clear));
      await user.click(screen.getByRole("button", { name: testCase.save }));
      for (const error of testCase.errors) expect(await screen.findByText(error)).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
    }
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("renames with PATCH, confirms deactivation consequences, retains history, and supports reactivation", async () => {
    let storedPerson = person;
    const fetchSpy = installFetch().mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/v1/identity") return ok({ email: "admin@vkb.test", role: "admin" });
      if (url.startsWith("/api/v1/people?") && !init?.method) {
        return ok([storedPerson], { page: 1, pageSize: 100, total: 1 });
      }
      if (url === "/api/v1/people/person-1" && init?.method === "PATCH") {
        storedPerson = { ...storedPerson, ...(JSON.parse(String(init.body)) as Partial<typeof person>) };
        return ok(storedPerson);
      }
      if (url.startsWith("/api/v1/categories?") && !init?.method) {
        return ok([category], { page: 1, pageSize: 100, total: 1 });
      }
      if (url === "/api/v1/categories/category-1" && init?.method === "PATCH") return ok(category);
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();
    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });

    await user.click(within(navigation).getByRole("button", { name: "Expense Categories" }));
    await user.click(await screen.findByRole("button", { name: "Edit Farm labour" }));
    await user.clear(screen.getByLabelText("Category name"));
    await user.type(screen.getByLabelText("Category name"), "Field labour");
    await user.click(screen.getByRole("button", { name: "Save category" }));
    await waitFor(() => expect(requestBody(fetchSpy, "/api/v1/categories/category-1", "PATCH")).toMatchObject({ name: "Field labour" }));
    expect(screen.getByText(/renaming changes the current label shown on historical records/i)).toBeVisible();

    await user.click(within(navigation).getByRole("button", { name: "People" }));
    await user.click(await screen.findByRole("button", { name: "Deactivate Satish" }));
    const confirmation = screen.getByRole("dialog", { name: "Deactivate Satish?" });
    expect(within(confirmation).getByText(/remove production login access/i)).toBeVisible();
    expect(within(confirmation).getByText(/shared-settlement participation/i)).toBeVisible();
    expect(within(confirmation).getByText(/historical records remain/i)).toBeVisible();
    await user.click(within(confirmation).getByRole("button", { name: "Deactivate person" }));
    await waitFor(() => expect(requestBody(fetchSpy, "/api/v1/people/person-1", "PATCH")).toEqual({ active: false }));
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    await waitFor(() => expect(screen.getByRole("button", { name: "Reactivate Satish" })).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Reactivate Satish" }));
    await waitFor(() => {
      const writes = fetchSpy.mock.calls.filter(([url, init]) => String(url) === "/api/v1/people/person-1" && init?.method === "PATCH");
      expect(writes).toHaveLength(2);
      expect(JSON.parse(String(writes.at(-1)?.[1]?.body))).toEqual({ active: true });
    });
  });

  it("surfaces authoritative duplicate conflicts without closing the form", async () => {
    installFetch().mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/v1/identity") return ok({ email: "admin@vkb.test", role: "admin" });
      if (url.startsWith("/api/v1/categories?")) return ok([category], { page: 1, pageSize: 100, total: 1 });
      if (url.startsWith("/api/v1/people?")) return ok([person], { page: 1, pageSize: 100, total: 1 });
      if (url === "/api/v1/categories" && init?.method === "POST") return failure(409, "CATEGORY_EXISTS", "An expense category with this name already exists");
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findByRole("navigation", { name: "Settings sections" })).querySelectorAll("button")[1]!);
    await user.click(await screen.findByRole("button", { name: "Add category" }));
    await user.type(screen.getByLabelText("Category name"), "Farm labour");
    await user.click(screen.getByRole("button", { name: "Save category" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("An expense category with this name already exists");
    expect(screen.getByRole("dialog", { name: "Add expense category" })).toBeVisible();
    expect(screen.getByLabelText("Category name")).toHaveValue("Farm labour");
  });

  it("keeps a form dialog open while its save request is pending", async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    const pendingSave = new Promise<Response>((resolve) => { resolveSave = resolve; });
    installFetch().mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/v1/identity") return ok({ email: "admin@vkb.test", role: "admin" });
      if (url.startsWith("/api/v1/people?")) return ok([person], { page: 1, pageSize: 100, total: 1 });
      if (url.startsWith("/api/v1/categories?")) return ok([category], { page: 1, pageSize: 100, total: 1 });
      if (url === "/api/v1/categories" && init?.method === "POST") return pendingSave;
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();
    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });
    await user.click(within(navigation).getByRole("button", { name: "Expense Categories" }));
    await user.click(await screen.findByRole("button", { name: "Add category" }));
    await user.type(screen.getByLabelText("Category name"), "Irrigation");
    await user.click(screen.getByRole("button", { name: "Save category" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("dialog", { name: "Add expense category" })).toBeVisible();

    resolveSave?.(new Response(JSON.stringify({ data: category }), { status: 201 }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add expense category" })).not.toBeInTheDocument());
  });

  it("surfaces a failed reactivation and leaves the inactive record available to retry", async () => {
    installFetch().mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/v1/identity") return ok({ email: "admin@vkb.test", role: "admin" });
      if (url.startsWith("/api/v1/people?")) return ok([person], { page: 1, pageSize: 100, total: 1 });
      if (url.startsWith("/api/v1/categories?")) return ok([{ ...category, active: false }], { page: 1, pageSize: 100, total: 1 });
      if (url === "/api/v1/categories/category-1" && init?.method === "PATCH") {
        return failure(409, "CATEGORY_EXISTS", "An expense category with this name already exists");
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();
    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });
    await user.click(within(navigation).getByRole("button", { name: "Expense Categories" }));
    await user.click(await screen.findByRole("button", { name: "Reactivate Farm labour" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("An expense category with this name already exists");
    expect(screen.getByRole("button", { name: "Reactivate Farm labour" })).toBeEnabled();
  });

  it.each(["editor", "viewer"] as const)("keeps the full settings view read-only for %s identities", async (role) => {
    installFetch(role);
    const user = userEvent.setup();
    renderPage();
    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });

    expect(await screen.findByText("Satish")).toBeVisible();
    expect(screen.getByText(/read-only configuration access/i)).toBeVisible();
    for (const section of ["People", "Expense Categories", "Crops", "Farm Areas"]) {
      await user.click(within(navigation).getByRole("button", { name: section }));
      await screen.findByRole("heading", { name: section });
      expect(screen.queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^(Deactivate|Reactivate) / })).not.toBeInTheDocument();
    }
  });

  it("shows fixed application facts without deployment identifiers or a save form", async () => {
    installFetch("viewer");
    const user = userEvent.setup();
    renderPage();
    await user.click(within(await screen.findByRole("navigation", { name: "Settings sections" })).getByRole("button", { name: "Application" }));

    const application = screen.getByRole("heading", { name: "Application" }).closest("section")!;
    expect(within(application).getByText("viewer@vkb.test")).toBeVisible();
    expect(screen.getByText("Viewer")).toBeVisible();
    expect(screen.getByText("INR (₹)")).toBeVisible();
    expect(screen.getByText("Asia/Kolkata")).toBeVisible();
    expect(screen.getByText(/cloudflare access.*active person/i)).toBeVisible();
    expect(screen.getByText("10 MiB")).toBeVisible();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/database id|account id|deployment id/i)).not.toBeInTheDocument();
  });

  it("invalidates every affected query family after settings mutations", async () => {
    const fetchSpy = installFetch();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage(client);
    const navigation = await screen.findByRole("navigation", { name: "Settings sections" });

    await user.click(await screen.findByRole("button", { name: "Edit Satish" }));
    await user.click(screen.getByRole("button", { name: "Save person" }));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url, init]) => String(url) === "/api/v1/people/person-1" && init?.method === "PATCH")).toBe(true));
    for (const key of [["people"], ["identity"], ["expenses"], ["settlements"], ["dashboard"], ["reports", "contributions"], ["reports"]]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }

    invalidate.mockClear();
    await user.click(within(navigation).getByRole("button", { name: "Expense Categories" }));
    await user.click(await screen.findByRole("button", { name: "Edit Farm labour" }));
    await user.click(screen.getByRole("button", { name: "Save category" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["categories"] }));
    for (const key of [["expenses"], ["dashboard"], ["reports"]]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });

    invalidate.mockClear();
    await user.click(within(navigation).getByRole("button", { name: "Crops" }));
    await user.click(await screen.findByRole("button", { name: "Edit Banana" }));
    await user.click(screen.getByRole("button", { name: "Save crop" }));
    for (const key of [["plantation"], ["harvests"], ["expenses"], ["dashboard"], ["reports"]]) {
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: key }));
    }

    invalidate.mockClear();
    await user.click(within(navigation).getByRole("button", { name: "Farm Areas" }));
    await user.click(await screen.findByRole("button", { name: "Edit MT" }));
    await user.click(screen.getByRole("button", { name: "Save farm area" }));
    for (const key of [["plantation"], ["dashboard"], ["reports"]]) {
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: key }));
    }
  });
});
