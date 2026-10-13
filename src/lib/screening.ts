import type { Condition, ConditionEvaluation, Conflict, MetricKey, Operator, ScreeningResult, StockEvaluation, StockRecord, Strategy } from "./domain";
import { METRICS, formatMetricValue } from "./metrics";
import { DEMO_SNAPSHOT_DATE } from "./demo-data";

function compare(left: number, operator: Operator, right: number): boolean {
  switch (operator) {
    case ">": return left > right;
    case ">=": return left >= right;
    case "<": return left < right;
    case "<=": return left <= right;
  }
}

export function evaluateCondition(stock: StockRecord, condition: Condition): ConditionEvaluation {
  const metric = stock.metrics[condition.metric];
  const definition = METRICS[condition.metric];
  if (metric.status !== "valid" || metric.value === null) {
    return {
      condition, metric, status: "unavailable",
      reason: `${definition.label}无法判断：${metric.note ?? "数据缺失或口径不适用"}`,
    };
  }
  const passed = compare(metric.value, condition.operator, condition.value);
  return {
    condition, metric, status: passed ? "passed" : "failed",
    reason: `${formatMetricValue(condition.metric, metric.value)} ${passed ? "满足" : "不满足"} ${condition.operator} ${condition.value}${definition.unit}`,
  };
}

export function screenStocks(strategy: Strategy, stocks: StockRecord[], now = new Date().toISOString(), snapshotDate = DEMO_SNAPSHOT_DATE): ScreeningResult {
  const enabled = strategy.conditions.filter((condition) => condition.enabled);
  const evaluations: StockEvaluation[] = stocks.map((stock) => {
    const exclusionReasons: string[] = [];
    if (strategy.exclusions.includes("ST") && stock.isST) exclusionReasons.push("已按策略排除 ST 股票");
    if (strategy.exclusions.includes("SUSPENDED") && stock.isSuspended) exclusionReasons.push("已按策略排除停牌股票");
    const unknownFlags = (strategy.exclusions.includes("ST") && stock.isST === null)
      || (strategy.exclusions.includes("SUSPENDED") && stock.isSuspended === null);

    const conditionResults = enabled.map((condition) => evaluateCondition(stock, condition));
    const unavailable = conditionResults.some((item) => item.status === "unavailable");
    const matched = strategy.logic === "AND"
      ? conditionResults.length > 0 && conditionResults.every((item) => item.status === "passed")
      : conditionResults.some((item) => item.status === "passed");

    const definitivelyFailed = enabled.length === 0 || (strategy.logic === "AND"
      ? conditionResults.some((item) => item.status === "failed")
      : !matched && !unavailable);
    // Known failures decide exclusion. Unknown data never passes, even if the legacy
    // MISSING_DATA flag is absent. OR needs just one passed branch.
    const status: StockEvaluation["status"] = exclusionReasons.length > 0 || definitivelyFailed
      ? "excluded" : unknownFlags || !matched ? "unavailable" : "included";
    if (definitivelyFailed) exclusionReasons.push(`未满足当前 ${strategy.logic} 条件组合`);
    if (unknownFlags) exclusionReasons.push("排除条件所需的 ST 或停牌状态缺失，无法判断");
    if (unavailable) exclusionReasons.push(matched ? "部分指标缺失；OR 已有满足分支" : "部分指标缺失，具体见逐条件依据");
    return { stock, status, evaluations: conditionResults, exclusionReasons };
  });

  return {
    strategy, evaluatedAt: now, snapshotDate, total: stocks.length,
    included: evaluations.filter((item) => item.status === "included"),
    excluded: evaluations.filter((item) => item.status === "excluded"),
    unavailable: evaluations.filter((item) => item.status === "unavailable"),
  };
}

export function detectConflicts(conditions: Condition[], logic: Strategy["logic"] = "AND"): Conflict[] {
  const active = conditions.filter((condition) => condition.enabled);
  const conflicts: Conflict[] = [];

  for (const condition of active) {
    const metric = METRICS[condition.metric];
    if (!Number.isFinite(condition.value) || condition.value < metric.min || condition.value > metric.max) {
      conflicts.push({
        type: "error", conditionIds: [condition.id],
        message: `${metric.label}的阈值应在 ${metric.min} 到 ${metric.max}${metric.unit}之间。`,
      });
    }
  }

  const grouped = Object.groupBy(active, (condition) => condition.metric);
  for (const [key, sameMetric] of Object.entries(grouped) as [MetricKey, Condition[] | undefined][]) {
    if (logic === "OR" || !sameMetric || sameMetric.length < 2) continue;
    const lower = sameMetric.filter((item) => item.operator.startsWith(">")).sort((a, b) => b.value - a.value || Number(b.operator === ">") - Number(a.operator === ">"))[0];
    const upper = sameMetric.filter((item) => item.operator.startsWith("<")).sort((a, b) => a.value - b.value || Number(b.operator === "<") - Number(a.operator === "<"))[0];
    const impossibleAtEqualPoint = lower?.value === upper?.value && (lower.operator === ">" || upper.operator === "<");
    if (lower && upper && (lower.value > upper.value || impossibleAtEqualPoint)) {
      conflicts.push({
        type: "error", conditionIds: sameMetric.map((item) => item.id),
        message: `${METRICS[key].label}的上下界互相冲突，当前条件无法同时满足。`,
      });
    }
  }

  if (active.length === 0) {
    conflicts.push({ type: "error", conditionIds: [], message: "至少启用一个筛选条件后才能执行。" });
  }
  return conflicts;
}

export function diffResults(previous: ScreeningResult | null, current: ScreeningResult) {
  if (!previous) return { added: current.included, removed: [] as StockEvaluation[] };
  const before = new Set(previous.included.map((item) => item.stock.symbol));
  const after = new Set(current.included.map((item) => item.stock.symbol));
  return {
    added: current.included.filter((item) => !before.has(item.stock.symbol)),
    removed: previous.included.filter((item) => !after.has(item.stock.symbol)),
  };
}

export function strategyChanges(previous: Strategy, current: Strategy): string[] {
  const describe = (v: Condition) => `${METRICS[v.metric].label} ${v.operator} ${v.value}${METRICS[v.metric].unit}${v.enabled ? "" : "（停用）"}`;
  const changes: string[] = [];
  if (previous.logic !== current.logic) changes.push(`组合逻辑：${previous.logic} → ${current.logic}`);
  const before = new Map(previous.conditions.map((v) => [v.id, v]));
  const after = new Map(current.conditions.map((v) => [v.id, v]));
  for (const v of current.conditions) {
    const old = before.get(v.id);
    if (!old) changes.push(`添加：${describe(v)}`);
    else if (describe(old) !== describe(v)) changes.push(`${describe(old)} → ${describe(v)}`);
  }
  for (const v of previous.conditions) if (!after.has(v.id)) changes.push(`删除：${describe(v)}`);
  if ([...previous.exclusions].sort().join() !== [...current.exclusions].sort().join()) changes.push("状态排除选项已修改");
  return changes;
}
