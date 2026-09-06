import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAwardRecord } from "../app/api/[...path]/route.js";

const fields = [
  { name: "投奖条目", type: 1, primary: true },
  { name: "项目名称", type: 3, options: ["示例项目"] },
  { name: "比赛名称", type: 1 },
  { name: "截止日期", type: 5 },
  { name: "投递日期", type: 5 },
  { name: "投赛结果", type: 3, options: ["一等奖", "二等奖"] },
  { name: "比赛官网", type: 15 },
];

test("builds the primary award title and normalizes Feishu field values", () => {
  const result = normalizeAwardRecord({
    项目名称: "示例项目",
    比赛名称: "西融杯 AI 互动影游大赛",
    截止日期: "2026-8-31",
    比赛官网: "https://example.com/competition",
  }, fields);

  assert.equal(result.投奖条目, "示例项目 | 西融杯 AI 互动影游大赛");
  assert.equal(result.截止日期, Date.parse("2026-08-31T00:00:00+08:00"));
  assert.deepEqual(result.比赛官网, {
    link: "https://example.com/competition",
    text: "https://example.com/competition",
  });
});

test("rejects invalid dates, links and select options before writing", () => {
  assert.throws(() => normalizeAwardRecord({ 项目名称: "示例项目", 比赛名称: "比赛", 截止日期: "2026-02-31" }, fields), /有效日期/);
  assert.throws(() => normalizeAwardRecord({ 项目名称: "新项目", 比赛名称: "比赛" }, fields), /选项无效/);
  assert.throws(() => normalizeAwardRecord({ 项目名称: "示例项目", 比赛名称: "比赛", 比赛官网: "example.com" }, fields), /完整网址/);
});

test("keeps explicit empty values when updating a record", () => {
  const result = normalizeAwardRecord({
    项目名称: "示例项目",
    比赛名称: "西融杯 AI 互动影游大赛",
    投递日期: null,
    投赛结果: "",
  }, fields, { includeEmpty: true });

  assert.equal(result.投奖条目, "示例项目 | 西融杯 AI 互动影游大赛");
  assert.equal(result.投递日期, null);
  assert.equal(result.投赛结果, null);
});
