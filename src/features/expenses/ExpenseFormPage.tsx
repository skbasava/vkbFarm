import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { useExpense } from "./api";
import { ExpenseForm } from "./ExpenseForm";

export default function ExpenseFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useExpense(id ?? "");
  const isEditing = Boolean(id);
  if (isEditing && detail.isLoading) return <div className="expense-form-page__skeleton"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (isEditing && (detail.isError || !detail.data)) return <ErrorState title="Expense not found" description="This entry may have been deleted or you no longer have access to it." action={<Link className="button button--secondary" to="/expenses">Back to expenses</Link>} />;
  return <section className="expense-form-page"><Link className="back-link" to={isEditing ? `/expenses/${id}` : "/expenses"}><ArrowLeft aria-hidden="true" size={16} /> Back to expenses</Link><div className="expense-form-page__heading"><span>{isEditing ? "Correct a ledger entry" : "Fast entry"}</span><h2>{isEditing ? "Edit expense" : "Add an expense"}</h2><p>{isEditing ? "Update the recorded details. Shared balances refresh when you save." : "Capture the essentials now; add the bill or notes when you have a moment."}</p></div><ExpenseForm expense={detail.data} mode={isEditing ? "edit" : "create"} onSaved={(expense) => navigate(isEditing ? `/expenses/${expense.id}` : "/expenses", { replace: !isEditing })} /></section>;
}
