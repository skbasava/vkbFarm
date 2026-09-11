import { ArrowLeft, FileText, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { formatDate, formatINR } from "../../lib/format";
import { canManageExpenses, useIdentity } from "../../lib/identity";
import { useDeleteExpense, useExpense } from "./api";
import { DeleteExpenseDialog } from "./DeleteExpenseDialog";

export default function ExpenseDetailPage() {
  const { id = "" } = useParams();
  const detail = useExpense(id);
  const deletion = useDeleteExpense(id);
  const identity = useIdentity();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (detail.isLoading) return <div className="expense-detail__skeleton"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (detail.isError || !detail.data) return <ErrorState title="Expense not found" description="This entry may have been deleted or you no longer have access to it." action={<Link className="button button--secondary" to="/expenses">Back to expenses</Link>} />;
  const expense = detail.data;
  const canWrite = canManageExpenses(identity.data);
  return <section className="expense-detail"><Link className="back-link" to="/expenses"><ArrowLeft aria-hidden="true" size={16} /> Back to expenses</Link><div className="expense-detail__hero"><div><span>{formatDate(expense.expenseDate)} · {expense.categoryName ?? "Uncategorised"}</span><h2>{expense.description}</h2><p>Paid by {expense.paidByPersonName}{expense.paidTo ? ` to ${expense.paidTo}` : ""}</p></div><strong>{formatINR(expense.amountPaise)}</strong></div>{canWrite ? <div className="expense-detail__actions"><Link className="button button--secondary" to={`/expenses/${expense.id}/edit`}><Pencil aria-hidden="true" size={16} /> Edit</Link><Button onClick={() => setDeleteOpen(true)} variant="destructive"><Trash2 aria-hidden="true" size={16} /> Delete</Button></div> : null}<div className="expense-detail__grid"><Card><CardHeader><CardTitle>Entry details</CardTitle></CardHeader><CardContent><dl className="expense-detail__facts"><div><dt>Class</dt><dd>{expense.expenseClass ?? "Not classified"}</dd></div><div><dt>Shared cost</dt><dd>{expense.isShared ? "Included in shared balances" : "Personal / excluded"}</dd></div><div><dt>Crop</dt><dd>{expense.cropName ?? "No crop linked"}</dd></div><div><dt>Recorded</dt><dd>{new Date(expense.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</dd></div></dl></CardContent></Card><Card className="expense-detail__receipt"><CardHeader><CardTitle>Receipt & notes</CardTitle></CardHeader><CardContent><FileText aria-hidden="true" size={22} /><p>{expense.notes ?? "No notes were added to this expense."}</p><Link to={`/documents/new?expenseId=${expense.id}`}>Attach a receipt in Documents</Link></CardContent></Card></div><DeleteExpenseDialog deleting={deletion.isPending} description={`Delete “${expense.description}”?`} onConfirm={() => deletion.mutate(undefined, { onSuccess: () => navigate("/expenses", { replace: true }) })} onOpenChange={setDeleteOpen} open={deleteOpen && canWrite} /></section>;
}
