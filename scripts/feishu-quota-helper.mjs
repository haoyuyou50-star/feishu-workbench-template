import { access, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const FEISHU_QUOTA_URL = "https://www.feishu.cn/member/quota-management?from=vc&scene_key=scene_ai_personal_member";
export const FEISHU_MEMBER_SOURCES = Object.freeze([
  Object.freeze({ id: "doubao-member", label: "豆包个人订阅", provider: "doubao-personal-member", accent: "#ad8adb" }),
  Object.freeze({ id: "feishu-ai-member", label: "飞书 AI 会员", provider: "feishu-ai-member", accent: "#58b6ad" }),
]);

const DEFAULT_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const LOGIN_CHECK_INTERVAL_MS = 2500;

function safeText(value, fallback = "", maxLength = 240) {
  return String(value || fallback).trim().slice(0, maxLength);
}

function percentValue(token) {
  const match = safeText(token).match(/(<?)\s*(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return null;
  return { usedPercent: Math.min(100, Math.max(0, match[1] ? Math.min(value, 0.5) : value)), displayPercent: `${match[1]}${match[2]}%` };
}

function dateAtShanghai(month, day, hour, minute, nowMs) {
  const now = new Date(nowMs);
  let year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(now));
  const timestamp = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp < nowMs - 24 * 60 * 60 * 1000) year += 1;
  const adjusted = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
  return Number.isFinite(adjusted) ? Math.floor(adjusted / 1000) : null;
}

export function parseQuotaTime(text, nowMs = Date.now()) {
  const normalized = safeText(text).replace(/\s+/g, "");
  const relative = normalized.match(/(\d+(?:\.\d+)?)(分钟|小时|天)后(?:重置|刷新)/);
  if (relative) {
    const multiplier = relative[2] === "分钟" ? 60 : relative[2] === "小时" ? 3600 : 86400;
    return Math.floor(nowMs / 1000 + Number(relative[1]) * multiplier);
  }
  const absolute = normalized.match(/(\d{1,2})月(\d{1,2})日(\d{1,2}):(\d{2})(?:重置|到期|失效)/);
  return absolute ? dateAtShanghai(Number(absolute[1]), Number(absolute[2]), Number(absolute[3]), Number(absolute[4]), nowMs) : null;
}

function sourceBase(config, status, message) {
  return {
    ...config,
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

export function membershipSourceStates(status = "authorization_required", message = "连接一次飞书账号后即可自动同步") {
  return FEISHU_MEMBER_SOURCES.map((source) => sourceBase(source, status, message));
}

function windowFromText(label, percentToken, timeText, resetLabel) {
  const percent = percentValue(percentToken);
  return percent ? {
    ...percent,
    label,
    resetsAt: parseQuotaTime(timeText),
    resetLabel: safeText(resetLabel || timeText, "等待刷新信息", 80),
    windowDurationMins: null,
  } : null;
}

function textSliceAfter(text, marker) {
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(index) : text;
}

export function parseMembershipPanel(kind, bodyText, nowMs = Date.now()) {
  const text = safeText(bodyText, "", 20000).replace(/\r/g, "");
  const isDoubao = kind === "doubao";
  const marker = isDoubao ? "个人订阅" : "飞书 AI 会员";
  const panel = textSliceAfter(text, marker);
  const percentages = [...panel.matchAll(/<?\s*\d+(?:\.\d+)?\s*%/g)].map((match) => match[0]);
  const timeMatches = [...panel.matchAll(/(?:\d+(?:\.\d+)?\s*(?:分钟|小时|天)后(?:重置|刷新)|\d{1,2}月\d{1,2}日\s*\d{1,2}:\d{2}\s*(?:重置|到期|失效))/g)].map((match) => match[0]);
  if (!percentages.length) throw new Error(`${marker}页面中没有找到额度百分比`);

  if (isDoubao) {
    const planMatch = panel.match(/(?:个人订阅\s*)([^\n]{2,30}(?:套餐|会员))/);
    return {
      ...sourceBase(FEISHU_MEMBER_SOURCES[0], "ready", ""),
      planType: safeText(planMatch?.[1], "个人订阅", 40),
      generatedAt: new Date(nowMs).toISOString(),
      windows: {
        primary: windowFromText("当前周期", percentages[0], timeMatches[0], timeMatches[0]),
        secondary: percentages[1] ? windowFromText("7天额度", percentages[1], timeMatches[1], timeMatches[1]) : null,
      },
    };
  }

  const expiry = timeMatches.find((value) => /到期|失效/.test(value)) || timeMatches[0] || "";
  return {
    ...sourceBase(FEISHU_MEMBER_SOURCES[1], "ready", ""),
    planType: "飞书 AI 会员",
    generatedAt: new Date(nowMs).toISOString(),
    windows: {
      primary: windowFromText("会员额度", percentages[0], expiry, expiry),
      secondary: null,
    },
  };
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try { await access(candidate); return candidate; } catch { /* try next installed browser */ }
  }
  return null;
}

export async function findEdgeExecutable(explicitPath = "") {
  return firstExistingPath([
    explicitPath,
    process.env.FEISHU_QUOTA_BROWSER,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : "",
    process.platform === "win32" ? "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" : "",
    process.platform === "darwin" ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" : "",
    process.platform === "linux" ? "/usr/bin/microsoft-edge" : "",
  ]);
}

export class FeishuQuotaCollector {
  constructor(options = {}, onState = () => {}) {
    this.onState = onState;
    this.profileDir = options.profileDir || process.env.FEISHU_QUOTA_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), "LiuFeng", "feishu-quota-helper-profile");
    this.edgeExecutable = options.edgeExecutable || "";
    this.refreshIntervalMs = Math.max(30000, Number(options.refreshIntervalMs) || DEFAULT_REFRESH_INTERVAL_MS);
    this.context = null;
    this.page = null;
    this.mode = null;
    this.refreshing = false;
    this.closed = false;
    this.pollTimer = null;
    this.loginTimer = null;
  }

  publish(state) { this.onState(state.id, state); }

  publishAll(status, message) {
    membershipSourceStates(status, message).forEach((state) => this.publish(state));
  }

  async launch(headless) {
    if (this.context && this.mode === (headless ? "headless" : "headed")) return;
    await this.closeBrowser();
    const executablePath = await findEdgeExecutable(this.edgeExecutable);
    if (!executablePath) throw new Error("没有找到 Microsoft Edge，请先安装或设置 FEISHU_QUOTA_BROWSER");
    await mkdir(this.profileDir, { recursive: true });
    const { chromium } = await import("playwright-core");
    this.mode = headless ? "headless" : "headed";
    this.context = await chromium.launchPersistentContext(this.profileDir, {
      executablePath,
      headless,
      viewport: { width: 1280, height: 860 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      args: ["--disable-background-networking", "--disk-cache-size=33554432", "--media-cache-size=16777216"],
    });
    this.context.once("close", () => {
      this.context = null;
      this.page = null;
      this.mode = null;
    });
    this.page = this.context.pages()[0] || await this.context.newPage();
  }

  async closeBrowser() {
    const context = this.context;
    this.context = null;
    this.page = null;
    this.mode = null;
    if (context) await context.close().catch(() => {});
  }

  async selectTab(name) {
    for (const locator of [this.page.getByRole("tab", { name, exact: true }), this.page.getByText(name, { exact: true })]) {
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible()) return candidate.click({ timeout: 5000 });
      }
    }
    throw new Error(`没有找到${name}额度页签`);
  }

  async readSources() {
    await this.selectTab("豆包");
    await this.page.waitForTimeout(700);
    const doubaoText = await this.page.locator("body").innerText();
    const doubao = parseMembershipPanel("doubao", doubaoText);

    await this.selectTab("飞书");
    await this.page.waitForTimeout(700);
    const feishuText = await this.page.locator("body").innerText();
    const feishu = parseMembershipPanel("feishu", feishuText);
    return [doubao, feishu];
  }

  async refresh({ headed = false } = {}) {
    if (this.refreshing || this.closed || (!headed && this.loginTimer)) return false;
    this.refreshing = true;
    try {
      await this.launch(!headed);
      await this.page.goto(FEISHU_QUOTA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await this.page.waitForTimeout(1200);
      const sources = await this.readSources();
      sources.forEach((source) => this.publish(source));
      clearInterval(this.loginTimer);
      this.loginTimer = null;
      return true;
    } catch (error) {
      const url = this.page?.url?.() || "";
      const message = safeText(error?.message, "无法读取会员额度");
      if (/login|passport|accounts|auth/i.test(url) || /没有找到.*页签|百分比/.test(message)) {
        this.publishAll("authorization_required", headed ? "请在打开的 Edge 窗口完成登录，助手会自动继续" : "需要连接一次飞书账号");
      } else {
        this.publishAll("error", message);
      }
      return false;
    } finally {
      this.refreshing = false;
      if (!headed) await this.closeBrowser();
    }
  }

  async checkHeadedLogin() {
    if (this.refreshing || this.closed) return false;
    if (!this.page || this.page.isClosed()) {
      clearInterval(this.loginTimer);
      this.loginTimer = null;
      this.publishAll("authorization_required", "登录窗口已关闭；需要时可重新打开");
      return false;
    }
    this.refreshing = true;
    try {
      const bodyText = await this.page.locator("body").innerText({ timeout: 3000 });
      if (!bodyText.includes("个人订阅")) {
        this.publishAll("authorization_required", "请在打开的 Edge 窗口完成登录，助手会自动继续");
        return false;
      }
      const sources = await this.readSources();
      sources.forEach((source) => this.publish(source));
      clearInterval(this.loginTimer);
      this.loginTimer = null;
      await this.closeBrowser();
      return true;
    } catch {
      this.publishAll("authorization_required", "请在打开的 Edge 窗口完成登录，助手会自动继续");
      return false;
    } finally {
      this.refreshing = false;
    }
  }

  async connect() {
    if (this.closed) return;
    this.publishAll("connecting", "正在打开专用 Edge 登录窗口");
    await this.launch(false);
    await this.page.goto(FEISHU_QUOTA_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    clearInterval(this.loginTimer);
    this.loginTimer = setInterval(() => this.checkHeadedLogin().catch(() => {}), LOGIN_CHECK_INTERVAL_MS);
    await this.checkHeadedLogin();
  }

  start() {
    this.refresh().catch((error) => this.publishAll("error", safeText(error?.message, "启动失败")));
    this.pollTimer = setInterval(() => this.refresh().catch(() => {}), this.refreshIntervalMs);
  }

  async stop() {
    this.closed = true;
    clearInterval(this.pollTimer);
    clearInterval(this.loginTimer);
    await this.closeBrowser();
  }
}
