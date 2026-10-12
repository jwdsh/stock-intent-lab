import { NextResponse } from "next/server";
import { z } from "zod";
import { parseIntent } from "@/lib/intent-parser";
import { parseIntentWithAI } from "@/lib/ai-intent-parser";

const requestSchema = z.object({ query: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    if (!process.env.AI_API_KEY) {
      return NextResponse.json({
        ...parseIntent(body.query),
        providerNote: "未配置 AI_API_KEY，当前使用本地可重复规则解析器。",
      });
    }
    try {
      return NextResponse.json(await parseIntentWithAI(body.query));
    } catch (cause) {
      const fallback = parseIntent(body.query);
      return NextResponse.json({
        ...fallback,
        providerNote: `AI 解析失败，已明确降级到本地规则：${cause instanceof Error ? cause.message : "未知错误"}`,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "请输入 1 到 500 字的选股意图。" }, { status: 400 });
    }
    return NextResponse.json({ error: "意图解析暂时不可用，请稍后重试。" }, { status: 500 });
  }
}
