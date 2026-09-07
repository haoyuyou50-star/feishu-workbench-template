# 架构与数据流

## 运行结构

```text
浏览器 React 工作台
  ├─ /api/auth/*       飞书 OAuth、HttpOnly Cookie、自动续期
  ├─ /api/dashboard    日历、任务、近期文档聚合
  ├─ /api/calendar     日期范围日历
  ├─ /api/wiki         当前用户可见知识库
  ├─ /api/awards       投奖多维表格
  └─ /api/courses      课程多维表格
             │
             └─ Cloudflare Worker → Feishu Open API
```

生产构建由 vinext 生成 `dist/server/wrangler.json`。所有飞书调用集中在 `app/api/[...path]/route.js`，客户端不接触 App Secret 或 token。

## 身份模型

- 日历、任务、Wiki：使用当前浏览器用户的 `user_access_token`。
- 投奖、课程 Bitable：Worker 使用 App ID/Secret 获取 `tenant_access_token`。
- 未授权时仅允许有限 tenant fallback，前端必须明确显示未连接状态。
- access token 过期后由服务端使用 refresh token 续期并轮换安全 Cookie。

## 任务同步

基础任务列表只覆盖“我负责的”。服务端同时按当前用户的负责人、创建者、关注人角色搜索未完成任务，自动分页、去重，再补齐任务详情。所有任务都返回给任务规划池，`defaultToday` 只决定是否进入今日栏；未来任务不能在服务端被提前删除。工作台和规划池只渲染未完成任务，飞书返回的完成状态优先于浏览器中可能残留的 `taskPrefs.done`，成功写回后会清除该本地覆盖。

## 缓存

- Dashboard、投奖和课程读取缓存 30 秒。
- `?refresh=1` 绕过读取缓存。
- 成功写入后清理对应缓存。
- 前端可乐观更新，但失败必须回滚到最后稳定状态。

## 本地数据

- localStorage：布局、主题、排序、个人看板偏好和项目原型。
- IndexedDB：便签图片。
- 本机用量助手：仅监听 `127.0.0.1`，配置文件不进入版本库。

## 扩展原则

新增功能前先确定唯一数据所有者。需要多人共享或跨设备的数据优先使用新的 Bitable 或有租户隔离的服务端存储；纯个人偏好继续使用版本化本地存储。不要复制第二套 OAuth、主题、弹窗或控件系统。
