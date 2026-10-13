import { describe, expect, it } from "vitest";
import { DEMO_STOCKS } from "@/lib/demo-data";
import type { Condition, Strategy } from "@/lib/domain";
import { detectConflicts, diffResults, screenStocks, strategyChanges } from "@/lib/screening";

const pe: Condition = { id: "pe", metric: "pe_ttm", operator: "<", value: 30, enabled: true };
const growth: Condition = { id: "profit", metric: "net_profit_yoy", operator: ">", value: 30, enabled: true };
const base: Strategy = { id: "multi", name: "test", originalQuery: "", logic: "AND", conditions: [pe], exclusions: [] };

describe("multi-stock truth table and condition changes", () => {
  it("partitions every stock exactly once", () => {
    const result = screenStocks(base, DEMO_STOCKS);
    const symbols = [...result.included, ...result.excluded, ...result.unavailable].map((v) => v.stock.symbol);
    expect(symbols).toHaveLength(12); expect(new Set(symbols).size).toBe(12);
    expect(result.unavailable.map((v) => v.stock.symbol)).toEqual(["DEMO011"]);
  });
  it("toggles explicit ST and suspension exclusions independently", () => {
    expect(screenStocks(base, DEMO_STOCKS).included.map((v) => v.stock.symbol)).toEqual(expect.arrayContaining(["DEMO009", "DEMO010"]));
    const st = screenStocks({ ...base, exclusions: ["ST"] }, DEMO_STOCKS);
    expect(st.excluded.find((v) => v.stock.symbol === "DEMO009")?.exclusionReasons).toContain("已按策略排除 ST 股票");
    expect(st.included.map((v) => v.stock.symbol)).toContain("DEMO010");
    const suspended = screenStocks({ ...base, exclusions: ["SUSPENDED"] }, DEMO_STOCKS);
    expect(suspended.excluded.map((v) => v.stock.symbol)).toContain("DEMO010");
    expect(suspended.included.map((v) => v.stock.symbol)).toContain("DEMO009");
  });
  it("known failed AND overrides another unknown condition", () => {
    const result = screenStocks({ ...base, conditions: [pe, { ...growth, value: 100 }] }, [DEMO_STOCKS[10]]);
    expect(result.excluded).toHaveLength(1); expect(result.unavailable).toHaveLength(0);
  });
  it("OR passes with a known match, but an unknown exclusion prevents inclusion", () => {
    const stock = structuredClone(DEMO_STOCKS[10]); stock.isSuspended = null;
    const s: Strategy = { ...base, logic: "OR", conditions: [pe, growth] };
    expect(screenStocks(s, [stock]).included).toHaveLength(1);
    expect(screenStocks({ ...s, exclusions: ["SUSPENDED"] }, [stock]).unavailable).toHaveLength(1);
    expect(screenStocks({ ...s, conditions: [pe, { ...growth, value: 100 }] }, [stock]).unavailable).toHaveLength(1);
  });
  it("disabling and removing a condition relaxes the same stock set", () => {
    const before = screenStocks({ ...base, conditions: [pe, growth] }, DEMO_STOCKS);
    const disabled = screenStocks({ ...base, conditions: [pe, { ...growth, enabled: false }] }, DEMO_STOCKS);
    const removed = screenStocks(base, DEMO_STOCKS);
    expect(disabled.included.map((v) => v.stock.symbol)).toEqual(removed.included.map((v) => v.stock.symbol));
    expect(diffResults(before, disabled).added.length).toBeGreaterThan(0);
    expect(diffResults(before, disabled).removed).toHaveLength(0);
  });
  it("tracks logic, fields, enabled flags, removals and exclusions", () => {
    const before = { ...base, conditions: [pe, growth] };
    const after: Strategy = { ...base, logic: "OR", conditions: [{ ...pe, value: 20, enabled: false }, { ...growth, id: "added" }], exclusions: ["ST"] };
    const changes = strategyChanges(before, after).join(";");
    for (const value of ["AND → OR", "停用", "添加", "删除", "排除"]) expect(changes).toContain(value);
    expect(strategyChanges(base, structuredClone(base))).toEqual([]);
  });
  it("rejects strict equality bounds regardless of condition order, but allows OR", () => {
    const bounds: Condition[] = [{ ...pe, operator: ">=", value: 20 }, { ...pe, id: "strict", operator: ">", value: 20 }, { ...pe, id: "upper", operator: "<=", value: 20 }];
    expect(detectConflicts(bounds)).toHaveLength(1);
    expect(detectConflicts([...bounds].reverse())).toHaveLength(1);
    expect(detectConflicts(bounds, "OR")).toEqual([]);
    expect(detectConflicts([{ ...pe, value: NaN }])).toHaveLength(1);
  });
});
