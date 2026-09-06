import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("workbench registers and opens the stable usage monitor board", async () => {
  const source = await read("../dashboard/main.jsx");
  const registry = await read("../dashboard/board-registry-model.js");
  assert.match(registry, /name: "用量监控看板"/);
  assert.match(source, /normalizeWorkbenchBoards/);
  assert.match(source, /getBoardDestination/);
  assert.match(source, /<UsageMonitorBoard query={search}/);
  assert.match(source, /window\.location\.hash\.slice\(1\)/);
});

test("usage board polls a loopback v1 endpoint and renders extensible sources", async () => {
  const source = await read("../dashboard/usage-monitor.jsx");
  assert.match(source, /http:\/\/127\.0\.0\.1:47832\/v1\/usage/);
  assert.match(source, /POLL_INTERVAL_MS = 15000/);
  assert.match(source, /parseUsagePayload/);
  assert.match(source, /filtered\.map\(\(source\) => <UsageSourceCard/);
  assert.match(source, /data-source-contract="usage-sources-v1"/);
  assert.match(source, /npm run usage:bridge/);
  assert.match(source, /\/v1\/feishu\/connect/);
  assert.match(source, /打开登录窗口/);
  assert.match(source, /liufeng-workbench\.usage-source-preferences\.v1/);
  assert.match(source, /usage-card-drag-handle/);
  assert.match(source, /编辑名称和颜色/);
  assert.match(source, /恢复默认/);
  assert.match(source, /nameInputRef\.current/);
  assert.match(source, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /input\.select\(\)/);
  assert.match(source, /onCloseRef\.current\(\)/);
  assert.match(source, /const requestClose = useCallback\([\s\S]*?\}, \[\]\);/);
  assert.doesNotMatch(source, /panel\?\.focus\(\);/);
});

test("usage styles provide two-column, mobile, error, and reduced-motion states", async () => {
  const css = await read("../dashboard/usage-monitor.css");
  assert.match(css, /\.usage-source-grid[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.usage-bridge-notice/);
  assert.match(css, /\.usage-membership-connect/);
  assert.match(css, /\.usage-maintenance-alert/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.usage-source-grid[^}]*grid-template-columns: 1fr/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.usage-card-dialog/);
  assert.match(css, /\.usage-edit-palette/);
});

test("usage header reserves new-account creation and keeps general settings minimal", async () => {
  const source = await read("../dashboard/main.jsx");
  assert.match(source, /activePage === "usage-monitor"[\s\S]*?title="新建账号监控"/);
  assert.match(source, /id="usage-create-heading">新建账号监控/);
  assert.match(source, /账号授权与采集配置功能正在准备中/);
  const generalSettings = source.match(/settingsPanel === "menu"[\s\S]*?settingsPanel === "award-menu"/)?.[0] || "";
  assert.doesNotMatch(generalSettings, /常用工具/);
  assert.doesNotMatch(generalSettings, /板块配色/);
});

test("bridge binds to loopback and sanitizes account output", async () => {
  const source = await read("../scripts/codex-usage-bridge.mjs");
  assert.match(source, /DEFAULT_HOST = "127\.0\.0\.1"/);
  assert.match(source, /account\/rateLimits\/read/);
  assert.match(source, /account\/usage\/read/);
  assert.match(source, /environment\.CODEX_HOME = this\.config\.codexHome/);
  assert.match(source, /cli_auth_credentials_store="file"/);
  assert.match(source, /Access-Control-Allow-Private-Network/);
  assert.match(source, /FeishuQuotaCollector/);
  assert.match(source, /\/v1\/feishu\/connect/);
  assert.match(source, /\/v1\/notifications\/test/);
  assert.doesNotMatch(source, /response\..*codexHome/);
});

test("Windows startup launcher starts both local services without opening a browser", async () => {
  const source = await read("../scripts/start-usage-monitor.ps1");
  assert.match(source, /47832/);
  assert.match(source, /3000/);
  assert.match(source, /codex-usage-bridge\.mjs/);
  assert.match(source, /vinext\\dist\\cli\.js/);
  assert.match(source, /-WindowStyle Hidden/);
  assert.doesNotMatch(source, /Start-Process.+https?:/);
});
