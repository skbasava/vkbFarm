import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatINR } from "../../lib/format";
import type { Expense } from "./types";

export function ExpenseCards({ expenses }: { expenses: Expense[] }) {
  return <div className="expense-cards" aria-label="Expense cards">{expenses.map((expense) => <Link className="expense-card" key={expense.id} to={`/expenses/${expense.id}`}><div><strong>{expense.description}</strong><span>{formatDate(expense.expenseDate)} · {expense.categoryName ?? "Uncategorised"} · {expense.paidByPersonName}</span></div><div><b>{formatINR(expense.amountPaise)}</b><ChevronRight aria-hidden="true" size={17} /></div></Link>)}</div>;
}
