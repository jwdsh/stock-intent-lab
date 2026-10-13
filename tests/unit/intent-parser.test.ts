import { describe, expect, it } from "vitest";
import { parseIntent } from "@/lib/intent-parser";

describe("parseIntent", () => {
  it("preserves inclusive versus strict comparison semantics", () => {
    expect(parseIntent("净利润同比不少于 20%，PE 不超过 25 倍，波动率低于 28%").strategy.conditions.map((v) => v.operator)).toEqual([">=", "<=", "<"]);
    expect(parseIntent("净利润增长超过 20%，市盈率高于 10 倍，波动率不高于 30%").strategy.conditions.map((v) => v.operator)).toEqual([">", ">", "<="]);
  });
  it("maps fuzzy language to editable defaults", () => {
    const result = parseIntent("找经营改善、估值合理、走势相对稳定的股票");
    expect(result.strategy.conditions.map((item) => item.metric)).toEqual([
      "net_profit_yoy", "pe_ttm", "volatility_60d",
    ]);
    expect(result.clarifications).toHaveLength(3);
    expect(result.mode).toBe("local");
  });

  it("extracts explicit numeric thresholds", () => {
    const result = parseIntent("净利润增长超过 35%，PE 不超过 25 倍，波动率低于 28%");
    expect(result.strategy.conditions.map((item) => [item.metric, item.value])).toEqual([
      ["net_profit_yoy", 35], ["pe_ttm", 25], ["volatility_60d", 28],
    ]);
    expect(result.clarifications).toHaveLength(0);
  });

  it("intercepts promises and direct trading requests", () => {
    const result = parseIntent("直接告诉我买哪只明天一定涨停的股票");
    expect(result.complianceMessage).toContain("无法提供确定性");
    expect(result.strategy.conditions.length).toBeGreaterThan(0);
  });

  it("provides an editable fallback for unsupported wording", () => {
    const result = parseIntent("给我看看值得关注的公司");
    expect(result.strategy.conditions[0].metric).toBe("net_profit_yoy");
    expect(result.clarifications[0].term).toBe("选股意图");
  });
});
