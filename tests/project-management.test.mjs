import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PROJECT_STORAGE_KEY, TASK_STATES, seedProjects, todayKey, validateProjectData, progressFor, overdue, visibleTasks, safeProjectLink, applyProjectCommand, loadProjectPrototype, persistProjectCommand } from "../dashboard/project-management-model.js";

const now = new Date("2026-08-26T08:00:00Z");
function memoryStorage() {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
function save(data, entity, record) { return applyProjectCommand(data, { type: "save", entity, record }); }

test("representative seed contains independent project types and exactly four task states", () => {
  const data = validateProjectData(seedProjects(now));
  assert.equal(data.projects.length, 8);
  assert.equal(new Set(data.projects.map((p) => p.type)).size, 4);
  assert.equal(data.tasks.length, 14);
  assert.deepEqual(TASK_STATES, ["待确认", "未开始", "进行中", "已完成"]);
  assert.equal(todayKey(new Date("2026-08-25T17:00:00Z")), "2026-08-26");
});
test("progress counts tasks, confirmed stages and next unconfirmed stage separately", () => {
  const p = progressFor(seedProjects(now), "p-film");
  assert.equal(p.done, 2); assert.equal(p.total, 5); assert.equal(p.percent, 40);
  assert.equal(p.stageDone, 1); assert.equal(p.stageTotal, 3);
  assert.equal(p.currentStage.id, "s-prototype");
  assert.equal(p.ready, false);
  const empty = progressFor(seedProjects(now), "p-home");
  assert.equal(empty.percent, null); assert.equal(empty.ready, false);
});
test("completing tasks does not auto-confirm stages or close a project", () => {
  let data = seedProjects(now);
  for (const task of data.tasks.filter((t) => t.projectId === "p-film")) data = save(data, "tasks", { ...task, status: "已完成" });
  assert.equal(progressFor(data, "p-film").percent, 100);
  assert.equal(progressFor(data, "p-film").ready, false);
  assert.equal(data.projects.find((p) => p.id === "p-film").status, "进行中");
  for (const stage of data.stages.filter((s) => s.projectId === "p-film")) data = save(data, "stages", { ...stage, done: true });
  assert.equal(progressFor(data, "p-film").ready, true);
  assert.equal(data.projects.find((p) => p.id === "p-film").status, "进行中");
});
test("adding a project, optional stage and task preserves immutable input", () => {
  const original = seedProjects(now);
  const snapshot = structuredClone(original);
  let data = save(original, "projects", { ...original.projects[0], id: "new-p", name: "  新项目  ", type: "个人事务" });
  data = save(data, "tasks", { ...original.tasks[0], id: "new-t", name: "新任务", projectId: "new-p", stageId: "", status: "未开始" });
  assert.equal(data.projects.at(-1).name, "新项目");
  assert.equal(progressFor(data, "new-p").total, 1);
  assert.deepEqual(original, snapshot);
});
test("tasks cannot reference another project's stage or a missing project", () => {
  const data = seedProjects(now);
  assert.throws(() => save(data, "tasks", { ...data.tasks[0], projectId: "p-tool" }), /阶段必须属于/);
  assert.throws(() => save(data, "tasks", { ...data.tasks[0], projectId: "missing", stageId: "" }), /所属项目/);
  const moved = save(data, "tasks", { ...data.tasks[0], projectId: "p-tool", stageId: "s-build" });
  assert.equal(progressFor(moved, "p-film").total, 4);
  assert.equal(progressFor(moved, "p-tool").total, 3);
});
test("reorder and cross-status move are atomic and retain task IDs", () => {
  const original = seedProjects(now);
  const moved = applyProjectCommand(original, { type: "move", entity: "tasks", id: "t-03", targetId: "t-06", after: true, patch: { status: "待确认" } });
  assert.equal(moved.tasks[moved.tasks.findIndex((t) => t.id === "t-06") + 1].id, "t-03");
  assert.equal(moved.tasks.find((t) => t.id === "t-03").status, "待确认");
  assert.equal(moved.tasks.length, original.tasks.length);
  assert.equal(moved.revision, original.revision + 1);
  assert.equal(applyProjectCommand(original, { type: "move", entity: "tasks", id: "t-03", targetId: "t-03" }), original);
});
test("moving to an empty status keeps the task once", () => {
  const original = seedProjects(now);
  original.tasks = original.tasks.filter((t) => t.status !== "待确认");
  const data = applyProjectCommand(original, { type: "move", entity: "tasks", id: "t-03", patch: { status: "待确认" } });
  assert.equal(data.tasks.filter((t) => t.status === "待确认").length, 1);
  assert.equal(data.tasks.at(-1).id, "t-03");
});
test("project recolor and classification retain its stages and tasks", () => {
  const original = seedProjects(now);
  const data = save(original, "projects", { ...original.projects[0], color: "#76539a", type: "展览" });
  assert.equal(data.projects[0].id, original.projects[0].id);
  assert.deepEqual(data.tasks, original.tasks); assert.deepEqual(data.stages, original.stages);
  assert.equal(data.projects[0].color, "#76539a");
});
test("archive is reversible and excludes descendants only from the work view", () => {
  const original = seedProjects(now);
  let data = save(original, "projects", { ...original.projects[0], archived: true });
  assert.equal(visibleTasks(data).some((t) => t.projectId === "p-film"), false);
  assert.equal(data.tasks.length, original.tasks.length);
  data = save(data, "projects", { ...data.projects[0], archived: false });
  assert.equal(visibleTasks(data).filter((t) => t.projectId === "p-film").length, 5);
});
test("individual task archiving is reversible without changing status or progress", () => {
  const original = seedProjects(now);
  const task = original.tasks.find((t) => t.id === "t-01");
  let data = save(original, "tasks", { ...task, archived: true });
  assert.equal(visibleTasks(data).some((t) => t.id === task.id), false);
  assert.deepEqual(visibleTasks(data, { archived: true }).map((t) => t.id), [task.id]);
  assert.equal(data.tasks.find((t) => t.id === task.id).status, "已完成");
  assert.deepEqual(progressFor(data, "p-film"), progressFor(original, "p-film"));
  data = save(data, "tasks", { ...task, archived: false });
  assert.equal(visibleTasks(data).some((t) => t.id === task.id), true);
  assert.equal(visibleTasks(data, { archived: true }).length, 0);
});
test("project archive includes descendants once and preserves independent task archives on restore", () => {
  let data = seedProjects(now);
  data = save(data, "tasks", { ...data.tasks[0], archived: true });
  data = save(data, "projects", { ...data.projects[0], archived: true });
  assert.equal(visibleTasks(data, { archived: true }).length, 5);
  assert.equal(new Set(visibleTasks(data, { archived: true }).map((t) => t.id)).size, 5);
  data = save(data, "projects", { ...data.projects[0], archived: false });
  assert.equal(visibleTasks(data, { archived: true }).length, 1);
  assert.equal(visibleTasks(data, { projectId: "p-film" }).length, 4);
});
test("flat project ordering never changes project type and survives reload", () => {
  const storage = memoryStorage(), original = seedProjects(now);
  const data = persistProjectCommand(storage, original, { type: "move", entity: "projects", id: "p-home", targetId: "p-film" });
  assert.equal(data.projects[0].id, "p-home");
  assert.equal(data.projects[0].type, "开发");
  assert.deepEqual(loadProjectPrototype(storage).projects, data.projects);
  assert.deepEqual(data.tasks, original.tasks);
});
test("legacy tasks without an archived field remain active", () => {
  const data = seedProjects(now);
  for (const task of data.tasks) delete task.archived;
  assert.equal(visibleTasks(validateProjectData(data)).length, data.tasks.length);
  assert.throws(() => save(data, "tasks", { ...data.tasks[0], archived: "false" }), /归档状态无效/);
});
test("removing stages preserves tasks and clears only their stage reference", () => {
  const original = seedProjects(now);
  const data = applyProjectCommand(original, { type: "remove", entity: "stages", id: "s-prototype" });
  assert.equal(data.tasks.length, original.tasks.length);
  assert.equal(data.tasks.find((t) => t.id === "t-03").stageId, "");
  assert.equal(data.tasks.find((t) => t.id === "t-01").stageId, "s-research");
  assert.equal(progressFor(data, "p-film").stageTotal, 2);
});
test("removing a task recalculates progress but preserves its parent", () => {
  const data = applyProjectCommand(seedProjects(now), { type: "remove", entity: "tasks", id: "t-04" });
  assert.equal(progressFor(data, "p-film").percent, 50);
  assert.equal(data.projects.find((p) => p.id === "p-film").status, "进行中");
  assert.throws(() => applyProjectCommand(data, { type: "remove", entity: "projects", id: "p-film" }), /不支持/);
});
test("overdue and seven-day filters use Shanghai calendar dates, exclude completion", () => {
  const data = seedProjects(now), today = "2026-08-26";
  assert.deepEqual(visibleTasks(data, { filter: "overdue", today }).map((t) => t.id), ["t-08"]);
  assert.equal(overdue({ deadline: today, status: "未开始" }, today), false);
  assert.equal(overdue({ deadline: "2026-08-25", status: "已完成" }, today), false);
  assert.equal(visibleTasks(data, { filter: "soon", today }).every((t) => t.deadline >= today && t.deadline <= "2026-09-02" && t.status !== "已完成"), true);
  assert.deepEqual(visibleTasks(data, { filter: "blocked", today }).map((t) => t.id), ["t-12"]);
  assert.equal(visibleTasks(data, { query: "城市漫游" }).length, 5);
  assert.equal(visibleTasks(data, { projectId: "p-home" }).length, 0);
});
test("rejects invalid dates, colors, blank titles and duplicate IDs", () => {
  const data = seedProjects(now);
  assert.throws(() => save(data, "projects", { ...data.projects[0], name: " " }), /名称/);
  assert.throws(() => save(data, "projects", { ...data.projects[0], deadline: "2026-02-30" }), /有效日期/);
  assert.throws(() => save(data, "projects", { ...data.projects[0], deadline: "2026-01-01" }), /早于/);
  assert.throws(() => save(data, "projects", { ...data.projects[0], color: "red" }), /颜色/);
  assert.throws(() => validateProjectData({ ...data, tasks: [...data.tasks, data.tasks[0]] }), /重复/);
});
test("local persistence roundtrips mutations without touching unrelated keys", () => {
  const storage = memoryStorage();
  storage.setItem("course-data", "preserve");
  const original = loadProjectPrototype(storage, now);
  const data = persistProjectCommand(storage, original, { type: "save", entity: "projects", record: { ...original.projects[0], name: "本地修改" } });
  assert.deepEqual(loadProjectPrototype(storage), data);
  assert.equal(storage.getItem("course-data"), "preserve");
  assert.equal(data.revision, 1);
});
test("quota failure leaves current data unchanged and conflicts cannot overwrite a newer revision", () => {
  const storage = memoryStorage(), original = seedProjects(now);
  const command = { type: "save", entity: "projects", record: { ...original.projects[0], name: "改名" } };
  const broken = { getItem: () => null, setItem() { throw new Error("QuotaExceeded"); } };
  assert.throws(() => persistProjectCommand(broken, original, command), /QuotaExceeded/);
  assert.equal(original.projects[0].name, "城市漫游 · 交互影像");
  persistProjectCommand(storage, original, command);
  assert.throws(() => persistProjectCommand(storage, original, command), /另一个窗口/);
  assert.equal(loadProjectPrototype(storage).revision, 1);
});
test("corrupt storage is never replaced by example data", () => {
  const storage = memoryStorage();
  storage.setItem(PROJECT_STORAGE_KEY, "{invalid");
  assert.throws(() => loadProjectPrototype(storage));
  assert.equal(storage.getItem(PROJECT_STORAGE_KEY), "{invalid");
  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ version: 99 }));
  assert.throws(() => loadProjectPrototype(storage), /版本/);
});
test("source links allow only explicit http and https destinations", () => {
  assert.equal(safeProjectLink("javascript:alert(1)"), "");
  assert.equal(safeProjectLink("data:text/html,x"), "");
  assert.equal(safeProjectLink("课程名称"), "");
  assert.equal(safeProjectLink("https://example.com/作品"), "https://example.com/%E4%BD%9C%E5%93%81");
});
test("prototype uses shared UI and local state, with four-column and narrow layouts", async () => {
  const [board, dialog, css, route] = await Promise.all(["../dashboard/project-management.jsx", "../dashboard/project-record-dialog.jsx", "../dashboard/project-management.css", "../app/project-preview/page.jsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.doesNotMatch(board + dialog, /fetch\(|\/api\//);
  assert.match(board, /persistProjectCommand/);
  assert.match(board, /useCourseCardMotion/);
  assert.match(dialog, /import \{ DialogFrame \}/);
  assert.equal((dialog.match(/<DialogFrame\b/g) || []).length, 1);
  assert.match(dialog, /LFDatePicker/); assert.match(dialog, /LFSelect/);
  assert.match(board, /onKeyDown=\{\(e\) => keyboardMove/);
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
  for (const width of [720, 480]) assert.ok(css.includes("max-width: " + width + "px"));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(route, /"localhost", "127.0.0.1", "\[::1\]"/);
  assert.match(route, /原型仅在本地开放/);
});
