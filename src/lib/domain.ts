import { z } from "zod";

export const metricKeySchema = z.enum([
  "net_profit_yoy",
  "revenue_yoy",
  "roe",
  "pe_ttm",
  "pb",
  "market_cap",
  "return_60d",
  "volatility_60d",
]);

export const operatorSchema = z.enum([">", ">=", "<", "<="]);

export const conditionSchema = z.object({
  id: z.string().min(1),
  metric: metricKeySchema,
  operator: operatorSchema,
  value: z.number().finite(),
  enabled: z.boolean().default(true),
});

export const strategySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  originalQuery: z.string(),
  logic: z.enum(["AND", "OR"]),
  conditions: z.array(conditionSchema).min(1),
  exclusions: z.array(z.enum(["ST", "SUSPENDED", "MISSING_DATA"])),
});

export type MetricKey = z.infer<typeof metricKeySchema>;
export type Operator = z.infer<typeof operatorSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Strategy = z.infer<typeof strategySchema>;
export type DataStatus = "valid" | "missing" | "not_applicable" | "stale";

export interface MetricValue {
  value: number | null;
  unit: string;
  asOf: string;
  period: string;
  source: string;
  status: DataStatus;
  note?: string;
}

export interface StockRecord {
  symbol: string;
  name: string;
  industry: string;
  isST: boolean;
  isSuspended: boolean;
  metrics: Record<MetricKey, MetricValue>;
}

export type MatchStatus = "passed" | "failed" | "unavailable";

export interface ConditionEvaluation {
  condition: Condition;
  metric: MetricValue;
  status: MatchStatus;
  reason: string;
}

export interface StockEvaluation {
  stock: StockRecord;
  status: "included" | "excluded" | "unavailable";
  evaluations: ConditionEvaluation[];
  exclusionReasons: string[];
}

export interface ScreeningResult {
  strategy: Strategy;
  evaluatedAt: string;
  snapshotDate: string;
  total: number;
  included: StockEvaluation[];
  excluded: StockEvaluation[];
  unavailable: StockEvaluation[];
}

export interface Conflict {
  type: "error" | "warning";
  conditionIds: string[];
  message: string;
}

export interface Clarification {
  term: string;
  message: string;
  resolvedAs: string;
}

export interface ParseResult {
  strategy: Strategy;
  clarifications: Clarification[];
  unsupportedTerms: string[];
  complianceMessage?: string;
  mode: "local" | "ai";
  providerNote?: string;
}
