import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentsPage from "./DocumentsPage";
import { ReceiptPreview } from "./ReceiptPreview";
import { ReceiptUpload } from "./ReceiptUpload";
import type { DocumentRecord } from "./api";

const pdfDocument: DocumentRecord = {
  id: "document-pdf",
  expenseId: "expense-1",
  expenseDescription: "Diesel for tractor",
  expenseDate: "2026-09-10",
  fileName: "diesel-invoice.pdf",
  contentType: "application/pdf",
  fileSize: 2048,
  uploadedBy: "editor@vkb.test",
  createdAt: "2026-09-10 08:00:00",
  contentUrl: "/api/v1/documents/document-pdf/content",
};

const imageDocument: DocumentRecord = {
  ...pdfDocument,
  id: "document-image",
  fileName: "pump.jpg",
  contentType: "image/jpeg",
  fileSize: 4096,
  contentUrl: "/api/v1/documents/document-image/content",
};

function providers(children: React.ReactNode, path = "/documents") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function ok(data: unknown, meta?: Record<string, number>): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(meta ? { data, meta } : { data }), {
      status: 200,
    }),
  );
}

function pageFetch(role: "admin" | "editor" | "viewer", documents = [pdfDocument]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url === "/api/v1/identity") {
      return ok({ email: `${role}@vkb.test`, role });
    }
    if (url.startsWith("/api/v1/expenses?")) {
      return ok(
        [
          {
            id: "expense-1",
            expenseDate: "2026-09-10",
            description: "Diesel for tractor",
          },
        ],
        { page: 1, pageSize: 100, total: 1 },
      );
    }
    if (url.startsWith("/api/v1/documents?")) {
      return ok(documents, { page: 1, pageSize: 25, total: documents.length });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

class MockXhr {
  static instances: MockXhr[] = [];
  aborted = false;
  body: FormData | null = null;
  method = "";
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  responseText = "";
  status = 0;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  url = "";

  constructor() {
    MockXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  send(body: FormData) {
    this.body = body;
  }
}

describe("DocumentsPage", () => {
  afterEach(() => {
    MockXhr.instances = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a filtered farm-record shelf and expense selector for viewers", async () => {
    pageFetch("viewer");
    render(providers(<DocumentsPage />));

    expect(
      await screen.findByRole("heading", { name: "Receipts & records" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Filter by expense")).toBeVisible();
    expect(await screen.findByText("diesel-invoice.pdf")).toBeVisible();
    expect(screen.getByTitle("Preview diesel-invoice.pdf")).toHaveAttribute(
      "src",
      pdfDocument.contentUrl,
    );
    expect(screen.queryByLabelText("Choose receipt file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete receipt/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only document access/i)).toBeVisible();
  });

  it("shows the saved-expense upload surface to editors on the direct new route", async () => {
    pageFetch("editor", []);
    render(providers(<DocumentsPage />, "/documents/new?expenseId=expense-1"));

    expect(await screen.findByLabelText("Choose receipt file")).toBeVisible();
    expect(screen.getByText(/maximum 10 mib/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "No receipts for this expense" })).toBeVisible();
  });

  it("loads every expense page so an older saved expense remains selectable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/v1/identity") {
        return ok({ email: "editor@vkb.test", role: "editor" });
      }
      if (url.startsWith("/api/v1/expenses?")) {
        const page = new URL(url, "https://farm.test").searchParams.get("page");
        return page === "1"
          ? ok(
              Array.from({ length: 100 }, (_, index) => ({
                id: `expense-${index + 1}`,
                expenseDate: "2026-09-10",
                description: `Recent expense ${index + 1}`,
              })),
              { page: 1, pageSize: 100, total: 101 },
            )
          : ok(
              [{ id: "expense-old", expenseDate: "2025-01-01", description: "Old pump repair" }],
              { page: 2, pageSize: 100, total: 101 },
            );
      }
      if (url.startsWith("/api/v1/documents?")) {
        return ok([], { page: 1, pageSize: 25, total: 0 });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(providers(<DocumentsPage />, "/documents/new?expenseId=expense-old"));

    expect(await screen.findByRole("option", { name: /old pump repair/i })).toBeVisible();
    expect(screen.getByLabelText("Choose receipt file")).toBeVisible();
    expect(
      fetchSpy.mock.calls.some(([url]) =>
        String(url).startsWith("/api/v1/expenses?page=2&"),
      ),
    ).toBe(true);
  });

  it("blocks upload for an unknown direct-route expense", async () => {
    pageFetch("editor", []);
    render(providers(<DocumentsPage />, "/documents/new?expenseId=expense-missing"));

    expect(
      await screen.findByRole("heading", { name: "Expense unavailable" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Choose receipt file")).not.toBeInTheDocument();
  });

  it("replaces an out-of-range document page with the last valid page", async () => {
    const documentRequests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/v1/identity") {
        return ok({ email: "viewer@vkb.test", role: "viewer" });
      }
      if (url.startsWith("/api/v1/expenses?")) {
        return ok([], { page: 1, pageSize: 100, total: 0 });
      }
      if (url.startsWith("/api/v1/documents?")) {
        documentRequests.push(url);
        const page = new URL(url, "https://farm.test").searchParams.get("page");
        return page === "999"
          ? ok([], { page: 999, pageSize: 25, total: 26 })
          : ok([imageDocument], { page: 2, pageSize: 25, total: 26 });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(providers(<DocumentsPage />, "/documents?page=999"));

    expect(await screen.findByText("pump.jpg")).toBeVisible();
    expect(
      documentRequests.some((url) =>
        new URL(url, "https://farm.test").searchParams.get("page") === "2"),
    ).toBe(true);
  });

  it("returns to the previous page after deleting its last receipt", async () => {
    let secondPageReads = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/v1/identity") {
        return ok({ email: "editor@vkb.test", role: "editor" });
      }
      if (url.startsWith("/api/v1/expenses?")) {
        return ok(
          [{ id: "expense-1", expenseDate: "2026-09-10", description: "Diesel" }],
          { page: 1, pageSize: 100, total: 1 },
        );
      }
      if (url === "/api/v1/documents/document-image" && init?.method === "DELETE") {
        return ok({ id: "document-image", deleted: true });
      }
      if (url.startsWith("/api/v1/documents?")) {
        const page = new URL(url, "https://farm.test").searchParams.get("page");
        if (page === "2") {
          secondPageReads += 1;
          return secondPageReads === 1
            ? ok([imageDocument], { page: 2, pageSize: 25, total: 26 })
            : ok([], { page: 2, pageSize: 25, total: 25 });
        }
        return ok([pdfDocument], { page: 1, pageSize: 25, total: 25 });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    render(providers(<DocumentsPage />, "/documents?page=2"));

    expect(await screen.findByText("pump.jpg")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete receipt pump.jpg" }));
    await user.click(screen.getByRole("button", { name: "Delete receipt" }));

    expect(await screen.findByText("diesel-invoice.pdf")).toBeVisible();
    expect(
      fetchSpy.mock.calls.some(([url]) => {
        const value = String(url);
        return value.startsWith("/api/v1/documents?") &&
          new URL(value, "https://farm.test").searchParams.get("page") === "1";
      }),
    ).toBe(true);
  });

  it("shows an offline recovery state without discarding the selected expense", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input) === "/api/v1/identity") {
        return ok({ email: "editor@vkb.test", role: "editor" });
      }
      if (String(input).startsWith("/api/v1/expenses?")) {
        return ok([], { page: 1, pageSize: 100, total: 0 });
      }
      return Promise.reject(new TypeError("offline"));
    });
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(providers(<DocumentsPage />, "/documents?expenseId=expense-1"));

    expect(await screen.findByRole("heading", { name: "Receipts are offline" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

describe("ReceiptUpload", () => {
  afterEach(() => {
    MockXhr.instances = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports real XHR progress and preserves the chosen file for retry", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXhr);
    const user = userEvent.setup();
    render(providers(<ReceiptUpload expenseId="expense-1" />));
    const file = new File(["%PDF-1.7\nreceipt"], "fertiliser.pdf", {
      type: "application/pdf",
    });

    await user.upload(screen.getByLabelText("Choose receipt file"), file);
    await user.click(screen.getByRole("button", { name: "Upload receipt" }));
    expect(MockXhr.instances).toHaveLength(1);
    expect(MockXhr.instances[0]).toMatchObject({
      method: "POST",
      url: "/api/v1/documents",
    });

    act(() => {
      MockXhr.instances[0]?.upload.onprogress?.({
        lengthComputable: true,
        loaded: 5,
        total: 10,
      } as ProgressEvent);
    });
    expect(screen.getByText("50% uploaded")).toBeVisible();

    act(() => {
      const xhr = MockXhr.instances[0];
      if (!xhr) return;
      xhr.status = 503;
      xhr.responseText = JSON.stringify({
        error: { code: "DOCUMENT_STORAGE_ERROR", message: "Storage unavailable" },
      });
      xhr.onload?.();
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage unavailable");
    expect(screen.getByText("fertiliser.pdf")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try upload again" }));
    expect(MockXhr.instances).toHaveLength(2);
  });

  it("cannot carry a selected receipt from one expense into another", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXhr);
    const user = userEvent.setup();
    const view = render(providers(<ReceiptUpload expenseId="expense-a" />));
    const fileA = new File(["%PDF-1.7\nA"], "expense-a.pdf", {
      type: "application/pdf",
    });
    const fileB = new File(["%PDF-1.7\nB"], "expense-b.pdf", {
      type: "application/pdf",
    });

    await user.upload(screen.getByLabelText("Choose receipt file"), fileA);
    expect(screen.getByText("expense-a.pdf")).toBeVisible();

    view.rerender(providers(<ReceiptUpload expenseId="expense-b" />));
    await waitFor(() =>
      expect(screen.queryByText("expense-a.pdf")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Upload receipt" })).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText("Choose receipt file"), fileB);
    await user.click(screen.getByRole("button", { name: "Upload receipt" }));
    const body = MockXhr.instances[0]?.body;
    expect(body?.get("expenseId")).toBe("expense-b");
    expect(body?.get("file")).toBe(fileB);
  });

  it("aborts a pending upload when the expense context changes", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXhr);
    const user = userEvent.setup();
    const view = render(providers(<ReceiptUpload expenseId="expense-a" />));
    const file = new File(["%PDF-1.7\nA"], "expense-a.pdf", {
      type: "application/pdf",
    });

    await user.upload(screen.getByLabelText("Choose receipt file"), file);
    await user.click(screen.getByRole("button", { name: "Upload receipt" }));
    const xhr = MockXhr.instances[0];
    expect(screen.getByLabelText("Choose receipt file")).toBeDisabled();

    view.rerender(providers(<ReceiptUpload expenseId="expense-b" />));

    await waitFor(() => expect(xhr?.aborted).toBe(true));
    act(() => xhr?.onload?.());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("expense-a.pdf")).not.toBeInTheDocument();
  });

  it("aborts a pending upload when its surface unmounts", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXhr);
    const user = userEvent.setup();
    const view = render(providers(<ReceiptUpload expenseId="expense-a" />));
    const file = new File(["%PDF-1.7\nA"], "expense-a.pdf", {
      type: "application/pdf",
    });

    await user.upload(screen.getByLabelText("Choose receipt file"), file);
    await user.click(screen.getByRole("button", { name: "Upload receipt" }));
    const xhr = MockXhr.instances[0];

    view.unmount();

    expect(xhr?.aborted).toBe(true);
  });
});

describe("ReceiptPreview", () => {
  afterEach(() => vi.restoreAllMocks());

  it("previews same-origin images and uses a stable accessible delete confirmation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: imageDocument.id, deleted: true } }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    render(providers(<ReceiptPreview canDelete document={imageDocument} />));

    expect(screen.getByAltText("Receipt pump.jpg")).toHaveAttribute(
      "src",
      imageDocument.contentUrl,
    );
    await user.click(screen.getByRole("button", { name: "Delete receipt pump.jpg" }));
    expect(screen.getByRole("alertdialog", { name: "Delete this receipt?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete receipt" }));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/documents/document-image",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("refuses a non-API preview URL", () => {
    render(
      providers(
        <ReceiptPreview
          canDelete={false}
          document={{
            ...pdfDocument,
            contentUrl: "https://evil.example/receipt.pdf",
          }}
        />,
      ),
    );

    expect(screen.getByText("Preview unavailable")).toBeVisible();
    expect(screen.queryByTitle(/preview/i)).not.toBeInTheDocument();
  });
});
