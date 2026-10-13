import { expect, test } from "@playwright/test";

test("persists, searches, loads, updates and deletes strategy conditions across reloads", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("策略名称", { exact: true }).fill("我的稳健策略");
  await page.getByLabel("阈值").nth(1).fill("22");
  await page.getByRole("button", { name: "OR", exact: true }).click();
  await page.getByRole("button", { name: "停用条件" }).first().click();
  await page.getByLabel("排除 ST", { exact: true }).uncheck();
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  const shelf = page.getByRole("region", { name: "已保存策略", exact: true });
  await expect(shelf).toContainText("1/10");
  await expect(shelf).toContainText("市盈率（PE-TTM） < 22");
  await page.reload();
  await page.getByRole("button", { name: "查看已保存策略", exact: true }).click();
  await expect(shelf).toContainText("我的稳健策略");
  await page.getByLabel("搜索已保存策略", { exact: true }).fill("不存在");
  await expect(shelf).toContainText("没有匹配的策略");
  await page.getByLabel("搜索已保存策略", { exact: true }).fill("稳健");
  await page.getByRole("button", { name: "载入策略 我的稳健策略", exact: true }).click();
  await expect(page.getByLabel("阈值").nth(1)).toHaveValue("22");
  await expect(page.getByRole("button", { name: "OR", exact: true })).toHaveClass("active");
  await expect(page.getByRole("button", { name: "启用条件", exact: true })).toHaveCount(1);
  await expect(page.getByLabel("排除 ST", { exact: true })).not.toBeChecked();
  await page.getByLabel("阈值").nth(1).fill("18");
  await expect(page.getByRole("button", { name: "保存策略", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await expect(shelf).toContainText("1/10");
  await page.reload();
  await page.getByRole("button", { name: "查看已保存策略", exact: true }).click();
  await page.getByRole("button", { name: "载入策略 我的稳健策略", exact: true }).click();
  await expect(page.getByLabel("阈值").nth(1)).toHaveValue("18");
  await page.getByRole("button", { name: "删除策略 我的稳健策略", exact: true }).click();
  await expect(shelf).toContainText("暂无已保存策略");
  await page.reload();
  await page.getByRole("button", { name: "查看已保存策略", exact: true }).click();
  await expect(shelf).toContainText("暂无已保存策略");
});

test("keeps multiple parsed strategies and clears old results on loading", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("策略名称", { exact: true }).fill("策略一");
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await page.getByLabel("描述你的选股意图").fill("PE 不超过 25 倍");
  await page.getByRole("button", { name: /解析意图/ }).click();
  await expect(page.getByLabel("阈值")).toHaveCount(1);
  await page.getByLabel("策略名称", { exact: true }).fill("策略二");
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await expect(page.getByRole("region", { name: "已保存策略", exact: true })).toContainText("2/10");
  await page.getByRole("button", { name: /执行筛选/ }).click();
  await expect(page.getByRole("table", { name: "筛选股票列表" })).toBeVisible();
  await page.getByRole("button", { name: "比较 远望制造", exact: true }).click();
  await page.getByRole("button", { name: "载入策略 策略一", exact: true }).click();
  await expect(page.getByRole("table", { name: "筛选股票列表" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "开始比较", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("描述你的选股意图")).toHaveValue("找经营改善、估值合理、走势相对稳定的股票");
  await expect(page.getByLabel("阈值")).toHaveCount(3);
  await page.getByRole("button", { name: /执行筛选/ }).click();
  await expect(page.getByRole("table", { name: "筛选股票列表" })).toBeVisible();
});

test("reports corrupt or unavailable storage without overwriting records or claiming success", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("saved-strategies", '{"invalid":true}'));
  await page.getByRole("button", { name: "查看已保存策略", exact: true }).click();
  await expect(page.getByText(/无法读取已保存策略/)).toBeVisible();
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await expect(page.getByText("浏览器存储不可用或已有记录损坏，策略未保存。")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("saved-strategies"))).toBe('{"invalid":true}');
  await page.evaluate(() => {
    localStorage.removeItem("saved-strategies");
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await expect(page.getByRole("button", { name: "已保存", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("saved-strategies"))).toBeNull();
});
