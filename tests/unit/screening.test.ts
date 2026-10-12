import { describe, expect, it } from "vitest";
import type { Condition, Strategy } from "@/lib/domain";
import { DEMO_STOCKS } from "@/lib/demo-data";
import { detectConflicts, diffResults, evaluateCondition, screenStocks } from "@/lib/screening";

const condition = (overrides: Partial<Condition> = {}): Condition => ({
  id: "condition-1", metric: "net_profit_yoy", operator: ">", value: 20, enabled: true, ...overrides,
});

const strategy = (conditions: Condition[], logic: Strategy["logic"] = "AND"): Strategy => ({
  id: "test-strategy", name: "测试策略", originalQuery: "测试", logic, conditions,
  exclusions: ["ST", "SUSPENDED", "MISSING_DATA"],
});

describe("evaluateCondition", () => {
  it("evaluates strict boundaries deterministically", () => {
    const stock = structuredClone(DEMO_STOCKS[0]);
    stock.metrics.net_profit_yoy.value = 20;
    expect(evaluateCondition(stock, condition()).status).toBe("failed");
    expect(evaluateCondition(stock, condition({ operator: ">=" })).status).toBe("passed");
  });

  it("distinguishes missing data from a failed condition", () => {
    const evaluation = evaluateCondition(DEMO_STOCKS[10], condition({ metric: "pe_ttm", operator: "<", value: 30 }));
    expect(evaluation.status).toBe("unavailable");
    expect(evaluation.reason).toContain("无法判断");
  });
});

describe("screenStocks", () => {
  it("applies AND conditions and records every reason", () => {
    const result = screenStocks(strategy([
      condition(),
      condition({ id: "pe", metric: "pe_ttm", operator: "<", value: 30 }),
      condition({ id: "vol", metric: "volatility_60d", operator: "<", value: 30 }),
    ]), DEMO_STOCKS, "2026-01-01T00:00:00.000Z");
    expect(result.total).toBe(12);
    expect(result.included.map((item) => item.stock.symbol)).toEqual(["DEMO001", "DEMO003", "DEMO005", "DEMO012"]);
    expect(result.unavailable.map((item) => item.stock.symbol)).toContain("DEMO011");
    expect(result.excluded.find((item) => item.stock.symbol === "DEMO009")?.exclusionReasons).toContain("已按策略排除 ST 股票");
  });

  it("supports OR logic", () => {
    const result = screenStocks(strategy([
      condition({ value: 60 }),
      condition({ id: "cheap", metric: "pe_ttm", operator: "<", value: 10 }),
    ], "OR"), DEMO_STOCKS);
    expect(result.included.map((item) => item.stock.symbol)).toContain("DEMO006");
  });

  it("keeps an OR match when a different metric is unavailable", () => {
    const result = screenStocks(strategy([
      condition({ metric: "pe_ttm", operator: "<", value: 30 }),
      condition({ id: "growth", metric: "net_profit_yoy", operator: ">", value: 30 }),
    ], "OR"), DEMO_STOCKS);
    expect(result.included.map((item) => item.stock.symbol)).toContain("DEMO011");
  });

  it("reports added and removed stocks after a threshold change", () => {
    const strict = screenStocks(strategy([condition({ metric: "pe_ttm", operator: "<", value: 20 })]), DEMO_STOCKS);
    const relaxed = screenStocks(strategy([condition({ metric: "pe_ttm", operator: "<", value: 30 })]), DEMO_STOCKS);
    const diff = diffResults(strict, relaxed);
    expect(diff.added.length).toBeGreaterThan(0);
    expect(diff.removed).toHaveLength(0);
  });
});

describe("detectConflicts", () => {
  it("finds impossible bounds", () => {
    const conflicts = detectConflicts([
      condition({ id: "low", metric: "pe_ttm", operator: "<", value: 10 }),
      condition({ id: "high", metric: "pe_ttm", operator: ">", value: 30 }),
    ]);
    expect(conflicts[0].type).toBe("error");
    expect(conflicts[0].message).toContain("互相冲突");
  });

  it("rejects out-of-range values and an empty active set", () => {
    expect(detectConflicts([condition({ metric: "volatility_60d", value: -1 })])[0].message).toContain("阈值");
    expect(detectConflicts([condition({ enabled: false })])[0].message).toContain("至少启用");
  });

  it("allows a closed interval that contains exactly one value", () => {
    expect(detectConflicts([
      condition({ id: "lower", metric: "pe_ttm", operator: ">=", value: 20 }),
      condition({ id: "upper", metric: "pe_ttm", operator: "<=", value: 20 }),
    ])).toHaveLength(0);
  });
});
