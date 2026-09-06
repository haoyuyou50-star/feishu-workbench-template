# Cloudflare 部署与更新

## 首次部署

```bash
corepack enable
pnpm install
pnpm lint
pnpm test:all
pnpm build
npx wrangler login
npx wrangler deploy --config dist/server/wrangler.json --keep-vars
```

首次发布可以在尚未设置 Secret 时创建 Worker；此时飞书功能会显示未配置。随后逐项写入生产配置：

```bash
npx wrangler secret put FEISHU_APP_ID --name feishu-workbench-template
npx wrangler secret put FEISHU_APP_SECRET --name feishu-workbench-template
npx wrangler secret put FEISHU_TENANT_ORIGIN --name feishu-workbench-template
```

按需继续设置 Bitable、Open ID 和近期文档变量。不要把值写入命令历史、仓库文件或 CI 日志。

## 自定义域名

在 Cloudflare Workers 中为 Worker 添加自定义域名和 DNS，然后把同一 HTTPS 域名登记为飞书网页应用首页、可信域名和 OAuth 回调。回调路径固定为 `/api/auth/callback`。

## 重新部署

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm lint
pnpm test:all
pnpm build
npx wrangler deploy --config dist/server/wrangler.json --keep-vars
```

`--keep-vars` 是必需项，否则可能删除现有变量和 Secret 绑定。记录 Wrangler 返回的 Version ID。

## 上线核验

1. `GET https://your-domain.example.com/api/health` 返回 `ok: true`、`appConfigured: true`、`runtime: "edge"`。
2. 首页和新静态资源返回 200。
3. 在已授权浏览器检查 `/api/auth/status`。
4. 用 `refresh=1` 核对日历、任务和启用的看板。
5. 写操作只使用事先命名的测试记录，并在验证后恢复。

## 回滚

在 Cloudflare Workers 的 Deployments/Versions 中选择上一个已验证版本进行回滚。回滚代码不会自动回滚飞书权限、Bitable schema 或真实记录；这些变更必须独立记录和恢复。

## GitHub Actions

仓库 CI 只运行 lint、测试和构建，不自动部署。若需要自动发布，应使用 GitHub Environments、最小权限 Cloudflare token 和人工审批，绝不能把飞书 App Secret 暴露给不受信任的 Pull Request。
