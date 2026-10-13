import { Workbench } from "@/components/workbench";
import { Suspense } from "react";
import { connection } from "next/server";

// Reflect the server's runtime data mode, including after a deployment config change.
async function RuntimeWorkbench() {
  await connection();
  const universe = [...new Set((process.env.FUYAO_THSCODES ?? "").split(",").map((v) => v.trim()).filter(Boolean))];
  return <Workbench dataMode={process.env.DATA_MODE === "live" ? "live" : "demo"} universe={universe} />;
}

export default function Home() {
  return <Suspense fallback={<p>正在加载选股工作台…</p>}><RuntimeWorkbench /></Suspense>;
}
