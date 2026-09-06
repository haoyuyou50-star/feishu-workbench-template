import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCourseRecord } from "../app/api/[...path]/route.js";

const fields = [
  { name: "课程名称", type: 1, primary: true },
  { name: "课程类型", type: 3, options: ["通识课", "必修课", "专业核心课", "专业选修课"] },
  { name: "授课安排", type: 1 },
  { name: "看板颜色", type: 1 },
  { name: "结课类型", type: 3, options: ["作业", "考试"] },
  { name: "结课状态", type: 3, options: ["尚未填写结课信息", "未开始", "进行中", "待提交", "已完成"] },
  { name: "结课日期", type: 5 },
  { name: "提交方式", type: 3, options: ["线下考试", "结课汇报", "畅课提交", "班委收集", "其他"] },
  { name: "是否组队", type: 7 },
  { name: "小组成员", type: 1 },
  { name: "联合作业课程", type: 1 },
  { name: "工作看板排序", type: 2 },
];

test("normalizes Feishu course fields before writing", () => {
  const result = normalizeCourseRecord({
    课程名称: "交互设计基础",
    结课类型: "作业",
    结课状态: "进行中",
    结课日期: "2026-12-28",
    提交方式: "畅课提交",
    是否组队: true,
    工作看板排序: 3,
  }, fields, true);

  assert.equal(result.课程名称, "交互设计基础");
  assert.equal(result.结课日期, Date.parse("2026-12-28T00:00:00+08:00"));
  assert.equal(result.是否组队, true);
  assert.equal(result.工作看板排序, 3);
});

test("updates course classification without overwriting schedule or final fields", () => {
  assert.deepEqual(normalizeCourseRecord({ 看板颜色: "#ef8a72" }, fields), { 看板颜色: "#ef8a72" });
  assert.deepEqual(normalizeCourseRecord({ 课程类型: "专业核心课" }, fields), { 课程类型: "专业核心课" });
  assert.deepEqual(normalizeCourseRecord({ 课程类型: null }, fields), { 课程类型: null });
  const schedule = "周二｜第1 - 9周 单周｜第7 - 8节｜教室｜单周\n周二｜第2 - 8周 双周｜第7 - 8节｜线上｜双周";
  assert.equal(normalizeCourseRecord({ 授课安排: schedule }, fields).授课安排, schedule);
  assert.throws(() => normalizeCourseRecord({ 课程类型: "不存在的分类" }, fields), /选项无效/);
});

test("exam records do not keep assignment-only state or team fields", () => {
  const result = normalizeCourseRecord({
    课程名称: "中国近现代史纲要",
    结课类型: "考试",
    结课状态: "进行中",
    是否组队: true,
    小组成员: "甲、乙",
    联合作业课程: "设计思维导引",
  }, fields, true);

  assert.equal(result.结课状态, null);
  assert.equal(result.是否组队, false);
  assert.equal(result.小组成员, null);
  assert.equal(result.联合作业课程, null);
});

test("undecided final type clears the status instead of writing a UI-only placeholder", () => {
  const result = normalizeCourseRecord({
    课程名称: "影像叙事观念与技巧",
    结课类型: null,
    结课状态: null,
  }, fields, true);

  assert.equal(result.结课类型, null);
  assert.equal(result.结课状态, null);
});

test("rejects invalid dates, select values, numbers and missing course names", () => {
  assert.throws(() => normalizeCourseRecord({ 课程名称: "课程", 结课日期: "2026-02-31" }, fields, true), /有效日期/);
  assert.throws(() => normalizeCourseRecord({ 课程名称: "课程", 结课类型: "论文" }, fields, true), /选项无效/);
  assert.throws(() => normalizeCourseRecord({ 课程名称: "课程", 工作看板排序: "第一个" }, fields, true), /有效数字/);
  assert.throws(() => normalizeCourseRecord({ 结课类型: "作业" }, fields, true), /课程名称为必填项/);
});
