import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCalendar, normalizeEvent, PATCH } from "../app/api/[...path]/route.js";

const origin = "https://workbench.example.com";
const calendarId = "feishu.cn_test@group.calendar.feishu.cn";
const eventId = "75d28f9b-e35c-4230-8a83-4a661497db54_0";

function replyRequest(rsvpStatus, scope = "calendar:calendar.event:read calendar:calendar.event:reply") {
  return new Request(`${origin}/api/calendar/events/rsvp`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `feishu_user_token=user-token; feishu_user_scope=${encodeURIComponent(scope)}`,
      Origin: origin,
    },
    body: JSON.stringify({ calendarId, eventId, rsvpStatus }),
  });
}

test("preserves Feishu calendar and event RGB colors", () => {
  const calendar = normalizeCalendar({
    calendar_id: calendarId,
    summary: "游皓宇",
    color: 0x2ac6a7,
    role: "owner",
    type: "primary",
  });
  const event = normalizeEvent({
    event_id: eventId,
    summary: "交互设计基础",
    calendar_id: calendarId,
    calendar_name: "游皓宇",
    calendar_color: 0x2ac6a7,
    color: -1,
    start_time: { timestamp: String(Date.parse("2026-08-25T08:00:00+08:00") / 1000) },
    end_time: { timestamp: String(Date.parse("2026-08-25T12:00:00+08:00") / 1000) },
    rsvp_status: "tentative",
  }, "2026-08-25");

  assert.equal(calendar.color, "#2ac6a7");
  assert.equal(calendar.group, "managed");
  assert.equal(event.color, "#2ac6a7");
  assert.equal(event.rsvpStatus, "tentative");
});

test("replies to a Feishu event using the current user token", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ code: 0, msg: "success", data: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await PATCH(replyRequest("decline"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.event.rsvpStatus, "decline");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://open.feishu.cn/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${eventId}/reply`);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Authorization, "Bearer user-token");
    assert.deepEqual(calls[0].body, { rsvp_status: "decline" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requires the event reply user scope", async () => {
  const response = await PATCH(replyRequest("accept", "calendar:calendar.event:read"));
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.reauthorizationRequired, true);
  assert.match(payload.error, /回复权限/);
});
