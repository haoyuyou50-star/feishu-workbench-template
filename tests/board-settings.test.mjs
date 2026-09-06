import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  Activity, CalendarDays, FolderKanban, GraduationCap, LayoutDashboard,
  Library, Lightbulb, ListTodo, Trophy,
} from "lucide-react";
import { getBoardIcon } from "../dashboard/board-icons.js";

test("board names select meaningful icons before generic project or library words", () => {
  assert.equal(getBoardIcon({ name: "项目投奖管理" }), Trophy);
  assert.equal(getBoardIcon({ name: "用量监控看板" }), Activity);
  assert.equal(getBoardIcon({ name: "课程与结课" }), GraduationCap);
  assert.equal(getBoardIcon({ name: "灵感资料库" }), Lightbulb);
  assert.equal(getBoardIcon({ name: "项目资料库" }), Library);
  assert.equal(getBoardIcon({ name: "项目进度" }), FolderKanban);
  assert.equal(getBoardIcon({ name: "今日待办" }), ListTodo);
  assert.equal(getBoardIcon({ name: "日程安排" }), CalendarDays);
  assert.equal(getBoardIcon({ name: "  PROJECT AWARDS  " }), Trophy);
});

test("renaming a board updates its symbol without mutating saved data", () => {
  const board = Object.freeze({
    id: "board-placeholder-1", name: "灵感库", color: "#df87a4", description: "Notes",
  });
  assert.equal(getBoardIcon(board), Lightbulb);
  assert.equal(board.id, "board-placeholder-1");
  assert.equal(board.color, "#df87a4");
  assert.equal(board.name, "灵感库");
});

test("unrecognized names keep existing board identities or a neutral fallback", () => {
  assert.equal(getBoardIcon({ id: "board-placeholder-1", name: "作品集" }), Trophy);
  assert.equal(getBoardIcon({ id: "board-placeholder-2", name: "" }), GraduationCap);
  assert.equal(getBoardIcon({ id: "board-placeholder-3" }), Lightbulb);
  assert.equal(getBoardIcon({ id: "board-usage-monitor", name: "" }), Activity);
  assert.equal(getBoardIcon({ id: "custom", name: "自定义" }), LayoutDashboard);
  assert.equal(getBoardIcon(null), LayoutDashboard);
});

test("board editor uses the shared palette, modal focus, and isolated draft", async () => {
  const source = await readFile(new URL("../dashboard/main.jsx", import.meta.url), "utf8");
  const editor = source.slice(source.indexOf("function BoardCardDialog("), source.indexOf("function awardText("));
  const colors = source.match(/const SETTINGS_COLOR_PRESETS = \[([\s\S]*?)\];/)[1].match(/#[0-9a-f]{6}/g);
  assert.equal(colors.length, 16);
  assert.equal(new Set(colors).size, 16);
  assert.match(editor, /useModalFocus\(panelRef\)/);
  assert.match(editor, /return createPortal/);
  assert.match(editor, /<form className="dialog-shell" onSubmit={save}>/);
  assert.match(editor, /SETTINGS_COLOR_PRESETS\.map/);
  assert.match(editor, /aria-pressed=/);
  assert.match(editor, /aria-invalid={!validColor}/);
  assert.match(editor, /disabled={closing \|\| !validColor}/);
  assert.match(editor, /<BoardSymbol board={{ \.\.\.board, name: draft\.name }}/);
  assert.match(editor, /className="quiet-button" onClick={requestClose}>取消/);
  assert.match(editor, /onSave\({ name: draft\.name\.trim\(\)/);
  assert.match(source, /<BoardCardDialog key={boardEditTarget}/);
  assert.ok(source.includes("<BoardSymbol board={board} size={21}"));
});

test("editor has scoped compact dimensions and a narrow-screen palette", async () => {
  const css = await readFile(new URL("../dashboard/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.dialog-card\.feature-dialog\.board-card-dialog[^}]*width: min\(420px, calc\(100vw - 32px\)\)/);
  assert.match(css, /\.board-card-dialog \.dialog-shell[^}]*padding: 24px/);
  assert.match(css, /\.board-edit-palette[^}]*grid-template-columns: repeat\(8, 30px\)/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.board-edit-palette[^}]*repeat\(4, 30px\)/);
  assert.match(css, /\.board-edit-palette > button\.is-active[^}]*scale\(\.9\)[^}]*0 0 0 4px var\(--swatch\)/);
  assert.match(css, /\.board-edit-palette > button:focus-visible/);
  assert.match(css, /\.board-card-dialog \* { letter-spacing: 0; }/);
});
