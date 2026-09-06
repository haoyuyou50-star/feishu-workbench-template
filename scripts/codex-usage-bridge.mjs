import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FeishuQuotaCollector, membershipSourceStates } from "./feishu-quota-helper.mjs";
import { MaintenanceNotifier } from "./maintenance-notifier.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 47832;
const REQUEST_TIMEOUT_MS = 10000;
const REFRESH_INTERVAL_MS = 15000;

export function codexAppServerArgs() {
  return ["-c", 'cli_auth_credentials_store="file"', "app-server", "--listen", "stdio://"];
}

export function defaultBridgeConfig() {
  return {
    port: DEFAULT_PORT,
    allowedOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    sources: [
      { id: "codex-primary", label: "Codex 账号 1", accent: "#70b78e", enabled: true },
      { id: "codex-secondary", label: "Codex 账号 2", accent: "#75a7f0", enabled: false },
    ],
    feishuMembership: {
      enabled: true,
      refreshIntervalMs: 2 * 60 * 1000,
    },
    notifications: {
      enabled: true,
      cooldownMs: 30 * 60 * 1000,
    },
  };
}

function safeText(value, fallback, maxLength = 120) {
  const text = String(value || fallback || "").trim();
  return text.slice(0, maxLength);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validSourceId(value) {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value || "");
}

export function normalizeBridgeConfig(value = {}) {
  const base = defaultBridgeConfig();
  const sources = Array.isArray(value.sources) ? value.sources : base.sources;
  const normalizedSources = sources.map((source, index) => {
    const fallback = base.sources[index] || {};
    const id = safeText(source?.id, fallback.id || `codex-${index + 1}`, 64);
    if (!validSourceId(id)) throw new Error(`无效的数据源 id: ${id}`);
    const accent = /^#[0-9a-f]{6}$/i.test(source?.accent || "") ? source.accent : fallback.accent || "#918b84";
    return {
      id,
      label: safeText(source?.label, fallback.label || id, 80),
      provider: "codex-app-server",
      accent,
      enabled: source?.enabled === undefined ? fallback.enabled !== false : source.enabled !== false,
      codexHome: source?.codexHome ? String(source.codexHome) : null,
      codexBin: source?.codexBin ? String(source.codexBin) : null,
    };
  });
  if (new Set(normalizedSources.map((source) => source.id)).size !== normalizedSources.length) throw new Error("数据源 id 不能重复");
  const requestedPort = safeNumber(value.port);
  const port = requestedPort && requestedPort >= 1024 && requestedPort <= 65535 ? requestedPort : base.port;
  const allowedOrigins = Array.isArray(value.allowedOrigins) ? value.allowedOrigins.map((origin) => safeText(origin, "", 240)).filter(Boolean) : base.allowedOrigins;
  const membership = value.feishuMembership && typeof value.feishuMembership === "object" ? value.feishuMembership : base.feishuMembership;
  const notifications = value.notifications && typeof value.notifications === "object" ? value.notifications : base.notifications;
  return {
    port,
    allowedOrigins,
    sources: normalizedSources,
    feishuMembership: {
      enabled: membership.enabled !== false,
      refreshIntervalMs: Math.max(30000, safeNumber(membership.refreshIntervalMs) || base.feishuMembership.refreshIntervalMs),
      profileDir: membership.profileDir ? String(membership.profileDir) : null,
      edgeExecutable: membership.edgeExecutable ? String(membership.edgeExecutable) : null,
    },
    notifications: {
      enabled: notifications.enabled !== false,
      cooldownMs: Math.max(60000, safeNumber(notifications.cooldownMs) || base.notifications.cooldownMs),
    },
  };
}

export async function readBridgeConfig(configPath) {
  if (!configPath) return normalizeBridgeConfig();
  const contents = await readFile(configPath, "utf8");
  return normalizeBridgeConfig(JSON.parse(contents));
}

async function readCodexAccountId(source) {
  if (!source?.enabled || !source.codexHome) return null;
  try {
    const auth = JSON.parse(await readFile(join(source.codexHome, "auth.json"), "utf8"));
    const accountId = auth?.tokens?.account_id;
    return typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
  } catch {
    return null;
  }
}

export function duplicateCodexSourceErrors(sources = [], accountIds = {}) {
  const firstSourceByAccount = new Map();
  const errors = new Map();
  for (const source of sources) {
    if (!source?.enabled) continue;
    const accountId = accountIds[source.id];
    if (!accountId) continue;
    const first = firstSourceByAccount.get(accountId);
    if (first) {
      errors.set(source.id, `与“${first.label}”登录了同一个 Codex 账号；请为此数据源重新完成独立登录`);
    } else {
      firstSourceByAccount.set(accountId, source);
    }
  }
  return errors;
}

function selectRateLimitSnapshot(response) {
  const buckets = response?.rateLimitsByLimitId;
  if (buckets && typeof buckets === "object") {
    if (buckets.codex) return buckets.codex;
    const first = Object.values(buckets).find(Boolean);
    if (first) return first;
  }
  return response?.rateLimits || null;
}

function publicWindow(value) {
  if (!value || typeof value !== "object") return null;
  return {
    usedPercent: safeNumber(value.usedPercent),
    windowDurationMins: safeNumber(value.windowDurationMins),
    resetsAt: safeNumber(value.resetsAt),
  };
}

function publicSourceBase(config, status, message = "") {
  return {
    id: config.id,
    label: config.label,
    provider: config.provider,
    accent: config.accent,
    status,
    planType: null,
    generatedAt: null,
    windows: { primary: null, secondary: null },
    credits: null,
    resetCredits: null,
    tokenUsage: null,
    message,
  };
}

export function serializeUsageSource(config, rateResponse, usageResponse = null, usageError = "") {
  const snapshot = selectRateLimitSnapshot(rateResponse);
  if (!snapshot) throw new Error("Codex 未返回额度快照");
  return {
    ...publicSourceBase(config, "ready", usageError ? `额度已同步；Token 统计暂不可用：${usageError}` : ""),
    planType: snapshot.planType == null ? null : safeText(snapshot.planType, "", 40),
    generatedAt: new Date().toISOString(),
    windows: { primary: publicWindow(snapshot.primary), secondary: publicWindow(snapshot.secondary) },
    credits: snapshot.credits ? {
      hasCredits: Boolean(snapshot.credits.hasCredits),
      unlimited: Boolean(snapshot.credits.unlimited),
      balance: snapshot.credits.balance == null ? null : safeText(snapshot.credits.balance, "", 40),
    } : null,
    resetCredits: rateResponse?.rateLimitResetCredits ? {
      availableCount: Math.max(0, safeNumber(rateResponse.rateLimitResetCredits.availableCount) || 0),
    } : null,
    tokenUsage: usageResponse?.summary ? {
      lifetimeTokens: Math.max(0, safeNumber(usageResponse.summary.lifetimeTokens) || 0),
      currentStreakDays: Math.max(0, safeNumber(usageResponse.summary.currentStreakDays) || 0),
    } : null,
  };
}

class CodexUsageClient {
  constructor(config, onState) {
    this.config = config;
    this.onState = onState;
    this.child = null;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
    this.refreshing = false;
    this.closed = false;
    this.restartTimer = null;
    this.pollTimer = null;
  }

  publish(state) {
    this.onState(this.config.id, state);
  }

  start() {
    if (!this.config.enabled) {
      this.publish(publicSourceBase(this.config, "disconnected", "尚未启用；请在配置文件中填写此账号的独立 CODEX_HOME"));
      return;
    }
    this.publish(publicSourceBase(this.config, "connecting", "正在连接 Codex App Server"));
    const executable = this.config.codexBin || process.env.CODEX_BIN || (process.platform === "win32" ? "codex.exe" : "codex");
    const environment = { ...process.env };
    if (this.config.codexHome) environment.CODEX_HOME = this.config.codexHome;
    this.child = spawn(executable, codexAppServerArgs(), {
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleChunk(chunk));
    this.child.on("error", (error) => this.handleExit(error));
    this.child.on("exit", (code) => this.handleExit(new Error(`Codex App Server 已退出（${code ?? "unknown"}）`)));
    this.child.once("spawn", () => this.initialize().catch((error) => this.fail(error)));
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "liufeng-usage-monitor", title: "用量监控看板", version: "1.0.0" },
      capabilities: null,
    });
    this.notify("initialized");
    await this.refresh();
    this.pollTimer = setInterval(() => this.refresh().catch((error) => this.fail(error, false)), REFRESH_INTERVAL_MS);
  }

  handleChunk(chunk) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.handleMessage(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  handleMessage(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message || "Codex 请求失败"));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "account/rateLimits/updated") this.refresh().catch((error) => this.fail(error, false));
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin?.writable) return reject(new Error("Codex App Server 尚未就绪"));
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 请求超时`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      const envelope = params === undefined ? { method, id } : { method, id, params };
      this.child.stdin.write(`${JSON.stringify(envelope)}\n`);
    });
  }

  notify(method) {
    if (this.child?.stdin?.writable) this.child.stdin.write(`${JSON.stringify({ method })}\n`);
  }

  async refresh() {
    if (this.refreshing || this.closed) return;
    this.refreshing = true;
    try {
      const rateResponse = await this.request("account/rateLimits/read");
      let usageResponse = null;
      let usageError = "";
      try { usageResponse = await this.request("account/usage/read", {}); }
      catch (error) { usageError = safeText(error.message, "Token 请求失败", 120); }
      this.publish(serializeUsageSource(this.config, rateResponse, usageResponse, usageError));
    } finally {
      this.refreshing = false;
    }
  }

  fail(error, restart = true) {
    if (this.closed) return;
    this.publish(publicSourceBase(this.config, "error", safeText(error?.message, "Codex 连接失败", 200)));
    if (restart) this.scheduleRestart();
  }

  handleExit(error) {
    if (this.closed || this.restartTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    this.fail(error);
  }

  scheduleRestart() {
    if (this.closed || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, 5000);
  }

  stop() {
    this.closed = true;
    clearInterval(this.pollTimer);
    clearTimeout(this.restartTimer);
    this.child?.kill();
  }
}

function parseArguments(argv) {
  const result = { configPath: null, port: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--config") result.configPath = argv[index + 1] || null;
    if (argv[index] === "--port") result.port = safeNumber(argv[index + 1]);
  }
  return result;
}

function corsOrigin(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return null;
  if (allowedOrigins.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  return false;
}

function sendJson(response, status, payload, origin = null) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Private-Network": "true",
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  response.end(body);
}

export async function startBridge({ configPath = null, port = null } = {}) {
  const config = await readBridgeConfig(configPath);
  if (port && port >= 1024 && port <= 65535) config.port = port;
  const accountIds = Object.fromEntries(await Promise.all(config.sources.map(async (source) => [source.id, await readCodexAccountId(source)])));
  const duplicateErrors = duplicateCodexSourceErrors(config.sources, accountIds);
  const sourceStates = new Map(config.sources.map((source) => {
    const duplicateError = duplicateErrors.get(source.id);
    return [source.id, duplicateError
      ? publicSourceBase(source, "error", duplicateError)
      : publicSourceBase(source, source.enabled ? "connecting" : "disconnected", source.enabled ? "准备连接" : "数据源尚未启用")];
  }));
  membershipSourceStates(config.feishuMembership.enabled ? "connecting" : "disconnected", config.feishuMembership.enabled ? "准备读取飞书会员额度" : "飞书会员采集尚未启用").forEach((source) => sourceStates.set(source.id, source));
  const notifier = new MaintenanceNotifier(config.notifications);
  const setSourceState = (id, state) => {
    const previous = sourceStates.get(id);
    sourceStates.set(id, state);
    notifier.handle(previous, state);
  };
  const clients = config.sources.filter((source) => !duplicateErrors.has(source.id)).map((source) => new CodexUsageClient(source, setSourceState));
  const membershipCollector = config.feishuMembership.enabled ? new FeishuQuotaCollector(config.feishuMembership, setSourceState) : null;

  const server = createServer(async (request, response) => {
    const origin = corsOrigin(request, config.allowedOrigins);
    if (origin === false) return sendJson(response, 403, { error: "origin_not_allowed" });
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Private-Network": "true",
        "Access-Control-Max-Age": "600",
      });
      return response.end();
    }
    const pathname = new URL(request.url || "/", `http://${DEFAULT_HOST}`).pathname;
    if (request.method === "GET" && pathname === "/health") return sendJson(response, 200, { ok: true, sources: sourceStates.size, membershipHelper: Boolean(membershipCollector), notifications: notifier.enabled }, origin);
    if (request.method === "GET" && pathname === "/v1/usage") return sendJson(response, 200, { version: 1, generatedAt: new Date().toISOString(), sources: [...sourceStates.values()] }, origin);
    if (request.method === "POST" && pathname === "/v1/feishu/connect") {
      if (!membershipCollector) return sendJson(response, 409, { error: "membership_helper_disabled" }, origin);
      membershipCollector.connect().catch((error) => membershipCollector.publishAll("error", safeText(error?.message, "无法打开登录窗口")));
      return sendJson(response, 202, { ok: true, status: "connecting" }, origin);
    }
    if (request.method === "POST" && pathname === "/v1/feishu/refresh") {
      if (!membershipCollector) return sendJson(response, 409, { error: "membership_helper_disabled" }, origin);
      membershipCollector.refresh().catch(() => {});
      return sendJson(response, 202, { ok: true, status: "refreshing" }, origin);
    }
    if (request.method === "POST" && pathname === "/v1/notifications/test") {
      return sendJson(response, 200, { ok: notifier.test() }, origin);
    }
    if (!["GET", "POST"].includes(request.method || "")) return sendJson(response, 405, { error: "method_not_allowed" }, origin);
    return sendJson(response, 404, { error: "not_found" }, origin);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, DEFAULT_HOST, resolve);
  });
  clients.forEach((client) => client.start());
  membershipCollector?.start();
  return {
    config,
    server,
    clients,
    close: () => {
      clients.forEach((client) => client.stop());
      membershipCollector?.stop();
      server.close();
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const bridge = await startBridge(options);
  process.stdout.write(`用量本地助手已启动：http://${DEFAULT_HOST}:${bridge.config.port}/v1/usage\n`);
  process.stdout.write(`已配置 ${bridge.config.sources.length} 个 Codex 数据源，并启用飞书 / 豆包会员采集；按 Ctrl+C 停止。\n`);
  const close = () => { bridge.close(); process.exit(0); };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`启动失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
