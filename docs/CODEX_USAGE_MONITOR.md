# 用量监控看板

看板默认保留 `Codex 账号 1`、`Codex 账号 2`、`豆包个人订阅`、`飞书 AI 会员` 四条数据。网页每 15 秒从本地助手读取一次快照；飞书会员额度默认每 2 分钟采集一次。网页只接收整理后的额度、刷新周期、Credits 和 Token 汇总，不读取登录令牌、Cookie、邮箱或账号 ID。

## 启动

不传配置时，采集器会读取当前终端所使用的 Codex 登录目录，并把它作为账号 1；账号 2 保持未启用状态。

```powershell
npm run usage:bridge
```

也可以使用含义更直观的同义命令：

```powershell
npm run usage:helper -- --config scripts/codex-usage-sources.local.json
```

同时读取两个账号时，先复制 `scripts/codex-usage-sources.example.json`，把两个 `codexHome` 改成各自独立且已完成登录的 Codex 数据目录，然后运行：

```powershell
npm run usage:bridge -- --config scripts/codex-usage-sources.local.json
```

每个目录由一个独立的 `codex app-server` 进程读取，采集器会强制使用 `cli_auth_credentials_store = "file"`，因此每个账号只读取各自 `CODEX_HOME/auth.json`，不会回退到共享的系统凭据库。采集依赖 Codex CLI/App Server 可执行文件，但不要求 Codex 桌面应用保持打开；关闭本机采集器后，看板会显示离线并保留两个账号槽位。

多账号监控时，两个数据源都必须使用固定的专用目录，例如 `.codex-account-1` 与 `.codex-account-2`。不要把 Codex 桌面应用正在使用的主目录 `.codex` 配置为其中一个数据源；桌面应用切换账号会覆盖该目录，从而让两张卡片串号。助手启动时会比较两个专用目录中的账号身份；如果发现重复账号，后一张卡片会显示明确错误，不再展示一份重复数据。

为每个账号登录时也要指定对应目录，并强制使用文件凭据。例如：

```powershell
$env:CODEX_HOME = "$env:USERPROFILE\.codex-account-2"
codex -c 'cli_auth_credentials_store="file"' login --device-auth
```

## 连接飞书与豆包会员

1. 保持本地助手运行并打开“用量监控看板”。
2. 点击 `打开登录窗口`。助手会启动一个独立的 Microsoft Edge 窗口并进入飞书额度管理页。
3. 在这个 Edge 窗口中完成一次飞书登录；页面出现“豆包”和“飞书”额度后无需复制任何内容，看板会自动更新。

该登录会话只保存在 `%LOCALAPPDATA%\LiuFeng\feishu-quota-helper-profile`。助手不会把 Cookie 或网页正文返回给前端，也不复用工作台的任务/日历 OAuth token。采集完成后 Edge 会自动退出；本地助手会在下次同步时用同一资料目录短暂后台读取，从而避免长期占用浏览器内存。若需要彻底断开，请先停止助手，再删除该资料目录。

默认使用已安装的 Microsoft Edge。若 Edge 位于其他位置，可设置环境变量 `FEISHU_QUOTA_BROWSER`；也可以在本地配置的 `feishuMembership` 中设置 `edgeExecutable`、`profileDir` 和 `refreshIntervalMs`。这些本机路径不要提交到仓库。

## 开机自启与维护提示

仓库提供 `scripts/start-usage-monitor.ps1`，用于在 Windows 登录后静默启动本地看板和用量助手。自启动任务只负责启动本机进程，不会打开浏览器页面或发布线上版本。

本地助手默认开启维护通知。同一个错误 30 分钟内只提醒一次；Codex 连接异常、飞书登录失效或会员额度采集失败时，Windows 通知区域会显示提示，看板内也会保留对应错误和重新检查入口。可在本地配置中使用 `notifications.enabled` 和 `notifications.cooldownMs` 调整。

## 扩展接口

页面读取 `http://127.0.0.1:47832/v1/usage`，协议版本为 `1`：

```json
{
  "version": 1,
  "generatedAt": "2026-09-05T08:00:00.000Z",
  "sources": [
    {
      "id": "codex-primary",
      "label": "Codex 账号 1",
      "provider": "codex-app-server",
      "accent": "#70b78e",
      "status": "ready",
      "planType": "plus",
      "generatedAt": "2026-09-05T08:00:00.000Z",
      "windows": {
        "primary": { "usedPercent": 18, "windowDurationMins": 300, "resetsAt": 1788600000 },
        "secondary": { "usedPercent": 42, "windowDurationMins": 10080, "resetsAt": 1789100000 }
      },
      "credits": { "hasCredits": true, "unlimited": false, "balance": "12.50" },
      "resetCredits": { "availableCount": 1 },
      "tokenUsage": { "lifetimeTokens": 150000, "currentStreakDays": 8 },
      "message": ""
    }
  ]
}
```

`sources` 可包含任意数量的数据源。新增记录只要使用唯一 `id` 并遵守上述字段，看板就会自动生成新卡片，无需修改 JSX。也可以用 `NEXT_PUBLIC_CODEX_USAGE_ENDPOINT` 指向另一个兼容 v1 协议的本机聚合服务。

## 安全边界

- 服务只监听 `127.0.0.1`，不会开放到局域网。
- CORS 默认只允许本地开发地址和工作台域名。
- API 响应不包含 `CODEX_HOME`、Edge 资料目录、Cookie、邮箱、账号 ID 或认证数据。
- 不要提交本地账号配置文件；示例文件仅用于复制。
