import { render, screen } from "@testing-library/react";
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
});
