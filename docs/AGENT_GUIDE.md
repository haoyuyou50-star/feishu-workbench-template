# Agent 接管与开发手册

## 可直接复制的接管提示词

```text
请接管这个 Feishu Personal Workbench Template。开始前完整阅读 AGENTS.md、README.md、docs/ARCHITECTURE.md、docs/CONFIGURATION.md、docs/DESIGN_SYSTEM.md 和 docs/DEPLOYMENT.md。

先做只读检查：git status --short、package.json、受影响组件/API/测试。不要读取或输出 Secret，不要覆盖已有修改，不要默认部署，也不要用真实飞书任务、日历或多维表格记录做测试。

开发时沿用现有 OAuth、数据边界、主题 token、共享控件、稳定 ID 和 140/220/320ms 局部动效。完成后运行针对性测试、pnpm lint、pnpm test:all、pnpm build。只有我明确授权发布后才允许部署，并必须保留线上变量。
```

## 开始工作

1. 阅读根目录 `AGENTS.md`。
2. 查看 `git status --short` 和当前分支。
3. 根据需求读取相关模型、组件、CSS、API 和测试。
4. 明确数据是浏览器本地、用户 OAuth、Bitable 还是新服务端存储。
5. 先定义验收行为和失败状态，再修改代码。

## 新增应用或看板

优先作为当前工作台的新看板。只有身份、域名、数据权限或发布周期需要隔离时才创建独立应用。

- 新建稳定 ID 和数据契约。
- 纯逻辑放 model 文件，不把聚合散落在 JSX。
- 复用现有主题、弹窗和选择器。
- 服务端输入必须校验，写操作必须同源检查。
- 提供 loading/empty/error/retry、移动端、键盘和 reduced motion。
- 更新文档和测试，不把个人 tenant/Base ID 设为默认值。

## 飞书修改

- 用户日历、任务、Wiki 使用 user token。
- Bitable 使用 tenant token。
- 新 scope 需要：代码请求 → 控制台开通 → 发布应用版本 → 用户重新授权。
- OAuth token 只存 HttpOnly Cookie。
- 写入成功后清缓存；失败回滚前端乐观状态。

## 发布

Agent 不应把“测试通过”理解为“允许上线”。只有所有者明确要求发布时，才执行 `docs/DEPLOYMENT.md` 的流程。发布后报告 Version ID、健康状态、已验证范围和任何必须由用户完成的登录步骤。
