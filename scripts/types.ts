export type NormalizationChange = {
  sheet: string;
  row: number;
  field: string;
  from: unknown;
  to: unknown;
  rule: string;
};

export type ImportIssue = {
  code: string;
  severity: "warning" | "error";
  entity: "expense" | "plantation" | "harvest" | "workbook";
  sheet: string;
  row: number;
  reason: string;
  raw: Record<string, unknown>;
};

export type SourceCell = { sheet: string; row: number; column: string };

export type NormalizedCategory = {
  id: string;
  name: string;
  normalizedName: string;
};

export type NormalizedExpense = {
  id: string;
  expenseDate: string;
  description: string;
  amountPaise: number;
  paidByPersonId: "person_satish" | "person_mahesh";
  categoryId: string;
  categoryName: string;
  paidTo: string | null;
  notes: string | null;
  source: "EXCEL";
  sourceSheet: "Common Expense";
  sourceRow: number;
  importFingerprint: string;
};

export type NormalizedPlantation = {
  id: string;
  cropId: string;
  cropName: string;
  farmAreaId: "area_mt" | "area_sk";
  quantity: number;
  sources: SourceCell[];
  source: "EXCEL";
  sourceSheet: "Plantation Details";
  sourceRow: number;
  importFingerprint: string;
};

export type FormulaCache = { formula: string; value: number };

export type NormalizedHarvest = {
  id: string;
  cropId: string;
  harvestDate: null;
  quantity: string;
  grossWeightKg: string | null;
  netWeightKg: string;
  averageWeightKg: null;
  salePricePaisePerKg: number;
  calculatedRevenuePaise: number;
  actualRevenuePaise: number;
  formulaCache: FormulaCache | null;
  source: "EXCEL";
  sourceSheet: "Banana Harvest Details";
  sourceRow: number;
  importFingerprint: string;
};

export type ImportPlan = {
  expenses: NormalizedExpense[];
  plantation: NormalizedPlantation[];
  harvests: NormalizedHarvest[];
  categories: NormalizedCategory[];
  changes: NormalizationChange[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
  discovered: Record<string, number>;
  duplicates: number;
  sourceFile: string;
  sourceChecksum: string;
};

export type SqlStatement = { sql: string; params?: Array<string | number | null> };

export interface ImportDatabase {
  readonly persistTo: string;
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: Array<string | number | null>): Promise<T[]>;
  batch(statements: SqlStatement[]): Promise<void>;
}
