import assert from "node:assert/strict";
import test from "node:test";

import { taskIsDone, unfinishedTasks, withoutTaskDonePreference } from "../dashboard/task-list-model.js";

test("server completion wins over a stale local incomplete preference", () => {
  const task = { id: "task-1", completed: true };
  assert.equal(taskIsDone(task, { done: false }), true);
  assert.deepEqual(unfinishedTasks([task], { "task-1": { done: false, inToday: true } }), []);
});

test("optimistic and local-only completed tasks leave unfinished lists", () => {
  const tasks = [
    { id: "task-1", completed: false },
    { id: "task-2", completed: false },
  ];
  assert.deepEqual(unfinishedTasks(tasks, { "task-1": { done: true } }).map((task) => task.id), ["task-2"]);
});

test("successful synchronization removes only the local done override", () => {
  const prefs = {
    "task-1": { done: false, inToday: true, transitionId: 42 },
    "task-2": { inToday: false },
  };
  assert.deepEqual(withoutTaskDonePreference(prefs, "task-1"), {
    "task-1": { inToday: true, transitionId: 42 },
    "task-2": { inToday: false },
  });
  assert.equal(withoutTaskDonePreference(prefs, "missing"), prefs);
});
