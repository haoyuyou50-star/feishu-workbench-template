# LiuFeng 设计规范

## 视觉语言

- 气质：温暖、安静、纸张感、准确；信息优先于装饰。
- 浅色基线：背景 `#f8f5f0`、文字 `#1a1613`、卡片 `#fffdf9`、边框 `#e8e2da`、弱文字 `#9a918a`、强调色 `#d97757`。
- 语义色：成功 `#3d7a4a`、删除 `#b35a5a`；状态色从当前 accent 混合生成。
- 间距使用 4 px 基准：`4/8/12/16/20/24/32/48`。
- 根圆角 10 px，嵌套层级逐级减小。
- 优先复用 CSS variables、`LFSelect`、`LFDatePicker`、`IconButton`、`DialogFrame`、`PageFooter`。

## 页面与卡片

- 页头顺序：身份/标题与日期 → 搜索 → 最多两个快捷入口 → 设置。
- 主壳通常不超过 960 px；只有真实双栏架构才扩展到约 1300 px。
- 卡片使用 1 px 暖灰边框、3 px 顶部强调色、14–18 px 内边距；静止时不使用重阴影。
- 业务 ID、React key、排序 key 和 motion key 必须来自稳定业务 ID，不能使用数组下标、标题或颜色。
- CSS columns 适合纵向报纸顺序，Grid 适合横向行顺序；一个看板只选择一种排序模型。

## 控件与无障碍

- 文本按钮最小高度 34 px，页级图标按钮 36 px，卡片图标按钮 28 px。
- 所有图标按钮提供 `aria-label` 和 title/tooltip。
- 拖动只能从手柄开始，并提供键盘或设置入口替代路径。
- 弹窗居中，打开与关闭均有动画，退出完成后再卸载并恢复焦点。
- 核验 400/480/720 px、80–140% 字体、亮暗主题和 `prefers-reduced-motion`。

## 动效

```css
--motion-fast: 140ms;
--motion-base: 220ms;
--motion-slow: 320ms;
--motion-standard: cubic-bezier(.2, 0, 0, 1);
--motion-emphasized: cubic-bezier(.16, 1, .3, 1);
```

- 首次入场只运行一次；保存、刷新、筛选、排序和换主题不能重播整页动画。
- 详情切编辑保留同一弹窗和卡片外壳，只动画内部内容。
- 删除先冻结几何，再局部淡出、位移和折叠。
- 排序使用稳定 key + FLIP/View Transition，只动画位置差。
- 重复操作要取消或串行旧计时器，避免闪卡。
- reduced motion 下缩短到约 1 ms，但仍完成状态与焦点生命周期。

## 新看板流程

1. 写数据契约：稳定 ID、字段、空值、权限、缓存和错误。
2. 在独立 model 文件实现纯聚合、分组、排序和迁移，并先写测试。
3. 在统一 API 路由增加验证、同源检查、错误映射和缓存清理。
4. 在 `dashboard/` 添加独立 JSX/CSS，复用共享控件和 token。
5. 使用稳定 board ID 注册导航。
6. 完成 loading、empty、error/retry、搜索、键盘和窄屏状态。
7. 补充 API、model、渲染、设计和动效回归测试。
