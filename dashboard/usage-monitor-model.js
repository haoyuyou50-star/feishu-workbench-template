export const USAGE_MONITOR_BOARD_ID = "board-usage-monitor";
export const USAGE_PAYLOAD_VERSION = 1;
export const USAGE_PREFERENCES_VERSION = 1;

export const DEFAULT_USAGE_SOURCES = Object.freeze([
  Object.freeze({ id: "codex-primary", provider: "codex-app-server", label: "Codex 账号 1", accent: "#70b78e" }),
  Object.freeze({ id: "codex-secondary", provider: "codex-app-server", label: "Codex 账号 2", accent: "#75a7f0" }),
  Object.freeze({ id: "doubao-member", provider: "doubao-personal-member", label: "豆包个人订阅", accent: "#ad8adb" }),
  Object.freeze({ id: "feishu-ai-member", provider: "feishu-ai-member", label: "飞书 AI 会员", accent: "#58b6ad" }),
]);

const ALLOWED_STATUSES = new Set(["authorization_required", "connecting", "ready", "disconnected", "error"]);

function finiteNumber(value) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) ? number : null;
}

function normalizedDate(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeUsageWindow(value) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = finiteNumber(value.usedPercent);
  const windowDurationMins = finiteNumber(value.windowDurationMins);
  const resetsAt = finiteNumber(value.resetsAt);
  return {
    usedPercent: usedPercent === null ? null : Math.min(100, Math.max(0, usedPercent)),
    windowDurationMins: windowDurationMins === null ? null : Math.max(0, windowDurationMins),
    resetsAt: resetsAt === null ? null : Math.max(0, resetsAt),
    label: value.label ? String(value.label).slice(0, 40) : null,
    displayPercent: /^<?\s*\d+(?:\.\d+)?%$/.test(value.displayPercent || "") ? String(value.displayPercent).replace(/\s+/g, "") : null,
    resetLabel: value.resetLabel ? String(value.resetLabel).slice(0, 80) : null,
  };
}

export function emptyUsageSource(source) {
  return {
    id: source.id,
    provider: source.provider || "custom",
    label: source.label || source.id,
    accent: source.accent || "#918b84",
    status: "disconnected",
    planType: null,
    generatedAt: null,
    windows: { primary: null, secondary: null },
    credits: null,
    resetCredits: null,
    tokenUsage: null,
    message: "等待本机采集器连接",
  };
}

export function normalizeUsageSource(value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const base = emptyUsageSource({ ...fallback, ...source });
  const id = String(source.id || fallback.id || "").trim();
  if (!id) return null;
  const status = ALLOWED_STATUSES.has(source.status) ? source.status : base.status;
  return {
    ...base,
    id,
    provider: String(source.provider || base.provider).slice(0, 80),
    label: String(source.label || base.label).slice(0, 80),
    accent: /^#[0-9a-f]{6}$/i.test(source.accent || "") ? source.accent : base.accent,
    status,
    planType: source.planType ? String(source.planType).slice(0, 40) : null,
    generatedAt: normalizedDate(source.generatedAt),
    windows: {
      primary: normalizeUsageWindow(source.windows?.primary),
      secondary: normalizeUsageWindow(source.windows?.secondary),
    },
    credits: source.credits && typeof source.credits === "object" ? {
      hasCredits: Boolean(source.credits.hasCredits),
      unlimited: Boolean(source.credits.unlimited),
      balance: source.credits.balance == null ? null : String(source.credits.balance).slice(0, 40),
    } : null,
    resetCredits: source.resetCredits && typeof source.resetCredits === "object" ? {
      availableCount: Math.max(0, finiteNumber(source.resetCredits.availableCount) || 0),
    } : null,
    tokenUsage: source.tokenUsage && typeof source.tokenUsage === "object" ? {
      lifetimeTokens: Math.max(0, finiteNumber(source.tokenUsage.lifetimeTokens) || 0),
      currentStreakDays: Math.max(0, finiteNumber(source.tokenUsage.currentStreakDays) || 0),
    } : null,
    message: source.message ? String(source.message).slice(0, 240) : status === "ready" ? "" : base.message,
  };
}

export function initialUsageSources() {
  return DEFAULT_USAGE_SOURCES.map(emptyUsageSource);
}

export function mergeUsageSources(incoming = [], defaults = DEFAULT_USAGE_SOURCES) {
  const values = Array.isArray(incoming) ? incoming : [];
  const byId = new Map(values.filter((source) => source && typeof source === "object" && source.id).map((source) => [String(source.id), source]));
  const defaultIds = new Set(defaults.map((source) => source.id));
  const merged = defaults.map((source) => normalizeUsageSource(byId.get(source.id), source));
  for (const source of values) {
    if (!source?.id || defaultIds.has(String(source.id))) continue;
    const normalized = normalizeUsageSource(source);
    if (normalized && !merged.some((item) => item.id === normalized.id)) merged.push(normalized);
  }
  return merged.filter(Boolean);
}

export function parseUsagePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("采集器返回了无效数据");
  if (payload.version !== USAGE_PAYLOAD_VERSION) throw new Error(`暂不支持用量协议 v${payload.version ?? "?"}`);
  return mergeUsageSources(payload.sources);
}

export function normalizeUsagePreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  const settings = {};
  if (source.settings && typeof source.settings === "object") {
    for (const [id, entry] of Object.entries(source.settings)) {
      if (!id || !entry || typeof entry !== "object") continue;
      const label = String(entry.label || "").trim().slice(0, 60);
      const accent = /^#[0-9a-f]{6}$/i.test(entry.accent || "") ? String(entry.accent).toLowerCase() : "";
      if (label || accent) settings[id] = { ...(label ? { label } : {}), ...(accent ? { accent } : {}) };
    }
  }
  const order = [...new Set((Array.isArray(source.order) ? source.order : []).map((id) => String(id || "").trim()).filter(Boolean))];
  return { version: USAGE_PREFERENCES_VERSION, settings, order };
}

export function applyUsagePreferences(sources = [], preferences = {}) {
  const normalized = normalizeUsagePreferences(preferences);
  const values = (Array.isArray(sources) ? sources : []).map((source) => ({
    ...source,
    ...(normalized.settings[source.id]?.label ? { label: normalized.settings[source.id].label } : {}),
    ...(normalized.settings[source.id]?.accent ? { accent: normalized.settings[source.id].accent } : {}),
  }));
  const byId = new Map(values.map((source) => [source.id, source]));
  const ordered = normalized.order.map((id) => byId.get(id)).filter(Boolean);
  const known = new Set(ordered.map((source) => source.id));
  return [...ordered, ...values.filter((source) => !known.has(source.id))];
}

export function reorderUsageSourceIds(sourceIds = [], sourceId, targetId, placeAfter = false) {
  const ids = [...new Set((Array.isArray(sourceIds) ? sourceIds : []).map(String))];
  if (!ids.includes(sourceId) || !ids.includes(targetId) || sourceId === targetId) return ids;
  const next = ids.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (placeAfter ? 1 : 0), 0, sourceId);
  return next;
}

export function usageBoardStats(sources = [], meta = {}) {
  const connected = sources.filter((source) => source.status === "ready").length;
  const lastUpdated = sources.reduce((latest, source) => {
    const timestamp = Date.parse(source.generatedAt || "");
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  return {
    total: sources.length,
    connected,
    warning: sources.filter((source) => source.status === "error" || source.status === "authorization_required").length,
    generatedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
    loading: Boolean(meta.loading),
    error: meta.error || "",
  };
}
