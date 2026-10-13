import type { MetricKey, MetricValue, StockRecord } from "./domain";
import { calculate60DayMetrics, type PriceBar } from "./indicators";

const source = "扶摇金融数据 API";
interface Envelope<T> { code: number; message: string; data?: T; }
interface Ticker { thscode: string; name: string; }
interface Valuation { thscode: string; name?: string | null; pe_ttm?: number | null; pb_mrq?: number | null; }
interface Indicators { report: string; abilities: Array<{ indicators: Array<{ index_id: string; value: string | null }> }>; }
interface Income { fiscal_year: number; fiscal_period: string; report_date_ms: number | null; period_end_ms: number; parent_holder_net_profit: number | null; }
interface Series<T> { timestamp: number | null; item: T[]; }

class ProviderError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}

async function optionalData<T>(path: string, params: Record<string, string>, validate: (data: T) => boolean): Promise<{ data: T | null; note?: string }> {
  try {
    const data = await get<T>(path, params);
    if (!validate(data)) return { data: null, note: `${path} 返回结构或报告期不匹配，该数据未参与正常判断` };
    return { data };
  }
  catch (error) {
    // Credential and rate-limit errors stop the batch, rather than continuing to hammer upstream.
    if (error instanceof ProviderError && [2001, 2002, 2003, 4001, 401, 403, 429].includes(error.code)) throw error;
    return { data: null, note: `${path} 调用失败，该数据未参与正常判断` };
  }
}

function dateFromMs(value: number | null | undefined) {
  return value != null && Number.isFinite(value)
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value)
    : "未知";
}
function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function metric(value: number | null, unit: string, asOf: string, period: string, note?: string): MetricValue {
  return { value, unit, asOf, period, source, status: value === null ? "missing" : "valid", note: value === null ? `接口未返回有效数据${note ? `；${note}` : ""}` : note };
}
async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.FUYAO_API_KEY;
  if (!key) throw new Error("FUYAO_API_KEY 未配置");
  const url = new URL(path, process.env.FUYAO_BASE_URL ?? "https://fuyao.aicubes.cn");
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { headers: { "X-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ProviderError(response.status, `扶摇接口 HTTP ${response.status}`);
  const envelope = await response.json() as Envelope<T>;
  // Do not expose upstream messages: they may contain request credentials.
  if (envelope.code !== 0 || !envelope.data) throw new ProviderError(envelope.code, `扶摇接口业务错误 ${envelope.code}`);
  return envelope.data;
}

/** Bounded universe; sequential calls deliberately avoid burst requests. */
export async function fetchFuyaoStocks(): Promise<StockRecord[]> {
  const configured = [...new Set((process.env.FUYAO_THSCODES ?? "").split(",").map((v) => v.trim()).filter(Boolean))];
  if (!configured.length || configured.length > 20 || configured.some((v) => !/^\d{6}\.(SH|SZ|BJ)$/.test(v))) {
    throw new Error("FUYAO_THSCODES 需要配置 1–20 个有效 A 股完整代码");
  }
  const requested = process.env.FUYAO_REPORT?.trim() || undefined;
  if (requested && !/^\d{4}-[1-4]$/.test(requested)) throw new Error("FUYAO_REPORT 格式必须为 yyyy-1/2/3/4");
  const tickers = await get<Series<Ticker>>("/api/meta/tickers/list", { asset_type: "a-share", limit: "10000", offset: "0" });
  const valuations = await get<Series<Valuation>>("/api/a-share/valuations/snapshot", { thscodes: configured.join(",") });
  const records: StockRecord[] = [];
  for (const code of configured) {
    const incomeResponse = await optionalData<Series<Income>>("/api/a-share/financials/income-statements", { thscode: code, period: "quarterly", limit: "8" }, (data) => Array.isArray(data.item) && data.item.every((v) => v && Number.isFinite(v.fiscal_year) && /^(Q[1-4]|FY)$/.test(v.fiscal_period) && Number.isFinite(v.period_end_ms)));
    const disclosed = (incomeResponse.data?.item ?? []).filter((v) => v.report_date_ms != null && v.report_date_ms <= Date.now() && v.period_end_ms <= Date.now());
    const reportOf = (v: Income) => `${v.fiscal_year}-${v.fiscal_period === "FY" ? "4" : v.fiscal_period.replace("Q", "")}`;
    const current = disclosed.sort((a, b) => b.period_end_ms - a.period_end_ms).find((v) => !requested || reportOf(v) === requested);
    const report = requested ?? (current ? reportOf(current) : null);
    const indicatorResponse = report ? await optionalData<Indicators>("/api/a-share/financials/indicators", { thscode: code, report }, (data) => data.report === report && Array.isArray(data.abilities) && data.abilities.every((v) => v && Array.isArray(v.indicators) && v.indicators.every((i) => i && typeof i.index_id === "string"))) : { data: null, note: "没有可用财务报告期" };
    const indicators = indicatorResponse.data;
    const fields = new Map(indicators?.abilities.flatMap((v) => v.indicators).map((v) => [v.index_id, numeric(v.value)]));
    const previous = current ? disclosed.find((v) => v.fiscal_year === current.fiscal_year - 1 && reportOf(v).split("-")[1] === reportOf(current).split("-")[1]) : undefined;
    const profit = numeric(current?.parent_holder_net_profit);
    const oldProfit = numeric(previous?.parent_holder_net_profit);
    const growth = profit !== null && oldProfit !== null && oldProfit > 0 ? (profit / oldProfit - 1) * 100 : null;
    const end = Date.now();
    const historyResponse = await optionalData<Series<PriceBar>>("/api/a-share/prices/historical", { thscode: code, interval: "1d", start: String(end - 140 * 86400000), end: String(end), adjust: "forward" }, (data) => Array.isArray(data.item) && data.item.every((v) => v && typeof v.date_ms === "number" && typeof v.close_price === "number"));
    const market = calculate60DayMetrics(historyResponse.data?.item ?? []);
    const asOf = dateFromMs(current?.report_date_ms);
    const period = `报告期 ${report ?? "未知"}；期末 ${dateFromMs(current?.period_end_ms)}（累计口径）`;
    const valuation = valuations.item.find((v) => v.thscode === code);
    const name = tickers.item.find((v) => v.thscode === code)?.name ?? valuation?.name ?? code;
    const metrics: Record<MetricKey, MetricValue> = {
      net_profit_yoy: metric(growth, "%", asOf, period, incomeResponse.note ?? (growth === null ? "归母净利润同期数据缺失或上年同期非正，无法计算常规同比" : `本期 ${profit} 元 ÷ 上年同期 ${oldProfit} 元 − 1，结果乘 100`)),
      revenue_yoy: metric(fields.get("operating_income_yoy_growth_ratio") ?? null, "%", asOf, period, indicatorResponse.note ?? "日期来自同报告期利润表披露日，指标接口未提供独立更新时间"),
      roe: metric(fields.get("index_weighted_avg_roe") ?? null, "%", asOf, period, indicatorResponse.note ?? "日期来自同报告期利润表披露日，指标接口未提供独立更新时间"),
      pe_ttm: metric(numeric(valuation?.pe_ttm), "倍", dateFromMs(valuations.timestamp), "PE-TTM", "日期为本批上游元数据最大时间，非该指标独立更新时间"),
      pb: metric(numeric(valuation?.pb_mrq), "倍", dateFromMs(valuations.timestamp), "PB-MRQ", "日期为本批上游元数据最大时间，非该指标独立更新时间"),
      market_cap: metric(null, "亿元", "未知", "总市值", "已接入接口没有总市值字段，不用流通市值替代"),
      return_60d: metric(market.return60d, "%", dateFromMs(market.asOf), "最近 60 个交易日，前复权收盘价", historyResponse.note ?? "需要 61 根有效且日期唯一的日 K 线"),
      volatility_60d: metric(market.volatility60d, "%", dateFromMs(market.asOf), "60 日日对数收益率样本标准差 × √252", historyResponse.note ?? "需要 61 根有效且日期唯一的日 K 线"),
    };
    for (const key of ["net_profit_yoy", "revenue_yoy", "roe", "pe_ttm", "pb", "return_60d", "volatility_60d"] as const) {
      const endpoints = { net_profit_yoy: "financials/income-statements", revenue_yoy: "financials/indicators", roe: "financials/indicators", pe_ttm: "valuations/snapshot", pb: "valuations/snapshot", return_60d: "prices/historical", volatility_60d: "prices/historical" };
      const rawFields = { net_profit_yoy: "parent_holder_net_profit（本期、上年同期）", revenue_yoy: "operating_income_yoy_growth_ratio", roe: "index_weighted_avg_roe", pe_ttm: "pe_ttm", pb: "pb_mrq", return_60d: "date_ms, close_price", volatility_60d: "date_ms, close_price" };
      metrics[key].endpoint = `/api/a-share/${endpoints[key]}`;
      metrics[key].rawField = rawFields[key];
    }
    records.push({ symbol: code, name, industry: "未接入行业分类", isST: name === code ? null : /^\*?ST/i.test(name), isSuspended: null, metrics });
  }
  return records;
}
