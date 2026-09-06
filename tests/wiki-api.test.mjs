import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/[...path]/route.js";

const origin = "https://workbench.example.com";
const wikiScope = "wiki:wiki:readonly";

function wikiRequest(scope = wikiScope) {
  return new Request(`${origin}/api/wiki`, {
    headers: {
      Cookie: `feishu_user_token=user-token; feishu_user_scope=${encodeURIComponent(scope)}`,
    },
  });
}

test("requires the Feishu Wiki read scope", async () => {
  const response = await GET(wikiRequest("calendar:calendar:readonly"));
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.requiresAuthorization, true);
  assert.equal(payload.requiredScope, wikiScope);
});

test("lists visible Wiki spaces with in-tenant root links", async () => {
  const originalFetch = globalThis.fetch;
  const originalOrigin = process.env.FEISHU_TENANT_ORIGIN;
  process.env.FEISHU_TENANT_ORIGIN = "https://tenant.example.feishu.cn";
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/wiki/v2/spaces/space-1/nodes")) {
      return Response.json({ code: 0, msg: "success", data: { items: [{ node_token: "root-node" }] } });
    }
    return Response.json({
      code: 0,
      msg: "success",
      data: {
        has_more: false,
        items: [{ space_id: "space-1", name: "项目资料", description: "最近使用", space_type: "team" }],
      },
    });
  };

  try {
    const response = await GET(wikiRequest());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.spaces.length, 1);
    assert.deepEqual(payload.spaces[0], {
      id: "space-1",
      name: "项目资料",
      description: "最近使用",
      spaceType: "团队",
      url: "https://tenant.example.feishu.cn/wiki/root-node",
    });
    assert.equal(payload.source.personalAccess, true);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOrigin === undefined) delete process.env.FEISHU_TENANT_ORIGIN;
    else process.env.FEISHU_TENANT_ORIGIN = originalOrigin;
  }
});
