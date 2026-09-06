import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import * as icons from "lucide-react";
import * as model from "../dashboard/project-management-model.js";

/* eslint-disable react/prop-types -- These lightweight component doubles are scoped to SSR tests. */

// Component rendering checks, not browser/visual QA. Keep the real project
// components and model; replace only the established workbench/portal shell.
const mocks = {
  React, ...React, ...icons, ...model,
  Link: ({ children, ...props }) => React.createElement("a", props, children),
  defaultWorkbenchAppearance: () => null,
  AppearanceDialog: () => null,
  LFSelect: ({ ariaLabel, value, options, disabled }) => React.createElement("button", { "aria-label": ariaLabel, disabled, "data-value": value }, options.find((o) => o.value === value)?.label),
  LFDatePicker: ({ ariaLabel, value }) => React.createElement("input", { "aria-label": ariaLabel, value, readOnly: true }),
  PageFooter: ({ stats }) => React.createElement("footer", null, stats.map((s) => s.value + " " + s.label).join(" / ")),
  useCourseCardMotion() {},
  DialogFrame: ({ title, navigation, children, footer, form }) => React.createElement("section", { role: "dialog" },
    React.createElement("h2", null, title), navigation,
    form ? React.createElement("form", { id: form.id }, children) : children,
    typeof footer === "function" ? footer(() => {}) : footer),
};
globalThis.__projectRenderMocks = mocks;
const localValues = new Map();
globalThis.localStorage = {
  getItem: (key) => localValues.get(key) ?? null,
  setItem: (key, value) => localValues.set(key, value),
};
async function compileComponent(name) {
  const source = await readFile(new URL("../dashboard/" + name, import.meta.url), "utf8");
  const bindings = [...source.matchAll(/^import\s+(.+?)\s+from\s+["'][^"']+["'];?$/gm)].flatMap((match) => {
    const imported = match[1].replace(/[{}]/g, "");
    return imported.split(",").map((s) => s.trim()).filter(Boolean);
  });
  const prefix = "const { " + [...new Set(["React", ...bindings])].join(", ") + " } = globalThis.__projectRenderMocks;\n";
  const stripped = source.replace(/^import[^\n]*\n/gm, "");
  const result = await transformWithEsbuild(prefix + stripped, name, { loader: "jsx", jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment", sourcemap: false });
  return import("data:text/javascript;base64," + Buffer.from(result.code).toString("base64"));
}
const dialog = await compileComponent("project-record-dialog.jsx");
Object.assign(mocks, dialog, { ProjectRecordDialog: dialog.default });
const board = await compileComponent("project-management.jsx");
const data = model.seedProjects(new Date("2026-08-26T08:00:00Z"));
const renderDialog = (initial, records = data) => renderToStaticMarkup(React.createElement(dialog.default, { initial, data: records, commit() {}, onClose() {} }));
const renderBoard = (props = {}, records = data) => {
  localValues.set(model.PROJECT_STORAGE_KEY, JSON.stringify(records));
  return renderToStaticMarkup(React.createElement(board.default, props));
};

test("project overview renders the actual eight-card prototype without network access", () => {
  const html = renderToStaticMarkup(React.createElement(board.default));
  assert.equal((html.match(/class="pm-card /g) || []).length, 8);
  assert.match(html, /工作看板/); assert.match(html, /项目看板/);
  assert.match(html, /城市漫游/); assert.match(html, /个人主页/);
  assert.match(html, /尚未接入飞书同步/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /--project-color:#75a7f0/);
});
test("project detail is read-only first and has overview, tasks, stages and edit entry", () => {
  const html = renderDialog({ entity: "projects", id: "p-film", edit: false });
  assert.match(html, /编辑项目/);
  assert.match(html, /概览/); assert.match(html, /阶段/); assert.match(html, /任务/);
  assert.match(html, /原型制作/); assert.match(html, /40%/);
  assert.doesNotMatch(html, /<form/);
});
test("project editor renders shared field navigation and all sixteen colors", () => {
  const html = renderDialog({ entity: "projects", id: "p-film", edit: true });
  assert.match(html, /project-prototype-form/);
  assert.match(html, /编辑字段导航/); assert.match(html, /目标与关联/);
  assert.match(html, /项目配色/);
  assert.equal((html.match(/aria-label="选择颜色 /g) || []).length, 16);
  assert.match(html, /aria-label="项目状态"/);
});
test("task detail and task editor render their separate state and project association", () => {
  const detail = renderDialog({ entity: "tasks", id: "t-12", edit: false });
  assert.match(detail, /等待场地方回复/); assert.match(detail, /编辑任务/);
  assert.doesNotMatch(detail, /<form/);
  const editor = renderDialog({ entity: "tasks", id: "t-03", edit: true });
  for (const name of ["任务状态", "所属项目", "所属阶段", "截止日期"]) assert.ok(editor.includes('aria-label="' + name + '"'));
});
test("new project and stage confirmation render with safe defaults", () => {
  const fresh = renderDialog({ entity: "projects", record: dialog.blankRecord("projects"), edit: true });
  assert.match(fresh, /新的项目/); assert.match(fresh, /required=""/);
  const stage = renderDialog({ entity: "stages", id: "s-prototype", edit: true, returnTo: "p-film" });
  assert.match(stage, /阶段成果已确认/); assert.match(stage, /aria-checked="false"/);
  assert.match(stage, /返回项目/);
});
test("project cards are a flat grid without category headers", () => {
  const html = renderBoard();
  assert.match(html, /class="pm-project-grid /);
  assert.doesNotMatch(html, /class="pm-column /);
  assert.doesNotMatch(html, /<h2>(创作|设计|开发|研究)<\/h2>/);
  const reordered = model.applyProjectCommand(data, { type: "move", entity: "projects", id: "p-home", targetId: "p-film" });
  const grid = renderBoard({}, reordered).split('aria-label="项目看板"')[1];
  assert.ok(grid.indexOf('data-course-motion-key="p-home"') < grid.indexOf('data-course-motion-key="p-film"'));
});
test("work columns start with pending confirmation and create action is in the page header", () => {
  const html = renderBoard({ initialView: "status" });
  assert.deepEqual([...html.matchAll(/<h2>(待确认|未开始|进行中|已完成)<\/h2>/g)].map((m) => m[1]), ["待确认", "未开始", "进行中", "已完成"]);
  const header = html.split("</header>")[0];
  assert.match(header, /award-create-header pm-create-header/);
  assert.match(header, /新建任务/);
  const sectionBar = html.slice(html.indexOf("<main"), html.indexOf('class="pm-prototype-note"'));
  assert.doesNotMatch(sectionBar, /新建任务/);
  assert.match(renderBoard().split("</header>")[0], /新建项目/);
});
test("completed tasks show only project and task names with detail and move controls retained", () => {
  const html = renderBoard({ initialView: "status" });
  const completed = [...html.matchAll(/<article class="pm-card [^"]*is-completed-compact[\s\S]*?<\/article>/g)].map((m) => m[0]);
  assert.equal(completed.length, data.tasks.filter((t) => t.status === "已完成").length);
  for (const card of completed) {
    assert.match(card, /pm-completed-project/);
    assert.match(card, /<h3>/);
    assert.match(card, /aria-label="查看/);
    assert.match(card, /draggable="true"/);
    assert.match(card, /aria-label="上移/);
    assert.doesNotMatch(card, /pm-task-stage|pm-progress|<footer|pm-blocked/);
    const summary = card.match(/class="pm-card-open pm-completed-summary"[\s\S]*?<\/button>/)[0];
    assert.doesNotMatch(summary, /\d{4}\.\d{2}\.\d{2}/);
  }
  const reopened = model.applyProjectCommand(data, { type: "save", entity: "tasks", record: { ...data.tasks[0], status: "进行中" } });
  const reopenedCard = renderBoard({ initialView: "status" }, reopened).match(/<article [^>]*data-course-motion-key="t-01"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(reopenedCard, /is-completed-compact/);
  assert.match(reopenedCard, /pm-task-stage/);
});
test("archive entry is available in both views and archived tasks have a restore path", () => {
  for (const initialView of ["project", "status"]) assert.match(renderBoard({ initialView }), /aria-label="查看归档"/);
  const archived = model.applyProjectCommand(data, { type: "save", entity: "tasks", record: { ...data.tasks[0], archived: true } });
  const html = renderBoard({ initialView: "status", initialArchived: true }, archived);
  assert.match(html, /aria-label="返回未归档看板"/);
  assert.equal((html.match(/class="pm-card /g) || []).length, 1);
  assert.match(html, /data-course-motion-key="t-01"/);
  assert.match(renderDialog({ entity: "tasks", id: "t-01", edit: false }, archived), /恢复任务/);
  assert.match(renderDialog({ entity: "tasks", id: "t-01", edit: false }), /归档任务/);
  const parentArchived = model.applyProjectCommand(data, { type: "save", entity: "projects", record: { ...data.projects[0], archived: true } });
  const detail = renderDialog({ entity: "tasks", id: "t-01", edit: false }, parentArchived);
  assert.match(detail, /随项目归档/);
  assert.match(detail, /查看已归档项目/);
  assert.doesNotMatch(detail, /恢复任务/);
});
