// Opt-in production/browser smoke check. Uses local .env.local; never logs credentials.
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3101"], {
  env: { ...process.env, DATA_MODE: "live" }, stdio: "ignore", windowsHide: true,
});
let browser;
try {
  const url = "http://127.0.0.1:3101";
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) throw new Error("Live test server exited before startup");
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("Live test server startup timed out");
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto(url);
  await expect(page.getByRole("region", { name: "股票池范围" })).toContainText("20 只");
  await page.getByRole("button", { name: "停用条件" }).first().click();
  await page.getByRole("button", { name: "停用条件" }).last().click();
  const initialResponse = page.waitForResponse((r) => r.url().endsWith("/api/screen"), { timeout: 120000 });
  await page.getByRole("button", { name: /执行筛选/ }).click();
  const first = await (await initialResponse).json();
  expect(first.total).toBe(20);
  expect(first.included.length).toBeGreaterThan(1);
  const table = page.getByRole("table", { name: "筛选股票列表" });
  await expect(table.getByRole("row")).toHaveCount(first.included.length + 1);
  const threshold = first.included.map((v) => v.stock.metrics.pe_ttm.value).sort((a, b) => a - b)[Math.floor(first.included.length / 2)];
  await page.getByLabel("阈值").nth(1).fill(String(threshold));
  const nextResponse = page.waitForResponse((r) => r.url().endsWith("/api/screen"));
  await page.getByRole("button", { name: /执行筛选/ }).click();
  const next = await (await nextResponse).json();
  expect(next.snapshot.id).toBe(first.snapshot.id);
  expect(next.included.length).toBeLessThan(first.included.length);
  await expect(page.getByRole("region", { name: "条件变化影响" })).toContainText("同一数据快照");
  await page.getByRole("tab", { name: /全部/ }).click();
  await expect(table.getByRole("row")).toHaveCount(21);
  await table.getByRole("button", { name: /^比较 / }).nth(0).click();
  await table.getByRole("button", { name: /^比较 / }).nth(1).click();
  await page.getByRole("button", { name: "开始比较" }).click();
  const dialog = page.getByRole("dialog", { name: "股票比较" });
  await expect(dialog.getByRole("row")).toHaveCount(9);
  await page.screenshot({ path: "test-results/live-compare-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 393, height: 851 });
  await expect(dialog.getByRole("button", { name: "关闭股票比较" })).toBeVisible();
  await page.screenshot({ path: "test-results/live-compare-mobile.png", fullPage: true });
  console.log(JSON.stringify({ total: next.total, before: first.included.length, after: next.included.length, excluded: next.excluded.length, sameSnapshot: true, comparisonMetrics: 8 }));
} finally {
  await browser?.close();
  server.kill();
}
