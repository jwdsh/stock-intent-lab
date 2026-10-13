export interface PriceBar { date_ms: number; close_price: number; }

export function calculateReturn(closes: number[]): number | null {
  if (closes.length < 2 || closes[0] <= 0) return null;
  return ((closes.at(-1)! / closes[0]) - 1) * 100;
}

export function calculateAnnualizedVolatility(closes: number[]): number | null {
  if (closes.length < 3 || closes.some((value) => value <= 0)) return null;
  const returns = closes.slice(1).map((value, index) => Math.log(value / closes[index]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function calculate60DayMetrics(bars: PriceBar[]) {
  const valid = [...bars].sort((a, b) => a.date_ms - b.date_ms).slice(-61);
  const invalid = valid.some((v) => !Number.isFinite(v.date_ms) || !Number.isFinite(v.close_price) || v.close_price <= 0);
  const duplicate = new Set(valid.map((v) => v.date_ms)).size !== valid.length;
  if (valid.length < 61 || invalid || duplicate) return { return60d: null, volatility60d: null, asOf: valid.at(-1)?.date_ms ?? null };
  const closes = valid.map((bar) => bar.close_price);
  return {
    return60d: calculateReturn(closes),
    volatility60d: calculateAnnualizedVolatility(closes),
    asOf: valid.at(-1)?.date_ms ?? null,
  };
}
