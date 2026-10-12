import type { MetricKey } from "./domain";

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  category: "growth" | "valuation" | "quality" | "market";
  description: string;
  min: number;
  max: number;
  step: number;
  defaultOperator: ">" | "<";
  defaultValue: number;
}

export const METRICS: Record<MetricKey, MetricDefinition> = {
  net_profit_yoy: {
    key: "net_profit_yoy", label: "归母净利润同比", shortLabel: "利润同比", unit: "%",
    category: "growth", description: "最新报告期归母净利润较上年同期的变化率", min: -100, max: 500, step: 1,
    defaultOperator: ">", defaultValue: 20,
  },
  revenue_yoy: {
    key: "revenue_yoy", label: "营业收入同比", shortLabel: "营收同比", unit: "%",
    category: "growth", description: "最新报告期营业收入较上年同期的变化率", min: -100, max: 500, step: 1,
    defaultOperator: ">", defaultValue: 10,
  },
  roe: {
    key: "roe", label: "净资产收益率（ROE）", shortLabel: "ROE", unit: "%",
    category: "quality", description: "最新报告期加权平均净资产收益率", min: -100, max: 100, step: 0.5,
    defaultOperator: ">", defaultValue: 10,
  },
  pe_ttm: {
    key: "pe_ttm", label: "市盈率（PE-TTM）", shortLabel: "PE-TTM", unit: "倍",
    category: "valuation", description: "总市值除以最近十二个月归母净利润", min: 0, max: 500, step: 1,
    defaultOperator: "<", defaultValue: 30,
  },
  pb: {
    key: "pb", label: "市净率（PB）", shortLabel: "PB", unit: "倍",
    category: "valuation", description: "总市值除以归属于母公司股东权益", min: 0, max: 100, step: 0.1,
    defaultOperator: "<", defaultValue: 4,
  },
  market_cap: {
    key: "market_cap", label: "总市值", shortLabel: "总市值", unit: "亿元",
    category: "market", description: "按数据日收盘价计算的总市值", min: 0, max: 100000, step: 10,
    defaultOperator: ">", defaultValue: 100,
  },
  return_60d: {
    key: "return_60d", label: "近 60 日涨跌幅", shortLabel: "60日涨跌", unit: "%",
    category: "market", description: "最近 60 个交易日复权收盘价涨跌幅", min: -100, max: 1000, step: 1,
    defaultOperator: ">", defaultValue: 0,
  },
  volatility_60d: {
    key: "volatility_60d", label: "近 60 日年化波动率", shortLabel: "60日波动", unit: "%",
    category: "market", description: "最近 60 个交易日日收益率标准差乘以 √252", min: 0, max: 300, step: 1,
    defaultOperator: "<", defaultValue: 30,
  },
};

export const METRIC_LIST = Object.values(METRICS);

export function formatMetricValue(key: MetricKey, value: number | null) {
  if (value === null) return "--";
  const digits = key === "market_cap" ? 0 : 1;
  return `${value.toFixed(digits)}${METRICS[key].unit}`;
}
