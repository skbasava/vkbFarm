import { Pencil } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { PlantationCohort, PlantationSummary } from "./api";

type PlantationMatrixProps = { summary: PlantationSummary; onEdit: (cohort: PlantationCohort) => void; canWrite: boolean };

export function PlantationMatrix({ summary, onEdit, canWrite }: PlantationMatrixProps) {
  return <>
    <div className="plantation-matrix-wrap"><table className="plantation-matrix"><caption>Plantation inventory by crop and farm area</caption><thead><tr><th scope="col">Crop</th>{summary.areas.map((area) => <th key={area.id} scope="col">{area.code}</th>)}<th scope="col">Total</th></tr></thead><tbody>{summary.rows.map((row) => <tr key={row.cropId}><th scope="row">{row.cropName}</th>{summary.areas.map((area) => <td key={area.id}>{row.quantities[area.id] ?? 0}</td>)}<td><strong>{row.totalQuantity}</strong></td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th>{summary.areas.map((area) => <td key={area.id}><strong>{summary.areaTotals[area.id] ?? 0}</strong></td>)}<td><strong>{summary.totalQuantity}</strong></td></tr></tfoot></table></div>
    <div className="plantation-cards" aria-label="Plantation crop cards">{summary.rows.map((row) => <article className="plantation-card" key={row.cropId}><header><h3>{row.cropName}</h3><strong>{row.totalQuantity}<small> plants</small></strong></header><dl>{summary.areas.map((area) => <div key={area.id}><dt>{area.code}</dt><dd>{row.quantities[area.id] ?? 0}</dd></div>)}</dl></article>)}</div>
    <section aria-label="Plantation cohorts" className="plantation-cohorts"><h3>Recorded cohorts</h3><ul>{summary.cohorts.map((cohort) => <li key={cohort.id}><div><strong>{cohort.cropName}</strong><span>{cohort.farmAreaCode} · {cohort.plantingDate ?? "Date unavailable"} · {cohort.quantity} plants · ID {cohort.id}</span></div>{canWrite ? <Button aria-label={`Edit ${cohort.cropName} cohort ${cohort.id}`} onClick={() => onEdit(cohort)} size="compact" variant="secondary"><Pencil aria-hidden="true" size={14} /> Edit cohort</Button> : null}</li>)}</ul></section>
  </>;
}
