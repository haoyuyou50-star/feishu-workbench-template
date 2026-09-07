import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Responsive, useContainerWidth } from "react-grid-layout";
import {
  AlarmClock,
  AlertCircle,
  Award,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CirclePause,
  CirclePlay,
  ClipboardCheck,
  ClipboardPaste,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GripVertical,
  ImagePlus,
  KeyRound,
  Link2,
  Library,
  LayoutDashboard,
  ListTodo,
  Lock,
  LockOpen,
  MapPin,
  Maximize2,
  Minus,
  Moon,
  NotebookPen,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  StickyNote,
  Sun,
  Sunrise,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { createDocsAppLink, openFeishuDestination } from "./feishu-links.js";
import { getBoardIcon } from "./board-icons.js";
import { DEFAULT_WORKBENCH_BOARDS, getBoardDestination, normalizeWorkbenchBoards } from "./board-registry-model.js";
import CoursePlanBoard from "./course-plan.jsx";
import UsageMonitorBoard from "./usage-monitor.jsx";
import { deleteAllNoteImages, deleteNoteImage, extractClipboardImages, formatNoteImageSize, listNoteImages, saveNoteImages } from "./note-image-store.js";
import { taskIsDone, unfinishedTasks, withoutTaskDonePreference } from "./task-list-model.js";

const STORAGE = {
  appearance: "liufeng-workbench.rebuild.appearance.v1",
  awardStatusColors: "liufeng-workbench.rebuild.award-status-colors.v1",
  awardTagColors: "liufeng-workbench.rebuild.award-tag-colors.v1",
  awardProjectColors: "liufeng-workbench.rebuild.award-project-colors.v1",
  awardProjectOrder: "liufeng-workbench.rebuild.award-project-order.v1",
  awardRecordOrder: "liufeng-workbench.rebuild.award-record-order.v1",
  awardView: "liufeng-workbench.rebuild.award-view.v1",
  courseView: "liufeng-workbench.rebuild.course-view.v1",
  boards: "liufeng-workbench.rebuild.boards.v1",
  calendarVisibility: "liufeng-workbench.rebuild.calendar-visibility.v1",
  knowledgePool: "liufeng-workbench.rebuild.knowledge-pool.v1",
  knowledgeStyles: "liufeng-workbench.rebuild.knowledge-styles.v1",
  projectsSplit: "liufeng-workbench.rebuild.projects-split.v1",
  layouts: "liufeng-workbench.rebuild.layouts.v1",
  layoutLocked: "liufeng-workbench.rebuild.layout-locked.v1",
  moduleColors: "liufeng-workbench.rebuild.module-colors.v1",
  notes: "liufeng-workbench.rebuild.notes.v1",
  notesSidebar: "liufeng-workbench.rebuild.notes-sidebar.v1",
  projects: "liufeng-workbench.rebuild.projects.v1",
  projectKindColors: "liufeng-workbench.rebuild.project-kind-colors.v1",
  tasks: "liufeng-workbench.rebuild.task-prefs.v1",
  taskTodayOrder: "liufeng-workbench.rebuild.task-today-order.v1",
  timer: "liufeng-workbench.rebuild.timer.v1",
};

export function defaultWorkbenchAppearance() {
  return window.LFTheme?.mergeAppearance({
    themeMode: "light",
    tokens: {
      light: {
        background: "#f8f7f3",
        foreground: "#2b2926",
        surface: "#fffefa",
        border: "#e7e3dc",
        muted: "#918b84",
        accent: "#70b78e",
        diffAdded: "#3f7f5e",
        diffRemoved: "#c85f68",
        skill: "#5f86b8",
      },
      dark: { accent: "#70b78e" },
    },
  }) || null;
}

const THEME_MODES = [
  { id: "system", label: "跟随系统", detail: "随设备外观变化", icon: Settings2 },
  { id: "light", label: "浅色", detail: "始终使用浅色", icon: Sun },
  { id: "dark", label: "深色", detail: "始终使用深色", icon: Moon },
  { id: "solar", label: "日出日落", detail: "按本地日照切换", icon: Sunrise },
];

const REQUIRED_PERSONAL_SCOPES = [
  "calendar:calendar:readonly",
  "calendar:calendar.event:read",
  "calendar:calendar.event:reply",
  "task:task:read",
  "task:task:write",
];

const BOARD_COLOR_PRESETS = ["#70b78e", "#58b6ad", "#75a7f0", "#ad8adb", "#df87a4", "#e6ad4f"];
const SETTINGS_COLOR_PRESETS = [
  "#ef8a72", "#e6ad4f", "#9aad68", "#70b78e", "#58b6ad", "#75a7f0", "#ad8adb", "#df87a4",
  "#c85f48", "#b8791f", "#697a3e", "#3f7f5e", "#347e78", "#426fae", "#76539a", "#a84f6c",
];
const DEFAULT_PROJECT_KIND_COLORS = {
  文档: "#75a7f0",
  多维表格: "#70b78e",
  知识库: "#ad8adb",
  自定义: "#918b84",
};
const AWARD_STATUS_ORDER = ["放弃", "制作中", "待投奖", "已投奖", "已获奖"];
const AWARD_STATUS_COLORS = {
  放弃: "#918b84",
  制作中: "#e6ad4f",
  待投奖: "#70b78e",
  已投奖: "#75a7f0",
  已获奖: "#ad8adb",
};
const DEFAULT_AWARD_LEVEL_COLORS = {
  国际: "#ad8adb",
  国家级: "#75a7f0",
  省市级: "#58b6ad",
  行业专项: "#e6ad4f",
  待确认: "#918b84",
};
const DEFAULT_AWARD_RESULT_COLORS = {
  待投递: "#70b78e",
  "评审中/待公布": "#75a7f0",
  尚未公布: "#75a7f0",
  拒稿: "#c85f48",
  受邀参展: "#ad8adb",
};
const DEFAULT_AWARD_TAG_COLORS = {
  level: "#75a7f0",
  result: "#70b78e",
  levels: DEFAULT_AWARD_LEVEL_COLORS,
  results: DEFAULT_AWARD_RESULT_COLORS,
};
const AWARD_FIELD_GROUPS = [
  { title: "基本信息", fields: ["投奖条目", "工作状态", "项目名称", "截止日期", "下一步行动"] },
  { title: "项目信息", fields: ["项目类型", "项目归属", "项目成员", "我的作次", "指导老师"] },
  { title: "比赛信息", fields: ["比赛名称", "赛事级别", "赛道/组别", "主办方", "投递日期", "结果公布日", "投赛结果"] },
  { title: "材料与链接", fields: ["比赛官网", "报名/提交入口", "作品要求", "提交材料", "备注"] },
];
const AWARD_LONG_FIELDS = new Set(["下一步行动", "作品要求", "提交材料", "备注"]);

const COLOR_FIELDS = [
  ["background", "页面背景"],
  ["foreground", "主要文字"],
  ["surface", "卡片表面"],
  ["border", "边框"],
  ["muted", "次要文字"],
  ["accent", "强调色"],
  ["diffAdded", "成功 / 新增"],
  ["diffRemoved", "危险 / 删除"],
  ["skill", "信息色"],
];

const NOTE_COLORS = ["mint", "amber", "rose", "blue"];
const NOTE_COLOR_LABELS = { mint: "薄荷绿", amber: "暖黄色", rose: "浅粉色", blue: "雾蓝色" };
const DEFAULT_MODULE_COLORS = {
  schedule: "#70b78e",
  tasks: "#df87a4",
  projects: "#e6ad4f",
  timer: "#58b6ad",
  notes: "#ad8adb",
};
const START_HOUR = 7;
const END_HOUR = 23;
const HOUR_HEIGHT = 52;
const TIMELINE_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

const DEFAULT_LAYOUTS = {
  lg: [
    { i: "schedule", x: 0, y: 0, w: 5, h: 13, minW: 4, minH: 9 },
    { i: "tasks", x: 5, y: 0, w: 3, h: 13, minW: 3, minH: 6 },
    { i: "projects", x: 8, y: 0, w: 4, h: 6, minW: 3, minH: 6 },
    { i: "timer", x: 8, y: 6, w: 4, h: 7, minW: 3, minH: 5 },
    { i: "notes", x: 0, y: 13, w: 12, h: 7, minW: 4, minH: 6 },
  ],
  md: [
    { i: "schedule", x: 0, y: 0, w: 5, h: 13 },
    { i: "tasks", x: 5, y: 0, w: 3, h: 13 },
    { i: "projects", x: 0, y: 13, w: 4, h: 7 },
    { i: "timer", x: 4, y: 13, w: 4, h: 7 },
    { i: "notes", x: 0, y: 20, w: 8, h: 7 },
  ],
  sm: [
    { i: "schedule", x: 0, y: 0, w: 4, h: 12 },
    { i: "tasks", x: 0, y: 12, w: 4, h: 8 },
    { i: "projects", x: 0, y: 20, w: 4, h: 7 },
    { i: "timer", x: 0, y: 27, w: 4, h: 7 },
    { i: "notes", x: 0, y: 34, w: 4, h: 8 },
  ],
  xs: [
    { i: "schedule", x: 0, y: 0, w: 2, h: 12 },
    { i: "tasks", x: 0, y: 12, w: 2, h: 8 },
    { i: "projects", x: 0, y: 20, w: 2, h: 7 },
    { i: "timer", x: 0, y: 27, w: 2, h: 8 },
    { i: "notes", x: 0, y: 35, w: 2, h: 9 },
  ],
};

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const identityStoredValue = (value) => value;

function useStoredState(key, fallback, normalizeInitial = identityStoredValue) {
  const [value, setValue] = useState(() => normalizeInitial(readStored(key, typeof fallback === "function" ? fallback() : fallback)));
  const setStoredValue = useCallback((nextValue) => {
    setValue((current) => {
      const resolved = typeof nextValue === "function" ? nextValue(current) : nextValue;
      try {
        localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Storage can be unavailable in private browsing contexts.
      }
      return resolved;
    });
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private browsing contexts.
    }
  }, [key, value]);
  return [value, setStoredValue];
}

function id() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const text = String(value || "").trim();
  if (!text) return null;
  const loose = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (loose) {
    const year = Number(loose[1]);
    const month = Number(loose[2]);
    const day = Number(loose[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) return parsed;
    return null;
  }
  const numeric = Number(text);
  const parsed = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function hasDateArrived(value, now = new Date()) {
  const parsed = parseDateValue(value);
  return Boolean(parsed) && dateKey(now) >= dateKey(parsed);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function startOfMonthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(first);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function buildDemoTasks(anchor) {
  const at = (offset, hour = 18) => {
    const date = addDays(anchor, offset);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  return [
    { id: "demo-task-today-1", title: "整理本周项目进度", due: at(0, 17), completed: false, defaultToday: true, localDemo: true },
    { id: "demo-task-today-2", title: "核对投奖材料清单", due: at(0, 21), completed: false, defaultToday: true, localDemo: true },
    { id: "demo-task-future-1", title: "完成故事写作初稿", due: at(1, 20), completed: false, defaultToday: false, localDemo: true },
    { id: "demo-task-future-2", title: "更新项目投奖信息", due: at(2, 18), completed: false, defaultToday: false, localDemo: true },
    { id: "demo-task-future-3", title: "准备课程汇报素材", due: at(4, 16), completed: false, defaultToday: false, localDemo: true },
    { id: "demo-task-future-4", title: "整理下周工作安排", due: at(6, 19), completed: false, defaultToday: false, localDemo: true },
  ];
}

function orderedByIds(items, order) {
  const positions = new Map((Array.isArray(order) ? order : []).map((itemId, index) => [itemId, index]));
  return [...items].sort((a, b) => {
    const aPosition = positions.has(a.id) ? positions.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bPosition = positions.has(b.id) ? positions.get(b.id) : Number.MAX_SAFE_INTEGER;
    return aPosition - bPosition;
  });
}

function sameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatTimer(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function eventsForDay(events, day) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 1);
  return events.filter((event) => new Date(event.start) < end && new Date(event.end) > start);
}

function layoutEvents(events, day, startHour = START_HOUR, endHour = END_HOUR) {
  const start = new Date(day);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(day);
  end.setHours(endHour, 0, 0, 0);
  const visible = events
    .filter((event) => !event.allDay && new Date(event.start) < end && new Date(event.end) > start)
    .map((event) => ({
      ...event,
      layoutStart: Math.max(start.getTime(), new Date(event.start).getTime()),
      layoutEnd: Math.min(end.getTime(), new Date(event.end).getTime()),
    }))
    .sort((a, b) => a.layoutStart - b.layoutStart || b.layoutEnd - a.layoutEnd);

  const groups = [];
  let group = [];
  let groupEnd = -Infinity;
  for (const event of visible) {
    if (group.length && event.layoutStart >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -Infinity;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, event.layoutEnd);
  }
  if (group.length) groups.push(group);

  return groups.flatMap((items) => {
    const columns = [];
    const placed = items.map((event) => {
      let column = columns.findIndex((columnEnd) => columnEnd <= event.layoutStart);
      if (column === -1) column = columns.length;
      columns[column] = event.layoutEnd;
      return { ...event, column };
    });
    const count = Math.max(1, columns.length);
    return placed.map((event) => ({ ...event, columnCount: count }));
  });
}

function eventStyle(event, startHour = START_HOUR, endHour = END_HOUR, height = TIMELINE_HEIGHT) {
  const day = new Date(event.layoutStart);
  const minute = day.getHours() * 60 + day.getMinutes() + day.getSeconds() / 60 - startHour * 60;
  const duration = (event.layoutEnd - event.layoutStart) / 60000;
  const range = (endHour - startHour) * 60;
  const gap = 3;
  return {
    "--event-color": event.color || "#70b78e",
    top: `${(minute / range) * height}px`,
    height: `${Math.max(27, (duration / range) * height)}px`,
    left: `calc(${event.column / event.columnCount * 100}% + ${event.column ? gap : 0}px)`,
    width: `calc(${100 / event.columnCount}% - ${gap}px)`,
  };
}

function eventKey(event) {
  return `${event.calendarId || "calendar"}:${event.id}`;
}

function eventRsvpClass(event) {
  if (event.rsvpStatus === "decline" || event.status === "cancelled") return "is-rsvp-declined";
  if (event.rsvpStatus === "tentative") return "is-rsvp-tentative";
  return event.rsvpStatus === "accept" ? "is-rsvp-accepted" : "is-rsvp-unanswered";
}

function eventColorStyle(event) {
  return { "--event-color": event.color || event.calendarColor || "#70b78e" };
}

const IconButton = React.forwardRef(function IconButton({ label, children, className = "", ...props }, ref) {
  return <button ref={ref} type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
});

export function LFSelect({ value = "", options = [], onChange, placeholder = "请选择", ariaLabel, disabled = false, className = "" }) {
  const normalized = options.map((option) => typeof option === "object" ? option : { value: option, label: option });
  const selectedIndex = normalized.findIndex((option) => option.value === value);
  const selected = normalized[selectedIndex];
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState("bottom");
  const [menuStyle, setMenuStyle] = useState({});
  const [highlighted, setHighlighted] = useState(Math.max(0, selectedIndex));
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const closeTimer = useRef(null);
  const openFrame = useRef(null);
  const typeahead = useRef({ text: "", timer: null });
  const listboxId = `lf-select-${React.useId().replaceAll(":", "")}`;

  function positionMenu() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const safe = 12;
    const gap = 6;
    const below = window.innerHeight - rect.bottom - safe - gap;
    const above = rect.top - safe - gap;
    const nextDirection = below < 150 && above > below ? "top" : "bottom";
    const available = Math.max(88, nextDirection === "top" ? above : below);
    const width = Math.min(Math.max(rect.width, 140), window.innerWidth - safe * 2);
    const left = Math.min(Math.max(safe, rect.left), window.innerWidth - safe - width);
    setDirection(nextDirection);
    setMenuStyle({
      left: `${left}px`,
      top: nextDirection === "top" ? "auto" : `${rect.bottom + gap}px`,
      bottom: nextDirection === "top" ? `${window.innerHeight - rect.top + gap}px` : "auto",
      width: `${width}px`,
      maxHeight: `${Math.min(190, available)}px`,
    });
  }

  function openMenu(initialIndex = selectedIndex >= 0 ? selectedIndex : 0) {
    if (disabled) return;
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(openFrame.current);
    setHighlighted(Math.max(0, initialIndex));
    positionMenu();
    setMounted(true);
    openFrame.current = requestAnimationFrame(() => setOpen(true));
  }

  function closeMenu({ restoreFocus = false } = {}) {
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(openFrame.current);
    setOpen(false);
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      if (restoreFocus) triggerRef.current?.focus();
    }, 150);
  }

  function focusOption(index) {
    const next = (index + normalized.length) % normalized.length;
    setHighlighted(next);
    requestAnimationFrame(() => optionRefs.current[next]?.focus());
  }

  function choose(option) {
    if (option.disabled) return;
    onChange(option.value);
    closeMenu({ restoreFocus: true });
  }

  function handleOptionKey(event, index) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusOption(event.key === "Home" ? 0 : normalized.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu({ restoreFocus: true });
    } else if (event.key === "Tab") {
      closeMenu();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(normalized[index]);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      clearTimeout(typeahead.current.timer);
      typeahead.current.text = `${typeahead.current.text}${event.key}`.toLocaleLowerCase("zh-CN");
      const match = normalized.findIndex((option) => String(option.label).toLocaleLowerCase("zh-CN").startsWith(typeahead.current.text));
      if (match >= 0) focusOption(match);
      typeahead.current.timer = setTimeout(() => { typeahead.current.text = ""; }, 500);
    }
  }

  useEffect(() => {
    if (!mounted) return undefined;
    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) closeMenu();
    };
    const reposition = () => positionMenu();
    document.addEventListener("pointerdown", handleOutside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [mounted]);

  useEffect(() => () => {
    clearTimeout(closeTimer.current);
    clearTimeout(typeahead.current.timer);
    cancelAnimationFrame(openFrame.current);
  }, []);

  return <div ref={rootRef} className={`lf-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`}>
    <button ref={triggerRef} type="button" className="lf-select-trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} onClick={() => open ? closeMenu() : openMenu()} onKeyDown={(event) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const index = event.key === "End" ? normalized.length - 1 : event.key === "Home" ? 0 : selectedIndex >= 0 ? selectedIndex : event.key === "ArrowUp" ? normalized.length - 1 : 0;
        openMenu(index);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu({ restoreFocus: true });
      }
    }}>
      <span className={!selected ? "is-placeholder" : ""}>{selected?.label || placeholder}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {mounted && createPortal(<div ref={menuRef} id={listboxId} className={`lf-select-menu ${open ? "is-open" : ""} ${direction === "top" ? "is-top" : ""}`} style={menuStyle} role="listbox" aria-label={ariaLabel}>
      {normalized.map((option, index) => <button ref={(node) => { optionRefs.current[index] = node; }} type="button" role="option" tabIndex={index === highlighted ? 0 : -1} aria-selected={option.value === value} disabled={option.disabled} key={`${option.value}-${index}`} className={index === highlighted ? "is-highlighted" : ""} onClick={() => choose(option)} onKeyDown={(event) => handleOptionKey(event, index)}><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</button>)}
      {!normalized.length && <div className="lf-select-empty">暂无可选项</div>}
    </div>, document.body)}
  </div>;
}

export function LFDatePicker({ value = "", onChange, ariaLabel, required = false }) {
  const selectedDate = parseDateValue(value);
  const [draft, setDraft] = useState(selectedDate ? dateKey(selectedDate) : String(value || ""));
  const [cursor, setCursor] = useState(() => selectedDate || new Date());
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState("bottom");
  const [popoverStyle, setPopoverStyle] = useState({});
  const [invalid, setInvalid] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimer = useRef(null);
  const openFrame = useRef(null);
  const dialogId = `lf-date-${React.useId().replaceAll(":", "")}`;

  useEffect(() => {
    const parsed = parseDateValue(value);
    setDraft(parsed ? dateKey(parsed) : String(value || ""));
    if (parsed) setCursor(parsed);
  }, [value]);

  function positionPopover() {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const safe = 12;
    const gap = 6;
    const height = 326;
    const below = window.innerHeight - rect.bottom - safe - gap;
    const above = rect.top - safe - gap;
    const nextDirection = below < Math.min(height, 220) && above > below ? "top" : "bottom";
    const width = Math.min(296, window.innerWidth - safe * 2);
    const left = Math.min(Math.max(safe, rect.left), window.innerWidth - safe - width);
    setDirection(nextDirection);
    setPopoverStyle({
      left: `${left}px`,
      top: nextDirection === "top" ? "auto" : `${rect.bottom + gap}px`,
      bottom: nextDirection === "top" ? `${window.innerHeight - rect.top + gap}px` : "auto",
      width: `${width}px`,
    });
  }

  function openCalendar() {
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(openFrame.current);
    const parsed = parseDateValue(draft) || selectedDate || new Date();
    setCursor(parsed);
    positionPopover();
    setMounted(true);
    openFrame.current = requestAnimationFrame(() => setOpen(true));
  }

  function closeCalendar({ restoreFocus = false } = {}) {
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(openFrame.current);
    setOpen(false);
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      if (restoreFocus) inputRef.current?.focus();
    }, 150);
  }

  function commitDraft() {
    if (!draft.trim()) {
      setInvalid(false);
      onChange("");
      return;
    }
    const parsed = parseDateValue(draft);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    const normalized = dateKey(parsed);
    setInvalid(false);
    setDraft(normalized);
    setCursor(parsed);
    onChange(normalized);
  }

  function chooseDate(date) {
    const normalized = dateKey(date);
    setDraft(normalized);
    setCursor(date);
    setInvalid(false);
    onChange(normalized);
    closeCalendar({ restoreFocus: true });
  }

  useEffect(() => {
    if (!mounted) return undefined;
    const outside = (event) => {
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) closeCalendar();
    };
    const reposition = () => positionPopover();
    const escape = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeCalendar({ restoreFocus: true });
      }
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("keydown", escape);
    };
  }, [mounted]);

  useEffect(() => () => {
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(openFrame.current);
  }, []);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const selectedKey = selectedDate ? dateKey(selectedDate) : "";
  const todayKey = dateKey(new Date());

  return <div ref={rootRef} className={`lf-date-picker ${open ? "is-open" : ""} ${invalid ? "is-invalid" : ""}`}>
    <input ref={inputRef} type="text" inputMode="numeric" required={required} value={draft} placeholder="例如：2026-08-18" aria-label={ariaLabel} aria-invalid={invalid} aria-controls={dialogId} aria-expanded={open} onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} onBlur={commitDraft} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); commitDraft(); }
      else if (event.key === "ArrowDown" && !open) { event.preventDefault(); openCalendar(); }
      else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); closeCalendar({ restoreFocus: true }); }
    }} />
    <button type="button" className="lf-date-trigger" aria-label={`打开${ariaLabel}日期选择`} aria-haspopup="dialog" aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => open ? closeCalendar({ restoreFocus: true }) : openCalendar()}><CalendarDays size={15} /></button>
    {mounted && createPortal(<div ref={popoverRef} id={dialogId} className={`lf-date-popover ${open ? "is-open" : ""} ${direction === "top" ? "is-top" : ""}`} style={popoverStyle} role="dialog" aria-modal="false" aria-label={`${ariaLabel}日期选择`}>
      <header><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="上个月"><ChevronLeft size={16} /></button><strong>{cursor.getFullYear()}年{cursor.getMonth() + 1}月</strong><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="下个月"><ChevronRight size={16} /></button></header>
      <div className="lf-date-weekdays" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="lf-date-grid">{calendarDays.map((day) => { const key = dateKey(day); return <button type="button" key={key} className={`${day.getMonth() !== cursor.getMonth() ? "is-outside" : ""} ${key === selectedKey ? "is-selected" : ""} ${key === todayKey ? "is-today" : ""}`} aria-label={`${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日`} aria-pressed={key === selectedKey} onClick={() => chooseDate(day)}>{day.getDate()}</button>; })}</div>
      <footer><button type="button" onClick={() => chooseDate(new Date())}>今天</button>{draft && <button type="button" onClick={() => { setDraft(""); setInvalid(false); onChange(""); closeCalendar({ restoreFocus: true }); }}>清除</button>}</footer>
    </div>, document.body)}
  </div>;
}

export function PageFooter({ stats }) {
  return <footer className="lf-footer">
    <div className="lf-footer-stats" aria-label="页面数据统计">{stats.map((stat) => <div className="lf-footer-stat" key={stat.label}><div className="lf-footer-stat-value">{stat.value}</div><div className="lf-footer-stat-label">{stat.label}</div></div>)}</div>
    <div className="lf-footer-signature">Made by LiuFeng</div>
  </footer>;
}

function ModuleCard({ icon: Icon, title, meta, action, accent = "accent", color, editing, children, className = "" }) {
  return (
    <section className={`module-card module-${accent} ${className}`} style={color ? { "--module-accent": color } : undefined}>
      <header className="module-header module-drag-handle">
        <div className="module-heading">
          <GripVertical className={`module-grip ${editing ? "is-visible" : ""}`} size={14} />
          <Icon size={16} strokeWidth={1.7} />
          <h2>{title}</h2>
          {meta && <span className="module-meta">{meta}</span>}
        </div>
        {action && <div className="module-action" onPointerDown={(event) => event.stopPropagation()}>{action}</div>}
      </header>
      <div className="module-content">{children}</div>
    </section>
  );
}

export default function Workbench() {
  const [now, setNow] = useState(new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authState, setAuthState] = useState({ status: "idle", message: "" });
  const [search, setSearch] = useState("");
  const [calendarState, setCalendarState] = useState(null);
  const [taskPlannerOpen, setTaskPlannerOpen] = useState(false);
  const [knowledgePlannerOpen, setKnowledgePlannerOpen] = useState(false);
  const [knowledgeData, setKnowledgeData] = useState({ spaces: [], source: null });
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [usageCreateOpen, setUsageCreateOpen] = useState(false);
  const [awardColorsOpen, setAwardColorsOpen] = useState(false);
  const [awardGroupColorTarget, setAwardGroupColorTarget] = useState(null);
  const [boardEditTarget, setBoardEditTarget] = useState(null);
  const [settingsPanel, setSettingsPanel] = useState(null);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [settingsMenuExpanded, setSettingsMenuExpanded] = useState(false);
  const [booted, setBooted] = useState(false);
  const [activePage, setActivePage] = useState(() => {
    if (typeof window === "undefined") return "workbench";
    const requested = window.location.hash.slice(1);
    return ["workbench", "boards", "award-board", "course-plan", "usage-monitor"].includes(requested) ? requested : "workbench";
  });
  const [pagePhase, setPagePhase] = useState("idle");
  const [awardData, setAwardData] = useState(null);
  const [awardLoading, setAwardLoading] = useState(false);
  const [awardError, setAwardError] = useState("");
  const [selectedAward, setSelectedAward] = useState(null);
  const [awardCreateOpen, setAwardCreateOpen] = useState(false);
  const [awardEditing, setAwardEditing] = useState(false);
  const [awardViewPhase, setAwardViewPhase] = useState("idle");
  const [courseViewPhase, setCourseViewPhase] = useState("idle");
  const [courseCreateRequest, setCourseCreateRequest] = useState(0);
  const [courseRefreshRequest, setCourseRefreshRequest] = useState(0);
  const [courseStats, setCourseStats] = useState({ courses: 0, incomplete: 0, exams: 0, joint: 0, loading: true, error: "" });
  const [usageRefreshRequest, setUsageRefreshRequest] = useState(0);
  const [usageStats, setUsageStats] = useState({ total: 4, connected: 0, warning: 0, generatedAt: null, loading: true, error: "" });
  const [appearance, setAppearance] = useState(defaultWorkbenchAppearance);
  const [boards, setBoards] = useStoredState(STORAGE.boards, () => clone(DEFAULT_WORKBENCH_BOARDS), normalizeWorkbenchBoards);
  const [taskPrefs, setTaskPrefs] = useStoredState(STORAGE.tasks, {});
  const [taskTodayOrder, setTaskTodayOrder] = useStoredState(STORAGE.taskTodayOrder, []);
  const [knowledgePool, setKnowledgePool] = useStoredState(STORAGE.knowledgePool, null);
  const [knowledgeStyles, setKnowledgeStyles] = useStoredState(STORAGE.knowledgeStyles, {});
  const [projects, setProjects] = useStoredState(STORAGE.projects, []);
  const [projectKindColors, setProjectKindColors] = useStoredState(STORAGE.projectKindColors, DEFAULT_PROJECT_KIND_COLORS);
  const [layouts, setLayouts] = useStoredState(STORAGE.layouts, () => clone(DEFAULT_LAYOUTS));
  const [layoutLocked, setLayoutLocked] = useStoredState(STORAGE.layoutLocked, false);
  const [moduleColors, setModuleColors] = useStoredState(STORAGE.moduleColors, DEFAULT_MODULE_COLORS);
  const [awardView, setAwardView] = useStoredState(STORAGE.awardView, "status");
  const [courseView, setCourseView] = useStoredState(STORAGE.courseView, "status");
  const [courseIncompleteOnly, setCourseIncompleteOnly] = useState(false);
  const [awardStatusColors, setAwardStatusColors] = useStoredState(STORAGE.awardStatusColors, AWARD_STATUS_COLORS);
  const [awardTagColors, setAwardTagColors] = useStoredState(STORAGE.awardTagColors, DEFAULT_AWARD_TAG_COLORS);
  const [awardProjectColors, setAwardProjectColors] = useStoredState(STORAGE.awardProjectColors, {});
  const [awardProjectOrder, setAwardProjectOrder] = useStoredState(STORAGE.awardProjectOrder, []);
  const [awardRecordOrder, setAwardRecordOrder] = useStoredState(STORAGE.awardRecordOrder, {});
  const themeController = useRef(null);
  const appearanceTimer = useRef(null);
  const authAttempted = useRef(false);
  const settingsMenuRef = useRef(null);
  const settingsTriggerRef = useRef(null);
  const settingsMenuTimer = useRef(null);
  const settingsMenuFrames = useRef([]);
  const pageTransitionTimers = useRef([]);
  const awardViewTimer = useRef(null);
  const courseViewTimer = useRef(null);
  const workbenchScrollTop = useRef(0);
  const { width, containerRef, mounted } = useContainerWidth();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    pageTransitionTimers.current.forEach(clearTimeout);
    clearTimeout(awardViewTimer.current);
    clearTimeout(courseViewTimer.current);
  }, []);

  function openSettingsMenu(panel) {
    clearTimeout(settingsMenuTimer.current);
    settingsMenuFrames.current.forEach(cancelAnimationFrame);
    setSettingsPanel(panel);
    setSettingsMenuExpanded(true);
    setSettingsMenuVisible(false);
    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => setSettingsMenuVisible(true));
      settingsMenuFrames.current = [secondFrame];
    });
    settingsMenuFrames.current = [firstFrame];
  }

  function closeSettingsMenu(restoreFocus = false, afterClose = null) {
    if (!settingsPanel || settingsMenuTimer.current) return;
    setSettingsMenuExpanded(false);
    setSettingsMenuVisible(false);
    settingsMenuTimer.current = setTimeout(() => {
      settingsMenuTimer.current = null;
      setSettingsPanel(null);
      if (restoreFocus) settingsTriggerRef.current?.focus();
      afterClose?.();
    }, 150);
  }

  useEffect(() => {
    if (!settingsPanel) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!settingsMenuRef.current?.contains(event.target)) closeSettingsMenu(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeSettingsMenu(true);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsPanel]);

  useEffect(() => () => {
    clearTimeout(settingsMenuTimer.current);
    settingsMenuFrames.current.forEach(cancelAnimationFrame);
  }, []);

  useEffect(() => {
    setLayouts((current) => {
      const migrated = {};
      for (const [breakpoint, defaults] of Object.entries(DEFAULT_LAYOUTS)) {
        const existing = Array.isArray(current?.[breakpoint]) ? current[breakpoint] : [];
        const hadNextModule = existing.some((item) => item.i === "next");
        migrated[breakpoint] = defaults.map((fallback) => {
          const saved = existing.find((item) => item.i === fallback.i);
          if (!saved) return { ...fallback };
          if (hadNextModule && fallback.i === "tasks") return { ...saved, ...fallback };
          return { ...fallback, ...saved, minW: fallback.minW, minH: fallback.minH };
        });
      }
      return migrated;
    });
  }, []);

  useEffect(() => {
    let active = true;
    let frame = 0;
    try {
      if (!localStorage.getItem(STORAGE.appearance)) localStorage.setItem(STORAGE.appearance, JSON.stringify(defaultWorkbenchAppearance()));
    } catch {
      // The controller still works with its in-memory defaults if storage is unavailable.
    }
    const controller = window.LFTheme?.createThemeController({
      storageKey: STORAGE.appearance,
      onApply: ({ appearance: next }) => { if (active) setAppearance(next); },
    });
    themeController.current = controller;
    const reveal = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (active) setBooted(true);
        });
      });
    };
    if (controller) {
      controller.init().then(() => {
        if (!active) return;
        setAppearance(controller.getAppearance());
        reveal();
      }).catch(reveal);
    } else reveal();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      clearTimeout(appearanceTimer.current);
      controller?.destroy();
    };
  }, []);

  function updateAppearance(next, immediate = false) {
    if (!window.LFTheme || !next) return;
    const normalized = window.LFTheme.mergeAppearance(next);
    setAppearance(normalized);
    clearTimeout(appearanceTimer.current);
    if (immediate) themeController.current?.setAppearance(normalized);
    else appearanceTimer.current = setTimeout(() => themeController.current?.setAppearance(normalized), 180);
  }

  async function refresh(force = false) {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard${force ? "?refresh=1" : ""}`);
      if (!response.ok) throw new Error("飞书数据暂时不可用");
      const payload = await response.json();
      setData(payload);
      setError("");
      setProjects((current) => {
        if (!current.length) return payload.projects || [];
        const known = new Set(current.map((project) => project.id));
        return [...current, ...(payload.projects || []).filter((project) => !known.has(project.id))];
      });
    } catch (requestError) {
      setError(requestError.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshAwards(force = false) {
    setAwardLoading(true);
    try {
      const response = await fetch(`/api/awards${force ? "?refresh=1" : ""}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "投奖数据读取失败");
      setAwardData(payload);
      setAwardError("");
      return payload;
    } catch (requestError) {
      setAwardError(requestError.message || "投奖数据读取失败");
      return null;
    } finally {
      setAwardLoading(false);
    }
  }

  async function refreshKnowledge(force = false) {
    setKnowledgeLoading(true);
    try {
      const response = await fetch(`/api/wiki${force ? "?refresh=1" : ""}`);
      const payload = await response.json();
      if (!response.ok) throw Object.assign(new Error(payload.error || "知识库读取失败"), { requiresAuthorization: payload.requiresAuthorization });
      setKnowledgeData(payload);
      setKnowledgeError("");
      setKnowledgePool((current) => current === null ? (payload.spaces || []).slice(0, 3).map((space) => space.id) : current);
    } catch (requestError) {
      setKnowledgeError(requestError.message || "知识库读取失败");
      if (requestError.requiresAuthorization) setKnowledgeData((current) => ({ ...current, source: { ...(current.source || {}), requiresAuthorization: true } }));
    } finally {
      setKnowledgeLoading(false);
    }
  }

  function authorizeKnowledge() {
    window.location.assign("/api/auth/start?reauthorize=1&include_wiki=1");
  }

  async function createAwardRecord(fields, options = {}) {
    const response = await fetch("/api/awards/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, createProject: Boolean(options.createProject) }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "记录创建失败");
    const refreshed = await refreshAwards(true);
    return refreshed?.records?.find((record) => record.id === payload.record?.id) || payload.record;
  }

  async function updateAwardRecord(recordId, fields, options = {}) {
    const response = await fetch(`/api/awards/records/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, createProject: Boolean(options.createProject) }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "记录更新失败");
    const refreshed = await refreshAwards(true);
    return refreshed?.records?.find((record) => record.id === payload.record?.id) || payload.record;
  }

  async function syncTaskCompletion(task, completed) {
    if (!task?.guid) return null;
    const response = await fetch(`/api/tasks/${encodeURIComponent(task.guid)}/completion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "飞书任务更新失败");
    setData((current) => current ? {
      ...current,
      tasks: (current.tasks || []).map((item) => item.id === task.id ? {
        ...item,
        completed: payload.task.completed,
        completedAt: payload.task.completed ? new Date(Number(payload.task.completedAt)).toISOString() : null,
        overdue: payload.task.completed ? false : item.overdue,
      } : item),
    } : current);
    return payload.task;
  }

  async function authorizeInFeishu(interactive = false) {
    if (interactive) {
      setAuthState({ status: "authorizing", message: "正在打开飞书日历与任务授权页…" });
      window.location.assign("/api/auth/start?reauthorize=1");
      return;
    }
    if (!window.tt?.requestAuthCode) {
      setAuthState({ status: "browser", message: "点击连接飞书，授权个人日历与任务。" });
      return;
    }
    setAuthState({ status: "authorizing", message: "正在连接你的飞书日历与任务…" });
    try {
      const configResponse = await fetch("/api/config");
      if (!configResponse.ok) throw new Error("飞书应用配置读取失败");
      const config = await configResponse.json();
      const authResult = await new Promise((resolve, reject) => {
        let requested = false;
        const timeout = window.setTimeout(() => reject(new Error("飞书授权响应超时，请点击重试")), 10000);
        const requestCode = () => {
          if (requested) return;
          requested = true;
          window.tt.requestAuthCode({
            appId: config.appId,
            success: (result) => { window.clearTimeout(timeout); resolve(result); },
            fail: (detail) => { window.clearTimeout(timeout); reject(new Error(detail?.errMsg || "飞书授权未完成")); },
          });
        };
        window.h5sdk?.ready?.(requestCode);
        window.setTimeout(requestCode, 500);
      });
      const exchangeResponse = await fetch("/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authResult.code, flow: "client" }),
      });
      const exchange = await exchangeResponse.json();
      if (!exchangeResponse.ok) throw new Error(exchange.error || "飞书授权交换失败");
      const grantedScopes = Array.isArray(exchange.grantedScopes) ? exchange.grantedScopes : [];
      const hasRequiredScopes = REQUIRED_PERSONAL_SCOPES.every((scope) => grantedScopes.includes(scope));
      if (!hasRequiredScopes) {
        setAuthState({ status: "browser", message: "端内登录已完成，请点击连接飞书授予个人日历与任务权限。" });
        await refresh(true);
        return;
      }
      setAuthState({ status: "authorized", message: "个人日历与任务已连接" });
      await refresh(true);
    } catch (authError) {
      setAuthState({ status: "browser", message: `${authError.message || "飞书端内登录失败"}，请点击连接飞书完成授权。` });
    }
  }

  useEffect(() => {
    refresh();
    refreshKnowledge();
    const poll = setInterval(refresh, 60000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (activePage !== "award-board") return undefined;
    refreshAwards();
    const poll = setInterval(() => refreshAwards(), 30000);
    return () => clearInterval(poll);
  }, [activePage]);

  useEffect(() => {
    if (!selectedAward?.id) return;
    const latest = awardData?.records?.find((record) => record.id === selectedAward.id);
    if (latest) setSelectedAward(latest);
  }, [awardData, selectedAward?.id]);

  useEffect(() => {
    const source = data?.source;
    const needsAuthorization = source && (!source.personalAccess || source.reauthorizationRequired || !source.calendarDetailsAvailable || !source.tasksPersonalAvailable || source.tasksCoverageComplete === false);
    if (!needsAuthorization || authAttempted.current) return;
    authAttempted.current = true;
    authorizeInFeishu(false);
  }, [data?.source?.personalAccess, data?.source?.reauthorizationRequired, data?.source?.calendarDetailsAvailable, data?.source?.tasksPersonalAvailable, data?.source?.tasksCoverageComplete]);

  const todayEvents = useMemo(() => eventsForDay(data?.events || [], now), [data?.events, dateKey(now)]);
  const visibleEvents = useMemo(() => todayEvents.filter((event) => event.title.toLowerCase().includes(search.trim().toLowerCase())), [todayEvents, search]);
  const taskPool = useMemo(() => {
    const syncedTasks = data?.tasks || [];
    if (data?.source?.tasksPersonalAvailable || syncedTasks.length) return syncedTasks;
    return buildDemoTasks(now);
  }, [data?.tasks, data?.source?.tasksPersonalAvailable, dateKey(now)]);
  const todayTaskCount = taskPool.filter((task) => taskIsToday(task, taskPrefs[task.id])).length;
  const needsPersonalAuthorization = Boolean(data && (
    !data.source?.personalAccess
    || data.source?.reauthorizationRequired
    || !data.source?.calendarDetailsAvailable
    || !data.source?.tasksPersonalAvailable
    || data.source?.tasksCoverageComplete === false
  ));
  const visibleBoards = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return boards;
    return boards.filter((board) => `${board.name} ${board.description}`.toLowerCase().includes(query));
  }, [boards, search]);
  const footerStats = activePage === "workbench"
    ? [
      { value: data ? todayEvents.length : "—", label: "今日日程" },
      { value: data ? todayTaskCount : "—", label: "今日待办" },
      { value: projects.length, label: "近期项目" },
    ]
    : activePage === "boards"
      ? [{ value: visibleBoards.length, label: "我的看板" }]
      : activePage === "course-plan"
        ? [
          { value: courseStats.courses, label: "下学期课程" },
          { value: courseStats.incomplete, label: "待补充结课信息" },
          { value: courseStats.exams, label: "考试结课" },
        ]
        : activePage === "usage-monitor"
          ? [
            { value: usageStats.connected, label: "已连接账号" },
            { value: usageStats.total, label: "数据源" },
            { value: usageStats.warning, label: "异常" },
          ]
      : [
        { value: awardData ? awardData.records?.length || 0 : "—", label: "投奖记录" },
        { value: awardData ? new Set((awardData.records || []).map((record) => awardText(record.fields?.["项目名称"])).filter(Boolean)).size : "—", label: "参与项目" },
        { value: awardData ? (awardData.records || []).filter((record) => awardText(record.fields?.["工作状态"]) === "已获奖").length : "—", label: "已获奖" },
      ];

  function switchPage(nextPage) {
    if (nextPage === activePage || pagePhase !== "idle") return;
    if (activePage === "workbench") workbenchScrollTop.current = window.scrollY;
    setSettingsPanel(null);
    setSettingsMenuExpanded(false);
    setSettingsMenuVisible(false);
    setUsageCreateOpen(false);
    setPagePhase("leaving");
    pageTransitionTimers.current.forEach(clearTimeout);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const leaveDuration = reducedMotion ? 0 : 160;
    const enterDuration = reducedMotion ? 0 : 300;
    const swapTimer = setTimeout(() => {
      setActivePage(nextPage);
      window.history.replaceState(null, "", nextPage === "workbench" ? `${window.location.pathname}${window.location.search}` : `#${nextPage}`);
      setPagePhase("entering");
      if (nextPage === "workbench") requestAnimationFrame(() => window.scrollTo(0, workbenchScrollTop.current));
      const settleTimer = setTimeout(() => setPagePhase("idle"), enterDuration);
      pageTransitionTimers.current = [settleTimer];
    }, leaveDuration);
    pageTransitionTimers.current = [swapTimer];
  }

  function switchAwardView(nextView) {
    if (nextView === awardView || awardViewPhase !== "idle") return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    clearTimeout(awardViewTimer.current);
    setAwardViewPhase("leaving");
    awardViewTimer.current = setTimeout(() => {
      setAwardView(nextView);
      setAwardViewPhase("entering");
      awardViewTimer.current = setTimeout(() => setAwardViewPhase("idle"), reducedMotion ? 0 : 320);
    }, reducedMotion ? 0 : 150);
  }

  function switchCourseView(nextView) {
    if (nextView === courseView || courseViewPhase !== "idle") return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    clearTimeout(courseViewTimer.current);
    setCourseIncompleteOnly(false);
    setCourseViewPhase("leaving");
    courseViewTimer.current = setTimeout(() => {
      setCourseView(nextView);
      setCourseViewPhase("entering");
      courseViewTimer.current = setTimeout(() => setCourseViewPhase("idle"), reducedMotion ? 0 : 320);
    }, reducedMotion ? 0 : 150);
  }

  function reorderBoards(sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setBoards((current) => {
      const source = current.find((board) => board.id === sourceId);
      if (!source) return current;
      const next = current.filter((board) => board.id !== sourceId);
      const targetIndex = next.findIndex((board) => board.id === targetId);
      if (targetIndex < 0) return current;
      next.splice(targetIndex + (placeAfter ? 1 : 0), 0, source);
      return next;
    });
  }
  return (
    <div className={`workbench-shell ${booted ? "is-ready" : "is-booting"} ${activePage === "boards" ? "is-boards-page" : ""} ${activePage === "award-board" ? "is-award-page" : ""} ${activePage === "course-plan" ? "is-course-page" : ""} ${activePage === "usage-monitor" ? "is-usage-page" : ""}`}>
      <header className="page-header">
        <div className="greeting-block">
          <h1>{greetingFor(now)}</h1>
          <p>{formatDate(now)}</p>
        </div>
        <div className="header-tools" aria-label="页面控制">
          <label className="global-search">
            <Search className="global-search-icon" size={15} strokeWidth={1.8} aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activePage === "award-board" ? "搜索投奖条目、比赛或项目…" : activePage === "course-plan" ? "搜索课程、老师或结课内容…" : activePage === "usage-monitor" ? "搜索账号或数据源…" : "搜索日程、任务、项目或看板…"} aria-label="搜索工作台" />
            {search && <button className="global-search-clear" type="button" onClick={() => setSearch("")} title="清空搜索" aria-label="清空搜索"><X size={12} /></button>}
          </label>
          {activePage === "award-board" ? <button type="button" className="award-create-header" disabled={!awardData?.fields?.length} onClick={() => setAwardCreateOpen(true)}><Plus size={16} />新建记录</button> : activePage === "course-plan" ? <button type="button" className="award-create-header" onClick={() => setCourseCreateRequest((value) => value + 1)}><Plus size={16} />新增课程</button> : activePage === "usage-monitor" ? <button type="button" className="award-create-header usage-create-header" onClick={() => setUsageCreateOpen(true)} title="新建账号监控"><Plus size={16} />新建</button> : null}
          <div className="header-settings-wrap" ref={settingsMenuRef}>
            <IconButton ref={settingsTriggerRef} label="设置" className={`header-settings ${settingsPanel ? "is-active" : ""}`} aria-haspopup="menu" aria-controls="header-settings-menu" aria-expanded={settingsMenuExpanded} onClick={() => settingsPanel ? closeSettingsMenu(false) : openSettingsMenu(activePage === "award-board" ? "award-menu" : activePage === "course-plan" ? "course-menu" : "menu")}><Settings2 size={17} strokeWidth={1.8} /></IconButton>
            {settingsPanel === "menu" && <div id="header-settings-menu" className={`header-settings-popover ${settingsMenuVisible ? "open" : "closing"}`} role="menu" aria-label="设置">
              <button type="button" className="settings-menu-item" role="menuitem" onClick={() => closeSettingsMenu(false, () => setAppearanceOpen(true))}><Palette size={18} /><span><strong>外观</strong><small>主题、字体与界面样式</small></span></button>
            </div>}
            {settingsPanel === "award-menu" && <div id="header-settings-menu" className={`header-settings-popover ${settingsMenuVisible ? "open" : "closing"}`} role="menu" aria-label="项目投奖管理设置">
              <button type="button" className="settings-menu-item" role="menuitem" onClick={() => closeSettingsMenu(false, () => setAppearanceOpen(true))}><Palette size={18} /><span><strong>外观</strong><small>主题、字体与界面样式</small></span></button>
              <button type="button" className="settings-menu-item" role="menuitem" onClick={() => closeSettingsMenu(false, () => setAwardColorsOpen(true))}><Palette size={18} /><span><strong>赛事配色</strong><small>管理赛事级别标签颜色</small></span></button>
            </div>}
            {settingsPanel === "course-menu" && <div id="header-settings-menu" className={`header-settings-popover ${settingsMenuVisible ? "open" : "closing"}`} role="menu" aria-label="课程与结课设置">
              <button type="button" className="settings-menu-item" role="menuitem" onClick={() => closeSettingsMenu(false, () => setAppearanceOpen(true))}><Palette size={18} /><span><strong>外观</strong><small>主题、字体与界面样式</small></span></button>
              <button type="button" className="settings-menu-item" role="menuitemcheckbox" aria-checked={courseIncompleteOnly} onClick={() => closeSettingsMenu(false, () => { setCourseIncompleteOnly((current) => !current); setCourseView("project"); })}><ClipboardCheck size={18} /><span><strong>{courseIncompleteOnly ? "取消未填写筛选" : "查看未填写课程"}</strong><small>{courseStats.incomplete} 门课程待补充结课信息</small></span></button>
            </div>}
          </div>
        </div>
      </header>

      <main className={`page-main page-main-${activePage}`} ref={containerRef}>
        <div className="section-bar">
          <div className="section-title">
            {activePage === "award-board" ? <button type="button" className="section-view-switch" disabled={pagePhase !== "idle"} onClick={() => switchPage("boards")} title="返回我的看板">
              <span>项目投奖管理</span>
              <ChevronRight className="is-back" size={15} />
            </button> : activePage === "course-plan" ? <button type="button" className="section-view-switch" disabled={pagePhase !== "idle"} onClick={() => switchPage("boards")} title="返回我的看板">
              <span>课程与结课</span>
              <ChevronRight className="is-back" size={15} />
            </button> : activePage === "usage-monitor" ? <button type="button" className="section-view-switch" disabled={pagePhase !== "idle"} onClick={() => switchPage("boards")} title="返回我的看板">
              <span>用量监控看板</span>
              <ChevronRight className="is-back" size={15} />
            </button> : <button type="button" className="section-view-switch" disabled={pagePhase !== "idle"} onClick={() => switchPage(activePage === "workbench" ? "boards" : "workbench")} title={activePage === "workbench" ? "切换到我的看板" : "返回今日工作台"}>
              <span>{activePage === "workbench" ? "今日工作台" : "我的看板"}</span>
              <ChevronRight className={activePage === "boards" ? "is-back" : ""} size={15} />
            </button>}
            <i />
          </div>
          <div className="section-actions">
            {activePage === "workbench" ? <>
              <span className="workbench-sync-state"><span>{data?.source?.scope || "正在连接飞书"}</span><i />最后刷新 {data?.generatedAt ? formatTime(new Date(data.generatedAt)) : "--:--"}</span>
              <IconButton label={layoutLocked ? "解锁工作台布局" : "锁定工作台布局"} className={`layout-lock-button ${layoutLocked ? "is-locked" : "is-unlocked"}`} aria-pressed={layoutLocked} onClick={() => setLayoutLocked((locked) => !locked)}>{layoutLocked ? <Lock size={16} /> : <LockOpen size={16} />}</IconButton>
              <IconButton label="刷新飞书数据" className={loading ? "is-spinning" : ""} onClick={() => refresh(true)}><RefreshCw size={16} /></IconButton>
            </> : activePage === "boards" ? <>
              <span className="section-count">{visibleBoards.length} 个看板</span>
            </> : activePage === "course-plan" ? <>
              <span className="section-count">{courseStats.loading ? "正在同步" : `${courseStats.courses} 门课程 · ${courseStats.incomplete} 门待补充`} · {courseStats.generatedAt ? formatTime(new Date(courseStats.generatedAt)) : "--:--"}</span>
              <div className="award-view-switch" role="tablist" aria-label="课程看板视图">
                <button type="button" role="tab" disabled={courseViewPhase !== "idle"} aria-selected={courseView === "status"} className={courseView === "status" ? "is-active" : ""} onClick={() => switchCourseView("status")}><ClipboardCheck size={14} />工作看板</button>
                <button type="button" role="tab" disabled={courseViewPhase !== "idle"} aria-selected={courseView === "project"} className={courseView === "project" ? "is-active" : ""} onClick={() => switchCourseView("project")}><LayoutDashboard size={14} />项目看板</button>
              </div>
              <IconButton label="刷新课程数据" className={courseStats.loading ? "is-spinning" : ""} onClick={() => setCourseRefreshRequest((value) => value + 1)}><RefreshCw size={16} /></IconButton>
            </> : activePage === "usage-monitor" ? <>
              <span className="section-count">{usageStats.connected} / {usageStats.total} 已连接 · {usageStats.generatedAt ? formatTime(new Date(usageStats.generatedAt)) : "等待同步"}</span>
              <IconButton label="刷新用量数据" className={usageStats.loading ? "is-spinning" : ""} onClick={() => setUsageRefreshRequest((value) => value + 1)}><RefreshCw size={16} /></IconButton>
            </> : <>
              <span className="section-count">{awardLoading ? "正在同步" : `${awardData?.records?.length || 0} 条记录`} · {awardData?.generatedAt ? formatTime(new Date(awardData.generatedAt)) : "--:--"}</span>
              <div className="award-view-switch" role="tablist" aria-label="看板视图">
                <button type="button" role="tab" disabled={awardViewPhase !== "idle"} aria-selected={awardView === "status"} className={awardView === "status" ? "is-active" : ""} onClick={() => switchAwardView("status")}><ClipboardCheck size={14} />工作看板</button>
                <button type="button" role="tab" disabled={awardViewPhase !== "idle"} aria-selected={awardView === "project"} className={awardView === "project" ? "is-active" : ""} onClick={() => switchAwardView("project")}><LayoutDashboard size={14} />项目看板</button>
              </div>
              <IconButton label="刷新投奖数据" className={awardLoading ? "is-spinning" : ""} onClick={() => refreshAwards(true)}><RefreshCw size={16} /></IconButton>
            </>}
          </div>
        </div>

        <div className={`page-view-stage page-view-stage-${activePage}`}>
          <div className={`page-view page-view-${activePage} is-${pagePhase}`}>
            {activePage === "workbench" ? <>
              {needsPersonalAuthorization && (
                <div className="permission-line">
                  <KeyRound size={14} />
                  <span>{authState.message || data.source?.errors?.[0] || "连接飞书个人日历与任务，显示你的真实日程和待办。"}</span>
                  {authState.status !== "authorizing" && <button type="button" onClick={() => authorizeInFeishu(true)}>{data.source?.personalAccess ? "重新授权" : "连接飞书"}</button>}
                </div>
              )}
              {error && <div className="permission-line is-error"><AlertCircle size={14} /><span>{error}</span></div>}

              {mounted && (
                <Responsive
                  className={`workspace-layout ${layoutLocked ? "is-layout-locked" : ""}`}
                  layouts={layouts}
                  width={width}
                  breakpoints={{ lg: 1180, md: 880, sm: 620, xs: 0 }}
                  cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
                  rowHeight={32}
                  margin={[14, 14]}
                  containerPadding={[0, 0]}
                  dragConfig={{ enabled: !layoutLocked, handle: ".module-drag-handle", threshold: 3 }}
                  resizeConfig={{ enabled: !layoutLocked, handles: ["se", "sw", "ne", "nw", "e", "w", "n", "s"] }}
                  onLayoutChange={(_, next) => { if (!layoutLocked) setLayouts(next); }}
                >
                  <div key="schedule"><ScheduleModule events={visibleEvents} calendars={data?.calendars || []} now={now} loading={loading && !data} editing={false} color={moduleColors.schedule} onOpen={(event = null) => setCalendarState({ date: now, event })} /></div>
                  <div key="tasks"><TasksModule tasks={taskPool} query={search} prefs={taskPrefs} setPrefs={setTaskPrefs} todayOrder={taskTodayOrder} setTodayOrder={setTaskTodayOrder} personalAccess={data?.source?.tasksPersonalAvailable} editing={false} color={moduleColors.tasks} onCompletion={syncTaskCompletion} onOpen={() => setTaskPlannerOpen(true)} /></div>
                  <div key="projects"><ProjectsModule projects={projects} setProjects={setProjects} kindColors={projectKindColors} setKindColors={setProjectKindColors} query={search} editing={false} color={moduleColors.projects} layoutLocked={layoutLocked} knowledgeSpaces={knowledgeData.spaces || []} knowledgeSelectedIds={knowledgePool || []} setKnowledgeSelectedIds={setKnowledgePool} knowledgeStyles={knowledgeStyles} setKnowledgeStyles={setKnowledgeStyles} knowledgeLoading={knowledgeLoading} knowledgeError={knowledgeError} knowledgeRequiresAuthorization={knowledgeData.source?.requiresAuthorization} onKnowledgeOpen={() => setKnowledgePlannerOpen(true)} onKnowledgeAuthorize={authorizeKnowledge} /></div>
                  <div key="timer"><TimerModule editing={false} color={moduleColors.timer} /></div>
                  <div key="notes"><NotesModule editing={false} color={moduleColors.notes} /></div>
                </Responsive>
              )}
            </> : activePage === "boards" ? <BoardsPage boards={visibleBoards} query={search} onEdit={(board) => setBoardEditTarget(board.id)} onOpenBoard={(board) => { const destination = getBoardDestination(board); if (destination) switchPage(destination); }} onReorder={reorderBoards} /> : activePage === "course-plan" ? <CoursePlanBoard query={search} mode={courseView} viewPhase={courseViewPhase} incompleteOnly={courseIncompleteOnly} onClearFilter={() => setCourseIncompleteOnly(false)} createRequest={courseCreateRequest} refreshRequest={courseRefreshRequest} SelectComponent={LFSelect} DatePickerComponent={LFDatePicker} onStatsChange={setCourseStats} /> : activePage === "usage-monitor" ? <UsageMonitorBoard query={search} refreshRequest={usageRefreshRequest} onStatsChange={setUsageStats} /> : <AwardBoardPage data={awardData} loading={awardLoading} error={awardError} query={search} mode={awardView} viewPhase={awardViewPhase} projectColors={awardProjectColors} statusColors={{ ...AWARD_STATUS_COLORS, ...awardStatusColors }} tagColors={normalizeAwardTagColors(awardTagColors)} projectOrder={awardProjectOrder} setProjectOrder={setAwardProjectOrder} recordOrder={awardRecordOrder} setRecordOrder={setAwardRecordOrder} onEditGroupColor={(type, name) => setAwardGroupColorTarget({ type, name })} onSelect={(record) => { setSelectedAward(record); setAwardEditing(false); }} onRetry={() => refreshAwards(true)} />}
          </div>
        </div>
        <PageFooter stats={footerStats} />
      </main>

      {calendarState && <CalendarDialog initialDate={calendarState.date} initialEvent={calendarState.event} source={data?.source} onEventChange={(updatedEvent) => setData((current) => current ? { ...current, events: (current.events || []).map((event) => eventKey(event) === eventKey(updatedEvent) ? { ...event, rsvpStatus: updatedEvent.rsvpStatus } : event) } : current)} onClose={() => setCalendarState(null)} />}
      {taskPlannerOpen && <TaskPlannerDialog tasks={taskPool} prefs={taskPrefs} setPrefs={setTaskPrefs} todayOrder={taskTodayOrder} setTodayOrder={setTaskTodayOrder} personalAccess={data?.source?.tasksPersonalAvailable} coverageComplete={data?.source?.tasksCoverageComplete} onAuthorize={() => authorizeInFeishu(true)} onCompletion={syncTaskCompletion} onClose={() => setTaskPlannerOpen(false)} />}
      {knowledgePlannerOpen && <KnowledgePlannerDialog spaces={knowledgeData.spaces || []} selectedIds={knowledgePool || []} setSelectedIds={setKnowledgePool} styles={knowledgeStyles} setStyles={setKnowledgeStyles} loading={knowledgeLoading} error={knowledgeError} requiresAuthorization={knowledgeData.source?.requiresAuthorization} onRefresh={() => refreshKnowledge(true)} onAuthorize={authorizeKnowledge} onClose={() => setKnowledgePlannerOpen(false)} />}
      {appearanceOpen && appearance && <AppearanceDialog appearance={appearance} controller={themeController.current} onChange={updateAppearance} onClose={() => { setAppearanceOpen(false); settingsTriggerRef.current?.focus(); }} />}
      {usageCreateOpen && <UsageCreatePlaceholderDialog onClose={() => setUsageCreateOpen(false)} />}
      {awardColorsOpen && <AwardColorsDialog data={awardData} tagColors={awardTagColors} setTagColors={setAwardTagColors} onClose={() => { setAwardColorsOpen(false); settingsTriggerRef.current?.focus(); }} />}
      {awardGroupColorTarget && <AwardGroupColorDialog type={awardGroupColorTarget.type} name={awardGroupColorTarget.name} color={awardGroupColorTarget.type === "status" ? ({ ...AWARD_STATUS_COLORS, ...awardStatusColors })[awardGroupColorTarget.name] : awardProjectColors[awardGroupColorTarget.name] || defaultProjectColor(awardGroupColorTarget.name)} onChange={(color) => awardGroupColorTarget.type === "status" ? setAwardStatusColors((current) => ({ ...AWARD_STATUS_COLORS, ...current, [awardGroupColorTarget.name]: color })) : setAwardProjectColors((current) => ({ ...current, [awardGroupColorTarget.name]: color }))} onReset={() => awardGroupColorTarget.type === "status" ? setAwardStatusColors((current) => ({ ...current, [awardGroupColorTarget.name]: AWARD_STATUS_COLORS[awardGroupColorTarget.name] || "#918b84" })) : setAwardProjectColors((current) => ({ ...current, [awardGroupColorTarget.name]: defaultProjectColor(awardGroupColorTarget.name) }))} onClose={() => setAwardGroupColorTarget(null)} />}
      {boardEditTarget && <BoardCardDialog key={boardEditTarget} board={boards.find((board) => board.id === boardEditTarget)} onSave={(patch) => setBoards((current) => current.map((board) => board.id === boardEditTarget ? { ...board, ...patch } : board))} onDelete={() => { setBoards((current) => current.filter((board) => board.id !== boardEditTarget)); setBoardEditTarget(null); }} onClose={() => setBoardEditTarget(null)} />}
      {selectedAward && <AwardRecordDialog key={`selected-${selectedAward.id}`} record={selectedAward} readOnly={!awardEditing} fields={awardData?.fields || []} records={awardData?.records || []} statusColors={{ ...AWARD_STATUS_COLORS, ...awardStatusColors }} tagColors={normalizeAwardTagColors(awardTagColors)} projectColor={awardProjectColors[awardText(selectedAward.fields?.["项目名称"]) || "未分项目"] || defaultProjectColor(awardText(selectedAward.fields?.["项目名称"]) || "未分项目")} onEdit={() => setAwardEditing(true)} onSubmit={(fields, options) => updateAwardRecord(selectedAward.id, fields, options)} onClose={() => { setSelectedAward(null); setAwardEditing(false); }} />}
      {awardCreateOpen && <AwardRecordDialog fields={awardData?.fields || []} records={awardData?.records || []} onSubmit={createAwardRecord} onClose={() => setAwardCreateOpen(false)} />}
    </div>
  );
}

function UsageCreatePlaceholderDialog({ onClose }) {
  const { closing, requestClose } = useDialogClose(onClose);
  const panelRef = useRef(null);
  useModalFocus(panelRef);
  return (
    <div className={`dialog-backdrop feature-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={panelRef} className="dialog-card feature-dialog" role="dialog" aria-modal="true" aria-labelledby="usage-create-heading" tabIndex="-1">
        <div className="dialog-shell">
          <header className="feature-dialog-header">
            <div><span className="dialog-eyebrow">用量监控</span><h2 id="usage-create-heading">新建账号监控</h2></div>
            <IconButton label="关闭新建账号监控提示" className="dialog-close" onClick={requestClose}><X size={18} /></IconButton>
          </header>
          <p className="feature-dialog-copy">这里将用于添加新的 Codex 或其他额度数据源。账号授权与采集配置功能正在准备中。</p>
          <footer className="dialog-actions"><button type="button" className="primary-action" onClick={requestClose}>知道了</button></footer>
        </div>
      </section>
    </div>
  );
}

function AwardColorsDialog({ data, tagColors, setTagColors, onClose }) {
  const { closing, requestClose } = useDialogClose(onClose);
  const [target, setTarget] = useState("");
  const panelRef = useRef(null);
  useModalFocus(panelRef);
  const presets = window.LFTheme?.PRESET_COLORS || BOARD_COLOR_PRESETS;
  const normalizedTags = normalizeAwardTagColors(tagColors);
  const fieldValues = (fieldName) => {
    const field = data?.fields?.find((item) => item.name === fieldName);
    const options = (field?.options || []).map(awardText).filter(Boolean);
    const values = (data?.records || []).map((record) => awardText(record.fields?.[fieldName])).filter(Boolean);
    return [...new Set([...options, ...values])];
  };
  const levelValues = fieldValues("赛事级别");
  const targets = levelValues.map((label) => ({ id: `level:${label}`, label, type: "赛事级别", color: awardTagColor(normalizedTags, "level", label) }));
  const selected = targets.find((item) => item.id === target) || targets[0] || { id: "level:赛事级别", label: "赛事级别", type: "赛事级别", color: normalizedTags.level };
  const resolved = toColorInput(selected.color);
  function patchColor(value) {
    const color = String(value || "").trim();
    if (!globalThis.CSS?.supports?.("color", color)) return;
    const name = selected.id.slice(6);
    setTagColors((current) => { const next = normalizeAwardTagColors(current); return { ...next, levels: { ...next.levels, [name]: color } }; });
  }
  return (
    <div className={`dialog-backdrop feature-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={panelRef} className="dialog-card feature-dialog color-manager-dialog award-colors-dialog" role="dialog" aria-modal="true" aria-labelledby="award-colors-heading" tabIndex="-1">
        <div className="dialog-shell">
          <header className="feature-dialog-header"><div><span className="dialog-eyebrow">项目投奖管理设置</span><h2 id="award-colors-heading">赛事配色</h2></div><IconButton label="关闭赛事配色" className="dialog-close" onClick={requestClose}><X size={18} /></IconButton></header>
          <p className="feature-dialog-copy">分别设置每一种赛事级别的标签颜色。工作状态颜色请在工作看板对应卡片中调整。</p>
          <div className="compact-module-manager award-color-manager">
            <div className="compact-module-list award-color-list" role="tablist" aria-label="选择投奖配色项">
              {targets.map((item) => <button type="button" role="tab" aria-selected={target === item.id} key={item.id} className={target === item.id ? "is-active" : ""} onClick={() => setTarget(item.id)}><span>{item.label}</span><small>{item.type}</small><i style={{ "--module-swatch": item.color }} /></button>)}
            </div>
            <div className="compact-module-editor">
              <div className="module-color-current"><span>{selected.type}</span><strong>{selected.label}</strong></div>
              <div className="award-color-preview" style={{ "--preview-color": resolved }}><i /><span>{selected.label}</span></div>
              <div className="module-color-input"><input type="color" value={resolved} onChange={(event) => patchColor(event.target.value)} aria-label={`${selected.label}取色器`} /><input key={`${target}-${resolved}`} defaultValue={resolved} onBlur={(event) => patchColor(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={`${selected.label}颜色值`} /></div>
              <div className="module-preset-palette" aria-label={`${selected.label}颜色预设`}>{presets.map((color) => <button type="button" key={color} className={resolved.toLowerCase() === color ? "is-active" : ""} style={{ "--swatch": color }} onClick={() => patchColor(color)} aria-label={`${selected.label}设为 ${color}`}>{resolved.toLowerCase() === color && <Check size={10} />}</button>)}</div>
            </div>
          </div>
          <footer className="dialog-actions"><button type="button" className="quiet-button" onClick={() => setTagColors((current) => ({ ...normalizeAwardTagColors(current), level: DEFAULT_AWARD_TAG_COLORS.level, levels: clone(DEFAULT_AWARD_LEVEL_COLORS) }))}><RotateCcw size={13} />恢复默认</button><button type="button" className="primary-action" onClick={requestClose}>完成</button></footer>
        </div>
      </section>
    </div>
  );
}

function AwardGroupColorDialog({ type, name, color, onChange, onReset, onClose }) {
  const { closing, requestClose } = useDialogClose(onClose);
  const panelRef = useRef(null);
  useModalFocus(panelRef);
  const presets = window.LFTheme?.PRESET_COLORS || BOARD_COLOR_PRESETS;
  const resolved = toColorInput(color);
  function patchColor(nextColor) {
    const value = String(nextColor || "").trim();
    if (globalThis.CSS?.supports?.("color", value)) onChange(value);
  }
  return (
    <div className={`dialog-backdrop feature-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={panelRef} className="dialog-card feature-dialog project-color-dialog" role="dialog" aria-modal="true" aria-labelledby="project-color-heading" tabIndex="-1">
        <div className="dialog-shell">
          <header className="feature-dialog-header"><div><span className="dialog-eyebrow">{type === "status" ? "工作看板设置" : "项目看板设置"}</span><h2 id="project-color-heading">{type === "status" ? "工作状态颜色" : "项目颜色"}</h2></div><IconButton label="关闭颜色设置" className="dialog-close" onClick={requestClose}><X size={18} /></IconButton></header>
          <p className="feature-dialog-copy">{type === "status" ? `颜色会应用于“${name}”工作状态的大卡片与状态标签。` : `颜色会标记“${name}”以及两个看板中属于该项目的全部投奖卡片。`}</p>
          <div className="project-color-preview" style={{ "--project-color": resolved }}><i /><div><span>{type === "status" ? "当前状态" : "当前项目"}</span><strong>{name}</strong></div><b>{resolved.toUpperCase()}</b></div>
          <label className="project-color-field"><span>自定义颜色</span><div><input type="color" value={resolved} onChange={(event) => patchColor(event.target.value)} aria-label={`${name}取色器`} /><input key={resolved} defaultValue={resolved} onBlur={(event) => patchColor(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={`${name}颜色值`} /></div></label>
          <div className="project-color-presets" aria-label="颜色预设">{presets.map((preset) => <button type="button" key={preset} className={resolved.toLowerCase() === preset ? "is-active" : ""} style={{ "--swatch": preset }} onClick={() => patchColor(preset)} aria-label={`将${name}设为 ${preset}`}>{resolved.toLowerCase() === preset && <Check size={11} />}</button>)}</div>
          <footer className="dialog-actions"><button type="button" className="quiet-button" onClick={onReset}><RotateCcw size={13} />恢复推荐色</button><button type="button" className="primary-action" onClick={requestClose}>完成</button></footer>
        </div>
      </section>
    </div>
  );
}

function BoardSymbol({ board, ...props }) {
  const Icon = getBoardIcon(board);
  return <Icon aria-hidden="true" {...props} />;
}

function BoardsPage({ boards, query, onEdit, onOpenBoard, onReorder }) {
  const [dragState, setDragState] = useState(null);
  const showProjectPrototype = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) && "项目管理 本地原型 创作 阶段 任务".includes(query.trim());
  if (!boards.length && !showProjectPrototype) {
    return <div className="boards-empty"><LayoutDashboard size={28} strokeWidth={1.45} /><strong>{query ? "没有匹配的看板" : "还没有看板"}</strong><span>{query ? "换一个关键词试试" : "这里会显示你固定的二级看板"}</span></div>;
  }
  return (
    <section className="boards-page" aria-label="我的看板">
      <div className="boards-grid">
        {boards.map((board, index) => (
          <article
            className={`board-card ${dragState?.sourceId === board.id ? "is-dragging" : ""} ${dragState?.targetId === board.id ? `is-drop-target is-drop-${dragState.placeAfter ? "after" : "before"}` : ""}`}
            key={board.id}
            data-board-id={board.id}
            style={{ "--board-accent": toColorInput(board.color) }}
          >
            <div className="board-card-topline"><button type="button" className="board-card-drag-handle" aria-label={`拖动排序${board.name || "看板"}`} title="拖动排序" onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setDragState({ sourceId: board.id, targetId: null, placeAfter: false }); }} onPointerMove={(event) => { if (!dragState?.sourceId) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".board-card"); const targetId = target?.dataset?.boardId; if (!targetId || targetId === dragState.sourceId) return; const bounds = target.getBoundingClientRect(); const horizontal = Math.abs(event.clientX - (bounds.left + bounds.width / 2)) > Math.abs(event.clientY - (bounds.top + bounds.height / 2)); const placeAfter = horizontal ? event.clientX > bounds.left + bounds.width / 2 : event.clientY > bounds.top + bounds.height / 2; setDragState((current) => ({ ...current, targetId, placeAfter })); }} onPointerUp={(event) => { event.currentTarget.releasePointerCapture?.(event.pointerId); if (dragState?.sourceId && dragState?.targetId) onReorder(dragState.sourceId, dragState.targetId, dragState.placeAfter); setDragState(null); }} onPointerCancel={() => setDragState(null)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; const targetIndex = index + (event.key === "ArrowRight" ? 1 : -1); if (targetIndex < 0 || targetIndex >= boards.length) return; event.preventDefault(); onReorder(board.id, boards[targetIndex].id, event.key === "ArrowRight"); }}><GripVertical size={15} /></button><h2>{board.name || "未命名看板"}</h2><span className="board-placeholder">{getBoardDestination(board) ? "已接入" : "预留"}</span><IconButton label={`编辑${board.name || "看板"}`} className="board-card-settings" onClick={() => onEdit(board)}><Settings2 size={16} /></IconButton></div>
            <div className="board-card-icon"><BoardSymbol board={board} size={21} strokeWidth={1.8} /></div>
            <div className="board-card-copy"><p>{board.description || "等待补充看板简介"}</p></div>
            <footer><span>二级看板</span><ExternalLink size={14} strokeWidth={1.6} /></footer>
            {getBoardDestination(board) && <button type="button" className="board-card-open" onClick={() => onOpenBoard(board)} aria-label={`打开${board.name || "看板"}`} />}
          </article>
        ))}
      </div>
      {showProjectPrototype && <a className="pm-preview-entry" href="/project-preview"><LayoutDashboard size={15} />项目管理 · 本地原型<ChevronRight size={14} /></a>}
    </section>
  );
}

function BoardCardDialog({ board, onSave, onDelete, onClose }) {
  const deleteOnClose = useRef(false);
  const { closing, requestClose } = useDialogClose(() => {
    if (deleteOnClose.current) onDelete();
    else onClose();
  });
  const panelRef = useRef(null);
  useModalFocus(panelRef);
  const [draft, setDraft] = useState(() => ({ name: board?.name || "", description: board?.description || "", color: toColorInput(board?.color) }));
  const [colorText, setColorText] = useState(draft.color);
  const validColor = /^#[0-9a-f]{6}$/i.test(colorText);
  if (!board) return null;
  function patch(patchValue) { setDraft((current) => ({ ...current, ...patchValue })); }
  function setColor(value) {
    setColorText(value);
    if (/^#[0-9a-f]{6}$/i.test(value)) patch({ color: value.toLowerCase() });
  }
  function save(event) {
    event.preventDefault();
    if (closing || !validColor) return;
    onSave({ name: draft.name.trim() || "未命名看板", description: draft.description.trim(), color: draft.color });
    requestClose();
  }
  return createPortal(
    <div className={`dialog-backdrop feature-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={panelRef} className="dialog-card feature-dialog board-card-dialog" role="dialog" aria-modal="true" aria-labelledby="board-manager-heading" tabIndex="-1" style={{ "--board-accent": draft.color }}>
        <form className="dialog-shell" onSubmit={save}>
          <header className="feature-dialog-header">
            <div><span className="dialog-eyebrow">我的看板</span><h2 id="board-manager-heading">编辑看板</h2></div>
            <IconButton label="关闭看板设置" className="dialog-close" onClick={requestClose}><X size={18} /></IconButton>
          </header>
          <div className="board-edit-fields">
            <label htmlFor="board-name"><span>看板名称</span>
              <span className="board-name-field">
                <i><BoardSymbol board={{ ...board, name: draft.name }} size={20} strokeWidth={1.8} /></i>
                <input id="board-name" value={draft.name} maxLength={60} placeholder="输入看板名称" onChange={(event) => patch({ name: event.target.value })} />
              </span>
            </label>
            <label htmlFor="board-description"><span>简介</span>
              <textarea id="board-description" value={draft.description} maxLength={100} placeholder="添加简短说明" onChange={(event) => patch({ description: event.target.value })} />
            </label>
          </div>
          <fieldset className="board-edit-color">
            <legend>卡片颜色</legend>
            <div className="board-edit-palette">
              {SETTINGS_COLOR_PRESETS.map((color) => (
                <button type="button" key={color} className={draft.color.toLowerCase() === color ? "is-active" : ""} style={{ "--swatch": color }} onClick={() => setColor(color)} aria-label={`设为 ${color}`} title={color.toUpperCase()} aria-pressed={draft.color.toLowerCase() === color}>
                  {draft.color.toLowerCase() === color && <Check size={12} strokeWidth={2} />}
                </button>
              ))}
            </div>
            <div className="board-edit-custom-color">
              <label htmlFor="board-color-hex">自定义颜色</label>
              <div>
                <input type="color" value={draft.color} onChange={(event) => setColor(event.target.value)} aria-label="自定义卡片颜色" />
                <input id="board-color-hex" value={colorText} onChange={(event) => setColor(event.target.value.trim())} maxLength={7} pattern="#[0-9a-fA-F]{6}" required aria-invalid={!validColor} title="使用 #RRGGBB 格式" placeholder="#70b78e" spellCheck={false} />
              </div>
            </div>
          </fieldset>
          <footer className="dialog-actions">
            <button type="button" className="quiet-button is-destructive" disabled={closing} onClick={() => { deleteOnClose.current = true; requestClose(); }}><Trash2 size={13} />删除</button>
            <span />
            <button type="button" className="quiet-button" onClick={requestClose}>取消</button>
            <button type="submit" className="primary-action" disabled={closing || !validColor}>保存</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function awardText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map(awardText).filter(Boolean).join("、");
  if (typeof value === "object") return value.text || value.name || value.link || "";
  return String(value);
}

function awardLink(value) {
  if (!value) return "";
  if (typeof value === "object") return value.link || "";
  const text = String(value);
  return text.startsWith("http") ? text : "";
}

function awardDate(value) {
  if (!value) return "未填写";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return awardText(value) || "未填写";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function awardFormValue(field, value) {
  if (value === null || value === undefined || value === "") return "";
  if (Number(field?.type) === 5) {
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : parseDateValue(awardText(value));
    return parsed && !Number.isNaN(parsed.getTime()) ? dateKey(parsed) : "";
  }
  if (Number(field?.type) === 15) return awardLink(value);
  return awardText(value);
}

function awardFormInitialValues(fields, record) {
  const source = record?.fields || {};
  const values = {};
  for (const field of fields) {
    if (!field?.name || !Object.hasOwn(source, field.name)) continue;
    values[field.name] = awardFormValue(field, source[field.name]);
  }
  if (!record && !values["工作状态"]) values["工作状态"] = "待投奖";
  return values;
}

function defaultProjectColor(projectName) {
  const text = String(projectName || "未分项目");
  const hash = [...text].reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 1), 0);
  return BOARD_COLOR_PRESETS[hash % BOARD_COLOR_PRESETS.length];
}

function normalizeAwardTagColors(value = {}) {
  return {
    level: value.level || DEFAULT_AWARD_TAG_COLORS.level,
    result: value.result || DEFAULT_AWARD_TAG_COLORS.result,
    levels: { ...DEFAULT_AWARD_LEVEL_COLORS, ...(value.levels || {}) },
    results: { ...DEFAULT_AWARD_RESULT_COLORS, ...(value.results || {}) },
  };
}

function awardTagColor(value, type, label) {
  const colors = normalizeAwardTagColors(value);
  const map = type === "level" ? colors.levels : colors.results;
  return map[label] || defaultProjectColor(`${type}:${label}`) || colors[type];
}

function awardTimeValue(record) {
  const fields = record.fields || {};
  for (const name of ["截止日期", "投递日期", "结果公布日"]) {
    const raw = fields[name];
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(awardText(raw));
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.POSITIVE_INFINITY;
}

function sortAwardRecords(records) {
  return [...records].sort((left, right) => awardTimeValue(left) - awardTimeValue(right) || (awardText(left.fields?.["投奖条目"]) || "").localeCompare(awardText(right.fields?.["投奖条目"]) || "", "zh-CN"));
}

function orderAwardRecords(records, savedOrder = []) {
  const sorted = sortAwardRecords(records);
  const byId = new Map(sorted.map((record) => [record.id, record]));
  return [
    ...savedOrder.map((id) => byId.get(id)).filter(Boolean),
    ...sorted.filter((record) => !savedOrder.includes(record.id)),
  ];
}

function AwardBoardPage({ data, loading, error, query, mode, viewPhase, projectColors, statusColors, tagColors, projectOrder, setProjectOrder, recordOrder, setRecordOrder, onEditGroupColor, onSelect, onRetry }) {
  const [draggingGroup, setDraggingGroup] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [draggingRecord, setDraggingRecord] = useState("");
  const [recordDropTarget, setRecordDropTarget] = useState(null);
  const draggingGroupRef = useRef("");
  const draggingRecordRef = useRef(null);
  const records = data?.records || [];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = records.filter((record) => !normalizedQuery || Object.values(record.fields || {}).some((value) => awardText(value).toLowerCase().includes(normalizedQuery)));
  const groupField = mode === "status" ? "工作状态" : "项目名称";
  const emptyGroupName = mode === "status" ? "未分组" : "未分项目";
  const schemaField = data?.fields?.find((field) => field.name === groupField);
  const preferred = mode === "status" ? AWARD_STATUS_ORDER : (schemaField?.options || []);
  const allProjects = [...new Set(records.map((record) => awardText(record.fields?.["项目名称"]) || "未分项目"))];
  const orderedProjects = [...projectOrder.filter((name) => allProjects.includes(name)), ...preferred.filter((name) => allProjects.includes(name) && !projectOrder.includes(name)), ...allProjects.filter((name) => !projectOrder.includes(name) && !preferred.includes(name))];
  const present = [...new Set(filtered.map((record) => awardText(record.fields?.[groupField]) || emptyGroupName))];
  const groupNames = mode === "status"
    ? [...preferred.filter((name) => present.includes(name)), ...present.filter((name) => !preferred.includes(name))]
    : orderedProjects.filter((name) => present.includes(name));

  function startProjectDrag(event, groupName) {
    draggingGroupRef.current = groupName;
    setDraggingGroup(groupName);
    setDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-liufeng-card", groupName);
  }

  function trackProjectDrop(event, groupName) {
    const sourceName = draggingGroupRef.current || draggingGroup || event.dataTransfer.getData("application/x-liufeng-card");
    if (!sourceName || sourceName === groupName) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDropTarget({ name: groupName, after: event.clientY > rect.top + rect.height / 2 });
  }

  function finishProjectDrop(event, groupName) {
    event.preventDefault();
    const sourceName = draggingGroupRef.current || draggingGroup || event.dataTransfer.getData("application/x-liufeng-card");
    if (!sourceName || sourceName === groupName) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    commitProjectOrder(sourceName, groupName, after);
  }

  function commitProjectOrder(sourceName, groupName, after) {
    setProjectOrder((current) => {
      const base = [...current.filter((name) => allProjects.includes(name)), ...allProjects.filter((name) => !current.includes(name))];
      const next = base.filter((name) => name !== sourceName);
      const targetIndex = next.indexOf(groupName);
      next.splice(Math.max(0, targetIndex + (after ? 1 : 0)), 0, sourceName);
      return next;
    });
    setDraggingGroup("");
    draggingGroupRef.current = "";
    setDropTarget(null);
  }

  function beginPointerProjectDrag(event, groupName) {
    if (event.button !== 0) return;
    event.preventDefault();
    draggingGroupRef.current = groupName;
    setDraggingGroup(groupName);
    setDropTarget(null);
  }

  function trackPointerProjectDrag(event, groupName) {
    const sourceName = draggingGroupRef.current;
    if (!sourceName || sourceName === groupName || event.buttons !== 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setDropTarget({ name: groupName, after: event.clientY > rect.top + rect.height / 2 });
  }

  function finishPointerProjectDrag(event, groupName) {
    const sourceName = draggingGroupRef.current;
    if (!sourceName) return;
    if (sourceName !== groupName) {
      const rect = event.currentTarget.getBoundingClientRect();
      commitProjectOrder(sourceName, groupName, event.clientY > rect.top + rect.height / 2);
    } else {
      draggingGroupRef.current = "";
      setDraggingGroup("");
      setDropTarget(null);
    }
  }

  function startRecordDrag(event, groupName, recordId) {
    event.stopPropagation();
    draggingRecordRef.current = { groupName, recordId };
    setDraggingRecord(recordId);
    setRecordDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-liufeng-item", JSON.stringify({ groupName, recordId }));
  }

  function trackRecordDrop(event, groupName, recordId) {
    const source = draggingRecordRef.current;
    if (!source || source.groupName !== groupName || source.recordId === recordId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setRecordDropTarget({ groupName, recordId, after: event.clientY > rect.top + rect.height / 2 });
  }

  function finishRecordDrop(event, groupName, recordId, groupRecords) {
    const source = draggingRecordRef.current;
    if (!source || source.groupName !== groupName || source.recordId === recordId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const base = orderAwardRecords(groupRecords, recordOrder[groupName] || []).map((record) => record.id).filter((id) => id !== source.recordId);
    const targetIndex = base.indexOf(recordId);
    base.splice(Math.max(0, targetIndex + (after ? 1 : 0)), 0, source.recordId);
    setRecordOrder((current) => ({ ...current, [groupName]: base }));
    draggingRecordRef.current = null;
    setDraggingRecord("");
    setRecordDropTarget(null);
  }

  function finishRecordDrag() {
    draggingRecordRef.current = null;
    setDraggingRecord("");
    setRecordDropTarget(null);
  }

  if (!data && loading) return <div className="award-loading"><RefreshCw className="is-spinning" size={22} /><strong>正在同步投奖台账</strong><span>读取多维表格字段与记录</span></div>;
  if (!data && error) return <div className="award-loading is-error"><AlertCircle size={22} /><strong>暂时无法读取投奖台账</strong><span>{error}</span><button type="button" className="quiet-button" onClick={onRetry}>重新读取</button></div>;

  return (
    <section className={`award-board-page is-view-${viewPhase}`} aria-label="项目投奖管理看板">
      {error && <div className="award-inline-error"><AlertCircle size={13} />{error}</div>}
      <div className="award-board-scroll">
        <div className={`award-groups award-groups-${mode}`}>
          {groupNames.map((groupName) => {
            const chronologicalItems = sortAwardRecords(filtered.filter((record) => (awardText(record.fields?.[groupField]) || emptyGroupName) === groupName));
            const items = mode === "project" ? orderAwardRecords(chronologicalItems, recordOrder[groupName] || []) : chronologicalItems;
            const groupColor = mode === "status" ? (statusColors[groupName] || "#918b84") : (projectColors[groupName] || defaultProjectColor(groupName));
            const dropClass = dropTarget?.name === groupName ? `is-order-drop-target ${dropTarget.after ? "drop-after" : ""}` : "";
            return <section className={`award-group ${draggingGroup === groupName ? "is-card-dragging" : ""} ${dropClass}`} data-motion-key={groupName} key={groupName} style={{ "--award-group-color": groupColor }} onDragEnd={mode === "project" ? () => { draggingGroupRef.current = ""; setDraggingGroup(""); setDropTarget(null); } : undefined} onDragOver={mode === "project" ? (event) => trackProjectDrop(event, groupName) : undefined} onDrop={mode === "project" ? (event) => finishProjectDrop(event, groupName) : undefined} onPointerMove={mode === "project" ? (event) => trackPointerProjectDrag(event, groupName) : undefined} onPointerUp={mode === "project" ? (event) => finishPointerProjectDrag(event, groupName) : undefined}>
              <header className="award-group-heading">
                {mode === "project" && <button type="button" className="award-group-drag-handle" draggable onDragStart={(event) => startProjectDrag(event, groupName)} onPointerDown={(event) => beginPointerProjectDrag(event, groupName)} title={`拖动调整${groupName}顺序`} aria-label={`拖动调整${groupName}顺序`}><GripVertical size={15} /></button>}
                <h2>{groupName}</h2><span>{items.length}</span>
                <IconButton label={`编辑${groupName}颜色`} className="award-group-settings" onClick={() => onEditGroupColor(mode, groupName)}><Settings2 size={16} /></IconButton>
              </header>
              <div className="award-card-list">{items.map((record) => { const projectName = awardText(record.fields?.["项目名称"]) || "未分项目"; const recordDrop = recordDropTarget?.groupName === groupName && recordDropTarget.recordId === record.id ? `is-record-drop-target ${recordDropTarget.after ? "drop-after" : ""}` : ""; return <AwardRecordCard key={record.id} record={record} mode={mode} projectColor={projectColors[projectName] || defaultProjectColor(projectName)} tagColors={tagColors} dragging={draggingRecord === record.id} dropClass={recordDrop} onDragStart={(event) => startRecordDrag(event, groupName, record.id)} onDragOver={(event) => trackRecordDrop(event, groupName, record.id)} onDrop={(event) => finishRecordDrop(event, groupName, record.id, chronologicalItems)} onDragEnd={finishRecordDrag} onClick={() => onSelect(record)} />; })}</div>
            </section>;
          })}
        </div>
        {!filtered.length && <div className="award-empty"><Award size={26} /><strong>{query ? "没有匹配的投奖记录" : "投奖台账暂时为空"}</strong><span>{query ? "换一个关键词试试" : "可以使用右上角的新建记录添加第一条数据"}</span></div>}
      </div>
    </section>
  );
}

function AwardRecordCard({ record, mode, projectColor, tagColors, dragging, dropClass, onDragStart, onDragOver, onDrop, onDragEnd, onClick }) {
  const fields = record.fields || {};
  const projectName = awardText(fields["项目名称"]) || "未分项目";
  const competitionName = awardText(fields["比赛名称"]) || "比赛名称待补充";
  const deadline = awardDate(fields["截止日期"]);
  const level = awardText(fields["赛事级别"]) || awardText(fields["赛道/组别"]) || "待补充";
  const awardResult = awardText(fields["投赛结果"]) || "尚未公布";
  const isProjectView = mode === "project";
  const levelColor = awardTagColor(tagColors, "level", level);
  const resultColor = projectColor;
  return (
    <article role="button" tabIndex="0" data-motion-key={`award-record-${record.id}`} className={`award-record-card is-${mode}-view ${dragging ? "is-record-dragging" : ""} ${dropClass || ""}`} style={{ "--record-color": projectColor }} onClick={onClick} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); onClick(); } }} onDragOver={isProjectView ? onDragOver : undefined} onDrop={isProjectView ? onDrop : undefined}>
      {isProjectView && <button type="button" className="award-record-drag-handle" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} title={`拖动调整${competitionName}顺序`} aria-label={`拖动调整${competitionName}顺序`}><GripVertical size={14} /></button>}
      {isProjectView ? <>
        <div className="award-record-competition is-primary"><strong>{competitionName}</strong></div>
        <div className="award-record-project-meta" aria-label={`级别 ${level}，获奖状态 ${awardResult}`}>
          <strong style={{ "--meta-color": levelColor }}>{level}</strong>
          <i />
          <strong style={{ "--meta-color": resultColor }}>{awardResult}</strong>
        </div>
      </> : <>
        <div className="award-record-identity">
          <strong>{projectName}</strong>
          <p>{competitionName}</p>
        </div>
        <div className="award-record-status-tags" aria-label={`截止时间 ${deadline}，赛事级别 ${level}`}>
          <strong style={{ "--tag-color": projectColor }}>{deadline}</strong>
          <strong style={{ "--tag-color": levelColor }}>{level}</strong>
        </div>
        <footer><span>下一步</span><strong>{awardText(fields["下一步行动"]) || "暂无下一步行动"}</strong><ChevronRight size={14} /></footer>
      </>}
    </article>
  );
}

function AwardRecordDialog({ record = null, readOnly = false, fields, records, statusColors = AWARD_STATUS_COLORS, tagColors = {}, projectColor = "#918b84", onEdit, onSubmit, onClose }) {
  const editing = Boolean(record?.id);
  const recordFields = record?.fields || {};
  const [values, setValues] = useState(() => awardFormInitialValues(fields, record));
  const [projectMode, setProjectMode] = useState("existing");
  const [newProjectName, setNewProjectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { closing, requestClose } = useDialogClose(onClose);
  const byName = useMemo(() => Object.fromEntries(fields.map((field) => [field.name, field])), [fields]);
  const projectOptions = useMemo(() => [...new Set([
    ...(byName["项目名称"]?.options || []),
    ...records.map((record) => awardText(record.fields?.["项目名称"])).filter(Boolean),
  ])], [byName, records]);
  const projectName = projectMode === "new" ? newProjectName.trim() : values["项目名称"] || "";
  const competitionName = String(values["比赛名称"] || "").trim();
  const generatedTitle = [projectName, competitionName].filter(Boolean).join(" | ") || "项目与比赛名称将在这里组成标题";
  const submitted = ["已投奖", "已获奖"].includes(values["工作状态"]);
  const resultDateArrived = hasDateArrived(values["结果公布日"]);
  const showAwardResult = submitted && resultDateArrived;
  const detailStatus = awardText(recordFields["工作状态"]) || "未设置";
  const detailProjectName = awardText(recordFields["项目名称"]) || "未分项目";
  const detailCompetitionName = awardText(recordFields["比赛名称"]) || "比赛名称待补充";
  const detailTitle = `${detailProjectName} | ${detailCompetitionName}`;
  const detailMeta = [
    ["项目", recordFields["项目名称"]], ["比赛", recordFields["比赛名称"]],
    ["截止日期", recordFields["截止日期"], true], ["投递日期", recordFields["投递日期"], true],
    ["赛道/组别", recordFields["赛道/组别"]], ["项目类型", recordFields["项目类型"]],
    ["项目归属", recordFields["项目归属"]], ["我的作次", recordFields["我的作次"]],
    ["项目成员", recordFields["项目成员"]], ["指导老师", recordFields["指导老师"]],
  ];

  function patchValue(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = { ...values, "项目名称": projectName, "投奖条目": generatedTitle };
      if (!submitted) {
        if (editing) payload["投递日期"] = null;
        else delete payload["投递日期"];
      }
      if (!showAwardResult) {
        if (editing) payload["投赛结果"] = null;
        else delete payload["投赛结果"];
      }
      await onSubmit(payload, { createProject: projectMode === "new" });
      requestClose();
    } catch (error) {
      setSubmitError(error.message || (editing ? "记录更新失败" : "记录创建失败"));
      setSubmitting(false);
    }
  }

  return (
    <div className={`dialog-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className={`dialog-card award-record-flow-dialog ${readOnly ? "award-detail-dialog" : "award-record-dialog"}`} role="dialog" aria-modal="true" aria-labelledby={readOnly ? "award-detail-heading" : "award-record-heading"}>
        {readOnly ? <div key="detail" className="award-dialog-pane is-detail">
          <header className="award-detail-header"><div><span>投奖详情</span><h2 id="award-detail-heading">{detailTitle}</h2></div><IconButton label="关闭投奖详情" onClick={requestClose}><X size={19} /></IconButton></header>
          <div className="award-detail-scroll">
            <div className="award-detail-tags"><span style={{ "--tag-color": statusColors[detailStatus] || "#918b84" }}>{detailStatus}</span>{awardText(recordFields["赛事级别"]) && <span style={{ "--tag-color": awardTagColor(tagColors, "level", awardText(recordFields["赛事级别"])) }}>{awardText(recordFields["赛事级别"])}</span>}{awardText(recordFields["投赛结果"]) && <span style={{ "--tag-color": projectColor }}>{awardText(recordFields["投赛结果"])}</span>}</div>
            <dl className="award-detail-meta">{detailMeta.map(([label, value, dateValue]) => <div key={label}><dt>{label}</dt><dd>{dateValue ? awardDate(value) : awardText(value) || "未填写"}</dd></div>)}</dl>
            <div className="award-detail-sections">{[["下一步行动", recordFields["下一步行动"]], ["作品要求", recordFields["作品要求"]], ["提交材料", recordFields["提交材料"]], ["备注", recordFields["备注"]]].map(([label, value]) => value ? <section key={label}><h3>{label}</h3><p>{awardText(value)}</p></section> : null)}</div>
          </div>
          <footer className="award-detail-actions"><button type="button" className="award-link-action award-edit-action" onClick={onEdit}><Pencil size={13} />编辑记录</button><span className="award-detail-action-spacer" />{awardLink(recordFields["比赛官网"]) && <a className="award-link-action" href={awardLink(recordFields["比赛官网"])} target="_blank" rel="noreferrer">比赛官网<ExternalLink size={13} /></a>}{awardLink(recordFields["报名/提交入口"]) && <a className="award-link-action" href={awardLink(recordFields["报名/提交入口"])} target="_blank" rel="noreferrer">报名 / 提交<ExternalLink size={13} /></a>}</footer>
        </div> : <form key="editor" className="award-dialog-pane is-editor" onSubmit={submit}>
          <header className="award-detail-header award-create-dialog-header"><div><span>{editing ? "编辑投奖记录" : "新建投奖记录"}</span><h2 id="award-record-heading">{generatedTitle}</h2><p>{editing ? "保存后立即更新飞书多维表格，后续表格变更也会同步回看板。" : "项目与比赛将自动生成记录标题，创建后立即同步飞书多维表格。"}</p></div><IconButton label={editing ? "关闭编辑记录" : "关闭新建记录"} onClick={requestClose}><X size={19} /></IconButton></header>
          <div className="award-record-form-scroll">
            <section className="award-form-section" aria-labelledby="award-form-core"><h3 id="award-form-core">核心信息</h3><p className="award-form-section-copy">确定项目、比赛和当前进度。</p><div className="award-form-grid award-form-core-grid">
              <ProjectNameField options={projectOptions} mode={projectMode} value={projectMode === "new" ? newProjectName : values["项目名称"] || ""} onSelectExisting={(value) => { setProjectMode("existing"); setNewProjectName(""); patchValue("项目名称", value); }} onCreate={() => { setProjectMode("new"); patchValue("项目名称", ""); }} onChangeNew={setNewProjectName} />
              {byName["比赛名称"] && <AwardFormField field={byName["比赛名称"]} value={values["比赛名称"] || ""} onChange={(value) => patchValue("比赛名称", value)} required />}
              {byName["工作状态"] && <AwardFormField field={byName["工作状态"]} value={values["工作状态"] || ""} onChange={(value) => patchValue("工作状态", value)} />}
              {byName["截止日期"] && <AwardFormField field={byName["截止日期"]} value={values["截止日期"] || ""} onChange={(value) => patchValue("截止日期", value)} />}
            </div></section>
            <section className="award-form-section" aria-labelledby="award-form-progress"><h3 id="award-form-progress">赛事与进度</h3><div className="award-form-grid">
              {byName["赛事级别"] && <AwardFormField field={byName["赛事级别"]} value={values["赛事级别"] || ""} onChange={(value) => patchValue("赛事级别", value)} />}
              {byName["赛道/组别"] && <AwardFormField field={byName["赛道/组别"]} value={values["赛道/组别"] || ""} onChange={(value) => patchValue("赛道/组别", value)} />}
              {byName["主办方"] && <AwardFormField field={byName["主办方"]} value={values["主办方"] || ""} onChange={(value) => patchValue("主办方", value)} />}
              {submitted && byName["投递日期"] && <AwardFormField field={byName["投递日期"]} value={values["投递日期"] || ""} onChange={(value) => patchValue("投递日期", value)} />}
              {byName["结果公布日"] && <AwardFormField field={byName["结果公布日"]} value={values["结果公布日"] || ""} onChange={(value) => patchValue("结果公布日", value)} />}
              {showAwardResult && byName["投赛结果"] && <AwardFormField field={byName["投赛结果"]} value={values["投赛结果"] || ""} onChange={(value) => patchValue("投赛结果", value)} />}
            </div></section>
            <section className="award-form-section" aria-labelledby="award-form-project"><h3 id="award-form-project">项目与人员</h3><div className="award-form-grid">
              {["项目类型", "项目归属", "项目成员", "我的作次", "指导老师", "下一步行动"].map((name) => byName[name] ? <AwardFormField key={name} field={byName[name]} value={values[name] || ""} onChange={(value) => patchValue(name, value)} /> : null)}
            </div></section>
            <section className="award-form-section" aria-labelledby="award-form-material"><h3 id="award-form-material">作品与材料</h3><div className="award-form-grid award-material-grid">{["作品要求", "提交材料", "备注"].map((name) => byName[name] ? <AwardFormField key={name} field={byName[name]} value={values[name] || ""} onChange={(value) => patchValue(name, value)} /> : null)}</div></section>
            <section className="award-form-section" aria-labelledby="award-form-links"><h3 id="award-form-links">网址链接</h3><div className="award-form-grid">{["比赛官网", "报名/提交入口"].map((name) => byName[name] ? <AwardFormField key={name} field={byName[name]} value={values[name] || ""} onChange={(value) => patchValue(name, value)} /> : null)}</div></section>
          </div>
          <footer className="award-record-form-actions">{submitError && <span><AlertCircle size={13} />{submitError}</span>}<button type="button" className="quiet-button" onClick={requestClose}>取消</button><button type="submit" className="primary-action" disabled={submitting || !projectName || !competitionName}>{submitting ? <RefreshCw className="is-spinning" size={14} /> : editing ? <Pencil size={14} /> : <Plus size={14} />}{submitting ? "正在同步" : editing ? "保存并同步" : projectMode === "new" ? "创建项目并添加记录" : "创建记录"}</button></footer>
        </form>}
      </section>
    </div>
  );
}

function ProjectNameField({ options, mode, value, onSelectExisting, onCreate, onChangeNew }) {
  return <label className="award-project-field"><span>项目名称<i>必填</i></span><div className="award-project-picker">
    <LFSelect value={mode === "new" ? "__new__" : value} options={[{ value: "", label: "请选择已有项目" }, ...options.map((option) => ({ value: option, label: option })), { value: "__new__", label: "＋ 创建新项目" }]} ariaLabel="项目名称" onChange={(nextValue) => nextValue === "__new__" ? onCreate() : onSelectExisting(nextValue)} />
    {mode === "new" && <input autoFocus value={value} required maxLength={60} placeholder="输入新项目名称" onChange={(event) => onChangeNew(event.target.value)} />}
  </div></label>;
}

function AwardFormField({ field, value, onChange, required: forceRequired = false }) {
  const required = forceRequired || field.primary;
  const wide = AWARD_LONG_FIELDS.has(field.name);
  let control;
  if (field.type === 3) control = <LFSelect value={value} options={[{ value: "", label: "请选择" }, ...(field.options || []).map((option) => ({ value: option, label: option }))]} ariaLabel={field.name} onChange={onChange} />;
  else if (field.type === 5) control = <LFDatePicker value={value} required={required} ariaLabel={field.name} onChange={onChange} />;
  else if (field.type === 15) control = <input type="url" value={value} required={required} placeholder="https://" onChange={(event) => onChange(event.target.value)} />;
  else if (wide) control = <textarea value={value} required={required} rows={3} onChange={(event) => onChange(event.target.value)} />;
  else control = <input value={value} required={required} onChange={(event) => onChange(event.target.value)} />;
  return <label className={wide ? "is-wide" : ""}><span>{field.name}{required && <i>必填</i>}</span>{control}</label>;
}

function ScheduleModule({ events, calendars = [], now, loading, editing, color, onOpen }) {
  const scrollRef = useRef(null);
  const dayEvents = useMemo(() => eventsForDay(events, now), [events, dateKey(now)]);
  const fallbackCalendars = [...new Map(dayEvents.map((event) => [event.calendarId || event.calendar || "default", { id: event.calendarId || event.calendar || "default", name: event.calendar || "我的日历", color: event.calendarColor || event.color || "#70b78e" }])).values()];
  const sourceLanes = calendars.length ? calendars : fallbackCalendars.length ? fallbackCalendars : [{ id: "default", name: "我的日历", color: "#70b78e" }];
  const lanes = [...sourceLanes].sort((left, right) => Number(right.name === "游皓宇") - Number(left.name === "游皓宇"));
  const calendarKey = (event) => event.calendarId || event.calendar || "default";
  const eventsForCalendar = (calendar) => dayEvents.filter((event) => calendarKey(event) === calendar.id || (!event.calendarId && event.calendar === calendar.name));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMinutes - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60) * TIMELINE_HEIGHT;

  useEffect(() => {
    if (!scrollRef.current) return;
    const target = Math.max(0, nowTop - scrollRef.current.clientHeight * 0.38);
    scrollRef.current.scrollTop = target;
  }, []);

  return (
    <ModuleCard icon={Clock3} title="今日日程" meta={`${dayEvents.length} 项`} accent="mint" color={color} editing={editing} className="schedule-card" action={<div className="module-header-actions"><button type="button" className="icon-button" onClick={() => openFeishuDestination("https://applink.feishu.cn/client/calendar/event/create")} title="新建日程" aria-label="新建日程"><CalendarPlus size={15} /></button><IconButton label="打开日视图" onClick={() => onOpen()}><Maximize2 size={15} /></IconButton></div>}>
      <div className="schedule-day-scroll" ref={scrollRef}><div className="schedule-day-surface" style={{ "--calendar-count": lanes.length }}>
        <div className="schedule-day-calendars"><span>GMT+8</span>{lanes.map((calendar) => <div key={calendar.id} style={{ "--calendar-color": calendar.color }}><i /><strong>{calendar.name}</strong></div>)}</div>
        <div className="schedule-day-all-day"><span>全天</span>{lanes.map((calendar) => <div key={calendar.id}>{eventsForCalendar(calendar).filter((event) => event.allDay).map((event) => <button key={eventKey(event)} className={eventRsvpClass(event)} style={eventColorStyle(event)} onClick={() => onOpen(event)}>{event.title}</button>)}</div>)}</div>
        <div className="timeline schedule-day-timeline" style={{ height: TIMELINE_HEIGHT }}>
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => <div className="timeline-hour" key={index} style={{ top: index * HOUR_HEIGHT }}><span>{String(index + START_HOUR).padStart(2, "0")}:00</span><i /></div>)}
          {nowTop >= 0 && nowTop <= TIMELINE_HEIGHT && <div className="timeline-now" style={{ top: nowTop }}><span>{formatTime(now)}</span><i /></div>}
          <div className="schedule-day-lanes">{lanes.map((calendar) => <div className="schedule-day-lane" key={calendar.id}>{layoutEvents(eventsForCalendar(calendar), now).map((event) => <button key={eventKey(event)} className={`schedule-event ${eventRsvpClass(event)}`} style={eventStyle(event)} onClick={() => onOpen(event)}><strong>{event.title}</strong><span>{formatTime(new Date(event.start))}–{formatTime(new Date(event.end))}</span>{event.location && <small>{event.location}</small>}</button>)}</div>)}</div>
          {!loading && dayEvents.length === 0 && <div className="schedule-empty"><CalendarDays size={20} /><span>今天还没有日程</span></div>}
          {loading && <div className="schedule-empty"><RefreshCw className="is-spinning" size={18} /><span>正在读取日程</span></div>}
        </div>
      </div></div>
    </ModuleCard>
  );
}

function taskIsToday(task, pref = {}) {
  return pref.inToday ?? task.defaultToday ?? true;
}

function taskDueCopy(task, includeDate = false) {
  if (!task.due) return "无截止时间";
  const due = new Date(task.due);
  if (Number.isNaN(due.getTime())) return String(task.due);
  return includeDate ? `${formatShortDate(due)} ${formatTime(due)}` : formatTime(due);
}

function reorderedTaskIds(currentOrder, tasks, sourceId, targetId, placeAfter = false) {
  const normalized = [...new Set([...(Array.isArray(currentOrder) ? currentOrder : []), ...tasks.map((task) => task.id)])]
    .filter((taskId) => tasks.some((task) => task.id === taskId));
  if (!sourceId || !targetId || sourceId === targetId) return normalized;
  const next = normalized.filter((taskId) => taskId !== sourceId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) return normalized;
  next.splice(targetIndex + (placeAfter ? 1 : 0), 0, sourceId);
  return next;
}

function installDragPreview(event, source) {
  if (!event.dataTransfer || !source) return;
  const preview = source.cloneNode(true);
  preview.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  preview.classList.add("liufeng-drag-preview");
  preview.style.width = `${Math.min(380, Math.max(220, source.getBoundingClientRect().width))}px`;
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 26, 24);
  requestAnimationFrame(() => preview.remove());
}

function TasksModule({ tasks, query, prefs, setPrefs, todayOrder, setTodayOrder, personalAccess, editing, color, onCompletion, onOpen }) {
  const [dragState, setDragState] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const [completionStages, setCompletionStages] = useState({});
  const completionTimers = useRef(new Map());
  const todayTasks = unfinishedTasks(tasks, prefs).filter((task) => taskIsToday(task, prefs[task.id]));
  const filtered = orderedByIds(todayTasks, todayOrder).filter((task) => task.title.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => () => {
    completionTimers.current.forEach((timers) => timers.forEach(clearTimeout));
    completionTimers.current.clear();
  }, []);

  function clearCompletionAnimation(taskId) {
    (completionTimers.current.get(taskId) || []).forEach(clearTimeout);
    completionTimers.current.delete(taskId);
    setCompletionStages((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function animateCompletion(taskId) {
    clearCompletionAnimation(taskId);
    setCompletionStages((current) => ({ ...current, [taskId]: "success" }));
    const timers = [
      setTimeout(() => {
        const commit = () => flushSync(() => {
          update(taskId, { done: true }, true);
          setCompletionStages((current) => ({ ...current, [taskId]: "settled" }));
        });
        if (typeof document.startViewTransition === "function") document.startViewTransition(commit);
        else commit();
      }, 380),
      setTimeout(() => clearCompletionAnimation(taskId), 1080),
    ];
    completionTimers.current.set(taskId, timers);
  }
  function update(taskId, patch, moveToEnd = false) {
    setPrefs((current) => ({ ...current, [taskId]: { ...current[taskId], ...patch, transitionId: Date.now() } }));
    if (moveToEnd) {
      setTodayOrder((current) => {
        const normalized = [...new Set([...(Array.isArray(current) ? current : []), ...todayTasks.map((task) => task.id)])];
        return [...normalized.filter((itemId) => itemId !== taskId), taskId];
      });
    }
  }
  function reorder(sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const nextOrder = reorderedTaskIds(todayOrder, todayTasks, sourceId, targetId, placeAfter);
    setTodayOrder(nextOrder);
    setPrefs((current) => ({ ...current, [sourceId]: { ...current[sourceId], transitionId: Date.now() } }));
    const position = nextOrder.indexOf(sourceId) + 1;
    setAnnouncement(`已移动到第 ${position} 项`);
    setDragState(null);
  }
  async function toggleCompletion(task, done) {
    const previous = prefs[task.id];
    const previousOrder = todayOrder;
    if (done) {
      clearCompletionAnimation(task.id);
      update(task.id, { done: false }, true);
    } else animateCompletion(task.id);
    if (!task.guid || !onCompletion) return;
    try {
      await onCompletion(task, !done);
      clearCompletionAnimation(task.id);
      setPrefs((current) => withoutTaskDonePreference(current, task.id));
      setAnnouncement(done ? "任务已恢复为未完成" : "任务已同步完成到飞书");
    } catch (error) {
      clearCompletionAnimation(task.id);
      setPrefs((current) => {
        const next = { ...current };
        if (previous) next[task.id] = previous;
        else delete next[task.id];
        return next;
      });
      setTodayOrder(previousOrder);
      setAnnouncement(error.message || "飞书任务更新失败");
    }
  }
  return (
    <ModuleCard icon={ListTodo} title="今日待办" meta={`${filtered.length} 项`} accent="rose" color={color} editing={editing} action={<div className="module-header-actions"><button type="button" className="icon-button" onClick={() => openFeishuDestination("https://applink.feishu.cn/client/todo/create")} title="新建任务" aria-label="新建任务"><Plus size={15} /></button><IconButton label="打开任务规划池" onClick={onOpen}><Maximize2 size={15} /></IconButton></div>}>
      {!personalAccess && <div className="inline-notice"><KeyRound size={13} />当前使用本地测试任务；授权后可接入飞书任务详情</div>}
      <div className="row-list task-list">
        {filtered.map((task, index) => {
          const pref = prefs[task.id] || {};
          const done = taskIsDone(task, pref);
          const completionStage = completionStages[task.id] || "";
          return <div className={`task-row-shell ${completionStage ? `is-completion-${completionStage}` : ""} ${dragState?.sourceId === task.id ? "is-item-dragging" : ""} ${dragState?.targetId === task.id ? `is-item-target is-target-${dragState.placeAfter ? "after" : "before"}` : ""}`} style={{ viewTransitionName: `task-${String(task.id).replace(/[^a-zA-Z0-9_-]/g, "-")}` }} key={task.id} data-task-id={task.id} onDragOver={(event) => { if (!dragState?.sourceId || dragState.sourceId === task.id) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setDragState((current) => ({ ...current, targetId: task.id, placeAfter: event.clientY > bounds.top + bounds.height / 2 })); }} onDrop={(event) => { event.preventDefault(); reorder(dragState?.sourceId || event.dataTransfer.getData("application/x-liufeng-item"), task.id, dragState?.placeAfter); }}><div className={`task-row ${done ? "is-done" : ""} ${completionStage === "success" ? "is-completing" : ""}`}><button type="button" className="task-row-drag-handle" draggable={!completionStage} aria-label={`拖动排序${task.title}`} title="拖动排序" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-item", task.id); installDragPreview(event, event.currentTarget.closest(".task-row-shell")); setDragState({ sourceId: task.id, targetId: null, placeAfter: false }); }} onDragEnd={() => setDragState(null)} onKeyDown={(event) => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; const targetIndex = index + (event.key === "ArrowDown" ? 1 : -1); if (targetIndex < 0 || targetIndex >= filtered.length) return; event.preventDefault(); reorder(task.id, filtered[targetIndex].id, event.key === "ArrowDown"); }}><GripVertical size={14} /></button><button className="task-check" disabled={Boolean(completionStage)} onClick={() => void toggleCompletion(task, done)} aria-label={done ? "恢复未完成" : "完成任务"}>{(done || completionStage === "success") && <Check size={13} />}</button><a href={task.url || undefined} title={task.title}><strong>{task.title}</strong></a><time className={task.overdue ? "is-overdue" : ""} dateTime={task.due || undefined} title={taskDueCopy(task, true)}>{taskDueCopy(task)}</time></div></div>;
        })}
        {filtered.length === 0 && <div className="empty-copy compact"><ClipboardCheck size={20} /><strong>{query ? "没有匹配的任务" : personalAccess ? "今日待办已清空" : "今日待办池为空"}</strong></div>}
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </ModuleCard>
  );
}

function TaskPlannerDialog({ tasks, prefs, setPrefs, todayOrder, setTodayOrder, personalAccess, coverageComplete, onAuthorize, onCompletion, onClose }) {
  const [draggedId, setDraggedId] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [reorderTarget, setReorderTarget] = useState(null);
  const [poolActive, setPoolActive] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const { closing, requestClose } = useDialogClose(onClose);
  const panelRef = useRef(null);
  useModalFocus(panelRef);
  const unfinished = unfinishedTasks(tasks, prefs).sort((a, b) => new Date(a.due || 8640000000000000) - new Date(b.due || 8640000000000000));
  const todayTasks = orderedByIds(unfinished.filter((task) => taskIsToday(task, prefs[task.id])), todayOrder);

  function patchTask(taskId, patch, moveToEnd = false) {
    if (!taskId) return;
    setPrefs((current) => ({ ...current, [taskId]: { ...current[taskId], ...patch, transitionId: Date.now() } }));
    if (moveToEnd) {
      setTodayOrder((current) => {
        const normalized = [...new Set([...(Array.isArray(current) ? current : []), ...todayTasks.map((task) => task.id)])];
        return [...normalized.filter((itemId) => itemId !== taskId), taskId];
      });
    }
  }

  function addToToday(taskId) {
    patchTask(taskId, { inToday: true }, true);
    setDraggedId(null);
    setDragSource(null);
    setReorderTarget(null);
    setPoolActive(false);
  }

  function reorderToday(sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const nextOrder = reorderedTaskIds(todayOrder, todayTasks, sourceId, targetId, placeAfter);
    setTodayOrder(nextOrder);
    setPrefs((current) => ({ ...current, [sourceId]: { ...current[sourceId], transitionId: Date.now() } }));
    setAnnouncement(`已移动到第 ${nextOrder.indexOf(sourceId) + 1} 项`);
    setDraggedId(null);
    setDragSource(null);
    setReorderTarget(null);
    setPoolActive(false);
  }

  function clearTaskDrag() {
    setDraggedId(null);
    setDragSource(null);
    setReorderTarget(null);
    setPoolActive(false);
  }

  async function toggleTaskCompletion(task, done) {
    const previous = prefs[task.id];
    patchTask(task.id, { done: !done }, true);
    if (!task.guid || !onCompletion) return;
    setPendingTaskIds((current) => new Set(current).add(task.id));
    try {
      await onCompletion(task, !done);
      setPrefs((current) => withoutTaskDonePreference(current, task.id));
      setAnnouncement(done ? "任务已在飞书恢复为未完成" : "任务已同步完成到飞书");
    } catch (error) {
      setPrefs((current) => {
        const next = { ...current };
        if (previous) next[task.id] = previous;
        else delete next[task.id];
        return next;
      });
      setAnnouncement(error.message || "飞书任务更新失败");
    } finally {
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <div className={`dialog-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={panelRef} className="dialog-card task-planner-dialog" role="dialog" aria-modal="true" aria-labelledby="task-planner-heading" tabIndex="-1">
        <header className="dialog-header">
          <div className="dialog-title"><ListTodo size={18} /><div><h2 id="task-planner-heading">任务规划池</h2><p>把未来任务拖入右侧，安排到今天</p></div></div>
          <div className="module-header-actions"><button type="button" className="quiet-button" onClick={() => openFeishuDestination("https://applink.feishu.cn/client/todo/create")}><Plus size={14} />新建任务</button><IconButton label="关闭任务规划池" onClick={requestClose}><X size={18} /></IconButton></div>
        </header>
        <div className={`task-planner-notice ${personalAccess && coverageComplete !== false ? "is-synced" : "is-local"}`}><span>{!personalAccess ? "本地测试模式" : coverageComplete === false ? "部分任务待同步" : "飞书任务已同步"}</span>{!personalAccess ? "尚未连接飞书，当前看不到你的真实任务清单。" : coverageComplete === false ? "已保留成功读取的任务，重新连接后会再次补齐参与任务。" : "负责人、创建者和关注人的未完成任务会自动合并；完成与恢复写回飞书，今日池安排保存在本机。"}{(!personalAccess || coverageComplete === false) && <button type="button" className="text-button" onClick={onAuthorize}>{personalAccess ? "重新连接" : "连接飞书"}</button>}</div>
        <div className="task-planner-body">
          <section className="task-planner-column task-backlog-column">
            <header><div><span>全部未完成</span><strong>{unfinished.length}</strong></div><small>含今天及未来任务</small></header>
            <div className="task-planner-list">
              {unfinished.map((task) => {
                const inToday = taskIsToday(task, prefs[task.id]);
                return <article className={`planner-task-card ${inToday ? "is-in-today" : ""} ${draggedId === task.id && dragSource === "backlog" ? "is-item-dragging" : ""}`} key={task.id}>
                  <div className="planner-task-main">{inToday ? <span className="planner-task-drag-placeholder"><GripVertical size={14} /></span> : <button type="button" className="planner-task-drag-handle" draggable aria-label={`拖动${task.title}到今日待办池`} title="拖入今日待办" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-item", task.id); installDragPreview(event, event.currentTarget.closest(".planner-task-card")); setDraggedId(task.id); setDragSource("backlog"); }} onDragEnd={clearTaskDrag}><GripVertical size={14} /></button>}<div><strong>{task.title}</strong><span>{taskDueCopy(task, true)}</span></div></div>
                  {inToday ? <span className="planner-status"><Check size={11} />今日</span> : <button type="button" className="planner-add-button" onClick={() => addToToday(task.id)}><ChevronRight size={13} />加入今日</button>}
                </article>;
              })}
              {!unfinished.length && <div className="empty-copy"><CheckCircle2 size={22} /><strong>没有未完成任务</strong></div>}
            </div>
          </section>
          <section className={`task-planner-column task-today-column ${poolActive ? "is-drop-active" : ""}`} onDragOver={(event) => { if (!draggedId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setPoolActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPoolActive(false); }} onDrop={(event) => { event.preventDefault(); const taskId = draggedId || event.dataTransfer.getData("application/x-liufeng-item"); if (dragSource === "today" && todayTasks.length) reorderToday(taskId, todayTasks[todayTasks.length - 1].id, true); else addToToday(taskId); }}>
            <header><div><span>今日待办池</span><strong>{todayTasks.length}</strong></div><small>{formatShortDate(new Date())}</small></header>
            <div className="task-planner-list">
              {todayTasks.map((task, index) => {
                const pref = prefs[task.id] || {};
                const done = taskIsDone(task, pref);
                return <div className={`planner-task-shell ${draggedId === task.id && dragSource === "today" ? "is-item-dragging" : ""} ${reorderTarget?.targetId === task.id ? `is-item-target is-target-${reorderTarget.placeAfter ? "after" : "before"}` : ""}`} key={task.id} onDragOver={(event) => { if (dragSource !== "today" || !draggedId || draggedId === task.id) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setReorderTarget({ targetId: task.id, placeAfter: event.clientY > bounds.top + bounds.height / 2 }); }} onDrop={(event) => { if (dragSource !== "today") return; event.preventDefault(); event.stopPropagation(); reorderToday(draggedId, task.id, reorderTarget?.placeAfter); }}><article className={`planner-task-card planner-today-card ${done ? "is-done" : ""}`} key={`${task.id}-${pref.transitionId || 0}`}>
                  <button type="button" className="planner-task-drag-handle" draggable aria-label={`拖动排序${task.title}`} title="拖动排序" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-item", task.id); installDragPreview(event, event.currentTarget.closest(".planner-task-shell")); setDraggedId(task.id); setDragSource("today"); }} onDragEnd={clearTaskDrag} onKeyDown={(event) => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; const targetIndex = index + (event.key === "ArrowDown" ? 1 : -1); if (targetIndex < 0 || targetIndex >= todayTasks.length) return; event.preventDefault(); reorderToday(task.id, todayTasks[targetIndex].id, event.key === "ArrowDown"); }}><GripVertical size={14} /></button>
                  <button className="task-check" disabled={pendingTaskIds.has(task.id)} onClick={() => void toggleTaskCompletion(task, done)} aria-label={done ? "恢复未完成" : "完成任务"}>{done && <Check size={13} />}</button>
                  <div><strong>{task.title}</strong><span>{taskDueCopy(task, true)}</span></div>
                  <IconButton label="移出今日待办池" onClick={() => patchTask(task.id, { inToday: false })}><X size={13} /></IconButton>
                </article></div>;
              })}
              {!todayTasks.length && <div className="task-pool-empty"><ListTodo size={23} /><strong>拖入今天要做的任务</strong><span>任务会出现在工作台的今日待办中</span></div>}
            </div>
          </section>
        </div>
        <span className="sr-only" aria-live="polite">{announcement}</span>
      </section>
    </div>
  );
}

function projectKindColor(kind, kindColors, fallback = "#918b84") {
  return toColorInput(kindColors?.[String(kind || "").trim()] || DEFAULT_PROJECT_KIND_COLORS[String(kind || "").trim()] || fallback);
}

function ProjectLinkDialog({ project, kindColors, onSave, onClose }) {
  const presets = window.LFTheme?.PRESET_COLORS || BOARD_COLOR_PRESETS;
  const [draft, setDraft] = useState(() => ({
    title: project?.title || "",
    url: project?.url || "",
    kind: project?.kind || "自定义",
    kindColor: projectKindColor(project?.kind || "自定义", kindColors, project?.kindColor),
    projectName: project?.projectName || "",
    projectColor: project?.projectColor || "#70b78e",
  }));
  const [error, setError] = useState("");
  const panelRef = useRef(null);
  const { closing, requestClose } = useDialogClose(onClose);
  useModalFocus(panelRef);
  const resolvedColor = toColorInput(draft.projectColor);
  const resolvedKindColor = toColorInput(draft.kindColor);
  function submit(event) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.url.trim() || !draft.kind.trim()) {
      setError("请填写显示名称、链接地址和文件类型");
      return;
    }
    onSave({
      ...project,
      id: project?.id || id(),
      title: draft.title.trim(),
      url: draft.url.trim(),
      kind: draft.kind.trim(),
      kindColor: resolvedKindColor,
      projectName: draft.projectName.trim(),
      projectColor: resolvedColor,
    }, resolvedKindColor);
    requestClose();
  }
  return createPortal(<div className={`dialog-backdrop feature-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={panelRef} className="dialog-card feature-dialog project-link-dialog" role="dialog" aria-modal="true" aria-labelledby="project-link-heading" tabIndex="-1">
      <form className="dialog-shell" onSubmit={submit}>
        <header className="feature-dialog-header"><div><span className="dialog-eyebrow">近期项目</span><h2 id="project-link-heading">{project ? "编辑挂载项目" : "挂载新项目"}</h2></div><IconButton label="关闭项目设置" className="dialog-close" onClick={requestClose}><X size={18} /></IconButton></header>
        <p className="feature-dialog-copy">保存常用飞书文档或网页入口，并分别配置文件类型与所属项目标签。</p>
        <div className="project-link-fields">
          <label><span>显示名称<i>必填</i></span><input autoFocus value={draft.title} onChange={(event) => { setDraft((current) => ({ ...current, title: event.target.value })); setError(""); }} placeholder="例如：项目简报" /></label>
          <label><span>链接地址<i>必填</i></span><input type="url" value={draft.url} onChange={(event) => { setDraft((current) => ({ ...current, url: event.target.value })); setError(""); }} placeholder="粘贴飞书文档或网页链接" /></label>
          <label><span>文件类型<i>必填</i></span><input value={draft.kind} maxLength={20} onChange={(event) => { const kind = event.target.value; setDraft((current) => ({ ...current, kind, kindColor: projectKindColor(kind, kindColors, current.kindColor) })); setError(""); }} placeholder="例如：文档、多维表格" /></label>
          <div className="project-tag-color project-kind-color"><span>文件类型标签颜色</span><div className="project-tag-preview project-kind-preview" style={{ "--project-color": resolvedKindColor }}>{draft.kind.trim() || "文件类型"}</div><div className="project-tag-presets" aria-label="文件类型标签颜色">{presets.map((preset) => <button type="button" key={preset} className={resolvedKindColor.toLowerCase() === preset.toLowerCase() ? "is-active" : ""} style={{ "--swatch": preset }} onClick={() => setDraft((current) => ({ ...current, kindColor: preset }))} aria-label={`文件类型设为 ${preset}`}>{resolvedKindColor.toLowerCase() === preset.toLowerCase() && <Check size={10} />}</button>)}<label title="自定义文件类型颜色"><Palette size={14} /><input type="color" value={resolvedKindColor} onChange={(event) => setDraft((current) => ({ ...current, kindColor: event.target.value }))} aria-label="自定义文件类型标签颜色" /></label></div></div>
          <label><span>所属项目<small>选填</small></span><input value={draft.projectName} onChange={(event) => setDraft((current) => ({ ...current, projectName: event.target.value }))} placeholder="设置后显示为彩色标签" /></label>
          <div className={`project-tag-color ${draft.projectName.trim() ? "" : "is-disabled"}`}><span>项目标签颜色</span><div className="project-tag-preview" style={{ "--project-color": resolvedColor }}>{draft.projectName.trim() || "项目标签预览"}</div><div className="project-tag-presets" aria-label="项目标签颜色">{presets.map((preset) => <button type="button" key={preset} className={resolvedColor.toLowerCase() === preset.toLowerCase() ? "is-active" : ""} style={{ "--swatch": preset }} onClick={() => setDraft((current) => ({ ...current, projectColor: preset }))} aria-label={`项目标签设为 ${preset}`}>{resolvedColor.toLowerCase() === preset.toLowerCase() && <Check size={10} />}</button>)}<label title="自定义颜色"><Palette size={14} /><input type="color" value={resolvedColor} onChange={(event) => setDraft((current) => ({ ...current, projectColor: event.target.value }))} aria-label="自定义项目标签颜色" /></label></div></div>
        </div>
        <footer className="dialog-actions"><span className="project-link-error" role="alert">{error}</span><button type="button" className="quiet-button" onClick={requestClose}>取消</button><button type="submit" className="primary-action"><Link2 size={14} />{project ? "保存" : "挂载"}</button></footer>
      </form>
    </section>
  </div>, document.body);
}

function ProjectsModule({
  projects,
  setProjects,
  kindColors,
  setKindColors,
  query,
  editing,
  color,
  layoutLocked,
  knowledgeSpaces,
  knowledgeSelectedIds,
  setKnowledgeSelectedIds,
  knowledgeStyles,
  setKnowledgeStyles,
  knowledgeLoading,
  knowledgeError,
  knowledgeRequiresAuthorization,
  onKnowledgeOpen,
  onKnowledgeAuthorize,
}) {
  const [editingProject, setEditingProject] = useState(null);
  const [editingSpace, setEditingSpace] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [knowledgeDragState, setKnowledgeDragState] = useState(null);
  const [splitPercent, setSplitPercent] = useStoredState(STORAGE.projectsSplit, 70);
  const [removingId, setRemovingId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const removalTimer = useRef(null);
  const workspaceRef = useRef(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = projects.filter((project) => [project.title, project.kind, project.projectName].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)));
  const selectedKnowledge = (knowledgeSelectedIds || []).map((spaceId) => (knowledgeSpaces || []).find((space) => space.id === spaceId)).filter(Boolean);
  useEffect(() => () => clearTimeout(removalTimer.current), []);
  function save(project, kindColor) {
    setProjects((current) => current.some((item) => item.id === project.id) ? current.map((item) => item.id === project.id ? project : item) : [...current, project]);
    setKindColors((current) => ({ ...DEFAULT_PROJECT_KIND_COLORS, ...current, [project.kind]: kindColor }));
  }
  function reorder(sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const commit = () => flushSync(() => setProjects((current) => {
      const source = current.find((item) => item.id === sourceId);
      if (!source) return current;
      const next = current.filter((item) => item.id !== sourceId);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      if (targetIndex < 0) return current;
      next.splice(targetIndex + (placeAfter ? 1 : 0), 0, source);
      return next;
    }));
    if (typeof document.startViewTransition === "function") document.startViewTransition(commit);
    else commit();
    setDragState(null);
    setAnnouncement("近期项目顺序已更新");
  }
  function reorderKnowledge(sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const commit = () => flushSync(() => setKnowledgeSelectedIds((current) => {
      const source = (Array.isArray(current) ? current : []).find((spaceId) => spaceId === sourceId);
      if (!source) return current;
      const next = current.filter((spaceId) => spaceId !== sourceId);
      const targetIndex = next.indexOf(targetId);
      if (targetIndex < 0) return current;
      next.splice(targetIndex + (placeAfter ? 1 : 0), 0, source);
      return next;
    }));
    if (typeof document.startViewTransition === "function") document.startViewTransition(commit);
    else commit();
    setKnowledgeDragState(null);
    setAnnouncement("知识库顺序已更新");
  }
  function startSplitResize(event) {
    if (layoutLocked || !workspaceRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const workspace = workspaceRef.current;
    const bounds = workspace.getBoundingClientRect();
    const splitterWidth = 7;
    const available = Math.max(1, bounds.width - splitterWidth);
    const minimumLeft = Math.min(190, Math.max(142, available * .44));
    const minimumRight = Math.min(150, Math.max(104, available * .25));
    const move = (moveEvent) => {
      const nextLeft = Math.max(minimumLeft, Math.min(available - minimumRight, moveEvent.clientX - bounds.left));
      setSplitPercent(Math.round((nextLeft / available) * 1000) / 10);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      document.body.classList.remove("is-resizing-projects");
    };
    document.body.classList.add("is-resizing-projects");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }
  function remove(projectId) {
    if (removingId) return;
    setRemovingId(projectId);
    clearTimeout(removalTimer.current);
    removalTimer.current = setTimeout(() => {
      setProjects((current) => current.filter((item) => item.id !== projectId));
      setRemovingId(null);
      setAnnouncement("项目已从工作台移除");
    }, 260);
  }
  return (
    <ModuleCard icon={FileText} title="近期项目" meta={`${filtered.length} 项`} accent="amber" color={color} editing={editing} className="projects-card" action={<div className="module-header-actions"><IconButton label="挂载项目" onClick={() => { setEditingProject(null); setDialogOpen(true); }}><Plus size={15} /></IconButton><IconButton label="展开知识库" onClick={onKnowledgeOpen}><Maximize2 size={15} /></IconButton></div>}>
      <div className={`projects-knowledge-workspace ${layoutLocked ? "is-split-locked" : ""}`} ref={workspaceRef} style={{ "--projects-pane-left": `calc(${Math.max(44, Math.min(78, Number(splitPercent) || 70))}% - 3.5px)` }}>
        <section className="projects-pane" aria-label="近期项目列表">
          <div className="row-list project-list">
            {filtered.map((project, index) => <div className={`project-row-shell ${removingId === project.id ? "is-removing" : ""} ${dragState?.sourceId === project.id ? "is-item-dragging" : ""} ${dragState?.targetId === project.id ? `is-item-target is-target-${dragState.placeAfter ? "after" : "before"}` : ""}`} style={{ viewTransitionName: `project-${String(project.id).replace(/[^a-zA-Z0-9_-]/g, "-")}` }} key={project.id} onDragOver={(event) => { if (!dragState?.sourceId || dragState.sourceId === project.id) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setDragState((current) => ({ ...current, targetId: project.id, placeAfter: event.clientY > bounds.top + bounds.height / 2 })); }} onDrop={(event) => { event.preventDefault(); reorder(dragState?.sourceId || event.dataTransfer.getData("application/x-liufeng-project"), project.id, dragState?.placeAfter); }}><div className="project-row"><button type="button" className="project-row-drag-handle" draggable={removingId !== project.id} aria-label={`拖动排序${project.title}`} title="拖动排序" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-project", project.id); installDragPreview(event, event.currentTarget.closest(".project-row-shell")); setDragState({ sourceId: project.id, targetId: null, placeAfter: false }); }} onDragEnd={() => setDragState(null)} onKeyDown={(event) => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; const targetIndex = index + (event.key === "ArrowDown" ? 1 : -1); if (targetIndex < 0 || targetIndex >= filtered.length) return; event.preventDefault(); reorder(project.id, filtered[targetIndex].id, event.key === "ArrowDown"); }}><GripVertical size={14} /></button><a className="project-row-link" href={project.url} target="_blank" rel="noreferrer"><strong>{project.title}</strong></a><div className="project-row-meta"><span className="project-kind-tag" style={{ "--project-kind-color": projectKindColor(project.kind, kindColors, project.kindColor) }}>{project.kind || "自定义"}</span>{project.projectName && <i className="project-name-tag" style={{ "--project-color": toColorInput(project.projectColor || "#70b78e") }}>{project.projectName}</i>}</div><div className="row-actions"><IconButton label="设置项目" onClick={() => { setEditingProject(project); setDialogOpen(true); }}><Settings2 size={13} /></IconButton><IconButton label="移除" onClick={() => remove(project.id)}><Trash2 size={13} /></IconButton></div></div></div>)}
            {filtered.length === 0 && <div className="empty-copy compact"><FileText size={20} /><strong>{query ? "没有匹配的项目" : "还没有挂载项目"}</strong></div>}
          </div>
        </section>
        <button type="button" className="project-pane-splitter" disabled={layoutLocked} onPointerDown={startSplitResize} aria-label={layoutLocked ? "布局已锁定" : "拖动调整近期项目与知识库宽度"} title={layoutLocked ? "解锁布局后可调整宽度" : "拖动调整左右宽度"}><i /></button>
        <aside className="project-knowledge-pane" aria-label="知识库快捷入口">
          <div className="knowledge-compact-list">
            {selectedKnowledge.map((space, index) => <KnowledgeSpaceRow key={space.id} compact draggable space={space} style={knowledgeStyleFor(space, knowledgeStyles)} target={knowledgeDragState?.targetId === space.id} targetPosition={knowledgeDragState?.placeAfter ? "after" : "before"} onEdit={setEditingSpace} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-wiki", space.id); installDragPreview(event, event.currentTarget.closest(".knowledge-space-row")); setKnowledgeDragState({ sourceId: space.id, targetId: null, placeAfter: false }); }} onDragEnd={() => setKnowledgeDragState(null)} onDragOver={(event) => { if (!knowledgeDragState?.sourceId || knowledgeDragState.sourceId === space.id) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setKnowledgeDragState((current) => ({ ...current, targetId: space.id, placeAfter: event.clientY > bounds.top + bounds.height / 2 })); }} onDrop={(event) => { event.preventDefault(); reorderKnowledge(knowledgeDragState?.sourceId || event.dataTransfer.getData("application/x-liufeng-wiki"), space.id, knowledgeDragState?.placeAfter); }} onKeyDown={(event) => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; const targetIndex = index + (event.key === "ArrowDown" ? 1 : -1); if (targetIndex < 0 || targetIndex >= selectedKnowledge.length) return; event.preventDefault(); reorderKnowledge(space.id, selectedKnowledge[targetIndex].id, event.key === "ArrowDown"); }} />)}
            {!selectedKnowledge.length && !knowledgeLoading && <div className="empty-copy compact"><Library size={18} /><strong>{knowledgeRequiresAuthorization ? "连接知识库" : knowledgeError || "还没有固定知识库"}</strong>{knowledgeRequiresAuthorization && <button type="button" className="quiet-button" onClick={onKnowledgeAuthorize}><KeyRound size={13} />授权</button>}</div>}
            {knowledgeLoading && <div className="empty-copy compact"><RefreshCw className="is-spinning" size={17} /><strong>读取中</strong></div>}
          </div>
        </aside>
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
      {dialogOpen && <ProjectLinkDialog project={editingProject} kindColors={kindColors} onSave={save} onClose={() => { setDialogOpen(false); setEditingProject(null); }} />}
      {editingSpace && <KnowledgeStyleDialog space={editingSpace} style={knowledgeStyleFor(editingSpace, knowledgeStyles)} onSave={(next) => setKnowledgeStyles((current) => ({ ...current, [editingSpace.id]: next }))} onClose={() => setEditingSpace(null)} />}
    </ModuleCard>
  );
}

function knowledgeStyleFor(space, styles) {
  const stored = styles?.[space.id] || {};
  return {
    color: toColorInput(stored.color || "#75a7f0"),
  };
}

function openKnowledgeSpace(space) {
  if (!space?.url) return;
  openFeishuDestination({ appLink: createDocsAppLink(space.url), webHref: space.url });
}

function KnowledgeStyleDialog({ space, style, onSave, onClose }) {
  const [draft, setDraft] = useState(style);
  const { closing, requestClose } = useDialogClose(onClose);
  const panelRef = useRef(null);
  useModalFocus(panelRef);
  return createPortal(<div className={`dialog-backdrop feature-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={panelRef} className="dialog-card feature-dialog knowledge-style-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-style-heading" tabIndex="-1" style={{ "--knowledge-color": draft.color }}>
      <div className="dialog-shell">
        <header className="feature-dialog-header"><div><span className="dialog-eyebrow">知识库快捷入口</span><h2 id="knowledge-style-heading">设置卡片样式</h2></div><IconButton label="关闭知识库样式" className="dialog-close" onClick={requestClose}><X size={18} /></IconButton></header>
        <p className="feature-dialog-copy">为“{space.name}”选择工作台标识色。</p>
        <div className="knowledge-style-body">
          <div className="knowledge-style-section"><div className="knowledge-style-label"><strong>卡片颜色</strong><span>16 种预设</span></div><div className="knowledge-color-grid">{SETTINGS_COLOR_PRESETS.map((preset) => <button key={preset} type="button" className={draft.color.toLowerCase() === preset ? "is-active" : ""} style={{ "--swatch": preset }} aria-label={`使用颜色 ${preset}`} onClick={() => setDraft((current) => ({ ...current, color: preset }))}>{draft.color.toLowerCase() === preset && <Check size={12} />}</button>)}</div></div>
          <div className="knowledge-style-preview"><Library size={17} /><span><strong>{space.name}</strong><small>{space.description || "飞书知识库"}</small></span><Settings2 size={14} /></div>
        </div>
        <footer className="dialog-actions"><button type="button" className="quiet-button" onClick={requestClose}>取消</button><button type="button" className="primary-action" onClick={() => { onSave(draft); requestClose(); }}><Check size={14} />完成</button></footer>
      </div>
    </section>
  </div>, document.body);
}

function KnowledgeSpaceRow({ space, style, compact = false, onEdit, onRemove, draggable = false, onDragStart, onDragEnd, onDragOver, onDrop, onKeyDown, target = false, targetPosition = "before" }) {
  return <article className={`knowledge-space-row ${compact ? "is-compact" : ""} ${draggable ? "is-draggable" : ""} ${target ? `is-drop-target is-target-${targetPosition}` : ""}`} style={{ "--knowledge-color": style.color, viewTransitionName: compact ? `knowledge-${String(space.id).replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined }} onDragOver={onDragOver || (onDrop ? (event) => event.preventDefault() : undefined)} onDrop={onDrop}>
    {draggable && <button type="button" className="knowledge-drag-handle" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onKeyDown={onKeyDown} aria-label={`拖动排序${space.name}`} title="拖动排序"><GripVertical size={14} /></button>}
    <button type="button" className="knowledge-space-open" onClick={() => openKnowledgeSpace(space)} title={`在飞书中打开 ${space.name}`}><Library size={compact ? 16 : 17} /><span><strong>{space.name}</strong><small>{space.description || "飞书知识库"}</small></span></button>
    <div className="knowledge-row-actions"><IconButton label={`设置 ${space.name}`} onClick={() => onEdit(space)}><Settings2 size={13} /></IconButton>{onRemove && <IconButton label={`从展示池移除 ${space.name}`} onClick={() => onRemove(space.id)}><X size={13} /></IconButton>}</div>
  </article>;
}

function KnowledgePlannerDialog({ spaces, selectedIds, setSelectedIds, styles, setStyles, loading, error, requiresAuthorization, onRefresh, onAuthorize, onClose }) {
  const [draggedId, setDraggedId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [poolActive, setPoolActive] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const { closing, requestClose } = useDialogClose(onClose);
  const panelRef = useRef(null);
  useModalFocus(panelRef);
  const selected = selectedIds.map((spaceId) => spaces.find((space) => space.id === spaceId)).filter(Boolean);

  function add(spaceId) {
    setSelectedIds((current) => [...new Set([...(Array.isArray(current) ? current : []), spaceId])]);
    setDraggedId(null);
    setPoolActive(false);
  }
  function remove(spaceId) {
    setSelectedIds((current) => (Array.isArray(current) ? current : []).filter((itemId) => itemId !== spaceId));
  }
  function reorder(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setSelectedIds((current) => {
      const next = (Array.isArray(current) ? current : []).filter((itemId) => itemId !== sourceId);
      const index = next.indexOf(targetId);
      next.splice(index < 0 ? next.length : index, 0, sourceId);
      return next;
    });
    setDraggedId(null);
    setDropTarget(null);
  }
  return createPortal(<div className={`dialog-backdrop feature-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={panelRef} className="dialog-card knowledge-planner-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-planner-heading" tabIndex="-1">
      <header className="dialog-header"><div className="dialog-title"><Library size={18} /><div><h2 id="knowledge-planner-heading">知识库展示池</h2><p>从全部知识库拖入右侧，固定到工作台</p></div></div><div className="module-header-actions"><IconButton label="刷新知识库" className={loading ? "is-spinning" : ""} onClick={onRefresh}><RefreshCw size={15} /></IconButton><IconButton label="关闭知识库展示池" onClick={requestClose}><X size={18} /></IconButton></div></header>
      {requiresAuthorization && <div className="task-planner-notice"><span>需要授权</span>读取你的知识空间后，才能建立快捷展示池。<button type="button" onClick={onAuthorize}>连接知识库</button></div>}
      <div className="knowledge-planner-body">
        <section className="knowledge-planner-column"><header><div><span>全部知识库</span><strong>{spaces.length}</strong></div><small>飞书中可访问的知识空间</small></header><div className="knowledge-planner-list">{spaces.map((space) => { const inPool = selectedIds.includes(space.id); return <article className={`knowledge-catalog-row ${draggedId === space.id ? "is-item-dragging" : ""}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-wiki", space.id); installDragPreview(event, event.currentTarget); setDraggedId(space.id); }} onDragEnd={() => { setDraggedId(null); setPoolActive(false); }} key={space.id}><GripVertical size={14} /><button type="button" onClick={() => openKnowledgeSpace(space)}><strong>{space.name}</strong><span>{space.description || "知识空间"}</span></button>{inPool ? <span className="planner-status"><Check size={11} />已固定</span> : <button type="button" className="planner-add-button" onClick={() => add(space.id)}><ChevronRight size={13} />固定</button>}</article>; })}{!spaces.length && <div className="empty-copy"><Library size={22} /><strong>{loading ? "正在读取知识库" : error || "没有可显示的知识库"}</strong></div>}</div></section>
        <section className={`knowledge-planner-column knowledge-pool-column ${poolActive ? "is-drop-active" : ""}`} onDragOver={(event) => { if (!draggedId) return; event.preventDefault(); setPoolActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPoolActive(false); }} onDrop={(event) => { event.preventDefault(); add(draggedId || event.dataTransfer.getData("application/x-liufeng-wiki")); }}><header><div><span>工作台展示</span><strong>{selected.length}</strong></div><small>拖动可调整顺序</small></header><div className="knowledge-planner-list">{selected.map((space) => <KnowledgeSpaceRow key={space.id} space={space} style={knowledgeStyleFor(space, styles)} draggable target={dropTarget === space.id} onEdit={setEditingSpace} onRemove={remove} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-wiki", space.id); installDragPreview(event, event.currentTarget.closest(".knowledge-space-row")); setDraggedId(space.id); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); reorder(draggedId || event.dataTransfer.getData("application/x-liufeng-wiki"), space.id); }} />)}{!selected.length && <div className="knowledge-pool-empty"><Library size={22} /><strong>把知识库拖到这里</strong><span>固定后会显示在工作台组件中</span></div>}</div></section>
      </div>
      {editingSpace && <KnowledgeStyleDialog space={editingSpace} style={knowledgeStyleFor(editingSpace, styles)} onSave={(next) => setStyles((current) => ({ ...current, [editingSpace.id]: next }))} onClose={() => setEditingSpace(null)} />}
    </section>
  </div>, document.body);
}

async function noteImageClipboardBlob(blob) {
  if (blob.type === "image/png") return blob;
  if (typeof createImageBitmap !== "function") throw new Error("当前浏览器暂不支持复制这种图片格式");
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片复制组件不可用");
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("图片转换失败，请重试");
    return png;
  } finally {
    bitmap.close?.();
  }
}

function NotesModule({ editing, color }) {
  const [notes, setNotes] = useStoredState(STORAGE.notes, () => [{ id: id(), title: "随手记", text: "", color: "mint", imageCount: 0, updatedAt: new Date().toISOString() }]);
  const [sidebarWidth, setSidebarWidth] = useStoredState(STORAGE.notesSidebar, 220);
  const [activeId, setActiveId] = useState(() => notes[0]?.id || null);
  const [noteImages, setNoteImages] = useState([]);
  const [imageStatus, setImageStatus] = useState({ tone: "", message: "" });
  const [previewImageId, setPreviewImageId] = useState(null);
  const [savingImages, setSavingImages] = useState(false);
  const [copyingImageId, setCopyingImageId] = useState(null);
  const [copiedImageId, setCopiedImageId] = useState(null);
  const workspaceRef = useRef(null);
  const titleInputRef = useRef(null);
  const noteTextRef = useRef(null);
  const noteContentRef = useRef(null);
  const active = notes.find((note) => note.id === activeId) || notes[0];
  const imagePreviews = useMemo(() => noteImages.map((image) => ({ ...image, url: URL.createObjectURL(image.blob) })), [noteImages]);
  const previewImage = imagePreviews.find((image) => image.id === previewImageId) || null;

  useEffect(() => {
    if (!active && notes.length) setActiveId(notes[0].id);
  }, [notes.length, activeId]);

  useEffect(() => () => imagePreviews.forEach((image) => URL.revokeObjectURL(image.url)), [imagePreviews]);

  const resizeNoteText = useCallback(() => {
    const textarea = noteTextRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(104, textarea.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    const content = noteContentRef.current;
    const frame = requestAnimationFrame(resizeNoteText);
    const observer = content && typeof ResizeObserver === "function" ? new ResizeObserver(resizeNoteText) : null;
    if (content) observer?.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [active?.id, resizeNoteText]);

  useEffect(() => {
    resizeNoteText();
  }, [active?.text, imagePreviews.length, resizeNoteText]);

  useEffect(() => {
    let cancelled = false;
    setPreviewImageId(null);
    setCopiedImageId(null);
    setImageStatus({ tone: "", message: "" });
    if (!active?.id) {
      setNoteImages([]);
      return () => { cancelled = true; };
    }
    listNoteImages(active.id).then((images) => {
      if (cancelled) return;
      setNoteImages(images);
      setNotes((current) => {
        let changed = false;
        const next = current.map((note) => {
          if (note.id !== active.id || Number(note.imageCount || 0) === images.length) return note;
          changed = true;
          return { ...note, imageCount: images.length };
        });
        return changed ? next : current;
      });
    }).catch((error) => {
      if (!cancelled) setImageStatus({ tone: "error", message: error.message || "图片读取失败" });
    });
    return () => { cancelled = true; };
  }, [active?.id, setNotes]);

  function add() {
    const note = { id: id(), title: `便签 ${notes.length + 1}`, text: "", color: NOTE_COLORS[notes.length % NOTE_COLORS.length], imageCount: 0, updatedAt: new Date().toISOString() };
    setNotes((current) => [...current, note]);
    setActiveId(note.id);
  }

  function patch(patchValue) {
    if (!active) return;
    setNotes((current) => current.map((note) => note.id === active.id ? { ...note, ...patchValue, updatedAt: new Date().toISOString() } : note));
  }

  function setNoteColor(nextColor) {
    if (!active || active.color === nextColor || !NOTE_COLORS.includes(nextColor)) return;
    setNotes((current) => current.map((note) => note.id === active.id ? { ...note, color: nextColor, updatedAt: new Date().toISOString() } : note));
  }

  function holdNotePointer(event) {
    event.stopPropagation();
    if (event.pointerType === "mouse") event.preventDefault();
  }

  function startSidebarResize(event) {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = Number(sidebarWidth) || 220;
    const bounds = workspace.getBoundingClientRect();
    const minimum = 88;
    const maximum = Math.max(minimum, Math.min(420, bounds.width - 220));
    const move = (moveEvent) => setSidebarWidth(Math.round(Math.max(minimum, Math.min(maximum, startWidth + moveEvent.clientX - startX))));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      document.body.classList.remove("is-resizing-notes");
    };
    document.body.classList.add("is-resizing-notes");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function remove(noteId) {
    deleteAllNoteImages(noteId).catch(() => {});
    setNotes((current) => {
      const index = current.findIndex((note) => note.id === noteId);
      const next = current.filter((note) => note.id !== noteId);
      if (noteId === activeId) setActiveId(next[Math.max(0, index - 1)]?.id || null);
      return next;
    });
  }

  function syncImageCount(noteId, count) {
    setNotes((current) => current.map((note) => note.id === noteId ? { ...note, imageCount: count, updatedAt: new Date().toISOString() } : note));
  }

  async function storeClipboardImages(images) {
    if (!active || !images.length || savingImages) return;
    setSavingImages(true);
    setImageStatus({ tone: "info", message: "正在保存图片…" });
    try {
      await saveNoteImages(active.id, images);
      const nextImages = await listNoteImages(active.id);
      setNoteImages(nextImages);
      syncImageCount(active.id, nextImages.length);
      setImageStatus({ tone: "success", message: `已保存 ${images.length} 张图片，仅存放在当前设备` });
    } catch (error) {
      setImageStatus({ tone: "error", message: error.message || "图片保存失败，请重试" });
    } finally {
      setSavingImages(false);
    }
  }

  function handleNotePaste(event) {
    const images = extractClipboardImages(event.clipboardData);
    if (!images.length) return;
    event.preventDefault();
    void storeClipboardImages(images);
  }

  async function pasteImagesFromClipboard() {
    if (!navigator.clipboard?.read) {
      noteTextRef.current?.focus();
      setImageStatus({ tone: "info", message: "请在便签正文中按 Ctrl+V 粘贴图片" });
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      const images = [];
      for (const item of clipboardItems) {
        for (const type of item.types.filter((value) => value.startsWith("image/"))) images.push(await item.getType(type));
      }
      if (!images.length) {
        setImageStatus({ tone: "error", message: "剪贴板中没有图片" });
        return;
      }
      await storeClipboardImages(images);
    } catch (error) {
      noteTextRef.current?.focus();
      setImageStatus({ tone: "info", message: error?.name === "NotAllowedError" ? "浏览器未允许读取，请在正文中按 Ctrl+V 粘贴图片" : "请在便签正文中按 Ctrl+V 粘贴图片" });
    }
  }

  async function removeImage(image) {
    if (!window.confirm("删除这张本地图片？删除后无法恢复。")) return;
    try {
      await deleteNoteImage(image.id);
      const nextImages = noteImages.filter((item) => item.id !== image.id);
      setNoteImages(nextImages);
      setPreviewImageId(null);
      syncImageCount(image.noteId, nextImages.length);
      setImageStatus({ tone: "success", message: "图片已删除" });
    } catch (error) {
      setImageStatus({ tone: "error", message: error.message || "图片删除失败" });
    }
  }

  async function copyImage(image) {
    if (!image || copyingImageId) return;
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
      setImageStatus({ tone: "error", message: "当前浏览器不支持复制图片，请升级浏览器后重试" });
      return;
    }
    setCopyingImageId(image.id);
    setImageStatus({ tone: "info", message: "正在复制图片…" });
    try {
      const blob = await noteImageClipboardBlob(image.blob);
      await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
      setCopiedImageId(image.id);
      setImageStatus({ tone: "success", message: "图片已复制，可直接粘贴到飞书、微信或其他应用" });
    } catch (error) {
      setImageStatus({ tone: "error", message: error?.name === "NotAllowedError" ? "浏览器未允许写入剪贴板，请点击复制按钮后重试" : (error.message || "图片复制失败，请重试") });
    } finally {
      setCopyingImageId(null);
    }
  }

  return (
    <ModuleCard icon={StickyNote} title="便签" meta={`${notes.length} 条`} accent="violet" color={color} editing={editing} action={<IconButton label="新建便签" onClick={add}><Plus size={15} /></IconButton>}>
      <div className={`notes-workspace ${sidebarWidth < 126 ? "is-sidebar-compact" : ""}`} ref={workspaceRef} style={{ "--notes-sidebar-width": `${sidebarWidth}px` }} onPointerDown={(event) => event.stopPropagation()}>
        <div className="note-tabs" role="tablist" aria-label="便签列表">
          {notes.map((note) => <button type="button" key={note.id} role="tab" aria-selected={active?.id === note.id} className={`note-tab note-${note.color} ${active?.id === note.id ? "is-active" : ""}`} onPointerDown={holdNotePointer} onClick={() => { if (note.id !== activeId) setActiveId(note.id); }} onDoubleClick={() => { setActiveId(note.id); requestAnimationFrame(() => { titleInputRef.current?.focus({ preventScroll: true }); titleInputRef.current?.select(); }); }} title="双击重命名"><i /><span>{note.title || "未命名便签"}</span><small>{note.text.length} 字{note.imageCount ? ` · ${note.imageCount} 图` : ""}</small></button>)}
        </div>
        <button type="button" className="note-splitter" onPointerDown={startSidebarResize} aria-label="拖动调整便签侧边栏宽度" title="拖动调整便签侧边栏宽度"><i /></button>
        {active ? <div className={`note-editor note-${active.color}`}>
          <div className="note-editor-toolbar"><label className="note-title-field" title="重命名便签"><Pencil size={13} /><input ref={titleInputRef} value={active.title} maxLength={60} placeholder="未命名便签" onChange={(event) => patch({ title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label="便签标题" /></label><div className="note-swatches" aria-label="便签颜色">{NOTE_COLORS.map((noteColor) => <button type="button" key={noteColor} className={`note-color note-${noteColor} ${active.color === noteColor ? "is-active" : ""}`} onPointerDown={holdNotePointer} onClick={() => setNoteColor(noteColor)} aria-label={`使用${NOTE_COLOR_LABELS[noteColor]}`} title={NOTE_COLOR_LABELS[noteColor]}><Check size={9} /></button>)}</div><IconButton label="粘贴剪贴板图片" onClick={pasteImagesFromClipboard} disabled={savingImages}><ClipboardPaste size={14} /></IconButton><IconButton label="删除便签" onClick={() => remove(active.id)}><Trash2 size={14} /></IconButton></div>
          <div ref={noteContentRef} className={`note-editor-content ${imagePreviews.length ? "has-images" : ""}`} tabIndex="0" aria-label="便签正文与图片，可上下滚动">
            <textarea ref={noteTextRef} value={active.text} onChange={(event) => patch({ text: event.target.value })} onPaste={handleNotePaste} placeholder="随手记点什么；也可以按 Ctrl+V 粘贴截图…" aria-label="便签内容与图片粘贴区域" />
            {imagePreviews.length > 0 && <section className="note-image-shelf" aria-label="便签图片"><div className="note-image-shelf-heading"><span><ImagePlus size={12} />图片粘贴板</span><small>{imagePreviews.length} 张 · 与正文一起上下滚动</small></div><div className="note-image-list" aria-label="便签图片列表">{imagePreviews.map((image) => <article key={image.id} className="note-image-item"><button type="button" className="note-image-preview-button" onClick={() => setPreviewImageId(image.id)} aria-label={`查看图片 ${image.name}`} title="点击放大"><img src={image.url} alt="" /><span><ZoomIn size={13} /></span></button><button type="button" className={`note-image-copy ${copiedImageId === image.id ? "is-copied" : ""}`} onClick={() => void copyImage(image)} disabled={copyingImageId === image.id} aria-label={`复制图片 ${image.name}`} title="复制图片"><Copy size={11} /><span>{copyingImageId === image.id ? "复制中" : copiedImageId === image.id ? "已复制" : "复制"}</span></button><button type="button" className="note-image-remove" onClick={() => void removeImage(image)} aria-label={`删除图片 ${image.name}`} title="删除图片"><X size={12} /></button></article>)}</div></section>}
          </div>
          <div className={`note-status ${imageStatus.tone ? `is-${imageStatus.tone}` : ""}`} role={imageStatus.tone === "error" ? "alert" : "status"}>{imageStatus.message ? (imageStatus.tone === "error" ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />) : <CheckCircle2 size={12} />}{imageStatus.message || `已自动保存 · ${formatTime(new Date(active.updatedAt))} · Ctrl+V 可存图片`}</div>
        </div> : <div className="empty-copy"><NotebookPen size={21} /><strong>新建一条便签开始记录</strong><button className="quiet-button" onClick={add}><Plus size={14} />新建便签</button></div>}
      </div>
      {previewImage && <NoteImagePreviewDialog image={previewImage} copying={copyingImageId === previewImage.id} copied={copiedImageId === previewImage.id} onCopy={() => void copyImage(previewImage)} onClose={() => setPreviewImageId(null)} onDelete={() => void removeImage(previewImage)} />}
    </ModuleCard>
  );
}

function NoteImagePreviewDialog({ image, copying, copied, onCopy, onClose, onDelete }) {
  const panelRef = useRef(null);
  const { closing, requestClose } = useDialogClose(onClose);
  useModalFocus(panelRef);
  return createPortal(<div className={`dialog-backdrop feature-backdrop note-image-preview-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={panelRef} className="dialog-card note-image-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="note-image-preview-heading" tabIndex="-1">
      <header className="dialog-header"><div className="dialog-title"><ImagePlus size={16} /><div><h2 id="note-image-preview-heading">{image.name}</h2><p>{formatNoteImageSize(image.size)} · 图片仅保存在当前设备</p></div></div><IconButton label="关闭图片预览" onClick={requestClose}><X size={17} /></IconButton></header>
      <div className="note-image-preview-canvas"><img src={image.url} alt={image.name} /></div>
      <footer className="note-image-preview-actions"><button type="button" className="quiet-button is-destructive" onClick={onDelete}><Trash2 size={14} />删除图片</button><button type="button" className="quiet-button" onClick={requestClose}>关闭</button><button type="button" className={`primary-action ${copied ? "is-copied" : ""}`} onClick={onCopy} disabled={copying}><Copy size={14} />{copying ? "复制中…" : copied ? "已复制" : "复制图片"}</button></footer>
    </section>
  </div>, document.body);
}

function TimerModule({ editing, color }) {
  const [mode, setMode] = useState("pomodoro");
  const [presets, setPresets] = useStoredState(STORAGE.timer, { focus: 25, short: 5, long: 15 });
  const [preset, setPreset] = useState("focus");
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 10, seconds: 0 });
  const [duration, setDuration] = useState(presets.focus * 60);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);
  const elapsedRef = useRef(0);
  const stopwatch = mode === "stopwatch";
  const shown = stopwatch ? elapsed : Math.max(0, duration - elapsed);
  const progress = stopwatch ? (elapsed % 60) / 60 : duration ? Math.min(1, elapsed / duration) : 0;

  useEffect(() => {
    if (!running) return undefined;
    startRef.current = Date.now();
    elapsedRef.current = elapsed;
    const tick = setInterval(() => {
      const next = elapsedRef.current + Math.floor((Date.now() - startRef.current) / 1000);
      if (!stopwatch && next >= duration) {
        setElapsed(duration);
        setRunning(false);
      } else setElapsed(next);
    }, 250);
    return () => clearInterval(tick);
  }, [running, duration, stopwatch, mode]);

  function reset() {
    setRunning(false);
    setElapsed(0);
  }

  function chooseMode(nextMode) {
    setMode(nextMode);
    reset();
    if (nextMode === "pomodoro") setDuration(presets[preset] * 60);
    if (nextMode === "countdown") setDuration(countdown.hours * 3600 + countdown.minutes * 60 + countdown.seconds);
    if (nextMode === "stopwatch") setDuration(0);
  }

  function choosePreset(key) {
    setPreset(key);
    setDuration(presets[key] * 60);
    reset();
  }

  function updateCountdown(key, value) {
    const max = key === "hours" ? 23 : 59;
    const next = { ...countdown, [key]: Math.max(0, Math.min(max, value)) };
    setCountdown(next);
    setDuration(next.hours * 3600 + next.minutes * 60 + next.seconds);
    reset();
  }

  function updatePreset(key, value) {
    const safe = Math.max(1, Math.min(240, Number(value) || 1));
    setPresets((current) => ({ ...current, [key]: safe }));
    if (mode === "pomodoro" && preset === key) {
      setDuration(safe * 60);
      reset();
    }
  }

  const modeSwitch = <div className="mode-switch timer-header-switch" role="tablist" aria-label="计时模式">{[["pomodoro", "番茄"], ["countdown", "倒计时"], ["stopwatch", "正计时"]].map(([key, label]) => <button type="button" role="tab" aria-selected={mode === key} key={key} className={mode === key ? "is-active" : ""} onClick={() => chooseMode(key)}>{label}</button>)}</div>;
  const timerText = formatTimer(shown);

  return (
    <ModuleCard icon={AlarmClock} title="计时器" accent="teal" color={color} editing={editing} action={modeSwitch} className="timer-card">
      <div className="timer-workspace">
        <div className="timer-display" style={{ "--timer-progress": `${progress * 360}deg` }}><div className="timer-readout"><span>{mode === "pomodoro" ? "专注" : mode === "countdown" ? "剩余" : "已进行"}</span><strong className={timerText.length > 5 ? "is-long-time" : ""}>{timerText}</strong></div></div>
        <div className={`timer-controls timer-controls-${mode}`}>
          <div className={`timer-settings-slot timer-settings-${mode}`}>
            {mode === "pomodoro" && <div className="preset-row">{[["focus", "专注"], ["short", "短休"], ["long", "长休"]].map(([key, label]) => <TimeStepper key={key} label={label} value={presets[key]} max={240} pad={false} active={preset === key} onSelect={() => choosePreset(key)} onChange={(value) => updatePreset(key, value)} />)}</div>}
            {mode === "countdown" && <div className="countdown-row"><TimeStepper label="时" value={countdown.hours} max={23} onChange={(value) => updateCountdown("hours", value)} /><TimeStepper label="分" value={countdown.minutes} max={59} onChange={(value) => updateCountdown("minutes", value)} /><TimeStepper label="秒" value={countdown.seconds} max={59} onChange={(value) => updateCountdown("seconds", value)} /></div>}
          </div>
          <div className="timer-actions"><button className="primary-action" disabled={!stopwatch && duration <= 0} onClick={() => setRunning((value) => !value)}>{running ? <CirclePause size={17} /> : <CirclePlay size={17} />}{running ? "暂停" : "开始"}</button><IconButton label="重置计时" onClick={reset}><RotateCcw size={16} /></IconButton></div>
        </div>
      </div>
    </ModuleCard>
  );
}

function TimeStepper({ label, value, max, onChange, unit = "", pad = true, active = false, onSelect }) {
  const [editingValue, setEditingValue] = useState(false);
  const [draftValue, setDraftValue] = useState(String(value));
  const inputRef = useRef(null);
  const shownValue = pad ? String(value).padStart(2, "0") : String(value);
  useEffect(() => {
    if (!editingValue) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingValue]);
  function beginValueEdit(event) {
    event.preventDefault();
    event.stopPropagation();
    setDraftValue(String(value));
    setEditingValue(true);
  }
  function commitValueEdit() {
    const parsed = Number.parseInt(draftValue, 10);
    onChange(Math.max(0, Math.min(max, Number.isFinite(parsed) ? parsed : value)));
    setEditingValue(false);
  }
  return <div className={`time-stepper ${active ? "is-active" : ""}`}>{onSelect ? <button type="button" className="stepper-label" onClick={onSelect}>{label}</button> : <span className="stepper-label">{label}</span>}<IconButton label={`${label}加一`} className="stepper-control" onClick={() => onChange(value < max ? value + 1 : 0)}><Plus size={13} /></IconButton><div className={`stepper-value ${editingValue ? "is-editing" : ""}`} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} onClick={() => { if (!editingValue) onSelect?.(); }} onDoubleClick={beginValueEdit} onKeyDown={(event) => { if (editingValue) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(); } }} title="双击输入数字">{editingValue ? <input ref={inputRef} type="number" inputMode="numeric" min="0" max={max} value={draftValue} onChange={(event) => setDraftValue(event.target.value)} onBlur={commitValueEdit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitValueEdit(); } else if (event.key === "Escape") { event.preventDefault(); setEditingValue(false); } }} aria-label={`输入${label}数值`} /> : <><strong>{shownValue}</strong>{unit && <small>{unit}</small>}</>}</div><IconButton label={`${label}减一`} className="stepper-control" onClick={() => onChange(value > 0 ? value - 1 : max)}><Minus size={13} /></IconButton></div>;
}

function SettingsRange({ label, value, min, max, step = 1, suffix = "", onChange }) {
  const update = (next) => onChange(Math.max(min, Math.min(max, Number(next))));
  return <label className="settings-range"><span>{label} <strong>{value}{suffix}</strong></span><div><IconButton label={`${label}减小`} onClick={() => update(value - step)}><Minus size={12} /></IconButton><input type="range" min={min} max={max} step={step} value={value} onInput={(event) => update(event.currentTarget.value)} onChange={(event) => update(event.currentTarget.value)} aria-label={label} /><IconButton label={`${label}增大`} onClick={() => update(value + step)}><Plus size={12} /></IconButton></div></label>;
}

function useDialogClose(onClose) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  function requestClose() {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(() => closeRef.current(), 210);
  }
  useEffect(() => {
    const keyHandler = (event) => { if (event.key === "Escape") requestClose(); };
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      clearTimeout(timer.current);
    };
  }, []);
  return { closing, requestClose };
}

function useModalFocus(panelRef) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const firstControl = panelRef.current?.querySelector("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex='0']");
      (firstControl || panelRef.current)?.focus();
    });
    const trapFocus = (event) => {
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")].filter((node) => !node.hidden);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, []);
}

function calendarRange(view, cursor) {
  if (view === "week") {
    const start = startOfWeek(cursor);
    return { start, end: addDays(start, 7) };
  }
  if (view === "month") {
    const start = startOfMonthGrid(cursor);
    return { start, end: addDays(start, 42) };
  }
  const start = addDays(cursor, 0);
  return { start, end: addDays(start, 1) };
}

function calendarHeading(view, cursor) {
  if (view === "month") return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`;
  if (view === "week") {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
  }
  return formatDate(cursor);
}

function shiftCalendarCursor(cursor, view, direction) {
  if (view === "month") return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
  return addDays(cursor, direction * (view === "week" ? 7 : 1));
}

function CalendarDateNavigator({ view, cursor, onChange, loading }) {
  const [displayMonth, setDisplayMonth] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimer = useRef(null);
  const openFrame = useRef(null);
  const popoverId = `calendar-nav-${React.useId().replaceAll(":", "")}`;
  useEffect(() => setDisplayMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor.getFullYear(), cursor.getMonth()]);
  function positionPopover() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const safe = 14;
    const width = Math.min(336, window.innerWidth - safe * 2);
    setPopoverStyle({ top: `${Math.max(safe, Math.min(rect.bottom + 8, window.innerHeight - 410))}px`, left: `${Math.min(Math.max(safe, rect.left), window.innerWidth - safe - width)}px`, width: `${width}px` });
  }
  function openPicker() {
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(openFrame.current);
    setDisplayMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    positionPopover();
    setMounted(true);
    openFrame.current = requestAnimationFrame(() => setOpen(true));
  }
  function closePicker({ restoreFocus = false } = {}) {
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(openFrame.current);
    setOpen(false);
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      if (restoreFocus) rootRef.current?.querySelector("button")?.focus();
    }, 150);
  }
  useEffect(() => {
    if (!mounted) return undefined;
    const outside = (event) => { if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) closePicker(); };
    const escape = (event) => { if (event.key === "Escape") { event.stopPropagation(); closePicker({ restoreFocus: true }); } };
    const reposition = () => positionPopover();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", reposition);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", escape); window.removeEventListener("resize", reposition); };
  }, [mounted]);
  useEffect(() => () => { clearTimeout(closeTimer.current); cancelAnimationFrame(openFrame.current); }, []);
  const gridStart = startOfWeek(new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const selectedKey = dateKey(cursor);
  const todayKey = dateKey(new Date());
  const selectedWeekStart = dateKey(startOfWeek(cursor));
  const selectedWeekEnd = dateKey(addDays(startOfWeek(cursor), 6));
  function chooseDate(day) {
    onChange(day);
    closePicker({ restoreFocus: true });
  }
  return <div ref={rootRef} className="calendar-date-navigator">
    <button type="button" className="calendar-date-heading" aria-haspopup="dialog" aria-controls={popoverId} aria-expanded={open} onClick={() => open ? closePicker({ restoreFocus: true }) : openPicker()}><span><strong>{calendarHeading(view, cursor)}</strong></span><ChevronDown size={16} />{loading && <RefreshCw className="is-spinning" size={14} />}</button>
    {mounted && createPortal(<div ref={popoverRef} id={popoverId} className={`calendar-date-popover ${open ? "is-open" : ""}`} style={popoverStyle} role="dialog" aria-modal="false" aria-label="快速选择日期">
      <header><strong>{displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月</strong><div><IconButton label="上个月" onClick={() => setDisplayMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}><ChevronLeft size={17} /></IconButton><IconButton label="下个月" onClick={() => setDisplayMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}><ChevronRight size={17} /></IconButton></div></header>
      <div className="calendar-date-weekdays" aria-hidden="true">{["日", "一", "二", "三", "四", "五", "六"].map((label) => <span key={label}>{label}</span>)}</div>
      <div className={`calendar-date-grid is-${view}`}>{days.map((day) => { const key = dateKey(day); const inWeek = view === "week" && key >= selectedWeekStart && key <= selectedWeekEnd; return <button type="button" key={key} className={`${day.getMonth() !== displayMonth.getMonth() ? "is-outside" : ""} ${key === selectedKey ? "is-selected" : ""} ${key === todayKey ? "is-today" : ""} ${inWeek ? "is-in-range" : ""} ${key === selectedWeekStart ? "is-range-start" : ""} ${key === selectedWeekEnd ? "is-range-end" : ""}`} aria-label={`${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日`} aria-pressed={key === selectedKey} onClick={() => chooseDate(day)}><span>{day.getDate()}</span></button>; })}</div>
      <footer><button type="button" onClick={() => chooseDate(new Date())}>今天</button></footer>
    </div>, document.body)}
  </div>;
}

function CalendarDayView({ cursor, events, calendars, selected, onSelect, onRsvp, rsvpPending, replyAvailable }) {
  const dayEvents = eventsForDay(events, cursor);
  const fallbackCalendars = [...new Map(dayEvents.map((event) => [event.calendarId || event.calendar || "default", { id: event.calendarId || event.calendar || "default", name: event.calendar || "我的日历", color: event.calendarColor || "#70b78e" }])).values()];
  const sourceLanes = calendars.length ? calendars : fallbackCalendars.length ? fallbackCalendars : [{ id: "default", name: "我的日历", color: "#70b78e" }];
  const lanes = [...sourceLanes].sort((left, right) => {
    const leftPinned = left.name === "游皓宇" ? 0 : 1;
    const rightPinned = right.name === "游皓宇" ? 0 : 1;
    return leftPinned - rightPinned;
  });
  const calendarKey = (event) => event.calendarId || event.calendar || "default";
  const eventsForCalendar = (calendar) => dayEvents.filter((event) => calendarKey(event) === calendar.id || (!event.calendarId && event.calendar === calendar.name));
  const now = new Date();
  const nowTop = (now.getHours() * 60 + now.getMinutes() - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60) * TIMELINE_HEIGHT;
  return <div className="calendar-body view-day">
    <div className="calendar-day-column">
      <div className="calendar-day-scroll"><div className="calendar-day-surface" style={{ "--calendar-count": lanes.length }}>
        <div className="calendar-day-calendars"><span>GMT+8</span>{lanes.map((calendar) => <div key={calendar.id} style={{ "--calendar-color": calendar.color }}><i /><strong>{calendar.name}</strong></div>)}</div>
        <div className="calendar-day-all-day"><span>全天</span>{lanes.map((calendar) => <div key={calendar.id}>{eventsForCalendar(calendar).filter((event) => event.allDay).map((event) => <button key={eventKey(event)} className={eventRsvpClass(event)} style={eventColorStyle(event)} onClick={() => onSelect(event)}>{event.title}</button>)}</div>)}</div>
        <div className="timeline calendar-day-timeline" style={{ height: TIMELINE_HEIGHT }}>{Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => <div className="timeline-hour" key={index} style={{ top: index * HOUR_HEIGHT }}><span>{String(index + START_HOUR).padStart(2, "0")}:00</span><i /></div>)}{sameDay(cursor, now) && nowTop >= 0 && nowTop <= TIMELINE_HEIGHT && <div className="timeline-now" style={{ top: nowTop }}><span>{formatTime(now)}</span><i /></div>}<div className="calendar-day-lanes">{lanes.map((calendar) => <div className="calendar-day-lane" key={calendar.id}>{layoutEvents(eventsForCalendar(calendar), cursor).map((event) => <button key={eventKey(event)} className={`schedule-event ${eventRsvpClass(event)} ${eventKey(selected || {}) === eventKey(event) ? "is-selected" : ""}`} style={eventStyle(event)} onClick={() => onSelect(event)}><strong>{event.title}</strong><span>{formatTime(new Date(event.start))}–{formatTime(new Date(event.end))}</span>{event.location && <small>{event.location}</small>}</button>)}</div>)}</div></div>
      </div></div>
    </div>
    <EventDetail event={selected} onRsvp={onRsvp} pending={rsvpPending} replyAvailable={replyAvailable} />
  </div>;
}

function CalendarWeekView({ cursor, events, selected, onSelect, onRsvp, rsvpPending, replyAvailable }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index));
  const now = new Date();
  const nowTop = (now.getHours() * 60 + now.getMinutes() - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60) * TIMELINE_HEIGHT;
  return <div className="calendar-range-view">
    {selected && <CalendarSelection event={selected} onRsvp={onRsvp} pending={rsvpPending} replyAvailable={replyAvailable} />}
    <div className="calendar-week-frame">
      <div className="calendar-week-scroll"><div className="calendar-week-content"><div className="calendar-week-header"><span>GMT+8</span>{days.map((day) => <div key={dateKey(day)} className={sameDay(day, now) ? "is-today" : ""}><b>{new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day)}</b><strong>{day.getDate()}</strong><div>{eventsForDay(events, day).filter((event) => event.allDay).slice(0, 1).map((event) => <button key={eventKey(event)} className={eventRsvpClass(event)} style={eventColorStyle(event)} onClick={() => onSelect(event)}>{event.title}</button>)}</div></div>)}</div><div className="calendar-week-canvas" style={{ height: TIMELINE_HEIGHT }}>{Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => <div className="calendar-week-hour" key={index} style={{ top: index * HOUR_HEIGHT }}><span>{String(index + START_HOUR).padStart(2, "0")}:00</span><i /></div>)}<div className="calendar-week-lanes">{days.map((day) => <div className="calendar-week-lane" key={dateKey(day)}>{sameDay(day, now) && nowTop >= 0 && nowTop <= TIMELINE_HEIGHT && <div className="calendar-week-now" style={{ top: nowTop }} />}{layoutEvents(eventsForDay(events, day), day).map((event) => <button key={eventKey(event)} className={`schedule-event ${eventRsvpClass(event)} ${eventKey(selected || {}) === eventKey(event) ? "is-selected" : ""}`} style={eventStyle(event)} onClick={() => onSelect(event)}><strong>{event.title}</strong><span>{formatTime(new Date(event.start))}–{formatTime(new Date(event.end))}</span></button>)}</div>)}</div></div></div></div>
    </div>
  </div>;
}

function monthBarBounds(event) {
  const startValue = new Date(event.start);
  const endValue = new Date(event.end);
  if (Number.isNaN(startValue.getTime()) || Number.isNaN(endValue.getTime())) return null;
  const start = new Date(startValue.getFullYear(), startValue.getMonth(), startValue.getDate());
  const crossesDay = dateKey(startValue) !== dateKey(endValue);
  if (!event.allDay && !crossesDay) return null;
  let end = event.allDay ? new Date(endValue.getFullYear(), endValue.getMonth(), endValue.getDate()) : addDays(endValue, 1);
  if (end <= start) end = addDays(start, 1);
  return { start, end };
}

function monthBarSegments(events, weekStart) {
  const weekEnd = addDays(weekStart, 7);
  const segments = events.map((event) => ({ event, bounds: monthBarBounds(event) })).filter(({ bounds }) => bounds && bounds.start < weekEnd && bounds.end > weekStart).sort((a, b) => a.bounds.start - b.bounds.start || b.bounds.end - a.bounds.end);
  const laneEnds = [];
  return segments.map(({ event, bounds }) => {
    const start = bounds.start < weekStart ? weekStart : bounds.start;
    const end = bounds.end > weekEnd ? weekEnd : bounds.end;
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    return { event, lane, startColumn: Math.round((start - weekStart) / 86400000) + 1, endColumn: Math.round((end - weekStart) / 86400000) + 1 };
  });
}

function CalendarMonthView({ cursor, events, selected, onSelect, onRsvp, rsvpPending, replyAvailable }) {
  const days = Array.from({ length: 42 }, (_, index) => addDays(startOfMonthGrid(cursor), index));
  const now = new Date();
  const weeks = Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  return <div className="calendar-range-view calendar-month-view">
    {selected && <CalendarSelection event={selected} onRsvp={onRsvp} pending={rsvpPending} replyAvailable={replyAvailable} />}
    <div className="calendar-month-weekdays">{["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((label) => <span key={label}>{label}</span>)}</div>
    <div className="calendar-month-grid">{weeks.map((week) => {
      const bars = monthBarSegments(events, week[0]);
      const visibleBars = bars.filter((bar) => bar.lane < 2);
      const barKeys = new Set(bars.map((bar) => eventKey(bar.event)));
      const barRows = Math.min(2, Math.max(0, ...visibleBars.map((bar) => bar.lane + 1)));
      return <div className="calendar-month-week" key={dateKey(week[0])} style={{ "--month-bar-rows": barRows }}><div className="calendar-month-bars">{visibleBars.map((bar) => <button type="button" key={`${eventKey(bar.event)}-${dateKey(week[0])}`} className={`${eventRsvpClass(bar.event)} ${eventKey(selected || {}) === eventKey(bar.event) ? "is-selected" : ""}`} style={{ ...eventColorStyle(bar.event), gridColumn: `${bar.startColumn} / ${bar.endColumn}`, gridRow: bar.lane + 1 }} onClick={() => onSelect(bar.event)}><span>{bar.event.title}</span></button>)}</div>{week.map((day) => {
        const dayEvents = eventsForDay(events, day).filter((event) => !barKeys.has(eventKey(event))).sort((a, b) => new Date(a.start) - new Date(b.start));
        const hiddenBars = bars.filter((bar) => bar.lane >= 2 && bar.startColumn <= day.getDay() + 1 && bar.endColumn > day.getDay() + 1).length;
        const muted = day.getMonth() !== cursor.getMonth();
        const hiddenCount = Math.max(0, dayEvents.length - 4) + hiddenBars;
        return <section key={dateKey(day)} className={`${muted ? "is-outside" : ""} ${sameDay(day, now) ? "is-today" : ""}`}><header><time>{day.getDate()}</time></header><div>{dayEvents.slice(0, 4).map((event) => <button key={eventKey(event)} className={`${eventRsvpClass(event)} ${eventKey(selected || {}) === eventKey(event) ? "is-selected" : ""}`} style={eventColorStyle(event)} onClick={() => onSelect(event)}><i /><b>{formatTime(new Date(event.start))}</b><span>{event.title}</span></button>)}{hiddenCount > 0 && <small>还有 {hiddenCount} 项</small>}</div></section>;
      })}</div>;
    })}</div>
  </div>;
}

function CalendarSelection({ event, onRsvp, pending, replyAvailable }) {
  return <div className="calendar-selection"><div className="calendar-selection-copy"><strong>{event.title}</strong><span>{formatDate(new Date(event.start))} · {event.allDay ? "全天" : `${formatTime(new Date(event.start))}–${formatTime(new Date(event.end))}`}</span></div><EventRsvpControls event={event} onChange={onRsvp} pending={pending} replyAvailable={replyAvailable} compact />{event.url && <a href={event.url} target="_blank" rel="noreferrer">在飞书中打开<ExternalLink size={13} /></a>}</div>;
}

function EventRsvpControls({ event, onChange, pending, replyAvailable, compact = false }) {
  if (!event) return null;
  const active = event.rsvpStatus;
  const disabled = pending || !replyAvailable || !event.canReply;
  const options = [
    { id: "accept", label: "已接受" },
    { id: "decline", label: "拒绝" },
    { id: "tentative", label: "待定" },
  ];
  return <div className={`event-rsvp-controls ${compact ? "is-compact" : ""}`} aria-label="日程参与状态">{options.map((option) => <button key={option.id} type="button" className={`is-${option.id} ${active === option.id ? "is-active" : ""}`} disabled={disabled} aria-pressed={active === option.id} onClick={() => onChange(event, option.id)}>{pending && active === option.id ? <RefreshCw className="is-spinning" size={13} /> : null}{option.label}</button>)}{!compact && !event.canReply && <small>{event.isOrganizer ? "你是该日程的组织者" : "该日程暂不支持回复"}</small>}{!compact && event.canReply && !replyAvailable && <small>重新授权后可直接切换参与状态</small>}</div>;
}

function EventDetail({ event, onRsvp, pending, replyAvailable }) {
  return <aside className="event-detail">{event ? <><span className="detail-kicker">日程详情</span><h3>{event.title}</h3><dl><dt>时间</dt><dd>{formatDate(new Date(event.start))}<br />{event.allDay ? "全天" : `${formatTime(new Date(event.start))}–${formatTime(new Date(event.end))}`}</dd><dt>日历</dt><dd><i className="calendar-color-dot" style={eventColorStyle(event)} />{event.calendar}</dd>{event.location && <><dt>地点</dt><dd>{event.location}</dd></>}{event.description && <><dt>说明</dt><dd>{event.description}</dd></>}</dl><EventRsvpControls event={event} onChange={onRsvp} pending={pending} replyAvailable={replyAvailable} />{event.url && <a className="primary-action" href={event.url} target="_blank" rel="noreferrer">在飞书中打开<ExternalLink size={14} /></a>}</> : <div className="empty-copy"><CalendarDays size={22} /><strong>选择一个日程</strong><span>这里会显示完整信息</span></div>}</aside>;
}

function CalendarSettingsPanel({ calendars, visibility, onChange, onClose }) {
  const groups = [
    { id: "managed", label: "我管理的" },
    { id: "subscribed", label: "我订阅的" },
  ];
  const visibleCount = calendars.filter((calendar) => visibility[calendar.id] !== false).length;
  return <div className="calendar-settings-panel" role="dialog" aria-label="显示的日历范围">
    <header><div><strong>显示日历</strong><span>{visibleCount} / {calendars.length}</span></div><IconButton label="关闭日历设置" onClick={onClose}><X size={15} /></IconButton></header>
    <div className="calendar-settings-list">{groups.map((group) => {
      const items = calendars.filter((calendar) => calendar.group === group.id);
      if (!items.length) return null;
      return <section key={group.id}><h3><ChevronDown size={13} />{group.label}</h3>{items.map((calendar) => <label key={calendar.id} style={{ "--calendar-color": calendar.color }}><input type="checkbox" checked={visibility[calendar.id] !== false} onChange={(event) => onChange({ ...visibility, [calendar.id]: event.target.checked })} /><i><Check size={11} /></i><span>{calendar.name}</span></label>)}</section>;
    })}{calendars.length === 0 && <div className="calendar-settings-empty">正在读取飞书日历…</div>}</div>
  </div>;
}

function CalendarDialog({ initialDate, initialEvent, source, onEventChange, onClose }) {
  const [cursor, setCursor] = useState(() => new Date(initialDate));
  const [view, setView] = useState("day");
  const [events, setEvents] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [calendarSource, setCalendarSource] = useState(source || {});
  const [calendarVisibility, setCalendarVisibility] = useStoredState(STORAGE.calendarVisibility, {});
  const [selected, setSelected] = useState(initialEvent || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rsvpPending, setRsvpPending] = useState("");
  const settingsRef = useRef(null);
  const { closing, requestClose } = useDialogClose(onClose);
  const range = useMemo(() => calendarRange(view, cursor), [view, dateKey(cursor)]);
  const visibleEvents = useMemo(() => events.filter((event) => calendarVisibility[event.calendarId] !== false), [events, calendarVisibility]);
  const visibleCalendars = useMemo(() => calendars.filter((calendar) => calendarVisibility[calendar.id] !== false), [calendars, calendarVisibility]);
  const replyAvailable = Boolean(calendarSource?.calendarReplyAvailable || source?.calendarReplyAvailable);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnOutside = (event) => {
      if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (selected && calendarVisibility[selected.calendarId] === false) setSelected(null);
  }, [calendarVisibility, selected]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/calendar?start=${dateKey(range.start)}&end=${dateKey(range.end)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("日历读取失败")))
      .then((payload) => { if (active) {
        const nextEvents = payload.events || [];
        setEvents(nextEvents);
        setCalendars(payload.calendars || []);
        setCalendarSource(payload.source || source || {});
        setSelected((current) => current ? nextEvents.find((event) => eventKey(event) === eventKey(current)) || null : null);
        setError("");
      } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view, dateKey(range.start), dateKey(range.end)]);

  async function updateRsvp(event, rsvpStatus) {
    if (!event?.calendarId || !event?.id || rsvpPending) return;
    const key = eventKey(event);
    const previousStatus = event.rsvpStatus;
    const patchEvent = (item, status) => eventKey(item) === key ? { ...item, rsvpStatus: status } : item;
    setRsvpPending(key);
    setEvents((current) => current.map((item) => patchEvent(item, rsvpStatus)));
    setSelected((current) => current ? patchEvent(current, rsvpStatus) : current);
    try {
      const response = await fetch("/api/calendar/events/rsvp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: event.calendarId, eventId: event.id, rsvpStatus }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "日程参与状态更新失败");
      onEventChange?.({ ...event, rsvpStatus });
      setError("");
    } catch (requestError) {
      setEvents((current) => current.map((item) => patchEvent(item, previousStatus)));
      setSelected((current) => current ? patchEvent(current, previousStatus) : current);
      setError(requestError.message || "日程参与状态更新失败");
    } finally {
      setRsvpPending("");
    }
  }

  return (
    <div className={`dialog-backdrop ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className="dialog-card calendar-dialog" role="dialog" aria-modal="true" aria-label="日程视图">
        <header className="dialog-header calendar-dialog-header"><div className="calendar-nav"><CalendarDateNavigator view={view} cursor={cursor} loading={loading} onChange={(date) => { setCursor(date); setSelected(null); }} /><div className="calendar-range-controls"><IconButton label="上一个日期范围" onClick={() => setCursor((date) => shiftCalendarCursor(date, view, -1))}><ChevronLeft size={17} /></IconButton><IconButton label="下一个日期范围" onClick={() => setCursor((date) => shiftCalendarCursor(date, view, 1))}><ChevronRight size={17} /></IconButton></div><button className="quiet-button calendar-today-button" onClick={() => setCursor(new Date())}>今天</button></div><div className="calendar-header-controls"><div className="calendar-view-switch" role="tablist" aria-label="日程视图"><button type="button" role="tab" aria-selected={view === "day"} className={view === "day" ? "is-active" : ""} onClick={() => setView("day")}>日</button><button type="button" role="tab" aria-selected={view === "week"} className={view === "week" ? "is-active" : ""} onClick={() => setView("week")}>周</button><button type="button" role="tab" aria-selected={view === "month"} className={view === "month" ? "is-active" : ""} onClick={() => setView("month")}>月</button></div><div className="calendar-settings-anchor" ref={settingsRef}><IconButton label="选择显示日历" className={settingsOpen ? "is-active" : ""} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((current) => !current)}><Settings2 size={17} /></IconButton>{settingsOpen && <CalendarSettingsPanel calendars={calendars} visibility={calendarVisibility} onChange={setCalendarVisibility} onClose={() => setSettingsOpen(false)} />}</div><IconButton label="关闭日程视图" onClick={requestClose}><X size={18} /></IconButton></div></header>
        {!source?.personalAccess && <div className="dialog-notice"><KeyRound size={13} />当前授权只包含忙闲时间，个人授权后显示标题与地点。</div>}
        {source?.personalAccess && !replyAvailable && <div className="dialog-notice"><KeyRound size={13} />重新授权飞书后，可在详情中切换已接受、拒绝和待定。</div>}
        {error && <div className="dialog-notice is-error"><AlertCircle size={13} />{error}</div>}
        {view === "day" ? <CalendarDayView cursor={cursor} events={visibleEvents} calendars={visibleCalendars} selected={selected} onSelect={setSelected} onRsvp={updateRsvp} rsvpPending={rsvpPending} replyAvailable={replyAvailable} /> : view === "week" ? <CalendarWeekView cursor={cursor} events={visibleEvents} selected={selected} onSelect={setSelected} onRsvp={updateRsvp} rsvpPending={rsvpPending} replyAvailable={replyAvailable} /> : <CalendarMonthView cursor={cursor} events={visibleEvents} selected={selected} onSelect={setSelected} onRsvp={updateRsvp} rsvpPending={rsvpPending} replyAvailable={replyAvailable} />}
      </section>
    </div>
  );
}

export function AppearanceDialog({ appearance, controller, onChange, onClose }) {
  const [side, setSide] = useState(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState(null);
  const [locating, setLocating] = useState(false);
  const fileInput = useRef(null);
  const panelRef = useRef(null);
  const { closing, requestClose } = useDialogClose(onClose);
  useModalFocus(panelRef);
  useEffect(() => {
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => setVisible(true));
      panelRef.current.dataset.openFrame = String(second);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(Number(panelRef.current?.dataset.openFrame || 0));
    };
  }, []);
  const tokens = appearance.tokens[side];
  const profile = appearance.profiles[side];
  const sunTimes = window.LFTheme?.calculateSunTimes?.(new Date(), Number(appearance.location.latitude), Number(appearance.location.longitude));
  const solarSummary = sunTimes
    ? `${appearance.location.label || "当前位置"} · 日出 ${formatTime(sunTimes.sunrise)} · 日落 ${formatTime(sunTimes.sunset)} · 当前${document.documentElement.dataset.theme === "dark" ? "深色" : "浅色"}`
    : `${appearance.location.label || "当前位置"} · 暂时无法计算日出日落`;

  function patchRoot(patch, immediate = false) {
    onChange({ ...appearance, ...patch }, immediate);
  }
  function patchTokens(patch) {
    onChange({ ...appearance, tokens: { ...appearance.tokens, [side]: { ...tokens, ...patch } } });
  }
  function patchProfile(patch) {
    onChange({ ...appearance, profiles: { ...appearance.profiles, [side]: { ...profile, ...patch } } });
  }
  function patchFonts(patch) {
    patchProfile({ fonts: { ...profile.fonts, ...patch } });
  }
  async function importTheme(text) {
    if (!controller) return;
    try {
      const imported = await controller.importText(text, side);
      onChange(imported, true);
      setStatus({ type: "success", message: "外观配置已验证并导入，未知字段已忽略。" });
    } catch (error) {
      const raw = error.message || "";
      const message = raw.includes("No recognized") ? "未识别到有效的外观字段" : raw.includes("empty") ? "配置内容不能为空" : "配置格式无效";
      setStatus({ type: "error", message: `导入失败：${message}。` });
    }
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    setInput(text);
    await importTheme(text);
  }
  async function exportTheme() {
    if (!controller) return;
    await controller.setAppearance(appearance);
    const blob = new Blob([controller.exportText()], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "liufeng-workbench-appearance.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus({ type: "success", message: "外观配置已导出。" });
  }
  function locate() {
    if (!navigator.geolocation) {
      setStatus({ type: "error", message: "浏览器不支持位置读取，请手动填写坐标。" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      patchRoot({ location: { latitude: Number(coords.latitude.toFixed(4)), longitude: Number(coords.longitude.toFixed(4)), label: "当前位置" } }, true);
      setLocating(false);
      setStatus({ type: "success", message: "已保存当前位置，日出日落时间将在本地计算。" });
    }, () => {
      setLocating(false);
      setStatus({ type: "error", message: "未取得位置权限，请手动填写经纬度。" });
    }, { timeout: 8000 });
  }
  function resetSide() {
    const defaults = window.LFTheme.DEFAULT_APPEARANCE;
    onChange({ ...appearance, tokens: { ...appearance.tokens, [side]: clone(defaults.tokens[side]) }, profiles: { ...appearance.profiles, [side]: clone(defaults.profiles[side]) } }, true);
    setStatus({ type: "success", message: `已恢复${side === "light" ? "浅色" : "深色"}默认配置。` });
  }

  return (
    <div className={`appearance-backdrop ${visible ? "visible" : ""} ${closing ? "closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={panelRef} className="appearance-panel" role="dialog" aria-modal="true" aria-labelledby="appearance-heading" tabIndex="-1">
        <header className="appearance-panel-header"><div><span className="dialog-eyebrow">个人工作台设置</span><h2 id="appearance-heading">外观</h2></div><IconButton label="关闭外观设置" className="dialog-close" onClick={requestClose}><X size={18} /></IconButton></header>
        <div className="appearance-panel-body">
          <section className="settings-section"><div className="settings-copy"><h3>主题模式</h3><p>选择界面如何在浅色与深色外观间切换。</p></div><div className="theme-mode-grid">{THEME_MODES.map(({ id: modeId, label }) => <button type="button" key={modeId} className={appearance.themeMode === modeId ? "selected" : ""} onClick={() => patchRoot({ themeMode: modeId }, true)}><span className={`theme-preview ${modeId === "light" ? "light" : modeId === "dark" ? "dark" : modeId === "system" ? "split" : "solar"}`}><i /><b /></span><strong>{label}</strong></button>)}</div></section>

          <section className={`settings-section solar-section ${appearance.themeMode === "solar" ? "is-relevant" : ""}`}><div className="settings-copy"><h3>太阳时刻</h3><p>{solarSummary}</p></div><div className="solar-grid"><label><span>纬度</span><input type="number" min="-90" max="90" step="0.0001" value={appearance.location.latitude} onChange={(event) => patchRoot({ location: { ...appearance.location, latitude: event.target.value } })} /></label><label><span>经度</span><input type="number" min="-180" max="180" step="0.0001" value={appearance.location.longitude} onChange={(event) => patchRoot({ location: { ...appearance.location, longitude: event.target.value } })} /></label><button type="button" className="quiet-button" onClick={locate}><MapPin size={13} />{locating ? "定位中" : "使用当前位置"}</button></div><p className="settings-note">坐标只保存在当前浏览器，用于离线计算日出与日落时间。</p></section>

          <section className="settings-section"><div className="settings-heading settings-profile-heading"><div className="settings-copy"><h3>浅色 / 深色外观</h3><p>两套颜色和字体配置独立保存，切换页签不会覆盖另一侧。</p></div><div className="profile-switch" role="tablist" aria-label="编辑外观配置"><button type="button" role="tab" aria-selected={side === "light"} className={side === "light" ? "is-active" : ""} onClick={() => setSide("light")}><Sun size={13} />浅色</button><button type="button" role="tab" aria-selected={side === "dark"} className={side === "dark" ? "is-active" : ""} onClick={() => setSide("dark")}><Moon size={13} />深色</button></div></div><div className="color-field-grid">{COLOR_FIELDS.map(([key, label]) => <label key={`${side}-${key}`}><span>{label}</span><div><input type="color" value={toColorInput(tokens[key])} onChange={(event) => patchTokens({ [key]: event.target.value })} aria-label={`${label}取色器`} /><input key={tokens[key]} defaultValue={tokens[key]} onBlur={(event) => patchTokens({ [key]: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={`${label}颜色值`} /></div></label>)}</div><div className="font-grid"><label><span>界面字体</span><input value={profile.fonts.ui} placeholder={appearance.fontFamily} onChange={(event) => patchFonts({ ui: event.target.value })} /></label><label><span>代码字体</span><input value={profile.fonts.code} placeholder={appearance.codeFontFamily} onChange={(event) => patchFonts({ code: event.target.value })} /></label><label className="is-wide"><span>代码主题 ID</span><input value={profile.codeThemeId} placeholder="absolutely" onChange={(event) => patchProfile({ codeThemeId: event.target.value })} /></label></div><div className="appearance-profile-row"><SettingsRange label="对比度" value={profile.contrast} min={0} max={100} onChange={(value) => patchProfile({ contrast: value })} /><div className="settings-row"><div><strong>不透明窗口</strong><span>减少玻璃与透明效果</span></div><button type="button" className={`switch-control ${profile.opaqueWindows ? "is-on" : ""}`} role="switch" aria-checked={profile.opaqueWindows} onClick={() => patchProfile({ opaqueWindows: !profile.opaqueWindows })}><i /></button></div></div><button type="button" className="reset-link" onClick={resetSide}><RotateCcw size={13} />恢复当前模式默认值</button></section>

          <section className="settings-section compact-setting-section"><div className="settings-copy"><h3>界面密度</h3><p>控制卡片、列表与工具栏的内部留白。</p></div><div className="density-switch"><button type="button" className={appearance.density === "comfortable" ? "is-active" : ""} onClick={() => patchRoot({ density: "comfortable" }, true)}>舒适</button><button type="button" className={appearance.density === "compact" ? "is-active" : ""} onClick={() => patchRoot({ density: "compact" }, true)}>紧凑</button></div></section>
          <section className="settings-section compact-setting-section"><div className="settings-copy"><h3>界面字号</h3><p>所有界面文字同步缩放，控件尺寸保持稳定。</p></div><SettingsRange label="字号缩放" value={appearance.fontScale} min={85} max={130} step={5} suffix="%" onChange={(value) => patchRoot({ fontScale: value })} /></section>
          <section className="settings-section compact-setting-section"><div className="settings-copy"><h3>圆角</h3><p>统一调整卡片和控件的圆角层级。</p></div><SettingsRange label="圆角大小" value={appearance.radius} min={2} max={22} suffix="px" onChange={(value) => patchRoot({ radius: value })} /></section>

          <section className="settings-section"><div className="settings-copy"><h3>Codex 外观配置</h3><p>支持导入、导出与恢复配置；可识别 codex-theme-v1 前缀。</p></div><textarea className="theme-import" value={input} onChange={(event) => setInput(event.target.value)} placeholder={'粘贴 codex-theme-v1:{...} 或其他外观配置'} aria-label="外观配置文本" /><div className="import-actions"><button type="button" className="primary-action" onClick={() => importTheme(input)}><Upload size={14} />验证并导入</button><button type="button" className="quiet-button" onClick={() => fileInput.current?.click()}><FileText size={14} />选择文件</button><button type="button" className="quiet-button" onClick={exportTheme}><Download size={14} />导出配置</button><button type="button" className="quiet-button" onClick={() => { onChange(clone(window.LFTheme.DEFAULT_APPEARANCE), true); setStatus({ type: "success", message: "已恢复全部默认外观配置。" }); }}><RotateCcw size={14} />恢复默认</button><input ref={fileInput} type="file" accept=".json,.txt,.toml,application/json,text/plain" onChange={importFile} hidden /></div>{status && <div className={`settings-status is-${status.type}`} role="status">{status.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{status.message}</div>}</section>
        </div>
      </section>
    </div>
  );
}

function toColorInput(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color.slice(1).split("").map((part) => part + part).join("")}`;
  return "#d97757";
}
