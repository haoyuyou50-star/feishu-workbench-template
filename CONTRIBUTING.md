# Contributing

欢迎 Issue 和 Pull Request。

1. 从 `main` 创建功能分支。
2. 不要提交真实飞书凭证、租户域名、Open ID、Base ID、Cookie 或本机账号路径。
3. 行为变更必须附带针对性测试；UI 变更同时核验键盘、窄屏、亮暗主题和 reduced motion。
4. 提交前运行：

```bash
pnpm lint
pnpm test:all
pnpm build
```

Pull Request 请说明数据所有权、权限变化、缓存策略、视觉/动效影响和部署迁移步骤。
