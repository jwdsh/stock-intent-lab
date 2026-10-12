"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, BarChart3, Bookmark, Check, CheckCircle2, ChevronRight,
  CircleHelp, Database, Info, Loader2, Plus, RefreshCw, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Trash2, X, XCircle,
} from "lucide-react";
import type { Condition, MetricKey, ParseResult, ScreeningResult, StockEvaluation, Strategy } from "@/lib/domain";
import { METRIC_LIST, METRICS, formatMetricValue } from "@/lib/metrics";
import { detectConflicts, diffResults } from "@/lib/screening";

const DEFAULT_QUERY = "找经营改善、估值合理、走势相对稳定的股票";
const EXAMPLES = [
  "找经营改善、估值合理、走势相对稳定的股票",
  "净利润增长超过 30%，PE 不超过 25 倍",
  "找低估值、低波动的大盘股",
];

type ResultTab = "included" | "excluded" | "unavailable";

const FALLBACK_STRATEGY: Strategy = {
  id: "initial-strategy",
  name: "经营改善与稳健估值",
  originalQuery: DEFAULT_QUERY,
  logic: "AND",
  conditions: [
    { id: "profit", metric: "net_profit_yoy", operator: ">", value: 20, enabled: true },
    { id: "pe", metric: "pe_ttm", operator: "<", value: 30, enabled: true },
    { id: "vol", metric: "volatility_60d", operator: "<", value: 30, enabled: true },
  ],
  exclusions: ["ST", "SUSPENDED", "MISSING_DATA"],
};

async function requestJson<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data as T;
}

function StatusIcon({ status }: { status: "passed" | "failed" | "unavailable" }) {
  if (status === "passed") return <CheckCircle2 className="status-icon pass" aria-label="满足" />;
  if (status === "failed") return <XCircle className="status-icon fail" aria-label="不满足" />;
  return <CircleHelp className="status-icon unknown" aria-label="无法判断" />;
}

export function Workbench({ dataMode }: { dataMode: "demo" | "live" }) {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [strategy, setStrategy] = useState<Strategy>(FALLBACK_STRATEGY);
  const [clarifications, setClarifications] = useState<ParseResult["clarifications"]>([
    { term: "经营改善", message: "该表达没有唯一财务定义。", resolvedAs: "默认按最新报告期归母净利润同比 > 20%" },
    { term: "估值合理", message: "估值需要指定指标和比较口径。", resolvedAs: "默认按 PE-TTM < 30 倍" },
    { term: "走势稳定", message: "稳定可由波动率或最大回撤衡量。", resolvedAs: "默认按近 60 日年化波动率 < 30%" },
  ]);
  const [complianceMessage, setComplianceMessage] = useState<string>();
  const [parseMode, setParseMode] = useState<ParseResult["mode"]>("local");
  const [providerNote, setProviderNote] = useState("未配置模型时使用本地可重复解析器");
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [previousResult, setPreviousResult] = useState<ScreeningResult | null>(null);
  const [selected, setSelected] = useState<StockEvaluation | null>(null);
  const [tab, setTab] = useState<ResultTab>("included");
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"parse" | "screen" | null>(null);
  const [error, setError] = useState<string>();

  const conflicts = useMemo(() => detectConflicts(strategy.conditions), [strategy.conditions]);
  const diff = useMemo(() => result ? diffResults(previousResult, result) : null, [previousResult, result]);
  const visibleRows = result?.[tab] ?? [];
  const allEvaluations = result ? [...result.included, ...result.excluded, ...result.unavailable] : [];
  const compareRows = allEvaluations.filter((item) => compareSymbols.includes(item.stock.symbol));

  const parse = async () => {
    if (!query.trim()) { setError("请输入选股意图后再解析。"); return; }
    setBusy("parse"); setError(undefined); setSaved(false);
    try {
      const parsed = await requestJson<ParseResult>("/api/parse", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
      });
      setStrategy(parsed.strategy);
      setClarifications(parsed.clarifications);
      setComplianceMessage(parsed.complianceMessage);
      setParseMode(parsed.mode);
      setProviderNote(parsed.providerNote ?? (parsed.mode === "ai" ? "模型结构化解析" : "本地规则解析"));
      setResult(null); setPreviousResult(null); setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "意图解析失败");
    } finally { setBusy(null); }
  };

  const screen = async () => {
    if (conflicts.some((item) => item.type === "error")) { setError("请先修正条件冲突。"); return; }
    setBusy("screen"); setError(undefined); setSaved(false);
    try {
      const next = await requestJson<ScreeningResult>("/api/screen", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(strategy),
      });
      setPreviousResult(result);
      setResult(next);
      setTab("included");
      setSelected(next.included[0] ?? next.excluded[0] ?? next.unavailable[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "筛选执行失败");
    } finally { setBusy(null); }
  };

  const updateCondition = (id: string, update: Partial<Condition>) => {
    setStrategy((current) => ({
      ...current,
      conditions: current.conditions.map((condition) => condition.id === id ? { ...condition, ...update } : condition),
    }));
    setSaved(false);
  };

  const addCondition = () => {
    const used = new Set(strategy.conditions.map((item) => item.metric));
    const metric = METRIC_LIST.find((item) => !used.has(item.key)) ?? METRIC_LIST[0];
    setStrategy((current) => ({
      ...current,
      conditions: [...current.conditions, {
        id: crypto.randomUUID(), metric: metric.key, operator: metric.defaultOperator,
        value: metric.defaultValue, enabled: true,
      }],
    }));
  };

  const saveStrategy = () => {
    const existing = JSON.parse(localStorage.getItem("saved-strategies") ?? "[]") as Strategy[];
    localStorage.setItem("saved-strategies", JSON.stringify([strategy, ...existing.filter((item) => item.id !== strategy.id)].slice(0, 10)));
    setSaved(true);
  };

  const toggleCompare = (symbol: string) => {
    setCompareSymbols((current) => current.includes(symbol)
      ? current.filter((item) => item !== symbol)
      : current.length < 4 ? [...current, symbol] : current);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">析</div><div><strong>析选</strong><span>自然语言策略工作台</span></div></div>
        <div className="topbar-meta">
          <span className="mode-badge"><Database size={14} /> {dataMode === "live" ? "扶摇数据" : "演示数据"} · {parseMode === "ai" ? "AI 解析" : "本地解析"}</span>
          <span className="snapshot">{dataMode === "live" ? "以接口返回时点为准" : "快照截至 2025-12-31"}</span>
        </div>
      </header>

      <main className="workspace">
        <section className="intro-row">
          <div><p className="eyebrow">策略草稿 01</p><h1>把投资想法变成可验证条件</h1><p>AI 负责理解表达，规则引擎负责执行。每个数字都保留时点、口径和来源。</p></div>
          <div className="trust-note"><ShieldCheck size={18} /><span>不预测涨跌，不构成投资建议</span></div>
        </section>

        <section className="query-panel" aria-label="自然语言输入">
          <div className="query-label"><Sparkles size={17} /><label htmlFor="intent">描述你的选股意图</label><span>最多 500 字</span></div>
          <div className="query-row">
            <textarea id="intent" value={query} maxLength={500} onChange={(event) => setQuery(event.target.value)} />
            <button className="primary-button" onClick={parse} disabled={busy !== null}>
              {busy === "parse" ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />} 解析意图
            </button>
          </div>
          <div className="example-row"><span>试试：</span>{EXAMPLES.map((example) => <button key={example} onClick={() => setQuery(example)}>{example}</button>)}</div>
        </section>

        <div className="runtime-note"><Info size={14} /><span>{providerNote}</span></div>
        {(error || complianceMessage) && <div className={`notice ${complianceMessage ? "notice-warning" : "notice-error"}`}>
          <AlertCircle size={18} /><span>{complianceMessage ?? error}</span><button aria-label="关闭提示" onClick={() => { setError(undefined); setComplianceMessage(undefined); }}><X size={16} /></button>
        </div>}

        <div className="main-grid">
          <section className="conditions-section">
            <div className="section-heading">
              <div><span className="step-number">1</span><div><h2>检查并调整条件</h2><p>所有默认解释均可修改</p></div></div>
              <div className="logic-toggle" aria-label="条件逻辑">
                {(["AND", "OR"] as const).map((logic) => <button key={logic} className={strategy.logic === logic ? "active" : ""} onClick={() => setStrategy({ ...strategy, logic })}>{logic}</button>)}
              </div>
            </div>

            {clarifications.length > 0 && <div className="clarification-block">
              <div className="clarification-title"><Info size={16} />AI 使用了 {clarifications.length} 项默认定义</div>
              {clarifications.map((item) => <div className="clarification-item" key={item.term}><strong>{item.term}</strong><span>{item.resolvedAs}</span></div>)}
            </div>}

            <div className="condition-list">
              {strategy.conditions.map((condition, index) => {
                const metric = METRICS[condition.metric];
                return <div className={`condition-row ${condition.enabled ? "" : "disabled"}`} key={condition.id}>
                  <button className="check-button" aria-label={condition.enabled ? "停用条件" : "启用条件"} onClick={() => updateCondition(condition.id, { enabled: !condition.enabled })}>{condition.enabled && <Check size={14} />}</button>
                  <span className="condition-index">{String(index + 1).padStart(2, "0")}</span>
                  <select aria-label="指标" value={condition.metric} onChange={(event) => {
                    const nextMetric = METRICS[event.target.value as MetricKey];
                    updateCondition(condition.id, { metric: nextMetric.key, operator: nextMetric.defaultOperator, value: nextMetric.defaultValue });
                  }}>{METRIC_LIST.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select>
                  <select className="operator" aria-label="运算符" value={condition.operator} onChange={(event) => updateCondition(condition.id, { operator: event.target.value as Condition["operator"] })}>
                    {[">", ">=", "<", "<="].map((operator) => <option key={operator}>{operator}</option>)}
                  </select>
                  <div className="value-input"><input aria-label="阈值" type="number" step={metric.step} value={condition.value} onChange={(event) => updateCondition(condition.id, { value: Number(event.target.value) })} /><span>{metric.unit}</span></div>
                  <button className="icon-button" title="删除条件" aria-label="删除条件" onClick={() => setStrategy({ ...strategy, conditions: strategy.conditions.filter((item) => item.id !== condition.id) })}><Trash2 size={16} /></button>
                </div>;
              })}
            </div>
            <button className="add-button" onClick={addCondition}><Plus size={16} /> 添加条件</button>

            {conflicts.length > 0 && <div className="conflict-list">{conflicts.map((conflict) => <div key={conflict.message}><AlertCircle size={16} /><span>{conflict.message}</span></div>)}</div>}

            <div className="exclusions"><span>默认排除</span><b>ST</b><b>停牌</b><b>关键数据缺失</b></div>
            <div className="condition-actions">
              <button className="secondary-button" onClick={saveStrategy}><Bookmark size={17} />{saved ? "已保存" : "保存策略"}</button>
              <button className="primary-button run-button" onClick={screen} disabled={busy !== null || conflicts.some((item) => item.type === "error")}>
                {busy === "screen" ? <Loader2 className="spin" size={18} /> : <Search size={18} />} 执行筛选 <ArrowRight size={17} />
              </button>
            </div>
          </section>

          <section className="results-section">
            <div className="section-heading results-heading">
              <div><span className="step-number">2</span><div><h2>筛选结果</h2><p>{result ? `基于 ${result.snapshotDate} 数据快照` : "等待执行筛选"}</p></div></div>
              {result && <button className="refresh-button" onClick={screen}><RefreshCw size={15} />重新运行</button>}
            </div>

            {!result ? <div className="empty-state"><SlidersHorizontal size={34} /><h3>条件就绪</h3><p>确认左侧条件后执行筛选，结果将显示入选、排除与无法判断三类状态。</p></div> : <>
              <div className="result-stats">
                <div><span>股票池</span><strong>{result.total}</strong></div>
                <div className="positive"><span>入选</span><strong>{result.included.length}</strong></div>
                <div><span>排除</span><strong>{result.excluded.length}</strong></div>
                <div className="muted"><span>无法判断</span><strong>{result.unavailable.length}</strong></div>
              </div>

              {previousResult && diff && <div className="diff-strip"><span>本次变化</span><b>+{diff.added.length} 新增</b><b>-{diff.removed.length} 移除</b><small>{previousResult.included.length} → {result.included.length} 只</small></div>}

              <div className="result-tabs" role="tablist">
                {(["included", "excluded", "unavailable"] as ResultTab[]).map((key) => {
                  const labels = { included: "入选", excluded: "排除", unavailable: "无法判断" };
                  return <button role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)}>{labels[key]} <span>{result[key].length}</span></button>;
                })}
              </div>

              <div className="table-wrap"><table><thead><tr><th>比较</th><th>股票</th>{strategy.conditions.filter((item) => item.enabled).slice(0, 3).map((condition) => <th key={condition.id}>{METRICS[condition.metric].shortLabel}</th>)}<th></th></tr></thead>
                <tbody>{visibleRows.map((item) => <tr key={item.stock.symbol} className={selected?.stock.symbol === item.stock.symbol ? "selected" : ""} onClick={() => setSelected(item)}>
                  <td><button className={`compare-check ${compareSymbols.includes(item.stock.symbol) ? "checked" : ""}`} aria-label="加入比较" onClick={(event) => { event.stopPropagation(); toggleCompare(item.stock.symbol); }}>{compareSymbols.includes(item.stock.symbol) && <Check size={13} />}</button></td>
                  <td><strong>{item.stock.name}</strong><span>{item.stock.symbol} · {item.stock.industry}</span></td>
                  {item.evaluations.slice(0, 3).map((evaluation) => <td key={evaluation.condition.id}><span className={`metric-cell ${evaluation.status}`}>{formatMetricValue(evaluation.condition.metric, evaluation.metric.value)}</span></td>)}
                  <td><ChevronRight size={16} /></td>
                </tr>)}</tbody></table>{visibleRows.length === 0 && <div className="table-empty">该分类暂无股票</div>}</div>
            </>}
          </section>
        </div>

        {selected && <section className="evidence-section">
          <div className="evidence-header"><div><p className="eyebrow">判断依据</p><h2>{selected.stock.name} <span>{selected.stock.symbol}</span></h2></div><div className={`decision-badge ${selected.status}`}>{selected.status === "included" ? "满足全部条件" : selected.status === "excluded" ? "未通过筛选" : "数据不足"}</div></div>
          <div className="evidence-grid">
            {selected.evaluations.map((evaluation) => <article className="evidence-item" key={evaluation.condition.id}>
              <StatusIcon status={evaluation.status} /><div><h3>{METRICS[evaluation.condition.metric].label}</h3><strong>{formatMetricValue(evaluation.condition.metric, evaluation.metric.value)}</strong><p>{evaluation.reason}</p><dl><div><dt>时点</dt><dd>{evaluation.metric.asOf}</dd></div><div><dt>口径</dt><dd>{evaluation.metric.period}</dd></div><div><dt>来源</dt><dd>{evaluation.metric.source}</dd></div></dl></div>
            </article>)}
          </div>
          {selected.exclusionReasons.length > 0 && <div className="exclusion-summary"><AlertCircle size={17} /><span>{selected.exclusionReasons.join("；")}</span></div>}
        </section>}
      </main>

      {compareSymbols.length > 0 && <div className="compare-bar"><span><BarChart3 size={17} />已选择 {compareSymbols.length}/4 只</span><button onClick={() => setCompareSymbols([])}>清空</button><button className="primary-button" disabled={compareSymbols.length < 2} onClick={() => setShowCompare(true)}>开始比较</button></div>}

      {showCompare && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="股票比较"><div className="compare-modal"><div className="modal-header"><div><p className="eyebrow">横向比较</p><h2>候选股票指标对照</h2></div><button className="icon-button" onClick={() => setShowCompare(false)}><X /></button></div><div className="compare-table"><table><thead><tr><th>指标</th>{compareRows.map((row) => <th key={row.stock.symbol}>{row.stock.name}<span>{row.stock.symbol}</span></th>)}</tr></thead><tbody>{strategy.conditions.filter((item) => item.enabled).map((condition) => <tr key={condition.id}><td>{METRICS[condition.metric].label}</td>{compareRows.map((row) => { const item = row.evaluations.find((evaluation) => evaluation.condition.id === condition.id); return <td key={row.stock.symbol}>{item ? formatMetricValue(condition.metric, item.metric.value) : "--"}</td>; })}</tr>)}</tbody></table></div><p className="modal-footnote"><Info size={14} />比较使用同一策略与数据快照，缺失值不会按 0 处理。</p></div></div>}
    </div>
  );
}
