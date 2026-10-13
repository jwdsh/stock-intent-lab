# 析选｜自然语言智能选股与策略解释器

这是题目 02 的可运行 MVP。它把一句模糊的选股意图转换成可检查、可修改、可执行的结构化条件，并由确定性筛选引擎根据数据快照返回入选、排除和无法判断结果。

## 在线体验

- 产品 URL：[https://illustrious-sundae-9bb680.netlify.app/](https://illustrious-sundae-9bb680.netlify.app/)
- 代码仓库：[jwdsh/stock-intent-lab](https://github.com/jwdsh/stock-intent-lab)
- 提交信息：见 [SUBMISSION.md](./SUBMISSION.md)

本地默认使用明确标注为“合成数据，仅用于功能验证”的演示快照，不把演示数据冒充实时行情。Netlify 线上数据模式取决于平台环境变量配置，以页面数据来源标识为准；启用真实数据需配置 `DATA_MODE=live`、`FUYAO_API_KEY` 和 `FUYAO_THSCODES`，密钥仅保存在平台环境变量中。

## 核心链路

1. 输入自然语言，例如“找经营改善、估值合理、走势相对稳定的股票”。
2. 解析器识别模糊词，并展示默认量化定义。
3. 用户编辑指标、运算符、阈值和 AND/OR 逻辑。
4. 规则引擎逐股比较条件，区分满足、不满足和无法判断。
5. 查看入选/排除证据，包括数值、单位、报告期、数据日期和来源。
6. 修改阈值、启停/增删条件、切换 AND/OR 或状态排除后重新运行，查看具体新增和移除股票及原因；未执行的修改不会改变旧结果表头。
7. 在全部/入选/排除/无法判断分类中搜索名称或代码，按任一指标排序，缺失值始终排在末尾。
8. 命名并保存策略，通过“查看已保存策略”按名称或原始意图查询、载入、更新和删除；刷新页面后仍可读取。从不同结果分类选择 2～4 只股票，对照全部 8 项指标、条件判断和数据来源。

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
- `/api/a-share/financials/income-statements`
- `/api/a-share/prices/historical`
- `/api/a-share/valuations/snapshot`
- `/api/a-share/financials/indicators`

Live 直连模式限制为最多 20 只股票，避免在 Web 请求中对全市场逐股扇出。全市场生产版本应使用扶摇 Market Dumps 建立离线快照/数据仓库，再由筛选引擎批量计算。

`.env.example` 提供 20 只 A 股代码，本地股票池也已扩展到 20 只。页面显示股票池范围和代码；这不是全 A 股筛选。修改 `.env.local` 的 `FUYAO_THSCODES` 后重启服务即可更换池子。

首次执行获取真实数据，之后 10 分钟内复用同一服务进程的数据快照，修改条件不重复请求上游；并发请求合并。缓存到期、服务重启或数据配置变化后重新获取。缓存不跨进程/实例共享。结果差异区会说明是否使用同一快照，避免将行情变化全部归因于条件变化。“重新运行”会重新计算条件，但有效期内不强制刷新上游。

接口调用串行执行，不立即重试限流。`FUYAO_REPORT` 留空时逐股选取最新已披露报告期；归母净利润同比使用利润表归母净利润与上年同期计算，上年同期非正时标记无法判断。财务日期展示披露日，报告期另行展示。估值日期是本批上游元数据最大时间，不表示全部字段同步更新。

已接入接口不提供总市值和可靠停牌状态：总市值显示缺失；Live 默认关闭“排除停牌”，启用后原本满足条件但停牌状态未知的股票会进入“无法判断”；已经明确不满足其他条件的股票仍为排除。ST 通过代码表名称前缀识别，不代表独立状态接口验证。状态排除可在界面独立开关。

单只股票的财务/行情接口失败或返回异常结构，会将对应指标标为缺失并保留其他有效数据。鉴权失败或限流会停止整批请求；代码表或估值批次失败会返回错误。没有有效快照时不会把旧数据伪装成新结果。

本地密钥验证命令（不会输出密钥，不纳入 CI）：

```bash
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.live.config.ts
```

真实浏览器验证：生产构建后运行 `node tests/live/workbench.mjs`，脚本启动并关闭自己的 3101 端口服务，验证 20 只股票、条件变化复用快照和 8 指标比较；截图写入忽略提交的 `test-results/`。

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
    ├── snapshot-cache.ts # 10 分钟进程内快照与并发合并
    ├── indicators.ts    # 行情推导指标
    ├── demo-data.ts
    └── fuyao.ts         # 扶摇适配器
```

## 已知边界

- 演示模式使用固定合成快照，不代表实时市场。
- Live 模式需要用户提供扶摇 API Key；仓库不包含任何密钥。
- 当前支持有限指标集合；行业分位、严谨历史回测和监控任务未实现。
- 本地解析器为有限规则，只覆盖常见利润、PE、波动率等表达；复杂自然语言应在后续模型接入时扩展，也可直接编辑条件。
- Live 模式的 60 日指标需要足够的历史 K 线，数据不足时显示“无法判断”，不会补零。
- 策略保存使用当前浏览器、当前网站地址下的 `localStorage`，最多 10 条；保存条件及原始意图，载入后重新获取筛选结果。同一策略再次保存会更新，重新解析意图会生成新策略。支持查询、载入、删除，不提供账号和跨设备同步；清除浏览器站点数据会删除记录。
- 本产品只做历史事实筛选，不提供确定性涨跌预测、收益承诺或直接买卖建议。

## 合规处理

输入“明天一定涨停”“保证收益”“直接告诉我买哪只”等请求会被拦截，并改为可验证的历史指标筛选起点。缺失、过期、接口失败和口径不适用不会静默生成正常结论。
