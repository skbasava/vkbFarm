import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatINR } from "../../lib/format";
import type { Expense } from "./types";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, Expense>();
type ExpenseTableProps = { expenses: Expense[]; onSort: (field: "expenseDate" | "amount" | "description" | "createdAt") => void; sortBy: string; sortOrder: "asc" | "desc" };

export function ExpenseTable({ expenses, onSort, sortBy, sortOrder }: ExpenseTableProps) {
  const columns = column.columns([
    column.accessor("expenseDate", { header: "Date", cell: (info) => formatDate(info.getValue()) }),
    column.accessor("description", { header: "Description", cell: (info) => <Link className="expense-table__description" to={`/expenses/${info.row.original.id}`}><strong>{info.getValue()}</strong><small>{info.row.original.paidTo ?? "No supplier listed"}</small></Link> }),
    column.accessor("categoryName", { header: "Category", cell: (info) => info.getValue() ?? "Uncategorised" }),
    column.accessor("paidByPersonName", { header: "Paid by" }),
    column.accessor("expenseClass", { header: "Class", cell: (info) => info.getValue() ?? "—" }),
    column.accessor("amountPaise", { id: "amount", header: "Amount", cell: (info) => <strong>{formatINR(info.getValue())}</strong> }),
  ]);
  const table = useTable({ data: expenses, columns, features });
  const sortable = new Set(["expenseDate", "description", "amount"]);
  return <div className="expense-table-wrap"><table className="expense-table"><thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => { const field = header.column.id as "expenseDate" | "amount" | "description"; const active = sortable.has(field) && sortBy === field; return <th aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : undefined} key={header.id}>{header.isPlaceholder ? null : sortable.has(field) ? <button onClick={() => onSort(field)} type="button"><table.FlexRender header={header} />{active ? sortOrder === "asc" ? <ArrowUp aria-hidden="true" size={14} /> : <ArrowDown aria-hidden="true" size={14} /> : null}</button> : <table.FlexRender header={header} />}</th>; })}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getAllCells().map((cell) => <td key={cell.id}><table.FlexRender cell={cell} /></td>)}</tr>)}</tbody></table></div>;
}
