import assert from "node:assert/strict";
import test from "node:test";

import { GET, POST } from "../app/api/[...path]/route.js";

test("exchanges a Feishu client auth code through the in-app token flow", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.FEISHU_APP_ID;
  const originalSecret = process.env.FEISHU_APP_SECRET;
  const calls = [];
  process.env.FEISHU_APP_ID = "cli_test_app";
  process.env.FEISHU_APP_SECRET = "test-secret";
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    if (String(url).endsWith("/auth/v3/app_access_token/internal")) {
      return new Response(JSON.stringify({ code: 0, app_access_token: "app-token", expire: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      code: 0,
      data: {
        access_token: "user-token",
        expires_in: 7200,
        refresh_token: "refresh-token",
        refresh_expires_in: 2592000,
        scope: "calendar:calendar.event:read task:task:read",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await POST(new Request("https://workbench.example.com/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "client-auth-code", flow: "client" }),
    }));
    const payload = await response.json();
    const cookies = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.equal(payload.personalAccess, true);
    assert.ok(payload.grantedScopes.includes("calendar:calendar.event:read"));
    assert.ok(payload.grantedScopes.includes("task:task:read"));
    assert.ok(!payload.grantedScopes.includes("task:task:write"));
    assert.match(cookies, /feishu_user_token=user-token/);
    assert.match(cookies, /feishu_user_refresh_token=refresh-token/);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "https://open.feishu.cn/open-apis/authen/v1/access_token");
    assert.equal(calls[1].options.headers.Authorization, "Bearer app-token");
    assert.deepEqual(calls[1].body, { grant_type: "authorization_code", code: "client-auth-code" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppId === undefined) delete process.env.FEISHU_APP_ID;
    else process.env.FEISHU_APP_ID = originalAppId;
    if (originalSecret === undefined) delete process.env.FEISHU_APP_SECRET;
    else process.env.FEISHU_APP_SECRET = originalSecret;
  }
});

test("refreshes an expired browser user token and rotates secure cookies", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.FEISHU_APP_ID;
  const originalSecret = process.env.FEISHU_APP_SECRET;
  process.env.FEISHU_APP_ID = "cli_test_refresh";
  process.env.FEISHU_APP_SECRET = "test-secret";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      access_token: "refreshed-user-token",
      expires_in: 7200,
      refresh_token: "rotated-refresh-token",
      refresh_token_expires_in: 2592000,
      scope: "calendar:calendar.event:read task:task:read task:task:write",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await GET(new Request("https://workbench.example.com/api/auth/status", {
      headers: {
        Cookie: `feishu_user_refresh_token=refresh-token; feishu_user_scope=${encodeURIComponent("task:task:read task:task:write")}`,
      },
    }));
    const payload = await response.json();
    const cookies = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.equal(payload.authMode, "user");
    assert.equal(payload.personalAccess, true);
    assert.ok(payload.grantedScopes.includes("task:task:write"));
    assert.match(cookies, /feishu_user_token=refreshed-user-token/);
    assert.match(cookies, /feishu_user_refresh_token=rotated-refresh-token/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://open.feishu.cn/open-apis/authen/v2/oauth/token");
    assert.deepEqual(calls[0].body, {
      grant_type: "refresh_token",
      client_id: "cli_test_refresh",
      client_secret: "test-secret",
      refresh_token: "refresh-token",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppId === undefined) delete process.env.FEISHU_APP_ID;
    else process.env.FEISHU_APP_ID = originalAppId;
    if (originalSecret === undefined) delete process.env.FEISHU_APP_SECRET;
    else process.env.FEISHU_APP_SECRET = originalSecret;
  }
});

test("does not synthesize OAuth scopes when Feishu client auth omits them", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.FEISHU_APP_ID;
  const originalSecret = process.env.FEISHU_APP_SECRET;
  process.env.FEISHU_APP_ID = "cli_test_app_no_scope";
  process.env.FEISHU_APP_SECRET = "test-secret";
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v3/app_access_token/internal")) {
      return new Response(JSON.stringify({ code: 0, app_access_token: "app-token-no-scope", expire: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      code: 0,
      data: { access_token: "user-token-no-scope", expires_in: 7200 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await POST(new Request("https://workbench.example.com/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "client-auth-code-no-scope", flow: "client" }),
    }));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.grantedScopes, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppId === undefined) delete process.env.FEISHU_APP_ID;
    else process.env.FEISHU_APP_ID = originalAppId;
    if (originalSecret === undefined) delete process.env.FEISHU_APP_SECRET;
    else process.env.FEISHU_APP_SECRET = originalSecret;
  }
});
