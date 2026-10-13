import { expect, it } from "vitest";
import { fetchFuyaoStocks } from "@/lib/fuyao";
import { screenStocks } from "@/lib/screening";
import { createSnapshotCache } from "@/lib/snapshot-cache";

it("validates local credentials and real-data screening without printing secrets", async () => {
  const getSnapshot = createSnapshotCache(fetchFuyaoStocks);
  const snapshot = await getSnapshot("local-live-check");
  const stocks = snapshot.stocks;
  const configured = [...new Set(process.env.FUYAO_THSCODES!.split(",").map((v) => v.trim()).filter(Boolean))];
  expect(stocks.map((v) => v.symbol)).toEqual(configured);
  expect(stocks.length).toBeGreaterThan(0);
  expect(stocks.some((v) => v.metrics.pe_ttm.status === "valid")).toBe(true);
  const result = screenStocks({ id: "live-check", name: "接口验证", originalQuery: "PE < 30", logic: "AND", conditions: [{ id: "pe", metric: "pe_ttm", operator: "<", value: 30, enabled: true }], exclusions: [] }, stocks);
  expect(result.total).toBe(stocks.length);
  expect(await getSnapshot("local-live-check")).toBe(snapshot);
  const peValues = stocks.map((v) => v.metrics.pe_ttm.value).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const threshold = peValues[Math.floor(peValues.length / 2)];
  const narrow = screenStocks({ ...result.strategy, conditions: [{ ...result.strategy.conditions[0], value: threshold }] }, stocks);
  expect(narrow.included.length).toBeLessThan(result.included.length);
  expect(narrow.excluded.length).toBeGreaterThan(0);
  const unknown = screenStocks({ ...result.strategy, conditions: [{ ...result.strategy.conditions[0], metric: "market_cap" }] }, stocks);
  expect(unknown.unavailable).toHaveLength(stocks.length);
  console.log(JSON.stringify({ total: result.total, peBelow30: result.included.length, narrowed: { threshold, included: narrow.included.length, excluded: narrow.excluded.length }, sameSnapshot: true, validCounts: Object.fromEntries(Object.keys(stocks[0].metrics).map((key) => [key, stocks.filter((v) => v.metrics[key as keyof typeof v.metrics].status === "valid").length])) }, null, 2));
});
