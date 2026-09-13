import { CalendarDays, CirclePlus, Edit3, FilterX, Trash2, Wheat } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { formatDate, formatINR, formatWeight } from "../../lib/format";
import { canManageExpenses, useIdentity } from "../../lib/identity";
import { HarvestCharts } from "./HarvestCharts";
import { HarvestForm } from "./HarvestForm";
import { HarvestSummary } from "./HarvestSummary";
import { useDeleteHarvest, useHarvestCrops, useHarvests, useHarvestSummary, type Harvest, type HarvestFilters } from "./api";

function dateLabel(harvest: Harvest): string {
  if (harvest.harvestDate) return formatDate(harvest.harvestDate);
  return harvest.source === "EXCEL" ? "Date unavailable · imported from Excel" : "Date unavailable";
}

export function HarvestPage() {
  const [filters, setFilters] = useState<HarvestFilters>({});
  const [editorOpen, setEditorOpen] = useState(() => window.location.pathname.endsWith("/new"));
  const [selected, setSelected] = useState<Harvest>();
  const [deleting, setDeleting] = useState<Harvest>();
  const identity = useIdentity();
  const crops = useHarvestCrops();
  const harvests = useHarvests(filters);
  const summary = useHarvestSummary(filters);
  const remove = useDeleteHarvest();
  const canWrite = canManageExpenses(identity.data);
  const dateFiltered = Boolean(filters.dateFrom || filters.dateTo || filters.month || filters.year);
  const updateFilter = (key: keyof HarvestFilters, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  const openCreate = () => { setSelected(undefined); setEditorOpen(true); };
  const openEdit = (harvest: Harvest) => { setSelected(harvest); setEditorOpen(true); };

  if (harvests.isLoading || summary.isLoading) return <section aria-label="Loading harvest reporting" className="harvest-page harvest-loading"><Skeleton className="harvest-loading__title" /><div><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div><Skeleton className="harvest-loading__wide" /></section>;
  if (harvests.isError || summary.isError || crops.isError) return <section className="harvest-page"><ErrorState action={<Button onClick={() => void Promise.all([harvests.refetch(), summary.refetch(), crops.refetch()])} variant="secondary">Try again</Button>} title="We could not load harvest records" /></section>;

  return <section className="harvest-page">
    <div className="harvest-page__heading"><div className="page-intro"><span><Wheat aria-hidden="true" size={14} /> Field sales · revenue ledger</span><h2>Harvest</h2><p>Follow yield from field weight to sale revenue, with every manual adjustment explained.</p></div>{canWrite ? <Button onClick={openCreate}><CirclePlus aria-hidden="true" size={17} /> Record harvest</Button> : null}</div>
    <section aria-label="Harvest filters" className="harvest-filters">
      <label><span>Crop</span><select aria-label="Filter crop" onChange={(event) => updateFilter("cropId", event.target.value)} value={filters.cropId ?? ""}><option value="">All crops</option>{crops.data?.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}{crop.active ? "" : " (inactive)"}</option>)}</select></label>
      <label><span>Month</span><input aria-label="Filter month" onChange={(event) => updateFilter("month", event.target.value)} type="month" value={filters.month ?? ""} /></label>
      <label><span>Year</span><input aria-label="Filter year" inputMode="numeric" max="9999" min="1000" onChange={(event) => updateFilter("year", event.target.value)} placeholder="YYYY" type="number" value={filters.year ?? ""} /></label>
      <label><span>From</span><input aria-label="Filter from date" onChange={(event) => updateFilter("dateFrom", event.target.value)} type="date" value={filters.dateFrom ?? ""} /></label>
      <label><span>To</span><input aria-label="Filter to date" onChange={(event) => updateFilter("dateTo", event.target.value)} type="date" value={filters.dateTo ?? ""} /></label>
      <Button aria-label="Clear harvest filters" disabled={!Object.values(filters).some(Boolean)} onClick={() => setFilters({})} size="icon" variant="secondary"><FilterX aria-hidden="true" size={17} /></Button>
    </section>
    {summary.data ? <><HarvestSummary summary={summary.data} /><div className="harvest-disclosure"><CalendarDays aria-hidden="true" size={17} /><p>{dateFiltered ? "Date filters and timeline buckets exclude imported records whose harvest date is unavailable." : summary.data.undatedCount ? `${summary.data.undatedCount} imported ${summary.data.undatedCount === 1 ? "record has" : "records have"} no harvest date. All-time totals include ${formatINR(summary.data.undatedRevenuePaise)} from them; timeline buckets exclude them.` : "All recorded harvests have a known farm date."}</p></div><HarvestCharts summary={summary.data} /></> : null}
    <Card className="harvest-recent"><CardHeader><div><span>Latest field entries</span><CardTitle>Recent harvest records</CardTitle></div><strong>{harvests.data?.length ?? 0} shown</strong></CardHeader><CardContent>{harvests.data?.length ? <ol>{harvests.data.map((harvest) => <li key={harvest.id}><div className="harvest-recent__date"><span>{dateLabel(harvest)}</span><small>{harvest.buyer ?? "Buyer not recorded"}</small></div><div className="harvest-recent__crop"><strong>{harvest.cropName}</strong>{!harvest.cropActive ? <small>Inactive historical crop</small> : null}</div><div className="harvest-recent__yield"><span>{formatWeight(Number(harvest.netWeightKg ?? 0))}</span><b>{formatINR(harvest.actualRevenuePaise ?? harvest.calculatedRevenuePaise ?? 0)}</b></div>{canWrite ? <div className="harvest-recent__actions"><Button aria-label={`Edit ${harvest.cropName} harvest ${harvest.id}`} onClick={() => openEdit(harvest)} size="icon" variant="ghost"><Edit3 aria-hidden="true" size={16} /></Button><Button aria-label={`Delete ${harvest.cropName} harvest ${harvest.id}`} onClick={() => setDeleting(harvest)} size="icon" variant="ghost"><Trash2 aria-hidden="true" size={16} /></Button></div> : null}</li>)}</ol> : <EmptyState action={canWrite ? <Button onClick={openCreate}>Record the first harvest</Button> : undefined} description="Adjust the filters or record a field sale to begin this ledger." title="No harvest records found" />}</CardContent></Card>

    <Dialog onOpenChange={setEditorOpen} open={canWrite && editorOpen}><DialogContent aria-describedby="harvest-dialog-description" className="harvest-dialog"><DialogTitle>{selected ? "Edit harvest" : "Record harvest"}</DialogTitle><DialogDescription id="harvest-dialog-description">{selected ? "Update this field sale. Calculated revenue refreshes whenever net weight or price changes." : "Capture field yield and sale terms. Revenue is calculated exactly in paise by the server."}</DialogDescription><HarvestForm harvest={selected} key={selected?.id ?? (editorOpen ? "new-open" : "new-closed")} onSaved={() => setEditorOpen(false)} /></DialogContent></Dialog>
    <Dialog onOpenChange={(open) => { if (!open) setDeleting(undefined); }} open={Boolean(deleting)}><DialogContent aria-describedby="harvest-delete-description" className="harvest-delete-dialog"><DialogTitle>Delete harvest record?</DialogTitle><DialogDescription id="harvest-delete-description">This removes the {deleting?.cropName} field sale from harvest and dashboard revenue. The deletion remains in the audit log.</DialogDescription>{remove.isError ? <p role="alert">The harvest could not be deleted. Try again.</p> : null}<div><Button onClick={() => setDeleting(undefined)} variant="secondary">Keep record</Button><Button disabled={remove.isPending} onClick={async () => { if (!deleting) return; await remove.mutateAsync(deleting.id); setDeleting(undefined); }} variant="destructive">{remove.isPending ? "Deleting…" : "Delete harvest"}</Button></div></DialogContent></Dialog>
  </section>;
}

export default HarvestPage;
