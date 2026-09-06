export const PROJECT_STORAGE_KEY = "liufeng-workbench.project-prototype.v1";
export const TASK_STATES = ["待确认", "未开始", "进行中", "已完成"];
export const PROJECT_STATES = ["未开始", "进行中", "已完成", "已暂停"];
export const PROJECT_TYPES = ["创作", "设计", "开发", "研究"];
export const PROJECT_COLORS = ["#ef8a72", "#e6ad4f", "#9aad68", "#70b78e", "#58b6ad", "#75a7f0", "#ad8adb", "#df87a4", "#c85f48", "#b8791f", "#697a3e", "#3f7f5e", "#347e78", "#426fae", "#76539a", "#a84f6c"];

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function offsetDate(days, now) {
  return todayKey(new Date(now.getTime() + days * 86400000));
}
export function seedProjects(now = new Date()) {
  const projects = [
    ["p-film", "城市漫游 · 交互影像", "创作", "#75a7f0", "进行中", 21, "完成一部可体验的交互影像，以及 90 秒演示视频。"],
    ["p-photo", "日常切片 · 摄影集", "创作", "#df87a4", "进行中", 12, "整理 12 张照片，制作一份可以分享的电子摄影集。"],
    ["p-identity", "独立书店视觉识别", "设计", "#e6ad4f", "进行中", 15, "交付标志、基础色彩规范和三件应用设计。"],
    ["p-portfolio", "个人作品集更新", "设计", "#ad8adb", "未开始", 30, "挑选四个代表项目，统一作品叙述与版式。"],
    ["p-tool", "灵感收集小工具", "开发", "#70b78e", "进行中", 18, "做一个能保存、分类和检索灵感链接的小工具。"],
    ["p-home", "个人主页改版", "开发", "#58b6ad", "未开始", 35, "搭建首页和作品展示页，支持手机浏览。"],
    ["p-field", "街区声音采集", "研究", "#9aad68", "进行中", 9, "记录三处街区的声音与访谈，形成一份观察笔记。"],
    ["p-reading", "叙事交互阅读笔记", "研究", "#ef8a72", "已完成", -3, "整理三篇阅读笔记与一张方法对照表。"],
  ].map(([id, name, type, color, status, days, goal]) => ({
    id, name, type, color, status, goal, deadline: offsetDate(days, now), start: offsetDate(-5, now),
    owner: "我", members: "", source: "", resources: "", archived: false,
  }));
  const stages = [
    { id: "s-research", projectId: "p-film", name: "前期策划", goal: "选题与交互结构确认", deadline: offsetDate(-1, now), done: true },
    { id: "s-prototype", projectId: "p-film", name: "原型制作", goal: "可体验的交互原型", deadline: offsetDate(6, now), done: false },
    { id: "s-deliver", projectId: "p-film", name: "最终交付", goal: "完整作品与演示视频", deadline: offsetDate(21, now), done: false },
    { id: "s-design", projectId: "p-identity", name: "视觉方案", goal: "确认一套视觉方向", deadline: offsetDate(5, now), done: false },
    { id: "s-build", projectId: "p-tool", name: "核心功能", goal: "保存与检索流程可用", deadline: offsetDate(7, now), done: false },
  ];
  const tasks = [
    ["t-01", "p-film", "s-research", "确定选题与叙事方向", "已完成", -3],
    ["t-02", "p-film", "s-research", "整理影像与交互参考", "已完成", -1],
    ["t-03", "p-film", "s-prototype", "绘制交互流程图", "进行中", 2],
    ["t-04", "p-film", "s-prototype", "搭建第一版体验原型", "未开始", 6],
    ["t-05", "p-film", "s-deliver", "剪辑演示视频", "未开始", 19],
    ["t-06", "p-photo", "", "完成第一轮照片筛选", "待确认", 1],
    ["t-07", "p-photo", "", "制作摄影集版式", "未开始", 8],
    ["t-08", "p-identity", "s-design", "整理两组视觉方向", "进行中", -1],
    ["t-09", "p-identity", "s-design", "确认标志草案", "待确认", 3],
    ["t-10", "p-tool", "s-build", "实现链接保存", "已完成", -1],
    ["t-11", "p-tool", "s-build", "完成分类与搜索", "进行中", 4],
    ["t-12", "p-field", "", "联系第二处采集地点", "未开始", 2],
    ["t-13", "p-field", "", "整理首轮采集笔记", "进行中", 4],
    ["t-14", "p-reading", "", "完成叙事方法对照表", "已完成", -3],
  ].map(([id, projectId, stageId, name, status, days]) => ({
    id, projectId, stageId, name, status, deadline: offsetDate(days, now), owner: "我",
    blocked: id === "t-12" ? "等待场地方回复采集时间" : "", notes: "", result: "",
  }));
  return { version: 1, revision: 0, projects, stages, tasks };
}

export function progressFor(data, projectId) {
  const tasks = data.tasks.filter((task) => task.projectId === projectId);
  const stages = data.stages.filter((stage) => stage.projectId === projectId);
  const done = tasks.filter((task) => task.status === "已完成").length;
  return { total: tasks.length, done, percent: tasks.length ? Math.round(done / tasks.length * 100) : null,
    stageTotal: stages.length, stageDone: stages.filter((stage) => stage.done).length,
    currentStage: stages.find((stage) => !stage.done) || null,
    ready: tasks.length > 0 && done === tasks.length && stages.every((stage) => stage.done) };
}
export function overdue(task, today = todayKey()) {
  return Boolean(task.deadline && task.deadline < today && task.status !== "已完成");
}
export function safeProjectLink(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}
export function visibleTasks(data, { projectId = "", filter = "all", query = "", today = todayKey(), archived = false } = {}) {
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const weekEnd = offsetDate(7, new Date(today + "T00:00:00+08:00"));
  return data.tasks.filter((task) => {
    const project = projects.get(task.projectId);
    if (!project || (projectId && task.projectId !== projectId)) return false;
    if (Boolean(task.archived || project.archived) !== archived) return false;
    if (filter === "overdue" && !overdue(task, today)) return false;
    if (filter === "blocked" && (!task.blocked || task.status === "已完成")) return false;
    if (filter === "soon" && (!task.deadline || task.deadline < today || task.deadline > weekEnd || task.status === "已完成")) return false;
    return [task.name, task.owner, task.blocked, project.name].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });
}

function assertRecord(record) {
  if (!record || typeof record.id !== "string" || !record.id || typeof record.name !== "string" || !record.name.trim()) throw new Error("请填写名称。");
  if (record.archived !== undefined && typeof record.archived !== "boolean") throw new Error("归档状态无效。");
  if (record.name.trim().length > 120) throw new Error("名称最多 120 个字。");
  for (const field of ["start", "deadline"]) {
    const value = record[field];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value)) throw new Error("请填写有效日期。");
  }
}
export function validateProjectData(data) {
  if (!data || data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error("本地数据版本无法识别，原数据未被覆盖。");
  for (const key of ["projects", "stages", "tasks"]) {
    if (!Array.isArray(data[key])) throw new Error("本地数据不完整，原数据未被覆盖。");
    const ids = new Set();
    for (const record of data[key]) {
      assertRecord(record);
      if (ids.has(record.id)) throw new Error("存在重复记录标识。");
      ids.add(record.id);
    }
  }
  for (const project of data.projects) {
    if (!PROJECT_STATES.includes(project.status) || !/^#[0-9a-f]{6}$/i.test(project.color) || !project.type?.trim()) throw new Error("项目状态、类型或颜色无效。");
    if (project.start && project.deadline && project.deadline < project.start) throw new Error("项目截止日期不能早于开始日期。");
  }
  for (const item of [...data.stages, ...data.tasks]) if (!data.projects.some((p) => p.id === item.projectId)) throw new Error("请选择有效的所属项目。");
  for (const stage of data.stages) if (typeof stage.done !== "boolean") throw new Error("阶段确认状态无效。");
  for (const task of data.tasks) {
    if (!TASK_STATES.includes(task.status)) throw new Error("任务状态无效。");
    if (task.stageId && !data.stages.some((stage) => stage.id === task.stageId && stage.projectId === task.projectId)) throw new Error("阶段必须属于当前项目。");
  }
  return data;
}
export function applyProjectCommand(data, command) {
  const next = structuredClone(data);
  const collection = command.entity;
  if (!["projects", "stages", "tasks"].includes(collection)) throw new Error("未知记录类型。");
  if (command.type === "save") {
    const record = { ...command.record, name: command.record.name.trim() };
    const index = next[collection].findIndex((item) => item.id === record.id);
    if (index < 0) next[collection].push(record);
    else next[collection][index] = record;
  } else if (command.type === "move") {
    const record = next[collection].find((item) => item.id === command.id);
    if (!record || command.id === command.targetId) return data;
    Object.assign(record, command.patch || {});
    const remaining = next[collection].filter((item) => item.id !== record.id);
    const target = remaining.findIndex((item) => item.id === command.targetId);
    remaining.splice(target < 0 ? remaining.length : target + (command.after ? 1 : 0), 0, record);
    next[collection] = remaining;
  } else if (command.type === "remove" && collection !== "projects") {
    next[collection] = next[collection].filter((item) => item.id !== command.id);
    if (collection === "stages") next.tasks = next.tasks.map((task) => task.stageId === command.id ? { ...task, stageId: "" } : task);
  } else throw new Error("不支持的操作。");
  next.revision = data.revision + 1;
  return validateProjectData(next);
}

export function loadProjectPrototype(storage, now = new Date()) {
  const saved = storage.getItem(PROJECT_STORAGE_KEY);
  return saved ? validateProjectData(JSON.parse(saved)) : seedProjects(now);
}
export function persistProjectCommand(storage, current, command) {
  const stored = storage.getItem(PROJECT_STORAGE_KEY);
  if (stored && validateProjectData(JSON.parse(stored)).revision !== current.revision) throw new Error("另一个窗口已更新原型，请刷新后再试。当前草稿仍保留。");
  const next = applyProjectCommand(current, command);
  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
  return next;
}
