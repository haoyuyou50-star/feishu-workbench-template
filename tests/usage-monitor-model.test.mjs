import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_USAGE_SOURCES,
  USAGE_MONITOR_BOARD_ID,
  applyUsagePreferences,
  mergeUsageSources,
  normalizeUsagePreferences,
  normalizeUsageWindow,
  parseUsagePayload,
  reorderUsageSourceIds,
  usageBoardStats,
} from "../dashboard/usage-monitor-model.js";
import { codexAppServerArgs, defaultBridgeConfig, duplicateCodexSourceErrors, normalizeBridgeConfig, serializeUsageSource } from "../scripts/codex-usage-bridge.mjs";
import { parseMembershipPanel, parseQuotaTime } from "../scripts/feishu-quota-helper.mjs";
import { maintenanceReason, shouldNotifyTransition } from "../scripts/maintenance-notifier.mjs";

test("usage monitor has a stable board id and four built-in sources", () => {
  assert.equal(USAGE_MONITOR_BOARD_ID, "board-usage-monitor");
  assert.deepEqual(DEFAULT_USAGE_SOURCES.map((source) => source.id), ["codex-primary", "codex-secondary", "doubao-member", "feishu-ai-member"]);
});

test("usage windows clamp percentages and keep reset metadata", () => {
  assert.deepEqual(normalizeUsageWindow({ usedPercent: 142, windowDurationMins: "300", resetsAt: 1788629047 }), {
    usedPercent: 100,
    windowDurationMins: 300,
    resetsAt: 1788629047,
    label: null,
    displayPercent: null,
    resetLabel: null,
  });
  assert.equal(normalizeUsageWindow(null), null);
});

test("v1 payload keeps the two defaults and appends compatible custom sources", () => {
  const sources = parseUsagePayload({
    version: 1,
    sources: [
      { id: "codex-primary", label: "主账号", status: "ready", generatedAt: "2026-09-05T08:00:00Z", windows: { primary: { usedPercent: 18 } } },
      { id: "custom-api", label: "内部 API", provider: "custom-json", status: "ready", accent: "#ad8adb" },
    ],
  });
  assert.deepEqual(sources.map((source) => source.id), ["codex-primary", "codex-secondary", "doubao-member", "feishu-ai-member", "custom-api"]);
  assert.equal(sources[0].label, "主账号");
  assert.equal(sources[1].status, "disconnected");
  assert.equal(sources[4].provider, "custom-json");
  assert.throws(() => parseUsagePayload({ version: 2, sources: [] }), /暂不支持/);
});

test("stats report connected and failed sources", () => {
  const sources = mergeUsageSources([
    { id: "codex-primary", status: "ready", generatedAt: "2026-09-05T08:00:00Z" },
    { id: "codex-secondary", status: "error" },
  ]);
  assert.deepEqual(usageBoardStats(sources, { loading: true, error: "offline" }), {
    total: 4,
    connected: 1,
    warning: 1,
    generatedAt: "2026-09-05T08:00:00.000Z",
    loading: true,
    error: "offline",
  });
});

test("card preferences safely customize labels and colors while preserving new sources", () => {
  const preferences = normalizeUsagePreferences({
    settings: {
      "codex-primary": { label: "刘峰的 Codex", accent: "#C85F48" },
      unsafe: { label: "x".repeat(90), accent: "red" },
    },
    order: ["feishu-ai-member", "codex-primary", "feishu-ai-member"],
  });
  assert.equal(preferences.settings["codex-primary"].label, "刘峰的 Codex");
  assert.equal(preferences.settings["codex-primary"].accent, "#c85f48");
  assert.equal(preferences.settings.unsafe.label.length, 60);
  assert.equal("accent" in preferences.settings.unsafe, false);
  assert.deepEqual(preferences.order, ["feishu-ai-member", "codex-primary"]);

  const sources = applyUsagePreferences(mergeUsageSources([{ id: "custom", label: "新数据源" }]), preferences);
  assert.deepEqual(sources.map((source) => source.id), ["feishu-ai-member", "codex-primary", "codex-secondary", "doubao-member", "custom"]);
  assert.equal(sources[1].label, "刘峰的 Codex");
  assert.equal(sources[1].accent, "#c85f48");
});

test("usage cards reorder by stable source id", () => {
  const ids = ["one", "two", "three", "four"];
  assert.deepEqual(reorderUsageSourceIds(ids, "one", "three", true), ["two", "three", "one", "four"]);
  assert.deepEqual(reorderUsageSourceIds(ids, "four", "two"), ["one", "four", "two", "three"]);
  assert.deepEqual(reorderUsageSourceIds(ids, "missing", "two"), ids);
});

test("membership helper parses Doubao and Feishu quota panels without exposing browser state", () => {
  const now = Date.parse("2026-09-06T10:00:00+08:00");
  const doubao = parseMembershipPanel("doubao", "豆包\n个人订阅\n标准套餐\n当前周期\n已使用 <1%\n2小时后重置\n过去7天\n已使用 18%\n9月12日 18:19重置", now);
  assert.equal(doubao.id, "doubao-member");
  assert.equal(doubao.planType, "标准套餐");
  assert.equal(doubao.windows.primary.displayPercent, "<1%");
  assert.equal(doubao.windows.primary.usedPercent, 0.5);
  assert.equal(doubao.windows.secondary.usedPercent, 18);
  assert.equal(doubao.windows.secondary.label, "7天额度");

  const feishu = parseMembershipPanel("feishu", "飞书\n飞书 AI 会员\n已使用 7%\n9月11日 00:00 到期", now);
  assert.equal(feishu.id, "feishu-ai-member");
  assert.equal(feishu.windows.primary.usedPercent, 7);
  assert.equal(feishu.windows.primary.resetsAt, Math.floor(Date.parse("2026-09-11T00:00:00+08:00") / 1000));
  assert.equal(parseQuotaTime("2小时后重置", now), Math.floor(now / 1000) + 7200);
  assert.equal("profileDir" in feishu, false);
});

test("bridge config accepts any number of isolated Codex homes", () => {
  const config = normalizeBridgeConfig({
    sources: [
      { id: "one", codexHome: "D:\\Codex\\one" },
      { id: "two", codexHome: "D:\\Codex\\two" },
      { id: "three", enabled: false },
    ],
  });
  assert.equal(config.sources.length, 3);
  assert.equal(config.sources[0].codexHome, "D:\\Codex\\one");
  assert.equal(config.sources[2].enabled, false);
  assert.throws(() => normalizeBridgeConfig({ sources: [{ id: "same" }, { id: "same" }] }), /不能重复/);
  assert.equal(defaultBridgeConfig().sources[1].enabled, false);
  assert.equal(defaultBridgeConfig().notifications.enabled, true);
});

test("bridge rejects duplicate account identities instead of showing copied usage", () => {
  const sources = normalizeBridgeConfig({ sources: [
    { id: "one", label: "账号 A", codexHome: "D:\\Codex\\one", enabled: true },
    { id: "two", label: "账号 B", codexHome: "D:\\Codex\\two", enabled: true },
    { id: "three", label: "账号 C", codexHome: "D:\\Codex\\three", enabled: true },
  ] }).sources;
  const errors = duplicateCodexSourceErrors(sources, { one: "account-a", two: "account-a", three: "account-c" });
  assert.equal(errors.size, 1);
  assert.match(errors.get("two"), /账号 A/);
  assert.equal(errors.has("one"), false);
  assert.equal(errors.has("three"), false);
});

test("maintenance notifications only target actionable source states", () => {
  const ready = { id: "one", label: "账号 A", status: "ready", message: "" };
  const error = { ...ready, status: "error", message: "连接超时" };
  assert.equal(maintenanceReason(error), "连接超时");
  assert.equal(shouldNotifyTransition(ready, error), true);
  assert.equal(shouldNotifyTransition(error, error), false);
  assert.equal(maintenanceReason({ ...ready, status: "disconnected", message: "尚未启用" }), null);
  assert.equal(maintenanceReason({ ...ready, status: "authorization_required", message: "需要重新登录" }), "需要重新登录");
});

test("bridge forces every Codex app server to use its CODEX_HOME auth file", () => {
  assert.deepEqual(codexAppServerArgs(), [
    "-c",
    'cli_auth_credentials_store="file"',
    "app-server",
    "--listen",
    "stdio://",
  ]);
});

test("bridge exposes only dashboard fields from App Server snapshots", () => {
  const config = normalizeBridgeConfig({ sources: [{ id: "one", label: "账号 A", codexHome: "D:\\secret" }] }).sources[0];
  const source = serializeUsageSource(config, {
    rateLimits: {
      planType: "plus",
      primary: { usedPercent: 21, windowDurationMins: 300, resetsAt: 1788629047 },
      secondary: { usedPercent: 35, windowDurationMins: 10080, resetsAt: 1788866315 },
      credits: { hasCredits: true, unlimited: false, balance: "9.5" },
    },
    rateLimitResetCredits: { availableCount: 2 },
  }, { summary: { lifetimeTokens: 12345, currentStreakDays: 4 } });
  assert.equal(source.status, "ready");
  assert.equal(source.windows.primary.usedPercent, 21);
  assert.equal(source.tokenUsage.lifetimeTokens, 12345);
  assert.equal("codexHome" in source, false);
  assert.equal(JSON.stringify(source).includes("D:\\secret"), false);
});
