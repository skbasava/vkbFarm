import {
  getDashboardTotals, getPlantationSummary, listCategoryExpenses, listMonthlyExpenses,
  listRecentExpenses, listRecentHarvests,
} from "../repositories/report-repository";
import type { DateRange } from "../repositories/report-repository";
import { listRecordedSettlements, listSettlementContributions } from "../repositories/settlement-repository";
import { calculateSettlement } from "./settlement-service";

function todayInKolkata(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Composes bounded reporting queries and the reviewed settlement calculation. */
export async function getDashboard(db: D1Database) {
  const today = todayInKolkata();
  const [totals, contributions, settlements, monthlyExpenses, categoryExpenses, recentExpenses, recentHarvests, plantationSummary] = await Promise.all([
    getDashboardTotals(db, today.slice(0, 7), today.slice(0, 4)),
    listSettlementContributions(db),
    listRecordedSettlements(db),
    listMonthlyExpenses(db),
    listCategoryExpenses(db),
    listRecentExpenses(db),
    listRecentHarvests(db),
    getPlantationSummary(db),
  ]);
  return {
    totals,
    contributions: calculateSettlement({ contributions, settlements }),
    monthlyExpenses,
    categoryExpenses,
    recentExpenses,
    recentHarvests,
    plantationSummary,
  };
}

/** Reuses the reviewed settlement engine for a date-bounded report slice. */
export async function getContributionReport(db: D1Database, range: DateRange) {
  const [contributions, settlements] = await Promise.all([
    listSettlementContributions(db, range),
    listRecordedSettlements(db, range),
  ]);
  return calculateSettlement({ contributions, settlements });
}

export function reportExportDate(): string {
  return todayInKolkata();
}
