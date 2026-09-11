type QueryFilters = Record<string, boolean | number | string | undefined>;

export const queryKeys = {
  identity: ["identity"] as const,
  dashboard: ["dashboard"] as const,
  people: ["people"] as const,
  categories: ["categories"] as const,
  expenses: (filters: QueryFilters = {}) => ["expenses", filters] as const,
  expenseContributionReport: ["reports", "contributions"] as const,
  expenseCashflowReport: ["reports", "cashflow"] as const,
  settlements: ["settlements"] as const,
  plantation: ["plantation"] as const,
  harvests: (filters: QueryFilters = {}) => ["harvests", filters] as const,
  reports: (filters: QueryFilters = {}) => ["reports", filters] as const,
};
