import { NextResponse } from "next/server";
import { z } from "zod";
import { strategySchema } from "@/lib/domain";
import { detectConflicts, screenStocks } from "@/lib/screening";
import { DEMO_STOCKS } from "@/lib/demo-data";
import { fetchFuyaoStocks } from "@/lib/fuyao";

export async function POST(request: Request) {
  try {
    const strategy = strategySchema.parse(await request.json());
    const conflicts = detectConflicts(strategy.conditions);
    if (conflicts.some((conflict) => conflict.type === "error")) {
      return NextResponse.json({ error: "筛选条件存在冲突。", conflicts }, { status: 422 });
    }
    const live = process.env.DATA_MODE === "live";
    const stocks = live ? await fetchFuyaoStocks() : DEMO_STOCKS;
    const snapshotDate = live
      ? stocks.flatMap((stock) => Object.values(stock.metrics)).map((metric) => metric.asOf).filter((date) => date !== "未知").sort().at(-1) ?? "未知"
      : undefined;
    return NextResponse.json(screenStocks(strategy, stocks, new Date().toISOString(), snapshotDate));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "策略结构无效。", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "筛选服务暂时不可用，请稍后重试。" }, { status: 500 });
  }
}
