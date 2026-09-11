import { Hono } from "hono";
import { ApiHttpError } from "../middleware/errors";
import {
  getCashflowReport, listExpenseReport, listHarvestReport, listPlantationReport, listSettlementReport,
  type DateRange,
} from "../repositories/report-repository";
import { getContributionReport, reportExportDate } from "../services/report-service";
import type { AppEnv } from "../types";
import { csvResponse } from "../utils/csv";
import { isIsoLocalDate } from "../utils/dates";

function parseRange(url: string): DateRange {
  const params = new URL(url).searchParams;
  const dateFrom = params.get("dateFrom") ?? undefined;
  const dateTo = params.get("dateTo") ?? undefined;
  if ((dateFrom && !isIsoLocalDate(dateFrom)) || (dateTo && !isIsoLocalDate(dateTo))) {
    throw new ApiHttpError(422, "VALIDATION_ERROR", "date filters must be valid ISO local dates");
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ApiHttpError(422, "VALIDATION_ERROR", "dateFrom must not be after dateTo");
  }
  return { ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) };
}

function rupees(amountPaise: number): number {
  return amountPaise / 100;
}

function* expenseRows(rows: Awaited<ReturnType<typeof listExpenseReport>>) {
  for (const row of rows) yield [row.expenseDate, row.description, row.categoryName, row.expenseClass, row.paidByPersonName, row.paidTo, rupees(row.amountPaise), row.isShared ? "Yes" : "No", row.notes];
}

function* settlementRows(rows: Awaited<ReturnType<typeof listSettlementReport>>) {
  for (const row of rows) yield [row.settlementDate, row.fromPersonName, row.toPersonName, rupees(row.amountPaise), row.remarks];
}

function* plantationRows(rows: Awaited<ReturnType<typeof listPlantationReport>>) {
  for (const row of rows) yield [row.cropName, row.areaCode, row.areaName, row.quantity, row.plantingDate ?? "Date unavailable", row.notes];
}

function* harvestRows(rows: Awaited<ReturnType<typeof listHarvestReport>>) {
  for (const row of rows) yield [row.harvestDate ?? "Date unavailable", row.cropName, row.quantity, rupees(row.revenuePaise), row.buyer, row.notes];
}

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.get("/expenses", async (c) => c.json({ data: await listExpenseReport(c.env.DB, parseRange(c.req.url)) }));
reportRoutes.get("/contributions", async (c) => c.json({ data: await getContributionReport(c.env.DB, parseRange(c.req.url)) }));
reportRoutes.get("/harvest", async (c) => c.json({ data: await listHarvestReport(c.env.DB, parseRange(c.req.url)) }));
reportRoutes.get("/cashflow", async (c) => c.json({ data: await getCashflowReport(c.env.DB, parseRange(c.req.url)) }));

reportRoutes.get("/export/:type", async (c) => {
  const range = parseRange(c.req.url);
  const type = c.req.param("type");
  const date = reportExportDate();
  if (type === "expenses") {
    const rows = await listExpenseReport(c.env.DB, range);
    return csvResponse("expenses", ["Expense Date", "Description", "Category", "Class", "Paid By", "Paid To", "Amount (INR)", "Shared", "Notes"], expenseRows(rows), date);
  }
  if (type === "settlements") {
    const rows = await listSettlementReport(c.env.DB, range);
    return csvResponse("settlements", ["Settlement Date", "From", "To", "Amount (INR)", "Remarks"], settlementRows(rows), date);
  }
  if (type === "plantation") {
    const rows = await listPlantationReport(c.env.DB, range);
    return csvResponse("plantation", ["Crop", "Area Code", "Area", "Quantity", "Planting Date", "Notes"], plantationRows(rows), date);
  }
  if (type === "harvest") {
    const rows = await listHarvestReport(c.env.DB, range);
    return csvResponse("harvest", ["Harvest Date", "Crop", "Quantity", "Revenue (INR)", "Buyer", "Notes"], harvestRows(rows), date);
  }
  throw new ApiHttpError(404, "REPORT_EXPORT_NOT_FOUND", "The requested report export was not found");
});
