# 析选｜自然语言智能选股与策略解释器

这是题目 02 的可运行 MVP。它把一句模糊的选股意图转换成可检查、可修改、可执行的结构化条件，并由确定性筛选引擎根据数据快照返回入选、排除和无法判断结果。

## 在线体验

部署后填写：

- 产品 URL：见 `SUBMISSION.md`
- 代码仓库：见 `SUBMISSION.md`

默认使用明确标注为“合成数据，仅用于功能验证”的演示快照，不把演示数据冒充实时行情。

## 核心链路

1. 输入自然语言，例如“找经营改善、估值合理、走势相对稳定的股票”。
2. 解析器识别模糊词，并展示默认量化定义。
3. 用户编辑指标、运算符、阈值和 AND/OR 逻辑。
4. 规则引擎逐股比较条件，区分满足、不满足和无法判断。
5. 查看入选/排除证据，包括数值、单位、报告期、数据日期和来源。
6. 修改阈值后重新运行，查看新增和移除股票。
7. 保存策略，选择 2～4 只股票横向比较。

## 技术栈

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4（基础样式采用 CSS 变量）
- Zod：策略和 AI 输出 Schema 校验
- Vitest：纯逻辑与 API 集成测试
- Playwright：桌面/移动端 E2E 测试
- `lucide-react`：图标

## AI、规则引擎和金融数据的边界

| 层 | 职责 |
|---|---|
| AI / 本地解析器 | 将自然语言映射为受约束的字段、运算符和阈值；发现需要澄清的表达；生成解释文字 |
| 确定性筛选引擎 | 计算指标、比较数值、执行 AND/OR、识别冲突、生成差异 |
| 金融数据适配器 | 标准化行情、估值和财务指标，并保留来源和时间 |

模型不能直接推荐股票，也不能决定某项数值条件是否满足。所有关键数字的比较都在 `src/lib/screening.ts` 完成。

### AI 模式

配置 `AI_API_KEY` 后，服务端调用 OpenAI-compatible Chat Completions 接口，要求 JSON 输出，随后用 Zod 校验字段、指标和运算符。AI 超时、HTTP 错误或返回非法 JSON 时，API 明确降级到本地规则解析并显示降级原因。

未配置密钥时，产品顶部显示“本地解析”，不是伪装成模型结果。

### 扶摇 Live 模式

配置 `DATA_MODE=live`、`FUYAO_API_KEY` 和显式的 `FUYAO_THSCODES` 后，使用扶摇官方 REST API：

- `/api/meta/tickers/list`
- `/api/a-share/prices/snapshot`
- `/api/a-share/prices/historical`
- `/api/a-share/valuations/snapshot`
- `/api/a-share/financials/indicators`

Live 直连模式限制为最多 20 只股票，避免在 Web 请求中对全市场逐股扇出。全市场生产版本应使用扶摇 Market Dumps 建立离线快照/数据仓库，再由筛选引擎批量计算。

## 本地运行

```bash
npm install
copy .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

## 验证命令

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright 首次使用需要下载浏览器：

```bash
npx playwright install chromium
```

## 目录结构

```text
src/
├── app/api/parse        # 意图解析 API
├── app/api/screen       # 冲突校验和筛选 API
├── components/          # 工作台 UI
└── lib/
    ├── domain.ts        # 领域类型和 Zod Schema
    ├── intent-parser.ts # 本地可重复解析器
    ├── ai-intent-parser.ts
    ├── screening.ts     # 确定性筛选、冲突和差异
    ├── indicators.ts    # 行情推导指标
    ├── demo-data.ts
    └── fuyao.ts         # 扶摇适配器
```

## 已知边界

- 演示模式使用固定合成快照，不代表实时市场。
- Live 模式需要用户提供扶摇 API Key；仓库不包含任何密钥。
- 当前支持有限指标集合；行业分位、严谨历史回测和监控任务未实现。
- Live 模式的 60 日指标需要足够的历史 K 线，数据不足时显示“无法判断”，不会补零。
- 策略保存使用当前浏览器 `localStorage`，不提供账号和跨设备同步。
- 本产品只做历史事实筛选，不提供确定性涨跌预测、收益承诺或直接买卖建议。

## 合规处理

输入“明天一定涨停”“保证收益”“直接告诉我买哪只”等请求会被拦截，并改为可验证的历史指标筛选起点。缺失、过期、接口失败和口径不适用不会静默生成正常结论。
