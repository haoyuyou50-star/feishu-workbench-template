import assert from "node:assert/strict";
import test from "node:test";
import { WORK_STATUSES, INCOMPLETE_STATUS, filterCourseView, courseWorkGroups, courseMotionDelta } from "../dashboard/course-board-model.js";

const courses = [...WORK_STATUSES, INCOMPLETE_STATUS, "考试"].map((status, index) => ({ id: `course${index}`, status }));
test("work view contains exactly four assignment statuses, even when empty", () => {
  assert.deepEqual(WORK_STATUSES, ["未开始", "进行中", "待提交", "已完成"]);
  assert.deepEqual(filterCourseView(courses, "status").map(c => c.status), WORK_STATUSES);
  assert.deepEqual(courseWorkGroups([]).map(group => [group.status, group.courses.length]), WORK_STATUSES.map(status => [status, 0]));
});
test("project view retains exams and unfinished courses; unfinished filter is reversible", () => {
  assert.equal(filterCourseView(courses, "project").length, 6);
  assert.deepEqual(filterCourseView(courses, "project", true).map(c => c.status), [INCOMPLETE_STATUS]);
  assert.deepEqual(filterCourseView(courses, "status", true).map(c => c.status), [INCOMPLETE_STATUS]);
  assert.equal(filterCourseView(courses, "project", false).length, 6);
  assert.equal(courses.length, 6);
});
test("status changes move only the existing course into its target group", () => {
  const updated = courses.map(c => c.id === "course0" ? { ...c, status: "进行中" } : c);
  const groups = courseWorkGroups(filterCourseView(updated, "status"));
  assert.equal(groups[0].courses.length, 0);
  assert.deepEqual(groups[1].courses.map(c => c.id), ["course0", "course1"]);
  assert.equal(groups.length, 4);
});
test("card motion uses position deltas and skips unchanged or newly mounted cards", () => {
  assert.equal(courseMotionDelta(null, {x: 5, y: 8}), null);
  assert.equal(courseMotionDelta({x: 5, y: 8}, {x: 5, y: 8}), null);
  assert.deepEqual(courseMotionDelta({x: 10, y: 200}, {x: 310, y: 20}), {x: -300, y: 180});
});
