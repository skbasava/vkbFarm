import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DeleteExpenseDialog } from "./DeleteExpenseDialog";

it("keeps a pending delete confirmation open when Escape is pressed", async () => {
  const onOpenChange = vi.fn();
  const user = userEvent.setup();

  render(<DeleteExpenseDialog deleting description="Delete irrigation pipe?" onConfirm={() => undefined} onOpenChange={onOpenChange} open />);
  await user.keyboard("{Escape}");

  expect(screen.getByRole("dialog", { name: "Delete this expense?" })).toBeVisible();
  expect(onOpenChange).not.toHaveBeenCalled();
});
