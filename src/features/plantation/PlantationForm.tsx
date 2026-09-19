import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { ApiError } from "../../lib/api-client";
import { useCreatePlantation, useFarmAreas, usePlantationCrops, useUpdatePlantation, type PlantationCohort } from "./api";

function todayInKolkata() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

function initialValues(cohort?: PlantationCohort) {
  return { cropId: cohort?.cropId ?? "", farmAreaId: cohort?.farmAreaId ?? "", quantity: cohort ? String(cohort.quantity) : "", plantingDate: cohort ? cohort.plantingDate ?? "" : todayInKolkata(), notes: cohort?.notes ?? "" };
}

export function PlantationForm({ cohort, onSaved }: { cohort?: PlantationCohort; onSaved: () => void }) {
  const [values, setValues] = useState(() => initialValues(cohort));
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"cropId" | "farmAreaId" | "plantingDate" | "quantity", string>>>({});
  const crops = usePlantationCrops();
  const areas = useFarmAreas();
  const create = useCreatePlantation();
  const update = useUpdatePlantation(cohort?.id ?? "");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(values.quantity);
    const retainUnavailableDate = Boolean(cohort && cohort.plantingDate === null && !values.plantingDate);
    const nextFieldErrors = {
      cropId: values.cropId ? undefined : "Choose a crop.",
      farmAreaId: values.farmAreaId ? undefined : "Choose a farm area.",
      quantity: Number.isInteger(quantity) && quantity >= 0 && values.quantity !== "" ? undefined : "Enter a valid whole quantity.",
      plantingDate: values.plantingDate || retainUnavailableDate ? undefined : "Choose a planting date.",
    };
    if (Object.values(nextFieldErrors).some(Boolean)) { setFieldErrors(nextFieldErrors); setError("Choose a crop, area, valid whole quantity, and planting date."); return; }
    setFieldErrors({});
    const base = { cropId: values.cropId, farmAreaId: values.farmAreaId, quantity, notes: values.notes || null };
    try {
      if (cohort) await update.mutateAsync({ ...base, plantingDate: values.plantingDate || null });
      else await create.mutateAsync({ ...base, plantingDate: values.plantingDate });
      onSaved();
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Could not save plantation record"); }
  };
  const isPending = cohort ? update.isPending : create.isPending;
  return <form className="plantation-form" noValidate onSubmit={submit}><div className="plantation-form__grid"><div className="field"><label className="field__label" htmlFor="plantation-crop">Crop</label><select aria-describedby={fieldErrors.cropId ? "plantation-crop-error" : undefined} aria-invalid={Boolean(fieldErrors.cropId)} className="field__input" id="plantation-crop" onChange={(event) => { setValues({ ...values, cropId: event.target.value }); setFieldErrors((current) => ({ ...current, cropId: undefined })); }} value={values.cropId}><option value="">Select crop</option>{crops.data?.filter((crop) => crop.active || crop.id === values.cropId).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select>{fieldErrors.cropId ? <span className="field__error" id="plantation-crop-error">{fieldErrors.cropId}</span> : null}</div><div className="field"><label className="field__label" htmlFor="plantation-area">Farm area</label><select aria-describedby={fieldErrors.farmAreaId ? "plantation-area-error" : undefined} aria-invalid={Boolean(fieldErrors.farmAreaId)} className="field__input" id="plantation-area" onChange={(event) => { setValues({ ...values, farmAreaId: event.target.value }); setFieldErrors((current) => ({ ...current, farmAreaId: undefined })); }} value={values.farmAreaId}><option value="">Select area</option>{areas.data?.filter((area) => area.active || area.id === values.farmAreaId).map((area) => <option key={area.id} value={area.id}>{area.code} · {area.name}</option>)}</select>{fieldErrors.farmAreaId ? <span className="field__error" id="plantation-area-error">{fieldErrors.farmAreaId}</span> : null}</div><Field error={fieldErrors.quantity} inputMode="numeric" label="Quantity" min="0" onChange={(event) => { setValues({ ...values, quantity: event.target.value }); setFieldErrors((current) => ({ ...current, quantity: undefined })); }} type="number" value={values.quantity} /><Field error={fieldErrors.plantingDate} hint={cohort?.plantingDate === null ? "Unavailable in the imported record. Choose a date only if you can confirm it." : undefined} label="Planting date" onChange={(event) => { setValues({ ...values, plantingDate: event.target.value }); setFieldErrors((current) => ({ ...current, plantingDate: undefined })); }} type="date" value={values.plantingDate} /></div><label className="field"><span className="field__label">Notes <em>optional</em></span><textarea className="field__input plantation-form__notes" onChange={(event) => setValues({ ...values, notes: event.target.value })} value={values.notes} /></label>{error ? <p className="plantation-form__error" role="alert"><AlertCircle aria-hidden="true" size={16} />{error}</p> : null}<div className="plantation-form__actions"><Button disabled={isPending || crops.isLoading || areas.isLoading} type="submit">{isPending ? "Saving…" : cohort ? "Save cohort changes" : "Record cohort"}</Button></div></form>;
}
