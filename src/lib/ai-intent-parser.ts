import { z } from "zod";
import type { ParseResult } from "./domain";
import { conditionSchema } from "./domain";

const aiOutputSchema = z.object({
  name: z.string().min(1).max(50),
  logic: z.enum(["AND", "OR"]),
  conditions: z.array(conditionSchema.omit({ id: true }).extend({ id: z.string().optional() })).min(1).max(8),
  clarifications: z.array(z.object({ term: z.string(), message: z.string(), resolvedAs: z.string() })).max(8),
  unsupportedTerms: z.array(z.string()).max(8),
  complianceMessage: z.string().optional(),
});

const SYSTEM_PROMPT = `你是自然语言选股条件解析器。只输出 JSON，不推荐股票，不预测涨跌。
支持字段：net_profit_yoy, revenue_yoy, roe, pe_ttm, pb, market_cap, return_60d, volatility_60d。
支持运算符：>, >=, <, <=。所有数值用人类展示单位：百分比用 20 表示 20%，市值用亿元。
模糊表达必须给出清晰、可编辑的默认定义，并写入 clarifications。
确定性收益、涨停预测、直接买卖建议必须写入 complianceMessage，并仅给出可验证历史条件替代。
输出结构：{name,logic,conditions:[{metric,operator,value,enabled}],clarifications:[{term,message,resolvedAs}],unsupportedTerms,complianceMessage?}。`;

export async function parseIntentWithAI(query: string): Promise<ParseResult> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY 未配置");
  const baseUrl = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? "gpt-5-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: query }],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型没有返回结构化内容");
    const parsed = aiOutputSchema.parse(JSON.parse(content));
    return {
      strategy: {
        id: crypto.randomUUID(), name: parsed.name, originalQuery: query, logic: parsed.logic,
        conditions: parsed.conditions.map((condition) => ({ ...condition, id: condition.id ?? crypto.randomUUID() })),
        exclusions: ["ST", "SUSPENDED", "MISSING_DATA"],
      },
      clarifications: parsed.clarifications,
      unsupportedTerms: parsed.unsupportedTerms,
      complianceMessage: parsed.complianceMessage,
      mode: "ai",
      providerNote: `${model} 结构化解析；输出已通过 Zod Schema 校验`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
