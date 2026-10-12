import { describe, expect, it } from "vitest";
import { calculate60DayMetrics, calculateAnnualizedVolatility, calculateReturn } from "@/lib/indicators";

describe("market indicators", () => {
  it("calculates period return", () => {
    expect(calculateReturn([100, 110])).toBeCloseTo(10);
    expect(calculateReturn([0, 110])).toBeNull();
  });

  it("calculates annualized volatility from log returns", () => {
    const value = calculateAnnualizedVolatility([100, 102, 101, 104]);
    expect(value).not.toBeNull();
    expect(value!).toBeGreaterThan(0);
    expect(calculateAnnualizedVolatility([100, 101])).toBeNull();
  });

  it("requires 61 closes for a 60-trading-day window and sorts bars", () => {
    const bars = Array.from({ length: 61 }, (_, index) => ({ date_ms: index, close_price: 100 + index })).reverse();
    const result = calculate60DayMetrics(bars);
    expect(result.return60d).toBeCloseTo(60);
    expect(result.volatility60d).not.toBeNull();
    expect(calculate60DayMetrics(bars.slice(0, 60)).return60d).toBeNull();
  });
});
