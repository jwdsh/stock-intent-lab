import { expect, test } from "@playwright/test";

test("explains specific removals and keeps old result headers until rerun", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /执行筛选/ }).click();
  const table = page.getByRole("table", { name: "筛选股票列表" });
  await expect(table.getByRole("row")).toHaveCount(5);
  await page.getByLabel("阈值").nth(1).fill("20");
  await expect(page.getByRole("status")).toContainText("仍是上次执行结果");
  await expect(table.locator("thead th").nth(4)).toContainText("30");
  await page.getByRole("button", { name: /执行筛选/ }).click();
  const diff = page.getByRole("region", { name: "条件变化影响" });
  await expect(diff).toContainText("-1 移除");
  await expect(diff).toContainText("青禾消费");
  await expect(diff).toContainText("同一数据快照");
  await expect(table.getByRole("row")).toHaveCount(4);
});

test("compares across result categories, enforces four-stock limit and resets after rerun", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /执行筛选/ }).click();
  await page.getByRole("tab", { name: /全部/ }).click();
  for (const name of ["远望制造", "澄明科技", "华屹通信", "海岳建设"]) await page.getByRole("button", { name: `比较 ${name}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "比较 川流能源", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "开始比较" }).click();
  const dialog = page.getByRole("dialog", { name: "股票比较" });
  await expect(dialog.getByRole("row")).toHaveCount(9);
  await expect(dialog).toContainText("华屹通信");
  await expect(dialog).toContainText("无法判断");
  await dialog.getByRole("button", { name: "关闭股票比较" }).click();
  await page.getByRole("button", { name: /重新运行/ }).click();
  await expect(page.getByRole("button", { name: "开始比较" })).toHaveCount(0);
});

test("supports exclusion switches and name/code search with numeric sorting", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "停用条件" }).first().click();
  await page.getByLabel("排除 ST", { exact: true }).uncheck();
  await page.getByLabel("排除停牌", { exact: true }).uncheck();
  await page.getByRole("button", { name: /执行筛选/ }).click();
  const table = page.getByRole("table", { name: "筛选股票列表" });
  await expect(table).toContainText("海岳建设");
  await expect(table).toContainText("星河装备");
  await page.getByLabel("搜索结果股票").fill("DEMO009");
  await expect(table.getByRole("row")).toHaveCount(2);
  await page.getByLabel("搜索结果股票").fill("");
  await page.getByLabel("结果排序指标").selectOption("pe_ttm");
  await expect(table.getByRole("row").nth(1)).toContainText("海岳建设");
  await page.getByLabel("排除 ST", { exact: true }).check();
  await page.getByRole("button", { name: /执行筛选/ }).click();
  await expect(table).not.toContainText("海岳建设");
  await page.getByRole("tab", { name: /排除/ }).click();
  await table.getByRole("row").filter({ hasText: "海岳建设" }).click();
  await expect(page.getByText("已按策略排除 ST 股票", { exact: true })).toBeVisible();
});

test("accepts OR bounds that would conflict under AND", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加条件" }).click();
  await page.getByLabel("指标").last().selectOption("pe_ttm");
  await page.getByLabel("阈值").nth(1).fill("10");
  await page.getByLabel("运算符").last().selectOption(">");
  await page.getByLabel("阈值").last().fill("30");
  await expect(page.getByRole("button", { name: /执行筛选/ })).toBeDisabled();
  await page.getByRole("button", { name: "OR", exact: true }).click();
  await page.getByRole("button", { name: /执行筛选/ }).click();
  await expect(page.getByText("已执行逻辑：OR", { exact: false })).toBeVisible();
});
