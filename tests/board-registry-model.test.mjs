import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WORKBENCH_BOARDS,
  getBoardDestination,
  normalizeWorkbenchBoards,
} from "../dashboard/board-registry-model.js";
import { USAGE_MONITOR_BOARD_ID } from "../dashboard/usage-monitor-model.js";

test("old three-card storage gains the integrated usage board before inspiration", () => {
  const oldBoards = DEFAULT_WORKBENCH_BOARDS.filter((board) => board.id !== USAGE_MONITOR_BOARD_ID);
  const migrated = normalizeWorkbenchBoards(oldBoards);
  assert.deepEqual(migrated.map((board) => board.id), [
    "board-placeholder-1",
    "board-placeholder-2",
    USAGE_MONITOR_BOARD_ID,
    "board-placeholder-3",
  ]);
});

test("a renamed legacy placeholder becomes the stable usage board without losing edits", () => {
  const migrated = normalizeWorkbenchBoards([
    { id: "custom-old-usage", name: "用量监控看板", description: "我自己的账号额度", color: "#df87a4" },
  ]);
  assert.equal(migrated.length, 1);
  assert.deepEqual(migrated[0], {
    id: USAGE_MONITOR_BOARD_ID,
    name: "用量监控看板",
    description: "我自己的账号额度",
    color: "#df87a4",
  });
  assert.equal(getBoardDestination(migrated[0]), "usage-monitor");
});

test("an existing stable usage board is not duplicated", () => {
  const current = [{ ...DEFAULT_WORKBENCH_BOARDS[2], name: "主账号额度" }];
  const migrated = normalizeWorkbenchBoards(current);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].name, "主账号额度");
});

test("legacy usage cards remain directly routable during migration", () => {
  assert.equal(getBoardDestination({ id: "old", name: "Codex 用量监控看板" }), "usage-monitor");
  assert.equal(getBoardDestination({ id: "custom", name: "普通资料" }), null);
});
