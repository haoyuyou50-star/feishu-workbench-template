"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertCircle, ArrowDown, ArrowUp, Bot, Check, Clock3, Coins, Cpu, GripVertical, LogIn, PlugZap, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import { applyUsagePreferences, initialUsageSources, normalizeUsagePreferences, parseUsagePayload, reorderUsageSourceIds, usageBoardStats } from "./usage-monitor-model.js";

const DEFAULT_USAGE_ENDPOINT = process.env.NEXT_PUBLIC_CODEX_USAGE_ENDPOINT || "http://127.0.0.1:47832/v1/usage";
const POLL_INTERVAL_MS = 15000;
const USAGE_PREFERENCES_KEY = "liufeng-workbench.usage-source-preferences.v1";
const USAGE_COLOR_PRESETS = [
  "#ef8a72", "#e6ad4f", "#9aad68", "#70b78e", "#58b6ad", "#75a7f0", "#ad8adb", "#df87a4",
  "#c85f48", "#b8791f", "#697a3e", "#3f7f5e", "#347e78", "#426fae", "#76539a", "#a84f6c",
];

function loadUsagePreferences() {
  if (typeof window === "undefined") return normalizeUsagePreferences();
  try { return normalizeUsagePreferences(JSON.parse(localStorage.getItem(USAGE_PREFERENCES_KEY) || "{}")); }
  catch { return normalizeUsagePreferences(); }
}

function formatResetTime(window) {
  if (window?.resetLabel) return window.resetLabel;
  if (!Number.isFinite(window?.resetsAt)) return "刷新周期等待连接";
  return `刷新 ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(window.resetsAt * 1000))}`;
}

function formatWindowLabel(window, fallback) {
  const minutes = window?.windowDurationMins;
  if (!Number.isFinite(minutes)) return fallback;
  if (minutes % 1440 === 0) return `${minutes / 1440} 天额度`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时额度`;
  return `${minutes} 分钟额度`;
}

function UsageWindow({ fallbackLabel, window }) {
  const used = Number.isFinite(window?.usedPercent) ? Math.min(100, Math.max(0, window.usedPercent)) : null;
  const label = window?.label || formatWindowLabel(window, fallbackLabel);
  return <div className="usage-window">
    <div className="usage-window-heading"><span>{label}</span><strong>{used === null ? "—" : window?.displayPercent || `${Math.round(used)}%`}</strong></div>
    <div className="usage-progress" role="progressbar" aria-label={`${label}已用额度`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={used ?? undefined}><i style={{ "--usage-progress": `${used ?? 0}%` }} /></div>
    <small>{formatResetTime(window)}</small>
  </div>;
}

function sourceStateLabel(status) {
  if (status === "ready") return "已连接";
  if (status === "error") return "连接异常";
  if (status === "connecting") return "正在连接";
  if (status === "authorization_required") return "需要登录";
  return "等待连接";
}

function SourceIcon({ provider }) {
  if (provider === "doubao-personal-member") return <Bot size={17} strokeWidth={1.8} />;
  if (provider === "feishu-ai-member") return <Sparkles size={17} strokeWidth={1.8} />;
  return <Cpu size={17} strokeWidth={1.8} />;
}

function isMembershipSource(source) {
  return source.provider === "doubao-personal-member" || source.provider === "feishu-ai-member";
}

function UsageSourceCard({ source, dragState, onDragStart, onDragOver, onDrop, onDragEnd, onMove, onEdit }) {
  const ready = source.status === "ready";
  const credits = source.credits?.unlimited ? "不限" : source.credits?.balance ?? "—";
  const membership = isMembershipSource(source);
  const windows = membership
    ? source.provider === "feishu-ai-member"
      ? [{ fallbackLabel: "会员额度", window: source.windows?.primary }]
      : [{ fallbackLabel: "当前周期", window: source.windows?.primary }, { fallbackLabel: "7天额度", window: source.windows?.secondary }]
    : [{ fallbackLabel: "5 小时额度", window: source.windows?.primary }, { fallbackLabel: "7 天额度", window: source.windows?.secondary }];
  const dragging = dragState?.sourceId === source.id;
  const target = dragState?.targetId === source.id;
  return <article
    className={`usage-source-card is-${source.status} ${dragging ? "is-dragging" : ""} ${target ? `is-drop-target is-drop-${dragState.placeAfter ? "after" : "before"}` : ""}`}
    data-usage-source-id={source.id}
    data-card-order-key={`usage:${source.id}`}
    data-motion-key={`usage-card-${source.id}`}
    style={{ "--source-accent": source.accent, viewTransitionName: `usage-card-${source.id.replace(/[^a-z0-9_-]/gi, "-")}` }}
    onDragOver={(event) => onDragOver(event, source.id)}
    onDrop={(event) => onDrop(event, source.id)}
  >
    <header>
      <button type="button" className="usage-card-drag-handle" draggable onDragStart={(event) => onDragStart(event, source.id)} onDragEnd={onDragEnd} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); onMove(source.id, -1); } if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); onMove(source.id, 1); } }} aria-label={`拖动排序${source.label}；方向键也可移动`} title="拖动排序；方向键可移动"><GripVertical size={15} /></button>
      <div className="usage-source-icon"><SourceIcon provider={source.provider} /></div>
      <div className="usage-source-title"><h2>{source.label}</h2><span>{source.planType ? membership ? source.planType : `ChatGPT ${source.planType}` : source.provider}</span></div>
      <span className="usage-source-state"><i />{sourceStateLabel(source.status)}</span>
      <button type="button" className="usage-card-settings" onClick={() => onEdit(source.id)} aria-label={`编辑${source.label}`} title="编辑名称和颜色"><Settings2 size={16} strokeWidth={1.8} /></button>
    </header>
    <div className={`usage-window-grid ${windows.length === 1 ? "is-single" : ""}`}>
      {windows.map((item) => <UsageWindow key={item.fallbackLabel} fallbackLabel={item.fallbackLabel} window={item.window} />)}
    </div>
    {!membership && <div className="usage-source-meta">
      <span><Coins size={13} />Credits <strong>{credits}</strong></span>
      <span><Activity size={13} />累计 Token <strong>{source.tokenUsage?.lifetimeTokens?.toLocaleString?.("zh-CN") ?? "—"}</strong></span>
      {source.resetCredits?.availableCount > 0 && <span><RefreshCw size={13} />刷新券 <strong>{source.resetCredits.availableCount}</strong></span>}
    </div>}
    {!ready && <div className={`usage-source-message ${source.status === "error" ? "is-error" : ""}`}><PlugZap size={14} /><span>{source.message || "等待本机采集器连接"}</span></div>}
    <footer><span>{source.provider}</span><span><Clock3 size={12} />{source.generatedAt ? new Date(source.generatedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "尚未同步"}</span></footer>
  </article>;
}

function UsageSourceDialog({ source, original, index, total, onMove, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ label: source.label, accent: source.accent }));
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const panelRef = useRef(null);
  const nameInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeTimer = useRef(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = setTimeout(() => onCloseRef.current(), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 210);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement;
    let focusFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        const input = nameInputRef.current;
        if (input) {
          input.focus({ preventScroll: true });
          input.select();
        } else {
          panel?.focus({ preventScroll: true });
        }
      });
    });
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); requestClose(); }
      if (event.key !== "Tab" || !panel) return;
      const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      clearTimeout(closeTimer.current);
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [requestClose]);

  function save(event) {
    event.preventDefault();
    const label = draft.label.trim();
    if (!label || closing) return;
    onSave({ label, accent: draft.accent });
    requestClose();
  }

  return createPortal(
    <div className={`dialog-backdrop feature-backdrop usage-edit-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={panelRef} className="dialog-card feature-dialog usage-card-dialog" role="dialog" aria-modal="true" aria-labelledby="usage-source-edit-heading" tabIndex="-1" style={{ "--source-accent": draft.accent }}>
        <form className="dialog-shell" onSubmit={save}>
          <header className="feature-dialog-header">
            <div><span className="dialog-eyebrow">用量监控</span><h2 id="usage-source-edit-heading">编辑数据源</h2></div>
            <button type="button" className="icon-button dialog-close" onClick={requestClose} aria-label="关闭数据源编辑"><X size={18} /></button>
          </header>
          <p className="feature-dialog-copy">名称和颜色只改变当前浏览器中的显示，不会修改账号登录或采集配置。</p>
          <label className="usage-edit-name" htmlFor="usage-source-name"><span>显示名称</span><input ref={nameInputRef} id="usage-source-name" name="usage-source-name" value={draft.label} maxLength={60} autoComplete="off" enterKeyHint="done" onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder="例如：刘峰的 Codex" /></label>
          <fieldset className="usage-edit-color">
            <legend>卡片颜色</legend>
            <div className="usage-edit-palette">
              {USAGE_COLOR_PRESETS.map((color) => <button type="button" key={color} className={draft.accent.toLowerCase() === color ? "is-active" : ""} style={{ "--swatch": color }} aria-label={`设为 ${color}`} title={color.toUpperCase()} aria-pressed={draft.accent.toLowerCase() === color} onClick={() => setDraft((current) => ({ ...current, accent: color }))}>{draft.accent.toLowerCase() === color && <Check size={12} strokeWidth={2} />}</button>)}
            </div>
          </fieldset>
          <div className="usage-edit-order" aria-label="卡片顺序">
            <span>卡片顺序</span>
            <div><button type="button" className="quiet-button" disabled={index <= 0} onClick={() => onMove(source.id, -1)}><ArrowUp size={13} />前移</button><button type="button" className="quiet-button" disabled={index >= total - 1} onClick={() => onMove(source.id, 1)}><ArrowDown size={13} />后移</button></div>
          </div>
          <footer className="dialog-actions">
            <button type="button" className="quiet-button" onClick={() => setDraft({ label: original.label, accent: original.accent })}>恢复默认</button>
            <span />
            <button type="button" className="quiet-button" onClick={requestClose}>取消</button>
            <button type="submit" className="primary-action" disabled={!draft.label.trim() || closing}>保存</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}

export default function UsageMonitorBoard({ query = "", refreshRequest = 0, onStatsChange, endpoint = DEFAULT_USAGE_ENDPOINT }) {
  const [sources, setSources] = useState(initialUsageSources);
  const [preferences, setPreferences] = useState(loadUsagePreferences);
  const [preferenceError, setPreferenceError] = useState("");
  const [dragState, setDragState] = useState(null);
  const [editSourceId, setEditSourceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectingMembership, setConnectingMembership] = useState(false);

  const refreshUsage = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`本机采集器返回 ${response.status}`);
      setSources(parseUsagePayload(await response.json()));
      setError("");
    } catch (requestError) {
      setError(requestError?.name === "AbortError" ? "连接本机采集器超时" : requestError?.message || "无法连接本机采集器");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [endpoint]);

  const connectMembership = useCallback(async () => {
    setConnectingMembership(true);
    try {
      const actionUrl = new URL("/v1/feishu/connect", endpoint).toString();
      const response = await fetch(actionUrl, { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error(`本地助手返回 ${response.status}`);
      setTimeout(refreshUsage, 900);
    } catch (requestError) {
      setError(requestError?.message || "无法打开飞书登录窗口");
    } finally {
      setConnectingMembership(false);
    }
  }, [endpoint, refreshUsage]);

  useEffect(() => {
    refreshUsage();
    const poll = setInterval(refreshUsage, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [refreshRequest, refreshUsage]);

  const displaySources = useMemo(() => applyUsagePreferences(sources, preferences), [preferences, sources]);

  const savePreferences = useCallback((nextValue) => {
    const next = normalizeUsagePreferences(typeof nextValue === "function" ? nextValue(preferences) : nextValue);
    setPreferences(next);
    try {
      localStorage.setItem(USAGE_PREFERENCES_KEY, JSON.stringify(next));
      setPreferenceError("");
    } catch {
      setPreferenceError("卡片设置暂时无法保存；本次修改只在当前页面有效");
    }
  }, [preferences]);

  const moveSource = useCallback((sourceId, direction) => {
    const ids = displaySources.map((source) => source.id);
    const index = ids.indexOf(sourceId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
    const order = reorderUsageSourceIds(ids, sourceId, ids[targetIndex], direction > 0);
    savePreferences((current) => ({ ...current, order }));
  }, [displaySources, savePreferences]);

  function startCardDrag(event, sourceId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-liufeng-card", sourceId);
    setDragState({ sourceId, targetId: null, placeAfter: false });
    const card = event.currentTarget.closest(".usage-source-card");
    if (card) {
      const preview = card.cloneNode(true);
      preview.className = "usage-source-card usage-card-drag-preview";
      preview.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      preview.style.width = `${Math.min(380, Math.max(240, card.getBoundingClientRect().width))}px`;
      document.body.appendChild(preview);
      event.dataTransfer.setDragImage(preview, 28, 20);
      requestAnimationFrame(() => preview.remove());
    }
  }

  function trackCardDrop(event, targetId) {
    if (!dragState?.sourceId || dragState.sourceId === targetId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = Math.abs(event.clientX - (bounds.left + bounds.width / 2)) > Math.abs(event.clientY - (bounds.top + bounds.height / 2));
    const placeAfter = horizontal ? event.clientX > bounds.left + bounds.width / 2 : event.clientY > bounds.top + bounds.height / 2;
    setDragState((current) => ({ ...current, targetId, placeAfter }));
  }

  function finishCardDrop(event, targetId) {
    event.preventDefault();
    const sourceId = dragState?.sourceId || event.dataTransfer.getData("application/x-liufeng-card");
    if (sourceId && sourceId !== targetId) {
      const order = reorderUsageSourceIds(displaySources.map((source) => source.id), sourceId, targetId, Boolean(dragState?.placeAfter));
      savePreferences((current) => ({ ...current, order }));
    }
    setDragState(null);
  }

  function saveSourceSettings(sourceId, patch) {
    savePreferences((current) => ({
      ...current,
      settings: { ...current.settings, [sourceId]: patch },
    }));
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? displaySources.filter((source) => `${source.label} ${source.provider} ${source.planType || ""}`.toLowerCase().includes(needle)) : displaySources;
  }, [displaySources, query]);
  const stats = useMemo(() => usageBoardStats(displaySources, { loading, error }), [displaySources, error, loading]);
  const membershipSources = displaySources.filter(isMembershipSource);
  const membershipReady = membershipSources.length > 0 && membershipSources.every((source) => source.status === "ready");
  const failedSources = displaySources.filter((source) => source.status === "error");
  const editSource = displaySources.find((source) => source.id === editSourceId) || null;
  const originalEditSource = sources.find((source) => source.id === editSourceId) || editSource;

  useEffect(() => { onStatsChange?.(stats); }, [onStatsChange, stats]);

  if (!filtered.length) return <div className="usage-empty"><AlertCircle size={24} /><strong>没有匹配的数据源</strong><span>换一个账号名称或数据源关键词试试</span></div>;
  return <><section className="usage-monitor-board" aria-label="用量监控数据源" data-source-contract="usage-sources-v1">
    <div className="usage-overview">
      <div><span>已连接</span><strong>{stats.connected}<small> / {stats.total}</small></strong></div>
      <p>两个 Codex 账号与飞书、豆包会员额度统一监控。看板每 15 秒读取本地快照，飞书会员数据约每 2 分钟更新。</p>
      <span className={`usage-live-state ${error ? "is-error" : loading ? "is-loading" : "is-ready"}`}><i />{error ? "采集器离线" : loading ? "正在同步" : "实时监控中"}</span>
    </div>
    {error && <div className="usage-bridge-notice" role="status"><AlertCircle size={15} /><span>{error}。请先运行 <code>npm run usage:bridge</code>；账号 2 可在数据源配置中启用。</span><button type="button" onClick={refreshUsage}>重试</button></div>}
    {!error && failedSources.length > 0 && <div className="usage-maintenance-alert" role="alert">
      <AlertCircle size={15} />
      <span><strong>有 {failedSources.length} 个数据源需要处理</strong><small>{failedSources.map((source) => `${source.label}：${source.message || "连接异常"}`).join("；")}</small></span>
      <button type="button" onClick={refreshUsage}>重新检查</button>
    </div>}
    {preferenceError && <div className="usage-maintenance-alert" role="status"><AlertCircle size={15} /><span><strong>卡片设置未保存</strong><small>{preferenceError}</small></span></div>}
    {!error && !membershipReady && <div className="usage-membership-connect" role="status">
      <LogIn size={16} />
      <span><strong>连接飞书 / 豆包会员</strong><small>将打开一个专用 Edge 窗口。登录一次后，助手会在本机持续读取额度。</small></span>
      <button type="button" disabled={connectingMembership} onClick={connectMembership}>{connectingMembership ? "正在打开…" : "打开登录窗口"}</button>
    </div>}
    <div className="usage-source-grid">{filtered.map((source) => <UsageSourceCard key={source.id} source={source} dragState={dragState} onDragStart={startCardDrag} onDragOver={trackCardDrop} onDrop={finishCardDrop} onDragEnd={() => setDragState(null)} onMove={moveSource} onEdit={setEditSourceId} />)}</div>
    <div className="usage-extension-hint"><PlugZap size={14} /><span>扩展接口已预留：任何兼容 v1 协议的数据源都会自动生成新卡片。</span></div>
  </section>{editSource && <UsageSourceDialog source={editSource} original={originalEditSource} index={displaySources.findIndex((source) => source.id === editSource.id)} total={displaySources.length} onMove={moveSource} onSave={(patch) => saveSourceSettings(editSource.id, patch)} onClose={() => setEditSourceId(null)} />}</>;
}
