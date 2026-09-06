import assert from "node:assert/strict";
import test from "node:test";

import {
  createDocsAppLink,
  openFeishuDestination,
  toNativeFeishuSchema,
} from "../dashboard/feishu-links.js";

test("builds Feishu-native document links for Docs and Wiki destinations", () => {
  const target = "https://example.feishu.cn/wiki/";
  const appLink = createDocsAppLink(target);

  assert.equal(appLink, "https://applink.feishu.cn/client/docs/open?url=https%3A%2F%2Fexample.feishu.cn%2Fwiki%2F");
  assert.equal(
    toNativeFeishuSchema(appLink),
    "feishu://applink.feishu.cn/client/docs/open?url=https%3A%2F%2Fexample.feishu.cn%2Fwiki%2F",
  );
});

test("opens AppLinks through the Feishu native schema bridge", () => {
  let options;
  const fakeWindow = {
    location: { assign() { throw new Error("unexpected fallback"); } },
    tt: { openSchema(value) { options = value; } },
  };

  const result = openFeishuDestination({
    appLink: "https://applink.feishu.cn/minutes/home",
    webHref: "https://example.feishu.cn/minutes/home",
  }, fakeWindow);

  assert.equal(result, "native");
  assert.equal(options.schema, "feishu://applink.feishu.cn/minutes/home");
  assert.equal(options.external, true);
});

test("falls back to the matching Feishu web destination when the native bridge fails", () => {
  let assigned = "";
  const fakeWindow = {
    location: { assign(value) { assigned = value; } },
    tt: { openSchema({ fail }) { fail(); } },
  };

  openFeishuDestination({
    appLink: "https://applink.feishu.cn/client/docs/open?url=encoded",
    webHref: "https://example.feishu.cn/drive/home/",
  }, fakeWindow);

  assert.equal(assigned, "https://example.feishu.cn/drive/home/");
});

test("uses the HTTPS AppLink outside the Feishu client", () => {
  let assigned = "";
  const fakeWindow = { location: { assign(value) { assigned = value; } } };

  const result = openFeishuDestination("https://applink.feishu.cn/client/todo/open", fakeWindow);

  assert.equal(result, "applink");
  assert.equal(assigned, "https://applink.feishu.cn/client/todo/open");
});
