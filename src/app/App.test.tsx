import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("VKB Farm Manager application shell", () => {
  it("shows core desktop navigation and opens quick actions", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("navigation", { name: /primary/i })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /quick add/i }));

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
});
