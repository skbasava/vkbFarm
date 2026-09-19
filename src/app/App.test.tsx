import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { QuickActionSheet } from "../components/layout/QuickActionSheet";
import App from "./App";

describe("VKB Farm Manager application shell", () => {
  it("shows core desktop navigation and opens quick actions", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "admin@vkb.test", role: "admin" } })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("navigation", { name: /primary/i })).toBeVisible();

    await user.click(await screen.findByRole("button", { name: /quick add/i }));

    expect(screen.getByRole("dialog", { name: /quick actions/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /add expense/i })).toHaveAttribute(
      "href",
      "/expenses/new",
    );
  });

  it("includes Settlements in primary navigation and dismisses mobile disclosures with Escape", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("link", { name: /settlements/i })).toHaveAttribute("href", "/settlements");

    const mobileNavigation = screen.getByRole("navigation", { name: /mobile/i });
    const farmTrigger = within(mobileNavigation).getByRole("button", { name: "Farm" });
    expect(farmTrigger).toHaveAttribute("aria-expanded", "false");

    await user.click(farmTrigger);

    expect(farmTrigger).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("region", { name: /farm navigation/i })).getByRole("link", { name: "Plantation" })).toHaveAttribute("href", "/plantation");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("region", { name: /farm navigation/i })).not.toBeInTheDocument();
    expect(farmTrigger).toHaveFocus();

    const moreTrigger = within(mobileNavigation).getByRole("button", { name: "More" });
    await user.click(moreTrigger);

    expect(moreTrigger).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("region", { name: /more navigation/i })).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("region", { name: /more navigation/i })).not.toBeInTheDocument();
    expect(moreTrigger).toHaveFocus();
  });

  it("puts a first-tab skip link before navigation and provides one focusable main landmark", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.tab();

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("returns focus to the quick-action control that opened the dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "admin@vkb.test", role: "admin" } })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    render(<App />);

    const trigger = await screen.findByRole("button", { name: "Add record" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /quick actions/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not offer write quick actions to a viewer", () => {
    render(<MemoryRouter><QuickActionSheet canWrite={false} onOpenChange={() => undefined} open /></MemoryRouter>);

    expect(screen.getByRole("dialog", { name: /quick actions/i })).toBeVisible();
    expect(screen.queryByRole("link", { name: /add expense/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access/i)).toBeVisible();
  });

  it("marks the dashboard navigation links current on the manifest start route", () => {
    window.history.replaceState({}, "", "/dashboard");
    render(<App />);

    expect(within(screen.getByRole("navigation", { name: /primary/i })).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByRole("navigation", { name: /mobile/i })).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    window.history.replaceState({}, "", "/");
  });
});
