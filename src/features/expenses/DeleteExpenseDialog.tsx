import { AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";

type DeleteExpenseDialogProps = { deleting: boolean; description: string; onConfirm: () => void; onOpenChange: (open: boolean) => void; open: boolean };

export function DeleteExpenseDialog({ deleting, description, onConfirm, onOpenChange, open }: DeleteExpenseDialogProps) {
  return <Dialog onOpenChange={(nextOpen) => { if (!deleting) onOpenChange(nextOpen); }} open={open}><DialogContent aria-describedby="delete-expense-description" aria-label="Delete expense" className="delete-expense-dialog"><div className="delete-expense-dialog__icon"><AlertTriangle aria-hidden="true" size={20} /></div><DialogTitle>Delete this expense?</DialogTitle><DialogDescription id="delete-expense-description">{description} This removes it from the active ledger and cannot be undone from this screen.</DialogDescription><div className="delete-expense-dialog__actions"><Button disabled={deleting} onClick={() => onOpenChange(false)} variant="secondary">Keep expense</Button><Button disabled={deleting} onClick={onConfirm} variant="destructive">{deleting ? "Deleting…" : "Delete expense"}</Button></div></DialogContent></Dialog>;
}
