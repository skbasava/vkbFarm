import { CirclePlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, Route, Routes, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { useCategories, useExpenses, usePeople } from "./api";
import { ExpenseCards } from "./ExpenseCards";
import ExpenseDetailPage from "./ExpenseDetailPage";
import { ExpenseFilters } from "./ExpenseFilters";
import ExpenseFormPage from "./ExpenseFormPage";
import { ExpenseTable } from "./ExpenseTable";
import type { ExpenseFilters as FilterValues } from "./types";

function searchFilters(search: URLSearchParams): FilterValues {
  const pageSize = Number(search.get("pageSize") ?? 25);
  return { page: Number(search.get("page") ?? 1), pageSize: pageSize === 50 || pageSize === 100 ? pageSize : 25, ...(search.get("search") ? { search: search.get("search")! } : {}), ...(search.get("categoryId") ? { categoryId: search.get("categoryId")! } : {}), ...(search.get("paidByPersonId") ? { paidByPersonId: search.get("paidByPersonId")! } : {}), ...(search.get("dateFrom") ? { dateFrom: search.get("dateFrom")! } : {}), ...(search.get("dateTo") ? { dateTo: search.get("dateTo")! } : {}), sortBy: (search.get("sortBy") as FilterValues["sortBy"]) || "expenseDate", sortOrder: search.get("sortOrder") === "asc" ? "asc" : "desc" };
}

export function ExpenseListPage() {
  const [search, setSearch] = useSearchParams();
  const filters = searchFilters(search);
  const expenses = useExpenses(search);
  const categories = useCategories();
  const people = usePeople();
  const updateFilters = (next: Partial<FilterValues>) => {
    const updated = new URLSearchParams(search);
    Object.entries(next).forEach(([key, value]) => { if (value === undefined || value === "") updated.delete(key); else updated.set(key, String(value)); });
    setSearch(updated);
  };
  const sort = (field: FilterValues["sortBy"]) => updateFilters({ sortBy: field, sortOrder: filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc", page: 1 });
  const totalPages = expenses.data ? Math.max(1, Math.ceil(expenses.data.meta.total / expenses.data.meta.pageSize)) : 1;
  const pagination = <footer className="expense-pagination"><span>{expenses.data?.meta.total ?? 0} expense{expenses.data?.meta.total === 1 ? "" : "s"}</span><label>Rows<select aria-label="Rows per page" onChange={(event) => updateFilters({ pageSize: Number(event.target.value) as FilterValues["pageSize"], page: 1 })} value={filters.pageSize}><option value="25">25 per page</option><option value="50">50 per page</option><option value="100">100 per page</option></select></label><div><Button aria-label="Previous page" disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} size="icon" variant="secondary"><ChevronLeft aria-hidden="true" size={18} /></Button><span>Page {filters.page} of {totalPages}</span><Button aria-label="Next page" disabled={filters.page >= totalPages} onClick={() => updateFilters({ page: filters.page + 1 })} size="icon" variant="secondary"><ChevronRight aria-hidden="true" size={18} /></Button></div></footer>;
  return <section className="expenses-page"><div className="expenses-page__heading"><div className="page-intro"><span>Farm ledger · current records</span><h2>Expenses</h2><p>Keep every purchase clear, searchable, and ready for shared settlement.</p></div><Link className="button button--primary" to="/expenses/new"><CirclePlus aria-hidden="true" size={17} /> Add expense</Link></div><ExpenseFilters categories={categories.data ?? []} filters={filters} onChange={updateFilters} people={people.data ?? []} />{expenses.isLoading ? <div aria-label="Loading expenses" className="expenses-page__skeleton"><Skeleton /><Skeleton /><Skeleton /></div> : expenses.isError ? <ErrorState title="We could not load expenses" action={<Button onClick={() => void expenses.refetch()} variant="secondary">Try again</Button>} /> : expenses.data?.data.length ? <><ExpenseTable expenses={expenses.data.data} onSort={sort} sortBy={filters.sortBy} sortOrder={filters.sortOrder} /><ExpenseCards expenses={expenses.data.data} />{pagination}</> : <><EmptyState title={filters.search || filters.categoryId || filters.paidByPersonId ? "No matching expenses" : "No expenses yet"} description={filters.search || filters.categoryId || filters.paidByPersonId ? "Try changing the search or filters to see more ledger entries." : "Add the first farm purchase and it will appear here."} action={<Link className="button button--primary" to="/expenses/new">Add expense</Link>} />{pagination}</>}</section>;
}

export default function ExpenseRoutes() {
  return <Routes><Route index element={<ExpenseListPage />} /><Route path="new" element={<ExpenseFormPage />} /><Route path=":id" element={<ExpenseDetailPage />} /><Route path=":id/edit" element={<ExpenseFormPage />} /></Routes>;
}
