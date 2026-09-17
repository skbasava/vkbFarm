import { Archive, ChevronLeft, ChevronRight, FileCheck2, FolderOpen } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { canManageExpenses, useIdentity } from "../../lib/identity";
import { ApiError } from "../../lib/api-client";
import { useDocumentExpenseOptions, useDocuments } from "./api";
import { ReceiptPreview } from "./ReceiptPreview";
import { ReceiptUpload } from "./ReceiptUpload";

const PAGE_SIZE = 25;

function pageFrom(value: string | null): number {
  const parsed = Number(value ?? 1);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default function DocumentsPage() {
  const [search, setSearch] = useSearchParams();
  const expenseId = search.get("expenseId")?.trim() || undefined;
  const page = pageFrom(search.get("page"));
  const identity = useIdentity();
  const expenses = useDocumentExpenseOptions();
  const documents = useDocuments(expenseId, page, PAGE_SIZE);
  const canWrite = canManageExpenses(identity.data);
  const selectedExpenseExists = expenseId
    ? expenses.data?.some((expense) => expense.id === expenseId) === true
    : true;
  const selectedExpenseUnavailable = Boolean(
    expenseId && expenses.isSuccess && !selectedExpenseExists,
  );
  const totalPages = Math.max(1, Math.ceil((documents.data?.meta.total ?? 0) / PAGE_SIZE));

  const updateSearch = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearch(next, { replace: true });
  };

  return (
    <section className="documents-page">
      <div className="documents-page__heading">
        <div className="page-intro"><span><Archive aria-hidden="true" size={13} /> Private farm archive</span><h2>Receipts &amp; records</h2><p>A quiet, searchable shelf for bills tied to the ledger. Every preview stays behind farm access.</p></div>
        <div className="documents-page__seal"><FileCheck2 aria-hidden="true" size={18} /><span>Private R2 storage</span></div>
      </div>

      <div className="documents-page__controls">
        <label className="field" htmlFor="document-expense-filter"><span className="field__label">Filter by expense</span><select className="field__input" disabled={expenses.isLoading || expenses.isError} id="document-expense-filter" onChange={(event) => updateSearch({ expenseId: event.target.value || undefined, page: undefined })} value={selectedExpenseExists ? expenseId ?? "" : ""}><option value="">All saved expenses</option>{expenses.data?.map((expense) => <option key={expense.id} value={expense.id}>{expense.expenseDate} · {expense.description}</option>)}</select></label>
        {!expenseId ? <p><FolderOpen aria-hidden="true" size={17} /> Choose an expense to attach a new receipt, or browse the full shelf.</p> : null}
        {expenses.isError ? <p role="alert"><FolderOpen aria-hidden="true" size={17} /> Expense choices could not be loaded. Receipt uploads are paused until you retry.</p> : null}
      </div>

      {identity.isLoading ? <div aria-label="Loading document access" className="documents-loading"><Skeleton /><Skeleton /></div> : null}
      {!identity.isLoading && !canWrite ? <p className="documents-page__readonly">Read-only document access: you can inspect and open receipts, but only editors and admins can change the shelf.</p> : null}
      {!identity.isLoading && canWrite && expenseId && selectedExpenseExists ? <ReceiptUpload expenseId={expenseId} /> : null}

      {selectedExpenseUnavailable ? (
        <ErrorState
          action={<Button onClick={() => updateSearch({ expenseId: undefined, page: undefined })} variant="secondary">Browse all receipts</Button>}
          description="This expense is missing or archived, so a new receipt cannot be attached from this route."
          title="Expense unavailable"
        />
      ) : null}

      {documents.isLoading ? <div aria-label="Loading receipts" className="documents-loading"><Skeleton /><div><Skeleton /><Skeleton /><Skeleton /></div></div> : null}
      {documents.isError ? (
        <ErrorState
          action={<Button onClick={() => void documents.refetch()} variant="secondary">Try again</Button>}
          description={documents.error instanceof ApiError && documents.error.offline ? "Reconnect to review the saved receipt shelf. Your selected expense is unchanged." : "The private receipt shelf could not be loaded. Your records have not been changed."}
          title={documents.error instanceof ApiError && documents.error.offline ? "Receipts are offline" : "We could not load receipts"}
        />
      ) : null}
      {documents.isSuccess && documents.data.data.length === 0 && !selectedExpenseUnavailable ? <EmptyState title={expenseId ? "No receipts for this expense" : "The receipt shelf is empty"} description={canWrite && expenseId ? "Choose a JPEG, PNG, or PDF above to attach the first record." : "Saved farm receipts will appear here once an editor attaches them to an expense."} /> : null}
      {documents.data?.data.length ? <div className="receipt-shelf">{documents.data.data.map((document) => <ReceiptPreview canDelete={canWrite} document={document} key={document.id} />)}</div> : null}
      {documents.isSuccess && documents.data.meta.total > PAGE_SIZE ? <nav aria-label="Document pages" className="documents-pagination"><span>Page {page} of {totalPages}</span><div><Button aria-label="Previous document page" disabled={page <= 1} onClick={() => updateSearch({ page: String(page - 1) })} size="icon" variant="secondary"><ChevronLeft aria-hidden="true" size={17} /></Button><Button aria-label="Next document page" disabled={page >= totalPages} onClick={() => updateSearch({ page: String(page + 1) })} size="icon" variant="secondary"><ChevronRight aria-hidden="true" size={17} /></Button></div></nav> : null}
    </section>
  );
}
