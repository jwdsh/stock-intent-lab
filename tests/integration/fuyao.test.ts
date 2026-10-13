import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFuyaoStocks } from "@/lib/fuyao";
import { screenStocks } from "@/lib/screening";

const june = Date.parse("2026-06-30T00:00:00+08:00");
const disclosed = Date.parse("2026-08-01T00:00:00+08:00");
function mockProvider(options: { missingValuation?: boolean; oldProfit?: number; businessCode?: number } = {}) {
  return vi.fn(async (input: URL) => {
    const path = input.pathname;
    let data: unknown;
    if (path.endsWith("tickers/list")) data = { item: [{ thscode: "600519.SH", name: "贵州茅台" }] };
    else if (path.endsWith("valuations/snapshot")) data = { timestamp: june, item: options.missingValuation ? [] : [{ thscode: "600519.SH", pe_ttm: 20, pb_mrq: 5 }] };
    else if (path.endsWith("income-statements")) data = { item: [
      { fiscal_year: 2026, fiscal_period: "Q2", report_date_ms: disclosed, period_end_ms: june, parent_holder_net_profit: 120 },
      { fiscal_year: 2025, fiscal_period: "Q2", report_date_ms: disclosed - 365 * 86400000, period_end_ms: june - 365 * 86400000, parent_holder_net_profit: options.oldProfit ?? 100 },
    ] };
    else if (path.endsWith("indicators")) data = { report: "2026-2", abilities: [{ ability: "growth", indicators: [{ index_id: "operating_income_yoy_growth_ratio", value: "12.50" }, { index_id: "net_profit_yoy_growth_ratio", value: "999" }] }, { ability: "profitability", indicators: [{ index_id: "index_weighted_avg_roe", value: null }] }] };
    else if (path.endsWith("historical")) data = { item: Array.from({ length: 61 }, (_, i) => ({ date_ms: june - (60 - i) * 86400000, close_price: 100 + i })) };
    else throw new Error(`Unexpected endpoint ${path}`);
    return new Response(JSON.stringify({ code: options.businessCode ?? 0, data }), { status: 200 });
  });
}
beforeEach(() => {
  vi.stubEnv("FUYAO_API_KEY", "test-only-secret");
  vi.stubEnv("FUYAO_THSCODES", "600519.SH");
  vi.stubEnv("FUYAO_REPORT", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Fuyao contract", () => {
  it("keeps all configured symbols and isolates a single-stock endpoint failure", async () => {
    vi.stubEnv("FUYAO_THSCODES", "600519.SH,000001.SZ,600519.SH");
    const provider = mockProvider();
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => url.searchParams.get("thscode") === "000001.SZ" && url.pathname.endsWith("historical") ? new Response("", { status: 503 }) : provider(url)));
    const stocks = await fetchFuyaoStocks();
    expect(stocks.map((v) => v.symbol)).toEqual(["600519.SH", "000001.SZ"]);
    expect(stocks[0].metrics.return_60d.status).toBe("valid");
    expect(stocks[1].metrics.return_60d.status).toBe("missing");
    expect(stocks[1].metrics.net_profit_yoy.status).toBe("valid");
    expect(stocks[1].metrics.return_60d.note).toContain("调用失败");
  });
  it("stops on business rate limits even on optional endpoints", async () => {
    const provider = mockProvider();
    const fetch = vi.fn(async (url: URL) => url.pathname.endsWith("income-statements") ? new Response(JSON.stringify({ code: 4001, data: {} })) : provider(url));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchFuyaoStocks()).rejects.toThrow("4001");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("marks malformed or mismatched indicators missing instead of corrupting the pool", async () => {
    const provider = mockProvider();
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => url.pathname.endsWith("indicators") ? new Response(JSON.stringify({ code: 0, data: { report: "2020-1", abilities: null } })) : provider(url)));
    const [stock] = await fetchFuyaoStocks();
    expect(stock.metrics.roe.status).toBe("missing");
    expect(stock.metrics.revenue_yoy.note).toContain("不匹配");
    expect(stock.metrics.net_profit_yoy.status).toBe("valid");
  });
  it("reads nested indicators, selects disclosed report and calculates parent profit growth", async () => {
    const fetch = mockProvider(); vi.stubGlobal("fetch", fetch);
    const [stock] = await fetchFuyaoStocks();
    expect(stock.metrics.net_profit_yoy.value).toBeCloseTo(20);
    expect(stock.metrics.revenue_yoy.value).toBe(12.5);
    expect(stock.metrics.roe.status).toBe("missing");
    expect(stock.metrics.net_profit_yoy.asOf).toBe("2026-08-01");
    expect(stock.metrics.net_profit_yoy.period).toContain("2026-2");
    expect(stock.metrics.market_cap.value).toBeNull();
    expect(stock.isSuspended).toBeNull();
    expect(stock.metrics.return_60d.value).toBeCloseTo(60);
    expect(fetch.mock.calls.find(([url]) => url.pathname.endsWith("indicators"))?.[0].searchParams.get("report")).toBe("2026-2");
  });
  it("keeps configured stocks when valuations are omitted", async () => {
    vi.stubGlobal("fetch", mockProvider({ missingValuation: true }));
    const stocks = await fetchFuyaoStocks();
    expect(stocks).toHaveLength(1); expect(stocks[0].metrics.pe_ttm.status).toBe("missing");
  });
  it("does not invent growth for nonpositive prior profit", async () => {
    vi.stubGlobal("fetch", mockProvider({ oldProfit: -100 }));
    expect((await fetchFuyaoStocks())[0].metrics.net_profit_yoy.status).toBe("missing");
  });
  it("rejects business errors even with HTTP 200", async () => {
    vi.stubGlobal("fetch", mockProvider({ businessCode: 2001 }));
    await expect(fetchFuyaoStocks()).rejects.toThrow("2001");
  });
  it("rejects HTTP rate limits without immediate retries", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 429 })); vi.stubGlobal("fetch", fetch);
    await expect(fetchFuyaoStocks()).rejects.toThrow("429"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requires credentials and validates the universe", async () => {
    vi.stubEnv("FUYAO_API_KEY", ""); await expect(fetchFuyaoStocks()).rejects.toThrow("未配置");
    vi.stubEnv("FUYAO_THSCODES", "bad"); await expect(fetchFuyaoStocks()).rejects.toThrow("有效");
  });
  it("makes unknown exclusion states unavailable rather than silently passing", async () => {
    vi.stubGlobal("fetch", mockProvider());
    const stocks = await fetchFuyaoStocks();
    const result = screenStocks({ id: "test", name: "test", originalQuery: "", logic: "AND", conditions: [{ id: "pe", metric: "pe_ttm", operator: "<", value: 30, enabled: true }], exclusions: ["SUSPENDED"] }, stocks);
    expect(result.included).toHaveLength(0); expect(result.unavailable).toHaveLength(1);
  });
});
