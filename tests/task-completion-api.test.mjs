import assert from "node:assert/strict";
import test from "node:test";

import { isTaskVisibleToday, normalizeTask, PATCH, prepareDashboardTasks, visibleTasks } from "../app/api/[...path]/route.js";

const origin = "https://workbench.example.com";
const guid = "699355d3-190b-4e5f-ae30-6cbdad729ae0";

function request(completed, scope = "task:task:read task:task:write") {
  return new Request(`${origin}/api/tasks/${guid}/completion`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `feishu_user_token=user-token; feishu_user_scope=${encodeURIComponent(scope)}`,
      Origin: origin,
    },
    body: JSON.stringify({ completed }),
  });
}

test("completes and reopens a Feishu task with completed_at", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), options, body });
    return new Response(JSON.stringify({
      code: 0,
      data: { task: { guid, completed_at: body.task.completed_at } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const completedResponse = await PATCH(request(true));
    const completedPayload = await completedResponse.json();
    assert.equal(completedResponse.status, 200);
    assert.equal(completedPayload.task.completed, true);
    assert.match(completedPayload.task.completedAt, /^\d+$/);

    const reopenedResponse = await PATCH(request(false));
    const reopenedPayload = await reopenedResponse.json();
    assert.equal(reopenedResponse.status, 200);
    assert.equal(reopenedPayload.task.completed, false);
    assert.equal(reopenedPayload.task.completedAt, "0");

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.url, `https://open.feishu.cn/open-apis/task/v2/tasks/${guid}`);
      assert.equal(call.options.method, "PATCH");
      assert.equal(call.options.headers.Authorization, "Bearer user-token");
      assert.deepEqual(call.body.update_fields, ["completed_at"]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requires the user task write scope", async () => {
  const response = await PATCH(request(true, "task:task:read"));
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.reauthorizationRequired, true);
  assert.match(payload.error, /写入权限/);
});

test("refreshes an expired user session before syncing task completion", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.FEISHU_APP_ID;
  const originalSecret = process.env.FEISHU_APP_SECRET;
  process.env.FEISHU_APP_ID = "cli_task_refresh";
  process.env.FEISHU_APP_SECRET = "test-secret";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const call = { url: String(url), options, body: JSON.parse(options.body) };
    calls.push(call);
    if (call.url.endsWith("/authen/v2/oauth/token")) {
      return new Response(JSON.stringify({
        access_token: "refreshed-task-user",
        expires_in: 7200,
        refresh_token: "rotated-task-refresh",
        refresh_token_expires_in: 2592000,
        scope: "task:task:read task:task:write",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      code: 0,
      data: { task: { guid, completed_at: call.body.task.completed_at } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await PATCH(new Request(`${origin}/api/tasks/${guid}/completion`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `feishu_user_refresh_token=expired-session-refresh; feishu_user_scope=${encodeURIComponent("task:task:read task:task:write")}`,
        Origin: origin,
      },
      body: JSON.stringify({ completed: true }),
    }));
    const payload = await response.json();
    const cookies = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.equal(payload.task.completed, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.headers.Authorization, "Bearer refreshed-task-user");
    assert.match(cookies, /feishu_user_refresh_token=rotated-task-refresh/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppId === undefined) delete process.env.FEISHU_APP_ID;
    else process.env.FEISHU_APP_ID = originalAppId;
    if (originalSecret === undefined) delete process.env.FEISHU_APP_SECRET;
    else process.env.FEISHU_APP_SECRET = originalSecret;
  }
});

test("keeps tasks completed today visible in the today list", () => {
  const now = Date.parse("2026-08-25T10:00:00+08:00");
  const task = normalizeTask({
    guid,
    summary: "今天完成的任务",
    completed_at: String(Date.parse("2026-08-25T09:30:00+08:00")),
  }, now);

  assert.equal(task.completed, true);
  assert.equal(task.overdue, false);
  assert.equal(isTaskVisibleToday(task, "2026-08-25"), true);
});

test("does not bring historical completed tasks into today's list", () => {
  const now = Date.parse("2026-08-25T10:00:00+08:00");
  const task = normalizeTask({
    guid,
    summary: "历史已完成任务",
    completed_at: String(Date.parse("2026-08-24T09:30:00+08:00")),
  }, now);

  assert.equal(task.completed, true);
  assert.equal(isTaskVisibleToday(task, "2026-08-25"), false);
});

test("merges every task where the current user is responsible, creator, or follower", async () => {
  const originalFetch = globalThis.fetch;
  const responsibleGuid = "11111111-1111-4111-8111-111111111111";
  const creatorGuid = "22222222-2222-4222-8222-222222222222";
  const followerGuid = "33333333-3333-4333-8333-333333333333";
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: parsed.toString(), method: options.method, body });
    let data;
    if (parsed.pathname.endsWith("/task/v2/tasks") && options.method === "GET") {
      data = { items: [{ guid: responsibleGuid, summary: "我负责的任务", completed_at: "0" }], has_more: false };
    } else if (parsed.pathname.endsWith("/authen/v1/user_info")) {
      data = { open_id: "ou_current_user" };
    } else if (parsed.pathname.endsWith("/task/v2/tasks/search")) {
      const role = Object.keys(body.filter)[0];
      if (role === "assignee_ids") {
        data = { items: [{ meta_data: { app_link: `https://applink.feishu.cn/client/todo/detail?guid=${responsibleGuid}` } }], has_more: false };
      } else if (role === "creator_ids" && !parsed.searchParams.get("page_token")) {
        data = { items: [{ meta_data: { app_link: `https://applink.feishu.cn/client/todo/detail?guid=${creatorGuid}` } }], has_more: true, page_token: "creator-next" };
      } else if (role === "creator_ids") {
        data = { items: [], has_more: false };
      } else {
        data = { items: [{ meta_data: { app_link: `https://applink.feishu.cn/client/todo/detail?guid=${followerGuid}` } }], has_more: false };
      }
    } else {
      const detailGuid = decodeURIComponent(parsed.pathname.split("/").at(-1));
      data = { task: { guid: detailGuid, summary: detailGuid === creatorGuid ? "我创建的任务" : "我关注的任务", completed_at: "0" } };
    }
    return new Response(JSON.stringify({ code: 0, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await visibleTasks("user-token");
    assert.equal(result.coverageComplete, true);
    assert.equal(result.error, "");
    assert.deepEqual(new Set(result.items.map((task) => task.guid)), new Set([responsibleGuid, creatorGuid, followerGuid]));
    const searchCalls = calls.filter((call) => call.url.includes("/tasks/search"));
    assert.equal(searchCalls.length, 4);
    assert.ok(searchCalls.every((call) => call.body.filter.is_completed === false));
    assert.equal(calls.filter((call) => call.url.includes(`/tasks/${responsibleGuid}`)).length, 0);
    assert.match(calls[0].url, /type=my_tasks/);
    assert.doesNotMatch(calls[0].url, /completed=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps future tasks in the planning pool without placing them in today by default", () => {
  const now = Date.parse("2026-09-06T10:00:00+08:00");
  const tasks = prepareDashboardTasks([
    { guid: "44444444-4444-4444-8444-444444444444", summary: "今天任务", due: { timestamp: String(Date.parse("2026-09-06T18:00:00+08:00")) } },
    { guid: "55555555-5555-4555-8555-555555555555", summary: "未来任务", due: { timestamp: String(Date.parse("2026-09-09T18:00:00+08:00")) } },
    { guid: "66666666-6666-4666-8666-666666666666", summary: "历史完成任务", completed_at: String(Date.parse("2026-09-05T18:00:00+08:00")) },
  ], now);

  assert.equal(tasks.length, 3);
  assert.equal(tasks.find((task) => task.title === "今天任务").defaultToday, true);
  assert.equal(tasks.find((task) => task.title === "未来任务").defaultToday, false);
  assert.equal(tasks.find((task) => task.title === "历史完成任务").defaultToday, false);
});
