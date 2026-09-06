import { spawn } from "node:child_process";

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

function safeText(value, fallback = "", maxLength = 180) {
  return String(value || fallback).replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
}

function psLiteral(value) {
  return `'${safeText(value).replace(/'/g, "''")}'`;
}

export function maintenanceReason(source) {
  if (!source || typeof source !== "object") return null;
  if (source.status === "error") return safeText(source.message, "连接异常");
  if (source.status === "authorization_required") return safeText(source.message, "需要重新登录");
  if (source.status === "disconnected" && !/尚未启用|未启用/.test(source.message || "")) return safeText(source.message, "连接已断开");
  return null;
}

export function shouldNotifyTransition(previous, next) {
  const reason = maintenanceReason(next);
  if (!reason) return false;
  if (!previous) return true;
  return previous.status !== next.status || safeText(previous.message) !== safeText(next.message);
}

export function showWindowsNotification(title, body) {
  if (process.platform !== "win32") return false;
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$notice = New-Object System.Windows.Forms.NotifyIcon",
    "$notice.Icon = [System.Drawing.SystemIcons]::Information",
    `$notice.Text = ${psLiteral("LiuFeng 用量监控")}`,
    `$notice.BalloonTipTitle = ${psLiteral(title)}`,
    `$notice.BalloonTipText = ${psLiteral(body)}`,
    "$notice.Visible = $true",
    "$notice.ShowBalloonTip(8000)",
    "Start-Sleep -Seconds 9",
    "$notice.Dispose()",
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return true;
}

export class MaintenanceNotifier {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.cooldownMs = Math.max(60000, Number(options.cooldownMs) || DEFAULT_COOLDOWN_MS);
    this.lastNotified = new Map();
  }

  handle(previous, next) {
    if (!this.enabled || !shouldNotifyTransition(previous, next)) return false;
    const reason = maintenanceReason(next);
    const fingerprint = `${next.status}:${reason}`;
    const last = this.lastNotified.get(next.id);
    const now = Date.now();
    if (last?.fingerprint === fingerprint && now - last.at < this.cooldownMs) return false;
    const shown = showWindowsNotification("用量监控需要处理", `${safeText(next.label, next.id, 60)}：${reason}`);
    if (shown) this.lastNotified.set(next.id, { fingerprint, at: now });
    return shown;
  }

  test() {
    if (!this.enabled) return false;
    return showWindowsNotification("用量监控提示已启用", "以后账号失效或采集异常时，这里会提醒你处理。");
  }
}
