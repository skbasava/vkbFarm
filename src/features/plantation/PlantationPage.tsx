import { CirclePlus, Sprout } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { canManageExpenses, useIdentity } from "../../lib/identity";
import { PlantationForm } from "./PlantationForm";
import { PlantationMatrix } from "./PlantationMatrix";
import { usePlantationSummary } from "./api";

export function PlantationPage() {
  const [open, setOpen] = useState(false);
  const [cropId, setCropId] = useState<string>();
  const summary = usePlantationSummary();
  const identity = useIdentity();
  const canWrite = canManageExpenses(identity.data);
  const openForm = (nextCropId?: string) => { setCropId(nextCropId); setOpen(true); };
  const add = canWrite ? <Button onClick={() => openForm()}><CirclePlus aria-hidden="true" size={17} /> Add plantation</Button> : undefined;
  return <section className="plantation-page"><div className="plantation-page__heading"><div className="page-intro"><span><Sprout aria-hidden="true" size={14} /> Field inventory · live count</span><h2>Plantation</h2><p>See every active crop across MT, SK, and the farm areas you add next.</p></div>{add}</div>{summary.isLoading ? <div aria-label="Loading plantation inventory" className="plantation-loading"><Skeleton /><Skeleton /></div> : summary.isError ? <ErrorState action={<Button onClick={() => void summary.refetch()} variant="secondary">Try again</Button>} title="We could not load plantation inventory" /> : summary.data?.rows.length ? <><div className="plantation-page__signal"><span>Total standing plants</span><strong>{summary.data.totalQuantity}</strong><p>{summary.data.areas.length} active farm areas · totals calculated from the recorded cohorts</p></div><PlantationMatrix canWrite={canWrite} onEdit={openForm} summary={summary.data} /></> : <EmptyState action={add} description={canWrite ? "Record the first crop cohort to start the live farm inventory." : "Plantation inventory will appear here once a farm editor records a crop cohort."} title="No plantation records yet" />}
    <Dialog onOpenChange={setOpen} open={open}><DialogContent aria-describedby="plantation-dialog-description" className="plantation-dialog"><DialogTitle>Record plantation</DialogTitle><DialogDescription id="plantation-dialog-description">Enter one crop cohort for a farm area. Planting dates keep repeated crops distinct.</DialogDescription><PlantationForm cropId={cropId} onSaved={() => setOpen(false)} /></DialogContent></Dialog>
  </section>;
}

export default PlantationPage;
