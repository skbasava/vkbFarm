import { AlertCircle, Calculator } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { ApiError } from "../../lib/api-client";
import { useCreateHarvest, useHarvestCrops, useUpdateHarvest, type Harvest, type HarvestInput } from "./api";
import { HarvestFormSchema, type HarvestFormValues } from "./schema";

function todayInKolkata(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function rupeesFromPaise(paise: number | null): string {
  if (paise === null) return "";
  const exact = BigInt(paise);
  const whole = exact / 100n;
  const fraction = String(exact % 100n).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function initialValues(harvest?: Harvest): HarvestFormValues {
  const hasOverride = harvest?.actualRevenuePaise !== harvest?.calculatedRevenuePaise;
  return {
    cropId: harvest?.cropId ?? "",
    harvestDate: harvest ? harvest.harvestDate ?? "" : todayInKolkata(),
    quantity: harvest?.quantity ?? "",
    grossWeightKg: harvest?.grossWeightKg ?? "",
    netWeightKg: harvest?.netWeightKg ?? "",
    averageWeightKg: harvest?.averageWeightKg ?? "",
    salePricePerKg: rupeesFromPaise(harvest?.salePricePaisePerKg ?? null),
    actualRevenue: hasOverride ? rupeesFromPaise(harvest?.actualRevenuePaise ?? null) : "",
    revenueOverrideReason: harvest?.revenueOverrideReason ?? "",
    buyer: harvest?.buyer ?? "",
    notes: harvest?.notes ?? "",
  };
}

function optional(value: string): string | undefined {
  return value.trim() || undefined;
}

export function HarvestForm({ harvest, onSaved }: { harvest?: Harvest; onSaved: () => void }) {
  const [values, setValues] = useState(() => initialValues(harvest));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>();
  const crops = useHarvestCrops();
  const create = useCreateHarvest();
  const update = useUpdateHarvest(harvest?.id ?? "");
  const retainUnavailableDate = Boolean(harvest?.source === "EXCEL" && harvest.harvestDate === null && !values.harvestDate);

  const set = (field: keyof HarvestFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(undefined);
    const parsed = HarvestFormSchema.safeParse({ ...values, harvestDate: retainUnavailableDate ? "2000-01-01" : values.harvestDate });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }

    const payload: HarvestInput = {
      cropId: values.cropId,
      harvestDate: values.harvestDate,
      netWeightKg: values.netWeightKg,
      salePricePerKg: values.salePricePerKg,
      ...(optional(values.quantity) ? { quantity: values.quantity } : {}),
      ...(optional(values.grossWeightKg) ? { grossWeightKg: values.grossWeightKg } : {}),
      ...(optional(values.averageWeightKg) ? { averageWeightKg: values.averageWeightKg } : {}),
      ...(optional(values.actualRevenue) ? { actualRevenue: values.actualRevenue } : {}),
      revenueOverrideReason: optional(values.revenueOverrideReason) ?? null,
      buyer: optional(values.buyer) ?? null,
      notes: optional(values.notes) ?? null,
    };

    try {
      if (harvest) {
        await update.mutateAsync({
          ...payload,
          harvestDate: retainUnavailableDate ? null : values.harvestDate,
          quantity: optional(values.quantity) ?? null,
          grossWeightKg: optional(values.grossWeightKg) ?? null,
          averageWeightKg: optional(values.averageWeightKg) ?? null,
          ...(!values.actualRevenue && harvest.actualRevenuePaise !== harvest.calculatedRevenuePaise ? { actualRevenue: null } : {}),
        });
      } else {
        await create.mutateAsync(payload);
      }
      onSaved();
    } catch (reason) {
      setSubmitError(reason instanceof ApiError ? reason.message : "Could not save the harvest record");
    }
  };

  const pending = harvest ? update.isPending : create.isPending;
  const options = crops.data?.filter((crop) => crop.active || crop.id === values.cropId) ?? [];
  return <form className="harvest-form" noValidate onSubmit={submit}>
    <div className="harvest-form__grid">
      <label className="field"><span className="field__label">Crop</span><select aria-invalid={Boolean(errors.cropId)} className="field__input" onChange={(event) => set("cropId", event.target.value)} value={values.cropId}><option value="">Select crop</option>{options.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}{crop.active ? "" : " (inactive)"}</option>)}</select>{errors.cropId ? <span className="field__error">{errors.cropId}</span> : null}</label>
      <Field error={errors.harvestDate} hint={retainUnavailableDate ? "Unavailable in this imported Excel record. Add a date only if it can be verified." : undefined} label="Harvest date" onChange={(event) => set("harvestDate", event.target.value)} type="date" value={values.harvestDate} />
      <Field error={errors.quantity} inputMode="decimal" label="Quantity" min="0" onChange={(event) => set("quantity", event.target.value)} step="0.001" type="number" value={values.quantity} />
      <Field error={errors.netWeightKg} inputMode="decimal" label="Net weight (kg)" min="0" onChange={(event) => set("netWeightKg", event.target.value)} required step="0.001" type="number" value={values.netWeightKg} />
      <Field error={errors.grossWeightKg} inputMode="decimal" label="Gross weight (kg)" min="0" onChange={(event) => set("grossWeightKg", event.target.value)} step="0.001" type="number" value={values.grossWeightKg} />
      <Field error={errors.averageWeightKg} inputMode="decimal" label="Average weight (kg)" min="0" onChange={(event) => set("averageWeightKg", event.target.value)} step="0.001" type="number" value={values.averageWeightKg} />
    </div>
    <div className="harvest-form__revenue">
      <div className="harvest-form__revenue-heading"><Calculator aria-hidden="true" size={18} /><div><strong>Revenue calculation</strong><span>Net weight × price is rounded half-up to one paise by the server.</span></div></div>
      <div className="harvest-form__grid">
        <Field error={errors.salePricePerKg} inputMode="decimal" label="Sale price (₹ per kg)" min="0" onChange={(event) => set("salePricePerKg", event.target.value)} required step="0.01" type="number" value={values.salePricePerKg} />
        <Field error={errors.actualRevenue} hint="Leave blank to use calculated revenue." inputMode="decimal" label="Actual revenue (₹)" min="0" onChange={(event) => set("actualRevenue", event.target.value)} step="0.01" type="number" value={values.actualRevenue} />
      </div>
      <label className="field"><span className="field__label">Override reason <em>required when actual revenue differs</em></span><textarea className="field__input harvest-form__notes" maxLength={500} onChange={(event) => set("revenueOverrideReason", event.target.value)} value={values.revenueOverrideReason} /></label>
    </div>
    <div className="harvest-form__grid"><Field error={errors.buyer} label="Buyer" maxLength={250} onChange={(event) => set("buyer", event.target.value)} value={values.buyer} /><label className="field"><span className="field__label">Notes</span><textarea className="field__input harvest-form__notes" maxLength={1000} onChange={(event) => set("notes", event.target.value)} value={values.notes} /></label></div>
    {submitError ? <p className="harvest-form__error" role="alert"><AlertCircle aria-hidden="true" size={16} />{submitError}</p> : null}
    <div className="harvest-form__actions"><Button disabled={pending || crops.isLoading} type="submit">{pending ? "Saving…" : harvest ? "Save harvest changes" : "Record harvest"}</Button></div>
  </form>;
}
