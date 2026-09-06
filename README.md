# Feishu Personal Workbench Template

一个可自托管、可二次开发的飞书个人工作台与看板模板。项目使用 React 19、vinext/Vite 和 Cloudflare Workers，支持飞书日历、任务、知识库、多维表格业务看板，以及浏览器本地组件。

> 仓库不包含任何可用的飞书凭证或个人数据。你需要创建自己的飞书企业自建应用和数据表。

## 功能

- 飞书日历：多日历读取、日视图、颜色保留、参会状态回复。
- 飞书任务：同步我负责、我创建、我关注的未完成任务，支持分页、任务规划池及完成状态写回。
- 飞书知识库：列出当前用户可见的 Wiki 空间。
- 多维表格看板：投奖管理、课程与结课管理。
- 本地工作台：布局、外观、看板偏好、项目管理原型。
- 便签图片剪贴板：图片粘贴、纵向浏览、预览、复制与删除，数据仅存当前浏览器。
- 用量监控：可选的本机 Codex/会员额度聚合服务。
- LiuFeng 设计系统：暖色纸张感主题、统一控件和无闪烁局部动效。

## 10 分钟开始

### 1. 克隆并安装

```bash
git clone https://github.com/haoyuyou50-star/feishu-workbench-template.git
cd feishu-workbench-template
corepack enable
pnpm install
```

需要 Node.js `>=22.13.0`，推荐 Node.js 24。

### 2. 配置本地环境

```powershell
Copy-Item .dev.vars.example .dev.vars
```

在 `.dev.vars` 中填写自己的配置。最少需要：

```dotenv
FEISHU_APP_ID=cli_your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_TENANT_ORIGIN=https://your-tenant.feishu.cn
```

投奖和课程看板是可选功能，启用时再填写对应的 `APP_TOKEN` 和 `TABLE_ID`。完整步骤见 [飞书与数据源配置](docs/CONFIGURATION.md)。

### 3. 启动

```bash
pnpm dev
```

打开终端显示的本地地址。未配置或未授权的模块会显示明确提示，不会把示例数据冒充成真实飞书数据。

### 4. 验证

```bash
pnpm lint
pnpm test:all
pnpm build
```

## 部署到 Cloudflare Workers

```bash
pnpm build
npx wrangler deploy --config dist/server/wrangler.json --keep-vars
```

首次部署后，通过 `wrangler secret put` 设置生产变量，并在飞书开放平台登记准确的 HTTPS 首页、可信域名和 OAuth 回调：

```text
https://your-domain.example.com/api/auth/callback
```

完整发布、更新和回滚流程见 [部署指南](docs/DEPLOYMENT.md)。

## 数据与隐私边界

| 数据 | 存储位置 | 跨设备 |
| --- | --- | --- |
| 日历、任务、Wiki | 飞书；服务端使用用户 OAuth Cookie | 是 |
| 投奖、课程 | 飞书多维表格 | 是 |
| 布局、外观、个人排序 | 浏览器 localStorage | 否 |
| 便签图片 | 浏览器 IndexedDB | 否 |
| 用量监控登录状态 | 可选本机助手的独立目录 | 否 |

用户 access token 和 refresh token 仅保存在 `HttpOnly; Secure; SameSite=Lax` Cookie 中；App Secret 仅存在于本机忽略文件或 Cloudflare Secret。

## 二次开发

- [架构与数据流](docs/ARCHITECTURE.md)
- [飞书与多维表格配置](docs/CONFIGURATION.md)
- [Cloudflare 部署与更新](docs/DEPLOYMENT.md)
- [LiuFeng 设计规范](docs/DESIGN_SYSTEM.md)
- [Agent 接管与开发手册](docs/AGENT_GUIDE.md)
- [用量监控说明](docs/CODEX_USAGE_MONITOR.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)

如果你使用 Codex 或其他 Agent，先让它完整阅读根目录 [AGENTS.md](AGENTS.md) 和 [Agent 指南](docs/AGENT_GUIDE.md)。

## 项目结构

```text
app/                    页面和 Edge API
dashboard/              工作台、看板、模型与样式
public/                 主题运行时和静态资源
scripts/                可选维护与本机用量助手
tests/                  API、模型、渲染、动效测试
docs/                   配置、部署、设计与 Agent 文档
```

## License

[MIT](LICENSE)
