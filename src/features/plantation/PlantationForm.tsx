import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { ApiError } from "../../lib/api-client";
import { useCreatePlantation, useFarmAreas, usePlantationCrops } from "./api";

function todayInKolkata() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export function PlantationForm({ cropId, onSaved }: { cropId?: string; onSaved: () => void }) {
  const [values, setValues] = useState({ cropId: cropId ?? "", farmAreaId: "", quantity: "", plantingDate: todayInKolkata(), notes: "" });
  const [error, setError] = useState<string>();
  const crops = usePlantationCrops();
  const areas = useFarmAreas();
  const create = useCreatePlantation();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(values.quantity);
    if (!values.cropId || !values.farmAreaId || !Number.isInteger(quantity) || quantity < 0 || !values.plantingDate) { setError("Choose a crop, area, valid whole quantity, and planting date."); return; }
    try { await create.mutateAsync({ cropId: values.cropId, farmAreaId: values.farmAreaId, quantity, plantingDate: values.plantingDate, notes: values.notes || null }); onSaved(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Could not save plantation record"); }
  };
  return <form className="plantation-form" noValidate onSubmit={submit}><div className="plantation-form__grid"><label className="field"><span className="field__label">Crop</span><select aria-label="Crop" className="field__input" onChange={(event) => setValues({ ...values, cropId: event.target.value })} value={values.cropId}><option value="">Select crop</option>{crops.data?.filter((crop) => crop.active).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></label><label className="field"><span className="field__label">Farm area</span><select aria-label="Farm area" className="field__input" onChange={(event) => setValues({ ...values, farmAreaId: event.target.value })} value={values.farmAreaId}><option value="">Select area</option>{areas.data?.filter((area) => area.active).map((area) => <option key={area.id} value={area.id}>{area.code} · {area.name}</option>)}</select></label><Field inputMode="numeric" label="Quantity" min="0" onChange={(event) => setValues({ ...values, quantity: event.target.value })} type="number" value={values.quantity} /><Field label="Planting date" onChange={(event) => setValues({ ...values, plantingDate: event.target.value })} type="date" value={values.plantingDate} /></div><label className="field"><span className="field__label">Notes <em>optional</em></span><textarea className="field__input plantation-form__notes" onChange={(event) => setValues({ ...values, notes: event.target.value })} value={values.notes} /></label>{error ? <p className="plantation-form__error" role="alert"><AlertCircle aria-hidden="true" size={16} />{error}</p> : null}<div className="plantation-form__actions"><Button disabled={create.isPending || crops.isLoading || areas.isLoading} type="submit">{create.isPending ? "Saving…" : "Save plantation"}</Button></div></form>;
}
