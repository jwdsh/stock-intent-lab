import type { MetricKey, MetricValue, StockRecord } from "./domain";

export const DEMO_SNAPSHOT_DATE = "2025-12-31";
export const DEMO_SOURCE = "演示数据快照（合成数据，仅用于功能验证）";

type Values = Record<MetricKey, number | null>;

function metric(key: MetricKey, value: number | null, status?: MetricValue["status"]): MetricValue {
  const financial = ["net_profit_yoy", "revenue_yoy", "roe"].includes(key);
  const units: Record<MetricKey, string> = {
    net_profit_yoy: "%", revenue_yoy: "%", roe: "%", pe_ttm: "倍", pb: "倍",
    market_cap: "亿元", return_60d: "%", volatility_60d: "%",
  };
  return {
    value,
    unit: units[key],
    asOf: financial ? "2025-09-30" : DEMO_SNAPSHOT_DATE,
    period: financial ? "2025 年三季报" : key.includes("60d") ? "最近 60 个交易日" : "收盘快照",
    source: DEMO_SOURCE,
    status: status ?? (value === null ? "missing" : "valid"),
    note: value === null ? "演示快照中没有可用值" : undefined,
  };
}

function stock(symbol: string, name: string, industry: string, values: Values, flags?: Partial<Pick<StockRecord, "isST" | "isSuspended">>): StockRecord {
  return {
    symbol, name, industry, isST: flags?.isST ?? false, isSuspended: flags?.isSuspended ?? false,
    metrics: Object.fromEntries(
      (Object.entries(values) as [MetricKey, number | null][]).map(([key, value]) => [key, metric(key, value)])
    ) as Record<MetricKey, MetricValue>,
  };
}

export const DEMO_STOCKS: StockRecord[] = [
  stock("DEMO001", "远望制造", "高端制造", { net_profit_yoy: 28.4, revenue_yoy: 16.8, roe: 13.2, pe_ttm: 18.2, pb: 2.4, market_cap: 486, return_60d: 8.6, volatility_60d: 22.6 }),
  stock("DEMO002", "澄明科技", "软件服务", { net_profit_yoy: 42.1, revenue_yoy: 31.5, roe: 18.7, pe_ttm: 42.6, pb: 6.8, market_cap: 312, return_60d: 24.3, volatility_60d: 38.1 }),
  stock("DEMO003", "川流能源", "公用事业", { net_profit_yoy: 23.6, revenue_yoy: 11.2, roe: 10.8, pe_ttm: 15.7, pb: 1.6, market_cap: 928, return_60d: 3.1, volatility_60d: 18.4 }),
  stock("DEMO004", "北辰医药", "医药生物", { net_profit_yoy: 18.9, revenue_yoy: 14.6, roe: 12.4, pe_ttm: 27.8, pb: 3.7, market_cap: 264, return_60d: -4.8, volatility_60d: 26.7 }),
  stock("DEMO005", "青禾消费", "食品饮料", { net_profit_yoy: 25.2, revenue_yoy: 8.3, roe: 21.4, pe_ttm: 29.6, pb: 5.1, market_cap: 1108, return_60d: 6.2, volatility_60d: 24.9 }),
  stock("DEMO006", "启明材料", "基础化工", { net_profit_yoy: 67.8, revenue_yoy: 22.1, roe: 9.6, pe_ttm: 21.3, pb: 2.1, market_cap: 176, return_60d: 33.7, volatility_60d: 45.2 }),
  stock("DEMO007", "汇港物流", "交通运输", { net_profit_yoy: -6.4, revenue_yoy: 4.5, roe: 7.8, pe_ttm: 19.1, pb: 1.3, market_cap: 356, return_60d: 1.8, volatility_60d: 20.3 }),
  stock("DEMO008", "凌云电子", "电子", { net_profit_yoy: 34.6, revenue_yoy: 28.9, roe: 15.1, pe_ttm: 32.4, pb: 4.9, market_cap: 642, return_60d: 18.4, volatility_60d: 29.2 }),
  stock("DEMO009", "海岳建设", "建筑装饰", { net_profit_yoy: 21.7, revenue_yoy: 6.2, roe: 8.9, pe_ttm: 9.8, pb: 0.9, market_cap: 214, return_60d: -2.1, volatility_60d: 19.7 }, { isST: true }),
  stock("DEMO010", "星河装备", "机械设备", { net_profit_yoy: 31.9, revenue_yoy: 19.4, roe: 14.3, pe_ttm: 24.5, pb: 3.2, market_cap: 538, return_60d: 12.5, volatility_60d: 27.4 }, { isSuspended: true }),
  stock("DEMO011", "华屹通信", "通信", { net_profit_yoy: 36.3, revenue_yoy: 24.7, roe: 16.8, pe_ttm: null, pb: 3.9, market_cap: 428, return_60d: 15.7, volatility_60d: 28.8 }),
  stock("DEMO012", "安澜金融", "非银金融", { net_profit_yoy: 22.8, revenue_yoy: 12.1, roe: 11.6, pe_ttm: 12.4, pb: 1.2, market_cap: 1530, return_60d: 7.9, volatility_60d: 21.5 }),
];
