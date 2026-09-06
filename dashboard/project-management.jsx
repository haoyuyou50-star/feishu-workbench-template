"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArrowDown, ArrowUp, ChevronRight, CircleAlert, ClipboardCheck, Flag, GripVertical, LayoutDashboard, Palette, Pencil, Plus, Search, Settings2, X } from "lucide-react";
import { AppearanceDialog, defaultWorkbenchAppearance, LFSelect, PageFooter } from "./main.jsx";
import ProjectRecordDialog, { blankRecord, formatDate, Progress } from "./project-record-dialog.jsx";
import { useCourseCardMotion } from "./course-motion.js";
import { PROJECT_STORAGE_KEY, TASK_STATES, loadProjectPrototype, persistProjectCommand, progressFor, overdue, todayKey, visibleTasks } from "./project-management-model.js";

const STATE_COLORS = { 待确认: "#75a7f0", 未开始: "#9aad68", 进行中: "#e6ad4f", 已完成: "#70b78e" };
const APPEARANCE_KEY = "liufeng-workbench.rebuild.appearance.v1";
function loadLocal() {
  try {
    const data = loadProjectPrototype(localStorage);
    if (!localStorage.getItem(PROJECT_STORAGE_KEY)) localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(data));
    return { data, error: "" };
  } catch (error) {
    return { data: { version: 1, revision: 0, projects: [], stages: [], tasks: [] }, error: "无法读取或保存本地原型。原数据未覆盖，请检查浏览器存储后重新载入。" + (error.message || "") };
  }
}
export default function ProjectManagement({ initialView = "project", initialArchived = false } = {}) {
  const [initial] = useState(loadLocal);
  const [data, setData] = useState(initial.data);
  const dataRef = useRef(data);
  const [notice, setNotice] = useState(initial.error);
  const [mode, setMode] = useState(initialView === "status" ? "status" : "project");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [archived, setArchived] = useState(initialArchived);
  const [dialog, setDialog] = useState(null);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null);
  const [ready, setReady] = useState(false);
  const [appearance, setAppearance] = useState(defaultWorkbenchAppearance);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [themeController, setThemeController] = useState(null);
  const [menu, setMenu] = useState("");
  const [today, setToday] = useState(todayKey);
  const theme = useRef(null), menuRef = useRef(null), menuTrigger = useRef(null), menuTimer = useRef(null), menuFrames = useRef([]), noticeTimer = useRef(null), boardRef = useRef(null);
  const activeProjects = data.projects.filter((p) => !p.archived);
  const filterProjects = archived ? (mode === "status" ? data.projects : data.projects.filter((p) => p.archived)) : activeProjects;
  const effectiveProjectFilter = filterProjects.some((p) => p.id === projectFilter) ? projectFilter : "";
  const tasks = visibleTasks(data, { projectId: effectiveProjectFilter, filter, query, today, archived });
  const matchingProjects = data.projects.filter((p) => p.archived === archived && (!effectiveProjectFilter || p.id === effectiveProjectFilter) && [p.name, p.type, p.goal, p.owner].join(" ").toLowerCase().includes(query.trim().toLowerCase()) && (filter === "all" || visibleTasks(data, { projectId: p.id, filter, today }).length > 0));
  const groups = TASK_STATES;
  const archivedCount = mode === "status" ? visibleTasks(data, { archived: true }).length : data.projects.filter((p) => p.archived).length;
  useCourseCardMotion(boardRef, JSON.stringify([data.revision, mode, query, filter, projectFilter, archived]));
  useEffect(() => {
    let alive = true;
    try { if (!localStorage.getItem(APPEARANCE_KEY)) localStorage.setItem(APPEARANCE_KEY, JSON.stringify(defaultWorkbenchAppearance())); } catch { /* Business-storage failures are surfaced separately. */ }
    const controller = window.LFTheme?.createThemeController({ storageKey: APPEARANCE_KEY, onApply: ({ appearance: next }) => { if (alive) setAppearance(next); } });
    theme.current = controller;
    const reveal = () => { if (alive) { setThemeController(controller || null); setReady(true); } };
    Promise.resolve(controller?.init()).then(reveal, reveal);
    const timer = setInterval(() => setToday(todayKey()), 60000);
    return () => { alive = false; controller?.destroy(); clearInterval(timer); clearTimeout(menuTimer.current); clearTimeout(noticeTimer.current); menuFrames.current.forEach(cancelAnimationFrame); };
  }, []);
  useEffect(() => {
    const changed = (event) => {
      if (event.key !== PROJECT_STORAGE_KEY) return;
      if (dialog) { setNotice("另一个窗口已更新数据；当前草稿保留，保存时会检查冲突。"); return; }
      try { const fresh = loadProjectPrototype(localStorage); dataRef.current = fresh; setData(fresh); setNotice("已载入另一个窗口的更新。"); } catch { setNotice("本地数据变化无法读取，已保留当前内容。"); }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [dialog]);
  function closeDialog() {
    setDialog(null);
    if (initial.error) return;
    try {
      const fresh = loadProjectPrototype(localStorage);
      if (fresh.revision !== dataRef.current.revision) { dataRef.current = fresh; setData(fresh); }
    } catch { setNotice("本地数据变化无法读取，已保留当前内容。"); }
  }
  const closeMenu = useCallback((after) => {
    if (!menu || menu === "closing") return;
    menuFrames.current.forEach(cancelAnimationFrame);
    setMenu("closing");
    menuTimer.current = setTimeout(() => { setMenu(""); menuTrigger.current?.focus({ preventScroll: true }); after?.(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150);
  }, [menu]);
  function openMenu() {
    clearTimeout(menuTimer.current);
    menuFrames.current.forEach(cancelAnimationFrame);
    setMenu("opening");
    menuFrames.current = [requestAnimationFrame(() => { menuFrames.current = [requestAnimationFrame(() => setMenu("open"))]; })];
  }
  useEffect(() => {
    if (!menu) return;
    const outside = (e) => { if (!menuRef.current?.contains(e.target)) closeMenu(); };
    const escape = (e) => { if (e.key === "Escape") closeMenu(); };
    document.addEventListener("pointerdown", outside); window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [menu, closeMenu]);
  function commit(command, defer = false) {
    if (initial.error) throw new Error("本地存储不可用，请先重新载入。草稿未丢弃。");
    const next = persistProjectCommand(localStorage, dataRef.current, command);
    const apply = () => {
      dataRef.current = next; setData(next); setNotice("已保存到本机");
      clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(""), 2800);
    };
    if (!defer) apply();
    return apply;
  }
  function mutate(command) { try { commit(command); } catch (e) { setNotice(e.message || "保存失败，未更改原数据。"); } }
  function create(entity, extra = {}) {
    const ownerProject = activeProjects.find((p) => p.id === effectiveProjectFilter)?.id || activeProjects[0]?.id || "";
    if (archived) { setArchived(false); setProjectFilter(""); setFilter("all"); }
    setDialog({ entity, record: { ...blankRecord(entity, ownerProject), ...extra }, edit: true });
  }
  function clearDrag() { setDrag(null); setDrop(null); }
  useEffect(() => {
    const cancel = (e) => { if (e.key === "Escape") clearDrag(); };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  function startDrag(event, entity, record) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-liufeng-item", record.id);
    const node = event.currentTarget.closest(".pm-card");
    if (node) {
      const preview = node.cloneNode(true);
      preview.removeAttribute("id"); preview.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
      preview.classList.add("course-drag-preview");
      document.body.appendChild(preview); event.dataTransfer.setDragImage(preview, 24, 20);
      setTimeout(() => preview.remove(), 0);
    }
    setDrag({ entity, id: record.id });
  }
  function dropRecord(event, group, targetId = null) {
    if (!drag) return;
    event.preventDefault(); event.stopPropagation();
    mutate({ type: "move", entity: drag.entity, id: drag.id, targetId, after: drop?.after || false, patch: drag.entity === "tasks" ? { status: group, ...(group === "已完成" ? { blocked: "" } : {}) } : {} });
    clearDrag();
  }
  function keyboardMove(event, record, records, group) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const entity = mode === "status" ? "tasks" : "projects";
    if (entity === "tasks" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const destination = groups[groups.indexOf(group) + (event.key === "ArrowRight" ? 1 : -1)];
      if (destination) mutate({ type: "move", entity, id: record.id, patch: { status: destination, ...(destination === "已完成" ? { blocked: "" } : {}) } });
    } else {
      const offset = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
      const target = records[records.findIndex((x) => x.id === record.id) + offset];
      if (target) mutate({ type: "move", entity, id: record.id, targetId: target.id, after: offset > 0 });
    }
  }
  function renderCard(record, records, group = "") {
    const isTask = mode === "status";
    const entity = isTask ? "tasks" : "projects";
    const project = isTask ? data.projects.find((p) => p.id === record.projectId) : record;
    const compact = isTask && record.status === "已完成";
    const progress = isTask ? null : progressFor(data, project.id);
    const handle = <button type="button" className="pm-drag-handle" draggable aria-label={`移动${record.name}，${isTask ? "上下排序，左右移动状态" : "方向键调整顺序"}`} title="拖动排序；方向键可移动" onDragStart={(e) => startDrag(e, entity, record)} onDragEnd={clearDrag} onKeyDown={(e) => keyboardMove(e, record, records, group)}><GripVertical size={15} /></button>;
    return <article className={`pm-card ${isTask ? "pm-task-card" : ""} ${compact ? "is-completed-compact" : ""} ${drag?.id === record.id ? "is-drag-source" : ""} ${drop?.id === record.id ? "is-drop-target" : ""} ${drop?.after ? "drop-after" : ""}`} key={record.id} data-course-motion-key={record.id} style={{ "--project-color": project.color }} onDragOver={(e) => {
      if (!drag || drag.entity !== entity || drag.id === record.id) return;
      e.preventDefault(); e.stopPropagation();
      const bounds = e.currentTarget.getBoundingClientRect();
      setDrop({ id: record.id, group, after: isTask ? e.clientY > bounds.top + bounds.height / 2 : e.clientX > bounds.left + bounds.width / 2 });
    }} onDrop={(e) => dropRecord(e, group, record.id)}>
      {compact ? <div className="pm-compact-handle">{handle}</div> : <div className="pm-card-top"><span className="pm-eyebrow">{isTask ? project.name : record.status}</span>{handle}</div>}
      <button type="button" className={`pm-card-open ${compact ? "pm-completed-summary" : ""}`} title={compact ? project.name + " · " + record.name : undefined} aria-label={`查看${record.name}`} onClick={() => setDialog({ entity, id: record.id, edit: false })}>
        {compact && <span className="pm-completed-project">{project.name}</span>}
        <h3>{record.name}</h3>
        {!compact && (isTask ? <><div className="pm-task-stage">{data.stages.find((s) => s.id === record.stageId)?.name || "独立任务"}{project.status === "已暂停" && " · 项目已暂停"}</div>{record.blocked && <p className="pm-blocked"><Flag size={12} />{record.blocked}</p>}<footer><span className={overdue(record, today) ? "pm-overdue" : ""}>{overdue(record, today) ? "已逾期 · " : ""}{record.deadline ? formatDate(record.deadline) : "未设截止"}</span><span>{record.owner || "未分配"}</span></footer></> : <><p className="pm-card-goal">{record.goal || "尚未填写目标与交付物"}</p><div className="pm-current-stage"><span>当前阶段</span><strong>{progress.currentStage?.name || (progress.stageTotal ? "阶段均已确认" : "未分阶段")}</strong></div><Progress data={data} project={project} /><footer><span>{progress.stageTotal ? `阶段 ${progress.stageDone}/${progress.stageTotal}` : "可直接管理任务"}</span><span>{record.deadline ? formatDate(record.deadline) : "未设截止"}</span></footer></>)}
      </button>
      <div className={compact ? "pm-compact-actions" : "pm-card-mobile-move"}>
        <button type="button" disabled={records[0]?.id === record.id} aria-label={`上移${record.name}`} title="上移" onClick={() => keyboardMove({ key: "ArrowUp", preventDefault() {} }, record, records, group)}><ArrowUp size={12} />{!compact && "上移"}</button>
        <button type="button" disabled={records.at(-1)?.id === record.id} aria-label={`下移${record.name}`} title="下移" onClick={() => keyboardMove({ key: "ArrowDown", preventDefault() {} }, record, records, group)}><ArrowDown size={12} />{!compact && "下移"}</button>
        <button type="button" aria-label={`编辑${record.name}`} title="编辑" onClick={() => setDialog({ entity, id: record.id, edit: true })}><Pencil size={12} />{!compact && "编辑"}</button>
      </div>
    </article>;
  }
  function switchView(next) { setMode(next); setProjectFilter(""); clearDrag(); }
  return <div className={`workbench-shell pm-shell ${ready ? "is-ready" : "is-booting"}`}>
    <header className="page-header"><div className="greeting-block"><h1>项目管理</h1><p>让想法一步步成为作品</p></div><div className="header-tools"><label className="global-search"><Search className="global-search-icon" size={15} /><input type="search" aria-label="搜索项目与任务" placeholder="搜索项目与任务…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" className="global-search-clear" aria-label="清空搜索" onClick={() => setQuery("")}><X size={12} /></button>}</label>
      <button type="button" className="award-create-header pm-create-header" disabled={mode === "status" && !activeProjects.length} onClick={() => create(mode === "status" ? "tasks" : "projects")}><Plus size={16} /><span>{mode === "status" ? "新建任务" : "新建项目"}</span></button>
      <div className="header-settings-wrap" ref={menuRef}><button ref={menuTrigger} type="button" className="icon-button header-settings" title="设置" aria-label="设置" aria-haspopup="menu" aria-expanded={menu === "open"} onClick={() => menu ? closeMenu() : openMenu()}><Settings2 size={17} /></button>{menu && <div className={`header-settings-popover ${menu === "open" ? "open" : "closing"}`} role="menu" aria-label="项目管理设置"><button type="button" role="menuitem" className="settings-menu-item" onClick={() => closeMenu(() => setAppearanceOpen(true))}><Palette size={18} /><span><strong>外观</strong><small>沿用工作台主题与字体</small></span></button></div>}</div>
    </div></header>
    <main className="page-main"><div className="section-bar"><div className="section-title"><Link className="section-view-switch" href="/" title="返回工作台"><span>项目管理</span><ChevronRight className="is-back" size={15} /></Link><i /></div><div className="section-actions"><div className="award-view-switch" role="group" aria-label="项目管理视图"><button type="button" aria-pressed={mode === "status"} className={mode === "status" ? "is-active" : ""} onClick={() => switchView("status")}><ClipboardCheck size={14} />工作看板</button><button type="button" aria-pressed={mode === "project"} className={mode === "project" ? "is-active" : ""} onClick={() => switchView("project")}><LayoutDashboard size={14} />项目看板</button></div></div></div>
      <div className="pm-prototype-note"><span>本地原型</span><span className="pm-note-copy">含示例数据 · 修改仅保存在此浏览器 · 尚未接入飞书同步</span></div>
      <div className="pm-toolbar"><div className="pm-filter-controls"><LFSelect value={effectiveProjectFilter} ariaLabel="筛选项目" options={[{ value: "", label: "全部项目" }, ...filterProjects.map((p) => ({ value: p.id, label: p.name }))]} onChange={setProjectFilter} /><LFSelect value={filter} ariaLabel="任务提醒筛选" options={[{ value: "all", label: "全部内容" }, { value: "soon", label: "七天内截止" }, { value: "overdue", label: "已逾期" }, { value: "blocked", label: "有受阻任务" }]} onChange={setFilter} disabled={archived} /></div>
        <div className="pm-toolbar-right"><span>{mode === "status" ? `${tasks.length} 项任务` : `${matchingProjects.length} 个项目`}</span><button type="button" className={`quiet-button pm-archive-entry ${archived ? "is-active" : ""}`} aria-label={archived ? "返回未归档看板" : "查看归档"} aria-pressed={archived} onClick={() => { setArchived(!archived); setProjectFilter(""); setFilter("all"); clearDrag(); }}><Archive size={14} />{archived ? "返回看板" : "归档"}<span className="pm-archive-count">{archivedCount}</span></button></div>
      </div>
      {archived && <p className="pm-archive-note">{mode === "status" ? "已归档任务 · 包括随项目归档的任务；在详情中恢复。" : "已归档项目 · 打开详情可恢复，任务与阶段会完整保留。"}</p>}
      <div className="pm-notice" role="status" aria-live="polite">{notice && <><CircleAlert size={13} /><span>{notice}</span>{initial.error && <button type="button" className="quiet-button" onClick={() => window.location.reload()}>重新载入</button>}</>}</div>
      <div ref={boardRef} className={`${mode === "status" ? "pm-columns" : "pm-project-grid"} ${drag ? "is-dragging" : ""}`} aria-label={mode === "status" ? "任务状态看板" : "项目看板"} onDragOver={(e) => {
        if (mode !== "project" || drag?.entity !== "projects" || e.target.closest(".pm-card")) return;
        e.preventDefault(); setDrop({ group: "" });
      }} onDrop={(e) => { if (mode === "project" && drag?.entity === "projects") dropRecord(e, ""); }}>
        {mode === "project" ? matchingProjects.length ? matchingProjects.map((record) => renderCard(record, matchingProjects)) : <div className="pm-empty pm-grid-empty">{archived ? "暂无归档项目" : query || filter !== "all" || effectiveProjectFilter ? "暂无符合筛选的项目" : "还没有项目，点击右上角新建项目。"}</div> : groups.map((group) => {
          const records = tasks.filter((task) => task.status === group);
          return <section className={`pm-column ${drag && drop?.group === group ? "is-drop-column" : ""}`} key={group} onDragOver={(e) => { if (drag?.entity !== "tasks") return; e.preventDefault(); if (!e.target.closest(".pm-card")) setDrop({ group }); }} onDrop={(e) => dropRecord(e, group)} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop(null); }}>
            <header><i style={{ background: STATE_COLORS[group] }} /><h2>{group}</h2><span>{records.length}</span>{!archived && <button type="button" className="pm-column-add" disabled={!activeProjects.length} aria-label={`在${group}中添加任务`} title="添加" onClick={() => create("tasks", { status: group })}><Plus size={14} /></button>}</header>
            <div className="pm-card-list">{records.map((record) => renderCard(record, records, group))}{!records.length && <div className="pm-empty">{drag ? "拖放到这里" : archived ? "暂无归档任务" : query || filter !== "all" || effectiveProjectFilter ? "暂无符合筛选的任务" : "这个状态暂无任务"}</div>}</div>
          </section>;
        })}
      </div>
      <p className="pm-board-help">{mode === "status" ? "待确认任务优先展示；已完成任务收起为项目名与任务名，点击可查看详情。" : "所有项目平铺展示，可拖动排序；完成任务不会自动结束项目。"} <span>进度仅按已完成任务数计算。</span></p>
      <PageFooter stats={[{ value: activeProjects.length, label: "未归档项目" }, { value: visibleTasks(data).filter((t) => t.status !== "已完成").length, label: "未完成任务" }, { value: visibleTasks(data, { filter: "soon", today }).length, label: "七天内截止" }]} />
    </main>
    {dialog && <ProjectRecordDialog initial={dialog} data={data} commit={commit} onClose={closeDialog} />}
    {appearanceOpen && appearance && <AppearanceDialog appearance={appearance} controller={themeController} onChange={(next) => theme.current?.setAppearance(next)} onClose={() => { setAppearanceOpen(false); menuTrigger.current?.focus({ preventScroll: true }); }} />}
  </div>;
}
