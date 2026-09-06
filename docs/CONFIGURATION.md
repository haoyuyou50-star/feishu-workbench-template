# 飞书与数据源配置

## 1. 创建飞书企业自建应用

1. 在飞书开放平台创建企业自建应用并启用网页应用。
2. 暂时填写本地或最终 HTTPS 首页。
3. 在权限管理中为用户身份开通：
   - `calendar:calendar:readonly`
   - `calendar:calendar.event:read`
   - `calendar:calendar.event:reply`
   - `task:task:read`
   - `task:task:write`
   - 使用 Wiki 时再开 `wiki:wiki:readonly`
4. 使用投奖或课程看板时，开通多维表格读取与编辑权限。
5. 创建并发布应用版本。仅保存权限但不发布，已签发 token 不会获得新权限。

## 2. OAuth 地址

部署域名假设为 `https://your-domain.example.com`：

- 网页应用首页：`https://your-domain.example.com/`
- OAuth 回调：`https://your-domain.example.com/api/auth/callback`
- 可信域名：`your-domain.example.com`

协议、域名、路径和端口必须完全一致。修改后重新发布飞书应用版本，再访问 `/api/auth/start?reauthorize=1`。

## 3. 环境变量

| 变量 | 必需 | 用途 |
| --- | --- | --- |
| `FEISHU_APP_ID` | 是 | 企业自建应用 ID |
| `FEISHU_APP_SECRET` | 是 | App Secret，只能放本地忽略文件或托管平台 Secret |
| `FEISHU_TENANT_ORIGIN` | 推荐 | 例如 `https://your-tenant.feishu.cn`，生成 Wiki/Bitable 链接 |
| `FEISHU_ACTOR_OPEN_ID` | 否 | 额外补充指定用户主日历 |
| `FEISHU_RECENT_DOC_QUERIES` | 否 | 逗号分隔的近期文档搜索词，最多 10 个 |
| `FEISHU_AWARDS_APP_TOKEN` | 投奖功能 | 投奖 Base app token |
| `FEISHU_AWARDS_TABLE_ID` | 投奖功能 | 投奖数据表 ID |
| `FEISHU_COURSES_APP_TOKEN` | 课程功能 | 课程 Base app token |
| `FEISHU_COURSES_TABLE_ID` | 课程功能 | 课程数据表 ID |

本地复制 `.dev.vars.example` 为 `.dev.vars`。不要提交 `.dev.vars`。

## 4. 多维表格

API 权限和文档权限是两层。除开通开放平台权限外，还要把自建应用添加为每张 Base 的文档应用/协作者，并授予需要的编辑权限。

### 投奖表建议字段

- 主字段：`投奖条目`
- 常用字段：`项目名称`、`比赛名称`、`截止日期`、`投递日期`、`投赛结果`、`比赛官网`
- 服务端会读取实际字段 schema，日期、网址和单选项在写入前会验证。

### 课程表字段

课程名称为主字段。结课功能要求以下字段存在：

```text
结课类型、结课状态、结课内容、结课要求、结课日期、提交方式、班委姓名、
是否组队、小组成员、联合作业课程、看板颜色、工作看板排序、课程看板排序
```

可先预览维护计划，再明确执行：

```bash
python scripts/setup_course_bitable.py
python scripts/setup_course_bitable.py --apply
python scripts/merge_duplicate_courses.py
python scripts/merge_duplicate_courses.py --apply
```

这些脚本从环境变量读取配置，默认不会写入。`--apply` 会修改真实表格，执行前务必备份并确认目标。

## 5. 授权核验

授权后检查：

1. `/api/auth/status` 返回 `authMode: "user"`。
2. `grantedScopes` 包含需要的 scope。
3. `/api/dashboard?refresh=1` 中 `tasksPersonalAvailable` 为 true。
4. 任务规划池显示“飞书任务已同步”。
5. 仅在指定测试任务后验证完成/恢复写回。
