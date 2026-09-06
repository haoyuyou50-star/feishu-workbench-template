import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", process.pid + "-" + Date.now());
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the production workbench shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>个人工作台<\/title>/i);
  assert.match(html, /<meta[^>]+name="description"[^>]+日程、任务、项目、便签与专注计时器/i);
  assert.match(html, /<script src="\/liufeng-theme-runtime\.js"><\/script>/i);
  assert.match(html, /h5-js-sdk-1\.5\.16\.js/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("keeps the client workbench and theme runtime wired into the app", async () => {
  const [page, layout, globals, runtime, dashboard] = await Promise.all([
    readFile(new URL("../app/page.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/liufeng-theme-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard/main.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /^"use client";/);
  assert.match(page, /<PersonalWorkbench \/>/);
  assert.match(layout, /title:\s*"个人工作台"/);
  assert.match(layout, /src="\/liufeng-theme-runtime\.js"/);
  assert.match(globals, /dashboard\/styles\.css/);
  assert.match(runtime, /createThemeController/);
  assert.match(dashboard, /export default function Workbench/);
  assert.match(dashboard, /\/api\/awards/);
});
