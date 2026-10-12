import type { MetricKey, MetricValue, StockRecord } from "./domain";
import { calculate60DayMetrics, type PriceBar } from "./indicators";

const BASE_URL = (process.env.FUYAO_BASE_URL ?? "https://fuyao.aicubes.cn").replace(/\/$/, "");
const source = "扶摇金融数据 API";

interface Envelope<T> { code: number; message: string; request_id?: string; data?: T; }
interface Ticker { thscode: string; name: string; asset_type: string; }
interface Snapshot { timestamp: number; item: Array<Record<string, unknown>>; }
interface Valuation { timestamp: number | null; item: Array<{ thscode: string; name?: string | null; pe_ttm?: number | null; pb_mrq?: number | null }> }
interface Indicators { timestamp?: number | null; item: Array<{ index_id: string; value: string | number | null }> }
interface History { timestamp: number; item: PriceBar[]; }

function dateFromMs(value: number | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : "未知"; }
function metric(value: number | null, unit: string, asOf: string, period: string): MetricValue {
  return { value, unit, asOf, period, source, status: value === null ? "missing" : "valid", note: value === null ? "扶摇接口未返回该字段" : undefined };
}
function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

async function get<T>(path: string, params: Record<string, string>) {
  const key = process.env.FUYAO_API_KEY;
  if (!key) throw new Error("FUYAO_API_KEY 未配置");
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { headers: { "X-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`扶摇接口 HTTP ${response.status}`);
  const envelope = await response.json() as Envelope<T>;
  if (envelope.code !== 0 || !envelope.data) throw new Error(`扶摇接口 ${envelope.code}: ${envelope.message}`);
  return envelope.data;
}

/**
 * Live provider for a deliberately bounded universe. The full-market mode should use
 * the provider's parquet dump or a scheduled warehouse job rather than fan-out requests.
 */
export async function fetchFuyaoStocks(): Promise<StockRecord[]> {
  const configured = (process.env.FUYAO_THSCODES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!configured.length) throw new Error("FUYAO_THSCODES 未配置；为避免高频请求，Live 模式需要显式提供股票代码。");
  if (configured.length > 20) throw new Error("Live 直连模式最多支持 20 只股票；全市场请使用 Market Dumps 建立离线快照。");
  const thscodes = configured.join(",");
  const [tickers, prices, valuations] = await Promise.all([
    get<{ timestamp: number; item: Ticker[] }>("/api/meta/tickers/list", { asset_type: "a-share", limit: "10000", offset: "0" }),
    get<Snapshot>("/api/a-share/prices/snapshot", { thscodes }),
    get<Valuation>("/api/a-share/valuations/snapshot", { thscodes }),
  ]);
  const tickerByCode = new Map(tickers.item.map((item) => [item.thscode, item]));
  const valuationByCode = new Map(valuations.item.map((item) => [item.thscode, item]));
  const priceDate = dateFromMs(prices.timestamp);

  const records = await Promise.all(prices.item.map(async (item) => {
    const code = String(item.thscode ?? "");
    const ticker = tickerByCode.get(code);
    const valuation = valuationByCode.get(code);
    const end = Date.now();
    const start = end - 140 * 24 * 60 * 60 * 1000;
    const [indicators, history] = await Promise.all([
      get<Indicators>("/api/a-share/financials/indicators", { thscode: code, report: process.env.FUYAO_REPORT ?? "2025-3" }),
      get<History>("/api/a-share/prices/historical", { thscode: code, interval: "1d", start: String(start), end: String(end), adjust: "forward" }),
    ]);
    const indicatorMap = new Map(indicators.item.map((entry) => [entry.index_id, numeric(entry.value)]));
    const asOf = dateFromMs(indicators.timestamp);
    const field = (key: string) => indicatorMap.get(key) ?? null;
    const marketCap = numeric(item.total_market_cap ?? item.float_market_cap);
    const unitMarketCap = marketCap === null ? null : marketCap / 100_000_000;
    const marketMetrics = calculate60DayMetrics(history.item);
    const marketAsOf = dateFromMs(marketMetrics.asOf);
    const metrics: Record<MetricKey, MetricValue> = {
      net_profit_yoy: metric(field("net_profit_yoy_growth_ratio"), "%", asOf, "扶摇财务指标报告期"),
      revenue_yoy: metric(field("operating_income_yoy_growth_ratio"), "%", asOf, "扶摇财务指标报告期"),
      roe: metric(field("index_weighted_avg_roe"), "%", asOf, "扶摇财务指标报告期"),
      pe_ttm: metric(valuation?.pe_ttm ?? null, "倍", dateFromMs(valuations.timestamp), "PE-TTM"),
      pb: metric(valuation?.pb_mrq ?? null, "倍", dateFromMs(valuations.timestamp), "PB-MRQ"),
      market_cap: metric(unitMarketCap, "亿元", priceDate, "行情快照总市值（原始元换算）"),
      return_60d: metric(marketMetrics.return60d, "%", marketAsOf, "最近 60 个交易日，前复权收盘价"),
      volatility_60d: metric(marketMetrics.volatility60d, "%", marketAsOf, "60 日日对数收益率样本标准差 × √252"),
    };
    return {
      symbol: code, name: ticker?.name ?? String(item.name ?? code), industry: "未接入行业分类",
      isST: /(^|\s)ST|退市/.test(ticker?.name ?? String(item.name ?? "")), isSuspended: numeric(item.last_price) === null,
      metrics,
    } satisfies StockRecord;
  }));
  return records;
}
