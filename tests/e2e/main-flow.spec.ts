import { expect, test } from "@playwright/test";

test("completes the main screening and explanation flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "把投资想法变成可验证条件" })).toBeVisible();
  await page.getByRole("button", { name: /执行筛选/ }).click();
  await expect(page.getByText("基于 2025-12-31 数据快照")).toBeVisible();
  await expect(page.getByRole("tab", { name: /入选/ })).toBeVisible();
  await expect(page.getByText("远望制造").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /远望制造/ })).toBeVisible();
  await expect(page.getByText("演示数据快照（合成数据，仅用于功能验证）").first()).toBeVisible();
});

test("parses a new intent and exposes editable thresholds", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("描述你的选股意图");
  await input.fill("净利润增长超过 35%，PE 不超过 25 倍");
  await page.getByRole("button", { name: /解析意图/ }).click();
  await expect(page.getByLabel("阈值").first()).toHaveValue("35");
  await expect(page.getByLabel("阈值").nth(1)).toHaveValue("25");
});

test("blocks conflicting conditions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加条件" }).click();
  const metrics = page.getByLabel("指标");
  await metrics.last().selectOption("pe_ttm");
  const operators = page.getByLabel("运算符");
  const values = page.getByLabel("阈值");
  await operators.nth(1).selectOption("<");
  await values.nth(1).fill("10");
  await operators.last().selectOption(">");
  await values.last().fill("30");
  await expect(page.getByText(/上下界互相冲突/)).toBeVisible();
  await expect(page.getByRole("button", { name: /执行筛选/ })).toBeDisabled();
});

test("shows the compliance boundary", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("描述你的选股意图").fill("告诉我明天一定涨停的股票");
  await page.getByRole("button", { name: /解析意图/ }).click();
  await expect(page.getByText(/无法提供确定性涨跌预测/)).toBeVisible();
});
