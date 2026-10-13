import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_STOCKS } from "@/lib/demo-data";
import { POST as parsePost } from "@/app/api/parse/route";
import { POST as screenPost } from "@/app/api/screen/route";

vi.mock("@/lib/fuyao", () => ({ fetchFuyaoStocks: async () => DEMO_STOCKS.map((v) => ({ ...v, isSuspended: null })) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const request = (path: string, body: unknown) => new Request(`http://localhost/api/${path}`, { method: "POST", body: JSON.stringify(body) });

describe("live parse → screen exclusion regression", () => {
  it.each(["local", "ai", "fallback"])("does not auto-enable unavailable suspension exclusion (%s)", async (mode) => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("AI_API_KEY", mode === "local" ? "" : "test-placeholder");
    vi.stubGlobal("fetch", vi.fn(async () => mode === "fallback" ? new Response("", { status: 503 }) : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ name: "test", logic: "AND", conditions: [{ metric: "pe_ttm", operator: "<", value: 30, enabled: true }], clarifications: [], unsupportedTerms: [] }) } }] }))));
    const parsed = await (await parsePost(request("parse", { query: "PE 低于 30" }))).json();
    expect(parsed.strategy.exclusions).toEqual(["ST", "MISSING_DATA"]);
    const result = await (await screenPost(request("screen", parsed.strategy))).json();
    expect(result.included.length).toBeGreaterThan(0);
    expect(result.included.every((v: { evaluations: { status: string }[] }) => v.evaluations.every((e) => e.status === "passed"))).toBe(true);
    expect(result.unavailable.map((v: { stock: { symbol: string } }) => v.stock.symbol)).toEqual(["DEMO011"]);
    // Explicit user choice is still enforced; unknown must not become false.
    parsed.strategy.exclusions.push("SUSPENDED");
    const blocked = await (await screenPost(request("screen", parsed.strategy))).json();
    expect(blocked.included).toHaveLength(0);
    expect(blocked.unavailable.some((v: { exclusionReasons: string[] }) => v.exclusionReasons.some((r) => r.includes("停牌状态缺失")))).toBe(true);
    parsed.strategy.exclusions = parsed.strategy.exclusions.filter((v: string) => v !== "SUSPENDED");
    const restored = await (await screenPost(request("screen", parsed.strategy))).json();
    expect(restored.included.map((v: { stock: { symbol: string } }) => v.stock.symbol)).toEqual(result.included.map((v: { stock: { symbol: string } }) => v.stock.symbol));
  });
});
