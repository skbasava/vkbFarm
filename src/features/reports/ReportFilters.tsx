import { Button } from "../../components/ui/button";
import type { ReportDates } from "./api";

export function ReportFilters({ dates, onChange, onApply }: { dates: ReportDates; onChange: (dates: ReportDates) => void; onApply: () => void }) {
  return <form className="report-filters" onSubmit={(event) => { event.preventDefault(); onApply(); }}><label>From date<input aria-label="From date" type="date" value={dates.dateFrom ?? ""} onChange={(event) => onChange({ ...dates, dateFrom: event.target.value || undefined })} /></label><label>To date<input aria-label="To date" type="date" value={dates.dateTo ?? ""} onChange={(event) => onChange({ ...dates, dateTo: event.target.value || undefined })} /></label><Button size="compact" type="submit" variant="secondary">Apply dates</Button></form>;
}
