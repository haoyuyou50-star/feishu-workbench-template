import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../dashboard/main.jsx", import.meta.url);
const boardRegistryUrl = new URL("../dashboard/board-registry-model.js", import.meta.url);
const coursePlanUrl = new URL("../dashboard/course-plan.jsx", import.meta.url);
const courseStylesUrl = new URL("../dashboard/course-plan.css", import.meta.url);

test("wires the Feishu-backed course board into the existing workbench", async () => {
  const [dashboard, boardRegistry, coursePlan, styles] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(boardRegistryUrl, "utf8"),
    readFile(coursePlanUrl, "utf8"),
    readFile(courseStylesUrl, "utf8"),
  ]);

  assert.match(boardRegistry, /name: "课程与结课"/);
  assert.ok(dashboard.includes('switchCourseView("status")'));
  assert.ok(dashboard.includes('switchCourseView("project")'));
  assert.match(dashboard, /function switchCourseView\(nextView\)[\s\S]*setCourseViewPhase\("leaving"\)[\s\S]*setCourseViewPhase\("entering"\)/);
  assert.match(dashboard, /setCourseCreateRequest/);
  assert.ok(dashboard.includes("createRequest={courseCreateRequest}"));
  assert.ok(coursePlan.includes("fetch(`/api/courses"));
  assert.ok(coursePlan.includes('fetch("/api/courses/records"'));
  assert.match(coursePlan, /export function aggregateCourseRecords/);
  assert.match(coursePlan, /课程类型/);
  assert.match(coursePlan, /orderedTypes\.map\(\(courseType\)/);
  assert.match(coursePlan, /moveProjectCourse/);
  assert.match(coursePlan, /CourseDetailContent/);
  assert.match(coursePlan, /编辑课程/);
  assert.match(styles, /\.course-sync-groups\.award-groups-status\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /\.course-sync-groups\.award-groups-project[^}]*columns: 280px/s);
});

test("keeps final-course tracking compact while covering required edge cases", async () => {
  const coursePlan = await readFile(coursePlanUrl, "utf8");

  assert.match(coursePlan, /courseWorkGroups\(visible\)/);
  assert.match(coursePlan, /DEFAULT_SUBMIT_METHODS = \["线下考试", "结课汇报", "畅课提交", "班委收集", "其他"\]/);
  assert.match(coursePlan, /收集班委姓名/);
  assert.match(coursePlan, /联合作业课程/);
  assert.match(coursePlan, /type === "考试"/);
  assert.match(coursePlan, /type === "作业" && <label><span>结课状态/);
  assert.match(coursePlan, /onDragStart/);
  assert.match(coursePlan, /ColorDialog/);
  assert.match(coursePlan, /授课安排/);
  assert.doesNotMatch(coursePlan, /下一步行动|创作节点|时间线|进度百分比/);
});

test("does not save the incomplete-board label as a Feishu completion-status option", async () => {
  const coursePlan = await readFile(coursePlanUrl, "utf8");
  assert.match(coursePlan, /if \(!type\) fields\["结课状态"\] = null/);
  assert.doesNotMatch(coursePlan, /if \(!type\) fields\["结课状态"\] = "尚未填写结课信息"/);
});

test("keeps course details and editing consistent with the award-board layout", async () => {
  const [dashboard, coursePlan, styles] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(coursePlanUrl, "utf8"),
    readFile(courseStylesUrl, "utf8"),
  ]);
  assert.match(styles, /\.course-sync-record[^}]*min-height/);
  assert.match(styles, /\.course-detail-dialog[^}]*900px/s);
  assert.match(coursePlan, /variant=\{readOnly \? "detail" : "editor"\}/);
  assert.match(coursePlan, /form=\{readOnly \? null/);
  assert.match(coursePlan, /award-detail-meta/);
  assert.match(coursePlan, /award-form-section/);
  assert.match(dashboard, /settingsPanel === "course-menu"/);
  assert.doesNotMatch(dashboard.match(/settingsPanel === "course-menu"[\s\S]*?<\/div>}/)?.[0] || "", /常用工具|板块配色/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("preserves one portal and limits course updates to local card motion", async () => {
  const [source, styles, dashboard, motion] = await Promise.all([readFile(coursePlanUrl, "utf8"), readFile(courseStylesUrl, "utf8"), readFile(dashboardUrl, "utf8"), readFile(new URL("../dashboard/course-motion.js", import.meta.url), "utf8")]);
  assert.match(source, /return createPortal/);
  assert.match(source, /document\.body\.style\.paddingRight/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => onEdit/);
  assert.match(source, /requestClose\(\(\) => onSaved/);
  assert.match(source, /refresh\(true, true\)/);
  assert.match(source, /data-course-motion-key=\{course.id\}/);
  assert.match(motion, /node\.animate/);
  assert.doesNotMatch(motion, /startViewTransition/);
  assert.match(styles, /\.dialog-backdrop\.course-dialog-backdrop[^}]*animation: none/);
  assert.match(dashboard, /查看未填写课程/);
  assert.match(dashboard, /incompleteOnly=\{courseIncompleteOnly\}/);
  assert.match(source, /CourseColorPalette value=\{courseColor\}/);
  assert.match(source, /"看板颜色": courseColor/);
  assert.match(source, /course-sync-board is-view-\$\{viewPhase\}/);
});
