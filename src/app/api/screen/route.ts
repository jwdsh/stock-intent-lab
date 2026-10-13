import { NextResponse } from "next/server";
import { z } from "zod";
import { strategySchema } from "@/lib/domain";
import { detectConflicts, screenStocks } from "@/lib/screening";
import { DEMO_STOCKS } from "@/lib/demo-data";
import { fetchFuyaoStocks } from "@/lib/fuyao";
import { createSnapshotCache } from "@/lib/snapshot-cache";

const liveSnapshot = createSnapshotCache(fetchFuyaoStocks);

export async function POST(request: Request) {
  try {
    const strategy = strategySchema.parse(await request.json());
    const conflicts = detectConflicts(strategy.conditions, strategy.logic);
    if (conflicts.some((conflict) => conflict.type === "error")) {
      return NextResponse.json({ error: "筛选条件存在冲突。", conflicts }, { status: 422 });
    }
    const live = process.env.DATA_MODE === "live";
    const snapshot = live ? await liveSnapshot([process.env.FUYAO_BASE_URL, process.env.FUYAO_API_KEY, process.env.FUYAO_THSCODES, process.env.FUYAO_REPORT].join("|")) : null;
    const stocks = snapshot?.stocks ?? DEMO_STOCKS;
    const snapshotDate = live
      ? stocks.flatMap((stock) => Object.values(stock.metrics)).map((metric) => metric.asOf).filter((date) => date !== "未知").sort().at(-1) ?? "未知"
      : undefined;
    const result = screenStocks(strategy, stocks, new Date().toISOString(), snapshotDate);
    result.snapshot = { id: snapshot?.id ?? "demo-2025-12-31", fetchedAt: snapshot?.fetchedAt ?? "2025-12-31T00:00:00Z", expiresAt: snapshot?.expiresAt ?? "2099-01-01T00:00:00Z", universe: stocks.map((v) => v.symbol), mode: live ? "live" : "demo" };
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "策略结构无效。", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "筛选服务暂时不可用，请稍后重试。" }, { status: 500 });
  }
}
