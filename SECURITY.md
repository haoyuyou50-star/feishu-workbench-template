# Security Policy

## 不应进入仓库的内容

- `FEISHU_APP_SECRET`、Cloudflare API token
- user/tenant/app access token、refresh token、OAuth code、Cookie
- `.dev.vars`、本地账号配置、浏览器资料目录
- 真实 Open ID、租户域名、Base app token、table ID

如果秘密被提交，请立即在对应平台轮换；仅从最新提交删除并不足以清理 Git 历史。

## 报告安全问题

请使用 GitHub Security Advisories 私下报告漏洞，不要在公开 Issue 中粘贴凭证、响应头、Cookie 或包含个人数据的截图。

## 部署建议

- 使用最小权限飞书 scopes 和 Cloudflare token。
- 生产 Secret 存在托管平台，不进入 GitHub Actions 普通变量。
- 不允许来自不受信任 Pull Request 的工作流访问生产 Secret。
- 保留 OAuth state 校验、同源写入检查和安全 Cookie 属性。
