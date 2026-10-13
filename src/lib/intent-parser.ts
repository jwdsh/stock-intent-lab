import type { Clarification, Condition, MetricKey, ParseResult, Strategy } from "./domain";

const forbiddenPatterns = [
  /一定(涨|赚钱|盈利)/, /保证(收益|赚钱|盈利)/, /稳赚/, /必涨/, /涨停/, /直接.*(买|卖)/,
];

const makeCondition = (metric: MetricKey, operator: Condition["operator"], value: number): Condition => ({
  id: `${metric}-${crypto.randomUUID()}`,
  metric, operator, value, enabled: true,
});

function explicitNumber(query: string, pattern: RegExp): number | undefined {
  const match = query.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function explicitOperator(query: string, metricPattern: RegExp, fallback: Condition["operator"]): Condition["operator"] {
  const clause = query.match(metricPattern)?.[0] ?? "";
  if (/不超过|不高于|至多|<=|≤/.test(clause)) return "<=";
  if (/不少于|不低于|至少|>=|≥/.test(clause)) return ">=";
  if (/低于|小于|少于|</.test(clause)) return "<";
  if (/超过|高于|大于|>/.test(clause)) return ">";
  return fallback;
}

export function parseIntent(query: string): ParseResult {
  const normalized = query.trim();
  const compliance = forbiddenPatterns.some((pattern) => pattern.test(normalized));
  const conditions: Condition[] = [];
  const clarifications: Clarification[] = [];

  const profitValue = explicitNumber(normalized, /(?:净利润|利润).*?(?:增长|同比)?[^\d]*(\d+(?:\.\d+)?)\s*%/);
  const peValue = explicitNumber(normalized, /(?:PE|市盈率)[^\d]*(\d+(?:\.\d+)?)/i);
  const volatilityValue = explicitNumber(normalized, /(?:波动率|波动)[^\d]*(\d+(?:\.\d+)?)\s*%/);

  if (/经营改善|利润增长|净利润|盈利改善/.test(normalized)) {
    conditions.push(makeCondition("net_profit_yoy", explicitOperator(normalized, /(?:净利润|利润)[^，,；;。]*/, ">"), profitValue ?? 20));
    if (profitValue === undefined) clarifications.push({ term: "经营改善", message: "该表达没有唯一财务定义。", resolvedAs: "默认按最新报告期归母净利润同比 > 20%" });
  }
  if (/营收|收入增长/.test(normalized)) conditions.push(makeCondition("revenue_yoy", ">", 10));
  if (/估值合理|低估值|便宜|市盈率|\bPE\b/i.test(normalized)) {
    conditions.push(makeCondition("pe_ttm", explicitOperator(normalized, /(?:PE|市盈率)[^，,；;。]*/i, "<"), peValue ?? 30));
    if (peValue === undefined) clarifications.push({ term: "估值合理", message: "估值需要指定指标和比较口径。", resolvedAs: "默认按 PE-TTM < 30 倍" });
  }
  if (/稳定|低波动|波动率/.test(normalized)) {
    conditions.push(makeCondition("volatility_60d", explicitOperator(normalized, /(?:波动率|波动)[^，,；;。]*/, "<"), volatilityValue ?? 30));
    if (volatilityValue === undefined) clarifications.push({ term: "走势稳定", message: "稳定可由波动率或最大回撤衡量。", resolvedAs: "默认按近 60 日年化波动率 < 30%" });
  }
  if (/大盘股|大市值/.test(normalized)) {
    conditions.push(makeCondition("market_cap", ">", 500));
    clarifications.push({ term: "大盘股", message: "大盘股没有统一绝对阈值。", resolvedAs: "默认按总市值 > 500 亿元" });
  }
  if (/走势好|表现好|上涨|涨幅/.test(normalized) && !compliance) {
    conditions.push(makeCondition("return_60d", ">", 0));
    clarifications.push({ term: "近期表现", message: "需要明确观察窗口。", resolvedAs: "默认按近 60 日涨跌幅 > 0%" });
  }

  if (conditions.length === 0) {
    conditions.push(makeCondition("net_profit_yoy", ">", 20));
    clarifications.push({ term: "选股意图", message: "未识别出当前支持的量化指标。", resolvedAs: "已提供利润同比条件作为可编辑起点" });
  }

  const strategy: Strategy = {
    id: crypto.randomUUID(),
    name: "自然语言策略",
    originalQuery: normalized,
    logic: "AND",
    conditions,
    exclusions: ["ST", "SUSPENDED", "MISSING_DATA"],
  };

  return {
    strategy,
    clarifications,
    unsupportedTerms: [],
    complianceMessage: compliance
      ? "无法提供确定性涨跌预测、收益承诺或直接买卖建议。已将请求转换为可验证的历史数据筛选起点。"
      : undefined,
    mode: "local",
  };
}
