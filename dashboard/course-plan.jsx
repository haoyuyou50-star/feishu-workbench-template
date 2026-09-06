"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WORK_STATUSES, filterCourseView, courseWorkGroups } from "./course-board-model.js";
import { useCourseCardMotion } from "./course-motion.js";
import { AlertCircle, Check, ChevronRight, CircleDot, ExternalLink, GripVertical, Layers3, Pencil, RefreshCw, Settings2, X } from "lucide-react";

const STATUS_COLORS = { 尚未填写结课信息: "#918b84", 未开始: "#9aad68", 进行中: "#e6ad4f", 待提交: "#75a7f0", 已完成: "#70b78e", 考试: "#ad8adb" };
const COLOR_PRESETS = ["#ef8a72", "#e6ad4f", "#9aad68", "#70b78e", "#58b6ad", "#75a7f0", "#ad8adb", "#df87a4", "#c85f48", "#b8791f", "#697a3e", "#3f7f5e", "#347e78", "#426fae", "#76539a", "#a84f6c"];
const DEFAULT_SUBMIT_METHODS = ["线下考试", "结课汇报", "畅课提交", "班委收集", "其他"];
const DEFAULT_COURSE_TYPES = ["通识课", "必修课", "专业核心课", "专业选修课"];
const TYPE_COLORS = { 通识课: "#75a7f0", 必修课: "#e6ad4f", 专业核心课: "#70b78e", 专业选修课: "#ad8adb", 未分类: "#918b84" };
const FINAL_EDITOR_FIELDS = ["课程类型", "结课类型", "结课状态", "结课内容", "结课要求", "结课日期", "提交方式", "班委姓名", "是否组队", "小组成员", "联合作业课程", "看板颜色"];

function fieldText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join("、");
  if (typeof value === "object") return fieldText(value.text || value.name || value.value || value.link);
  return String(value).trim();
}

function dateInput(value) {
  if (!value) return "";
  const number = Number(value);
  const date = Number.isFinite(number) ? new Date(number) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const shifted = new Date(date.getTime() + 8 * 3600000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function shortDate(value) {
  const date = dateInput(value);
  return date ? date.replaceAll("-", ".") : "待确认";
}

function defaultCourseColor(name) {
  const presets = ["#75a7f0", "#70b78e", "#e6ad4f", "#ad8adb", "#58b6ad", "#df87a4"];
  let hash = 0;
  for (const char of String(name || "课程")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return presets[hash % presets.length];
}

function completeCourse(fields) {
  const type = fieldText(fields["结课类型"]);
  if (!type) return false;
  const required = [fields["结课内容"], fields["结课要求"], fields["结课日期"], fields["提交方式"]];
  if (required.some((value) => !fieldText(value))) return false;
  if (fieldText(fields["提交方式"]) === "班委收集" && !fieldText(fields["班委姓名"])) return false;
  if (type === "作业" && Boolean(fields["是否组队"]) && !fieldText(fields["小组成员"])) return false;
  return true;
}

function workStatus(course) {
  if (!completeCourse(course.fields)) return "尚未填写结课信息";
  if (fieldText(course.fields["结课类型"]) === "考试") return "考试";
  const savedStatus = fieldText(course.fields["结课状态"]);
  return WORK_STATUSES.includes(savedStatus) ? savedStatus : "未开始";
}

function scheduleSessions(fields, recordId) {
  const schedule = fieldText(fields["授课安排"]);
  if (schedule) return schedule.split(/\r?\n/).map((line, index) => {
    const [weekday, weeks, periods, location, weekType] = line.split("｜").map((item) => item?.trim() || "");
    return { id: `${recordId}-schedule-${index}`, weekday, weeks, periods, location, weekType, teacher: fieldText(fields["授课教师"]) };
  }).filter((session) => [session.weekday, session.weeks, session.periods, session.location].some(Boolean));
  return [{ id: recordId, weekday: fieldText(fields["星期"]), weeks: fieldText(fields["周次范围"]), periods: fieldText(fields["节次范围"]), location: fieldText(fields["上课地点"]), teacher: fieldText(fields["授课教师"]), weekType: fieldText(fields["周类型"]) }];
}

export function aggregateCourseRecords(records = []) {
  const groups = new Map();
  for (const record of records) {
    const fields = record.fields || {};
    const name = fieldText(fields["课程名称"]);
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, { id: record.id, name, recordIds: [], fields: {}, sessions: [], workOrder: Number.POSITIVE_INFINITY, courseOrder: Number.POSITIVE_INFINITY });
    const group = groups.get(name);
    group.recordIds.push(record.id);
    for (const [key, value] of Object.entries(fields)) if (!fieldText(group.fields[key]) && fieldText(value)) group.fields[key] = value;
    for (const session of scheduleSessions(fields, record.id)) if ([session.weekday, session.weeks, session.periods, session.location].some(Boolean)) group.sessions.push(session);
    const workOrder = Number(fields["工作看板排序"]);
    const courseOrder = Number(fields["课程看板排序"]);
    if (Number.isFinite(workOrder)) group.workOrder = Math.min(group.workOrder, workOrder);
    if (Number.isFinite(courseOrder)) group.courseOrder = Math.min(group.courseOrder, courseOrder);
  }
  return [...groups.values()].map((course) => ({ ...course, courseType: fieldText(course.fields["课程类型"]) || "未分类", color: fieldText(course.fields["看板颜色"]) || defaultCourseColor(course.name), status: workStatus(course) }));
}

function matchesQuery(course, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [course.name, ...Object.values(course.fields).map(fieldText), ...course.sessions.flatMap((item) => Object.values(item))].join(" ").toLowerCase().includes(needle);
}

function installDragPreview(event, node) {
  if (!event.dataTransfer || !node) return;
  const clone = node.cloneNode(true);
  clone.classList.add("course-drag-preview");
  clone.querySelectorAll("[id]").forEach((item) => item.removeAttribute("id"));
  document.body.appendChild(clone);
  event.dataTransfer.setDragImage(clone, 24, 20);
  setTimeout(() => clone.remove(), 0);
}

function StatusTag({ status }) {
  return <span className="course-sync-status" style={{ "--status-color": STATUS_COLORS[status] || "#918b84" }}><CircleDot size={9} />{status}</span>;
}

function CourseRecordCard({ course, mode, dragging, onOpen, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const type = fieldText(course.fields["结课类型"]);
  const incomplete = course.status === "尚未填写结课信息";
  const teacher = fieldText(course.fields["授课教师"]) || course.sessions.map((item) => item.teacher).filter(Boolean).join("、") || "教师待确认";
  return <article role="button" tabIndex="0" aria-label={`查看${course.name}`} data-course-motion-key={course.id} className={`award-record-card course-sync-record is-${mode}-view ${dragging ? "is-record-dragging" : ""}`} style={{ "--record-color": course.color }} onClick={onOpen} onDragOver={onDragOver} onDrop={onDrop} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); onOpen(); } }}>
    <button type="button" className="award-record-drag-handle" draggable onDragStart={(event) => { event.stopPropagation(); installDragPreview(event, event.currentTarget.closest("article")); onDragStart(event); }} onDragEnd={onDragEnd} onClick={(event) => event.stopPropagation()} aria-label={`拖动调整${course.name}`} title={`拖动调整${course.name}`}><GripVertical size={14} /></button>
    {mode === "status" ? <>
      <div className="award-record-identity"><strong>{course.name}</strong><p>{teacher}</p></div>
      <div className="course-sync-card-tags"><span>{course.courseType}</span><span>{type || "结课类型待确认"}</span>{course.sessions.length > 1 && <span><Layers3 size={10} />{course.sessions.length} 个时段</span>}</div>
      <div className="award-record-competition"><strong>{incomplete ? "点击补充结课信息" : fieldText(course.fields["结课内容"])}</strong></div>
      <footer><span>{type === "考试" ? "考试日期" : "截止日期"}</span><strong>{shortDate(course.fields["结课日期"])}</strong><ChevronRight size={14} /></footer>
    </> : <>
      <div className="award-record-identity"><strong>{course.name}</strong><p>{teacher}</p></div>
      <div className="course-sync-session-list">{course.sessions.slice(0, 3).map((session) => <div key={session.id}><strong>{session.weekday || "时间待定"} · {session.periods || "节次待定"}</strong><small>{session.weeks || "周次待定"} · {session.location || "地点待定"}</small></div>)}</div>
      <div className="course-sync-card-tags"><StatusTag status={course.status} />{type && <span>{type}</span>}</div>
      <div className="award-record-competition"><strong>{incomplete ? "尚未填写结课信息" : fieldText(course.fields["结课内容"])}</strong></div>
      <footer><span>{fieldText(course.fields["提交方式"]) || "提交方式待确认"}</span><strong>{shortDate(course.fields["结课日期"])}</strong><ChevronRight size={14} /></footer>
    </>}
  </article>;
}

export function DialogFrame({ eyebrow, title, copy = "", onClose, children, footer, navigation, variant = "compact", busy = false, form, className = "" }) {
  const [closing, setClosing] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const panelRef = useRef(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  function requestClose(afterClose) {
    if (timer.current || (latest.current.busy && typeof afterClose !== "function")) return;
    setClosing(true);
    timer.current = setTimeout(() => { latest.current.onClose(); if (typeof afterClose === "function") afterClose(); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
  }
  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const opener = document.activeElement;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    document.body.style.overflow = "hidden";
    let secondFrame;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => { setOpen(true); panelRef.current?.focus({ preventScroll: true }); }); });
    const keydown = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (document.querySelector('.lf-select-menu.is-open, .lf-date-popover')) return;
        requestClose();
      }
      if (event.key !== "Tab" || document.querySelector('.lf-select-menu.is-open')) return;
      const focusable = [...(panelRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || [])].filter((node) => node.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); panelRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current || !panelRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { clearTimeout(timer.current); cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); document.body.style.overflow = previous; document.body.style.paddingRight = previousPadding; window.removeEventListener("keydown", keydown); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const detail = variant === "detail";
  const editor = variant === "editor";
  const panelClass = (detail ? "award-detail-dialog course-detail-dialog" : editor ? "award-record-dialog course-editor-dialog" : "course-sync-dialog") + (className ? " " + className : "");
  const headerClass = detail ? "award-detail-header" : editor ? "award-detail-header award-create-dialog-header" : "course-dialog-header";
  const scrollClass = detail ? "award-detail-scroll" : editor ? "award-record-form-scroll" : "course-dialog-scroll";
  const footerClass = detail ? "award-detail-actions" : editor ? "award-record-form-actions" : "course-dialog-footer";
  const body = <><div className={scrollClass}>{typeof children === "function" ? children(requestClose) : children}</div>{footer && <footer className={footerClass}>{typeof footer === "function" ? footer(requestClose) : footer}</footer>}</>;
  return createPortal(<div className={`dialog-backdrop course-dialog-backdrop ${open ? "is-open" : ""} ${closing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}><section ref={panelRef} className={`dialog-card ${panelClass}`} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="course-sync-dialog-title" tabIndex="-1">
    <header className={headerClass}><div><span>{eyebrow}</span><h2 id="course-sync-dialog-title">{title}</h2>{copy && <p>{copy}</p>}</div><button type="button" className={variant === "compact" ? "course-icon-action" : "icon-button"} onClick={requestClose} aria-label="关闭"><X size={18} /></button></header>
    {navigation}
    {form ? <form id={form.id} onSubmit={(event) => form.onSubmit(event, requestClose)}>{body}</form> : body}
  </section></div>, document.body);
}

function CourseDetailContent({ course, typeColor }) {
  const fields = course.fields || {};
  const finalType = fieldText(fields["结课类型"]) || "待确认";
  const status = course.status;
  const meta = [
    ["课程类型", course.courseType],
    ["授课教师", fieldText(fields["授课教师"]) || "未填写"],
    ["结课类型", finalType],
    [finalType === "考试" ? "考试日期" : "截止日期", shortDate(fields["结课日期"])],
    ["提交方式", fieldText(fields["提交方式"]) || "未填写"],
    ["课程配色", <span className="course-detail-color"><i style={{ background: course.color }} />{course.color.toUpperCase()}</span>],
    ...(fieldText(fields["提交方式"]) === "班委收集" ? [["收集班委", fieldText(fields["班委姓名"]) || "未填写"]] : []),
    ...(finalType === "作业" ? [["是否组队", fields["是否组队"] ? "是" : "否"], ...(fields["是否组队"] ? [["小组成员", fieldText(fields["小组成员"]) || "未填写"]] : []), ["联合作业", fieldText(fields["联合作业课程"]) || "无"], ["结课状态", status]] : []),
  ];
  const sections = [["结课内容", fields["结课内容"]], ["结课要求", fields["结课要求"]], ["备注", fields["备注"]]];
  return <>
    <div className="award-detail-tags"><span style={{ "--tag-color": typeColor }}>{course.courseType}</span><span style={{ "--tag-color": STATUS_COLORS[status] || "#918b84" }}>{status}</span>{finalType !== "待确认" && finalType !== status && <span style={{ "--tag-color": course.color }}>{finalType}</span>}</div>
    <dl className="award-detail-meta">{meta.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="award-detail-sections course-detail-sections">
      <section><h3>授课安排</h3><div className="course-detail-sessions">{course.sessions.map((session) => <div key={session.id}><strong>{session.weekday || "时间待定"} · {session.periods || "节次待定"}</strong><span>{session.weeks || "周次待定"} · {session.location || "地点待定"}{session.weekType ? ` · ${session.weekType}` : ""}</span></div>)}</div></section>
      {sections.map(([label, value]) => label !== "备注" || fieldText(value) ? <section key={label}><h3>{label}</h3><p>{fieldText(value) || "尚未填写，可通过下方“编辑课程”补充。"}</p></section> : null)}
    </div>
  </>;
}

function CourseEditorDialog({ course, readOnly = false, typeColor, onEdit, payload, SelectComponent, DatePickerComponent, onSaved, onClose }) {
  const editing = Boolean(course);
  const initial = course?.fields || {};
  const [values, setValues] = useState(() => ({ "课程名称": course?.name || "", "课程类型": fieldText(initial["课程类型"]), "授课教师": fieldText(initial["授课教师"]), "星期": fieldText(initial["星期"]), "周次范围": fieldText(initial["周次范围"]), "节次范围": fieldText(initial["节次范围"]), "上课地点": fieldText(initial["上课地点"]), "周类型": fieldText(initial["周类型"]), "授课安排": fieldText(initial["授课安排"]), "结课类型": fieldText(initial["结课类型"]), "结课状态": ["", "尚未填写结课信息"].includes(fieldText(initial["结课状态"])) ? "未开始" : fieldText(initial["结课状态"]), "结课内容": fieldText(initial["结课内容"]), "结课要求": fieldText(initial["结课要求"]), "结课日期": dateInput(initial["结课日期"]), "提交方式": fieldText(initial["提交方式"]), "班委姓名": fieldText(initial["班委姓名"]), "是否组队": Boolean(initial["是否组队"]), "小组成员": fieldText(initial["小组成员"]), "联合作业课程": fieldText(initial["联合作业课程"]) }));
  const [customSubmit, setCustomSubmit] = useState("");
  const [courseColor, setCourseColor] = useState(() => course?.color || defaultCourseColor("新课程"));
  const formRef = useRef(null);
  const [customSubmitOpen, setCustomSubmitOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const type = values["结课类型"];
  const patch = (name, value) => setValues((current) => ({ ...current, [name]: value }));
  const schemaMethods = payload?.fields?.find((item) => item.name === "提交方式")?.options || [];
  const submitMethods = [...new Set([...DEFAULT_SUBMIT_METHODS, ...schemaMethods])];
  const schemaCourseTypes = payload?.fields?.find((item) => item.name === "课程类型")?.options || [];
  const courseTypes = [...new Set([...DEFAULT_COURSE_TYPES, ...schemaCourseTypes])];
  async function save(event, requestClose) {
    event.preventDefault();
    if (!values["课程名称"].trim()) return setError("请填写课程名称。");
    const fields = { ...values, "看板颜色": courseColor, "提交方式": customSubmitOpen ? customSubmit.trim() || null : values["提交方式"] || null };
    if (!editing) fields["授课安排"] = [values["星期"] || "时间待定", values["周次范围"] || "周次待定", values["节次范围"] || "节次待定", values["上课地点"] || "地点待定", values["周类型"] || "周类型待定"].join("｜");
    // “尚未确定”只是不选择结课类型的界面文案，不是飞书多维表格中的结课状态选项。
    // 清空状态可避免把内部占位值写入未配置该选项的表格。
    if (!type) fields["结课状态"] = null;
    if (type === "考试") Object.assign(fields, { "结课状态": null, "是否组队": false, "小组成员": null, "联合作业课程": null });
    const initialValue = (name) => name === "结课日期" ? dateInput(initial[name]) : name === "是否组队" ? fieldText(Boolean(initial[name])) : fieldText(initial[name]);
    const syncFields = editing ? Object.fromEntries(FINAL_EDITOR_FIELDS.filter((name) => fieldText(fields[name]) !== initialValue(name)).map((name) => [name, fields[name]])) : fields;
    if (editing && !Object.keys(syncFields).length) { requestClose(); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/courses/records", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { recordIds: course.recordIds, fields: syncFields } : { fields: syncFields }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "飞书课程保存失败");
      setSaving(false);
      // Reconcile cards only after the overlay has finished closing.
      requestClose(() => onSaved({ course, fields: syncFields, created: editing ? null : result.record }));
    } catch (saveError) { setError(saveError.message || "飞书课程保存失败"); setSaving(false); }
  }
  const footer = (requestClose) => <><span className="course-form-error" role="status">{error && <><AlertCircle size={13} />{error}</>}</span><button type="button" className="quiet-button" onClick={requestClose}>取消</button><button type="submit" form="course-sync-form" className="primary-action" disabled={saving}>{saving ? <RefreshCw className="is-spinning" size={14} /> : <Check size={14} />}{saving ? "正在同步" : "保存并同步"}</button></>;
  const navigation = <nav className="course-field-navigation" aria-label="编辑字段导航">{["课程信息", "结课信息", ...(type === "作业" ? ["协作信息"] : []), "课程配色"].map((label, index) => <button type="button" key={label} onClick={() => { const section = formRef.current?.children[index]; section?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); section?.querySelector('input:not([readonly]), button, textarea:not([readonly])')?.focus({ preventScroll: true }); }}>{label}<ChevronRight size={12} /></button>)}</nav>;
  const detailFooter = <><button type="button" className="award-link-action award-edit-action" onClick={onEdit}><Pencil size={13} />编辑课程</button><span className="award-detail-action-spacer" /><a className="award-link-action" href={payload?.sourceUrl} target="_blank" rel="noreferrer">打开飞书表格<ExternalLink size={13} /></a></>;
  return <DialogFrame eyebrow={readOnly ? "课程详情" : editing ? "编辑课程" : "新增课程"} title={values["课程名称"] || "课程与结课"} copy={readOnly ? "" : editing ? "只修改需要更新的字段，保存后会立即同步飞书多维表格。" : "课程与结课信息将一次写入飞书多维表格。"} onClose={onClose} busy={saving} footer={readOnly ? detailFooter : footer} navigation={readOnly ? null : navigation} form={readOnly ? null : { id: "course-sync-form", onSubmit: save }} variant={readOnly ? "detail" : "editor"}>{readOnly ? <CourseDetailContent course={course} typeColor={typeColor} /> : <div ref={formRef} className="course-record-form">
    <section className="award-form-section"><h3>课程信息</h3><p className="award-form-section-copy">{editing ? "课程名称和授课安排沿用飞书课表，课程类型可在这里调整。" : "填写课程归类与基础授课信息。"}</p><div className="award-form-grid">
      <label><span>课程名称<i>必填</i></span><input value={values["课程名称"]} readOnly={editing} onChange={(event) => patch("课程名称", event.target.value)} /></label><label><span>课程类型</span><SelectComponent value={values["课程类型"]} options={[{ value: "", label: "请选择" }, ...courseTypes.map((value) => ({ value, label: value }))]} ariaLabel="课程类型" onChange={(value) => patch("课程类型", value)} /></label>
      <label><span>授课教师</span><input value={values["授课教师"]} readOnly={editing} onChange={(event) => patch("授课教师", event.target.value)} /></label>
      {editing ? <label className="is-wide"><span>授课安排</span><textarea value={values["授课安排"]} readOnly rows={Math.max(2, course?.sessions?.length || 1)} /></label> : <>
        <label><span>星期</span><SelectComponent value={values["星期"]} options={["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((value) => ({ value, label: value || "待定" }))} ariaLabel="星期" onChange={(value) => patch("星期", value)} /></label><label><span>周类型</span><SelectComponent value={values["周类型"]} options={["", "每周", "单周", "双周", "单双周", "其中一周"].map((value) => ({ value, label: value || "待定" }))} ariaLabel="周类型" onChange={(value) => patch("周类型", value)} /></label>
        <label><span>周次范围</span><input value={values["周次范围"]} onChange={(event) => patch("周次范围", event.target.value)} placeholder="例如：第1 - 17周" /></label><label><span>节次范围</span><input value={values["节次范围"]} onChange={(event) => patch("节次范围", event.target.value)} placeholder="例如：第1 - 4节" /></label><label className="is-wide"><span>上课地点</span><input value={values["上课地点"]} onChange={(event) => patch("上课地点", event.target.value)} /></label>
      </>}
    </div></section>
    <section className="award-form-section"><h3>结课信息</h3><p className="award-form-section-copy">暂不确定时保持“尚未确定”，课程会归入待补充状态。</p><div className="award-form-grid">
      <label><span>结课类型</span><SelectComponent value={type} options={[{ value: "", label: "尚未确定" }, { value: "作业", label: "作业" }, { value: "考试", label: "考试" }]} ariaLabel="结课类型" onChange={(value) => patch("结课类型", value)} /></label>
      {type === "作业" && <label><span>结课状态</span><SelectComponent value={values["结课状态"]} options={["未开始", "进行中", "待提交", "已完成"].map((value) => ({ value, label: value }))} ariaLabel="结课状态" onChange={(value) => patch("结课状态", value)} /></label>}
      {type && <><label className="is-wide"><span>结课内容</span><textarea value={values["结课内容"]} onChange={(event) => patch("结课内容", event.target.value)} rows={3} /></label><label className="is-wide"><span>结课要求</span><textarea value={values["结课要求"]} onChange={(event) => patch("结课要求", event.target.value)} rows={3} /></label><label><span>{type === "考试" ? "考试日期" : "截止日期"}</span><DatePickerComponent value={values["结课日期"]} ariaLabel="结课日期" onChange={(value) => patch("结课日期", value)} /></label><label><span>提交方式</span><SelectComponent value={customSubmitOpen ? "__new__" : values["提交方式"]} options={[{ value: "", label: "待确认" }, ...submitMethods.map((value) => ({ value, label: value })), { value: "__new__", label: "新建提交方式…" }]} ariaLabel="提交方式" onChange={(value) => { if (value === "__new__") { setCustomSubmitOpen(true); setCustomSubmit(""); } else { setCustomSubmitOpen(false); setCustomSubmit(""); patch("提交方式", value); } }} /></label>{customSubmitOpen && <label className="is-wide"><span>新提交方式</span><input value={customSubmit} onChange={(event) => setCustomSubmit(event.target.value)} placeholder="输入后会同步为飞书新选项" /></label>}{(customSubmitOpen ? customSubmit.trim() : values["提交方式"]) === "班委收集" && <label className="is-wide"><span>收集班委姓名</span><input value={values["班委姓名"]} onChange={(event) => patch("班委姓名", event.target.value)} /></label>}</>}
    </div></section>
    {type === "作业" && <section className="award-form-section"><h3>协作信息</h3><p className="award-form-section-copy">记录联合作业、组队方式和成员，不承担项目进度管理。</p><div className="award-form-grid"><label><span>联合作业课程</span><input value={values["联合作业课程"]} onChange={(event) => patch("联合作业课程", event.target.value)} placeholder="可填写多门课程" /></label><label className="course-team-switch"><span><strong>是否组队</strong><small>开启后填写成员</small></span><button type="button" role="switch" aria-checked={values["是否组队"]} className={values["是否组队"] ? "is-on" : ""} onClick={() => patch("是否组队", !values["是否组队"])}><i /></button></label>{values["是否组队"] && <label className="is-wide"><span>小组成员</span><input value={values["小组成员"]} onChange={(event) => patch("小组成员", event.target.value)} placeholder="用顿号分隔" /></label>}</div></section>}
    <section className="award-form-section"><h3>课程配色</h3><p className="award-form-section-copy">用于这门课程在两个看板中的卡片标识，保存后同步到飞书。</p><div className="course-editor-color"><div className="course-color-preview" style={{ "--preview-color": courseColor }}><i /><strong>{values["课程名称"] || "课程卡片"}</strong><span>{courseColor.toUpperCase()}</span></div><CourseColorPalette value={courseColor} onChange={setCourseColor} /></div></section>
  </div>}</DialogFrame>;
}

function CourseColorPalette({ value, onChange }) {
  return <div className="course-color-grid" role="group" aria-label="课程颜色">{COLOR_PRESETS.map((preset) => <button type="button" key={preset} className={value === preset ? "is-selected" : ""} style={{ "--preset": preset }} title={preset} aria-label={`选择颜色 ${preset}`} aria-pressed={value === preset} onClick={() => onChange(preset)} />)}</div>;
}

function ColorDialog({ name, color, onSave, onClose }) {
  const [selected, setSelected] = useState(color);
  return <DialogFrame eyebrow="看板配色" title={name} onClose={onClose} footer={(requestClose) => <><button type="button" className="quiet-button" onClick={requestClose}>取消</button><button type="button" className="primary-action" onClick={async () => { await onSave(selected); requestClose(); }}><Check size={14} />保存颜色</button></>}><div className="course-color-preview" style={{ "--preview-color": selected }}><i /><strong>{name}</strong><span>{selected.toUpperCase()}</span></div><div className="course-color-grid">{COLOR_PRESETS.map((preset) => <button type="button" key={preset} className={selected === preset ? "is-selected" : ""} style={{ "--preset": preset }} aria-label={`选择颜色 ${preset}`} aria-pressed={selected === preset} onClick={() => setSelected(preset)} />)}</div></DialogFrame>;
}

export default function CoursePlanBoard({ query = "", mode = "status", viewPhase = "idle", incompleteOnly = false, onClearFilter, createRequest = 0, refreshRequest = 0, SelectComponent, DatePickerComponent, onStatsChange }) {
  const [payload, setPayload] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [colorTarget, setColorTarget] = useState(null);
  const [statusColors, setStatusColors] = useState(() => { try { return { ...STATUS_COLORS, ...JSON.parse(localStorage.getItem("liufeng-workbench.course-status-colors.v1") || "{}") }; } catch { return STATUS_COLORS; } });
  const [typeColors, setTypeColors] = useState(() => { try { return { ...TYPE_COLORS, ...JSON.parse(localStorage.getItem("liufeng-workbench.course-type-colors.v1") || "{}") }; } catch { return TYPE_COLORS; } });
  const [typeOrder, setTypeOrder] = useState(() => { try { return JSON.parse(localStorage.getItem("liufeng-workbench.course-type-order.v1") || "[]"); } catch { return []; } });
  const [dragging, setDragging] = useState(null);
  const createSeen = useRef(createRequest);
  const refreshSeen = useRef(refreshRequest);
  const pendingWrites = useRef(0);
  const refreshVersion = useRef(0);
  const boardRef = useRef(null);
  const displayMode = incompleteOnly ? "project" : mode;
  const motionSignature = useMemo(() => JSON.stringify([courses.map((course) => [course.id, course.status, course.courseType, course.workOrder, course.courseOrder]), displayMode, query, incompleteOnly, typeOrder]), [courses, displayMode, query, incompleteOnly, typeOrder]);
  useCourseCardMotion(boardRef, motionSignature);

  const refresh = useCallback(async (force = false, quiet = false) => {
    const version = ++refreshVersion.current;
    if (!quiet) { setLoading(true); setError(""); }
    try {
      const response = await fetch(`/api/courses${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "无法读取飞书课表");
      if (version === refreshVersion.current) { setPayload(result); setCourses(aggregateCourseRecords(result.records)); setError(""); }
    } catch (loadError) { if (version === refreshVersion.current) setError(loadError.message || "无法读取飞书课表"); }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => { refresh(false); }, [refresh]);
  useEffect(() => {
    const syncFromFeishu = () => { if (!selected && !editing && !createOpen && !colorTarget && !dragging && !pendingWrites.current && document.visibilityState === "visible") refresh(true, true); };
    const interval = window.setInterval(syncFromFeishu, 30000);
    window.addEventListener("focus", syncFromFeishu);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", syncFromFeishu); };
  }, [refresh, selected, editing, createOpen, colorTarget, dragging]);
  useEffect(() => { if (createRequest !== createSeen.current) { createSeen.current = createRequest; setCreateOpen(true); } }, [createRequest]);
  useEffect(() => { if (refreshRequest !== refreshSeen.current) { refreshSeen.current = refreshRequest; refresh(true); } }, [refreshRequest, refresh]);
  const visible = useMemo(() => filterCourseView(courses, displayMode, incompleteOnly).filter((course) => matchesQuery(course, query)), [courses, displayMode, incompleteOnly, query]);
  const incomplete = courses.filter((course) => course.status === "尚未填写结课信息").length;
  useEffect(() => onStatsChange?.({ courses: courses.length, incomplete, exams: courses.filter((course) => course.status === "考试").length, joint: courses.filter((course) => fieldText(course.fields["联合作业课程"])).length, generatedAt: payload?.generatedAt || "", loading, error }), [courses, incomplete, payload?.generatedAt, loading, error, onStatsChange]);

  async function syncUpdates(updates) {
    pendingWrites.current += 1;
    refreshVersion.current += 1;
    try {
      const response = await fetch("/api/courses/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "飞书同步失败");
    } finally { pendingWrites.current -= 1; }
  }
  function applySavedCourse({ course, fields, created }) {
    if (course) setCourses((current) => current.map((item) => {
      if (item.id !== course.id) return item;
      const updated = { ...item, fields: { ...item.fields, ...fields } };
      return { ...updated, color: fieldText(updated.fields["看板颜色"]) || defaultCourseColor(item.name), courseType: fieldText(updated.fields["课程类型"]) || "未分类", status: workStatus(updated) };
    }));
    else if (created?.id) setCourses((current) => [...current, ...aggregateCourseRecords([created])]);
    refresh(true, true);
  }
  function reorderType(sourceKey, targetType) {
    const sourceType = String(sourceKey || "").replace(/^type:/, "");
    if (!sourceType || sourceType === targetType) return;
    const available = [...new Set([...DEFAULT_COURSE_TYPES, ...courses.map((course) => course.courseType)])];
    const ordered = [...new Set([...typeOrder.filter((type) => available.includes(type)), ...available])];
    const next = ordered.filter((type) => type !== sourceType);
    const index = next.indexOf(targetType);
    next.splice(index < 0 ? next.length : index, 0, sourceType);
    setTypeOrder(next);
    try { localStorage.setItem("liufeng-workbench.course-type-order.v1", JSON.stringify(next)); } catch { /* local preference only */ }
  }
  async function moveProjectCourse(sourceId, targetType, targetId = null) {
    if (pendingWrites.current) return;
    const course = courses.find((item) => item.id === sourceId);
    if (!course || sourceId === targetId) return;
    const ordered = courses.filter((item) => item.courseType === targetType && item.id !== sourceId).sort((a, b) => a.courseOrder - b.courseOrder || a.name.localeCompare(b.name, "zh-CN"));
    const targetIndex = targetId ? ordered.findIndex((item) => item.id === targetId) : -1;
    ordered.splice(targetIndex >= 0 ? targetIndex : ordered.length, 0, course);
    const ordering = new Map(ordered.map((item, index) => [item.id, index + 1]));
    setCourses((current) => current.map((item) => ordering.has(item.id) ? { ...item, courseType: item.id === sourceId ? targetType : item.courseType, courseOrder: ordering.get(item.id), fields: { ...item.fields, ...(item.id === sourceId ? { "课程类型": targetType } : {}), "课程看板排序": ordering.get(item.id) } } : item));
    const updates = ordered.map((item) => ({ recordIds: item.recordIds, fields: { ...(item.id === sourceId ? { "课程类型": targetType === "未分类" ? null : targetType } : {}), "课程看板排序": ordering.get(item.id) } }));
    try { await syncUpdates(updates); } catch (syncError) { await refresh(true); setError(syncError.message); }
  }
  async function moveWorkCourse(sourceId, targetStatus, targetId = null) {
    if (pendingWrites.current) return;
    const course = courses.find((item) => item.id === sourceId);
    if (!course || sourceId === targetId || (course.status === "考试") !== (targetStatus === "考试")) return;
    if ((course.status === "尚未填写结课信息") !== (targetStatus === "尚未填写结课信息")) return;
    const ordered = courses.filter((item) => item.status === targetStatus && item.id !== sourceId).sort((a, b) => a.workOrder - b.workOrder || a.name.localeCompare(b.name, "zh-CN"));
    const targetIndex = targetId ? ordered.findIndex((item) => item.id === targetId) : -1;
    ordered.splice(targetIndex >= 0 ? targetIndex : ordered.length, 0, course);
    const ordering = new Map(ordered.map((item, index) => [item.id, index + 1]));
    const optimistic = courses.map((item) => ordering.has(item.id) ? {
      ...item,
      status: item.id === sourceId ? targetStatus : item.status,
      workOrder: ordering.get(item.id),
      fields: {
        ...item.fields,
        ...(item.id === sourceId && targetStatus !== "考试" && targetStatus !== "尚未填写结课信息" ? { "结课状态": targetStatus } : {}),
        "工作看板排序": ordering.get(item.id),
      },
    } : item);
    setCourses(optimistic);
    const updates = ordered.map((item) => ({
      recordIds: item.recordIds,
      fields: {
        ...(item.id === sourceId && targetStatus !== "考试" && targetStatus !== "尚未填写结课信息" ? { "结课状态": targetStatus } : {}),
        "工作看板排序": ordering.get(item.id),
      },
    }));
    try { await syncUpdates(updates); } catch (syncError) { await refresh(true); setError(syncError.message); }
  }
  async function saveColor(target, color) {
    if (target.type === "status") { const next = { ...statusColors, [target.name]: color }; setStatusColors(next); try { localStorage.setItem("liufeng-workbench.course-status-colors.v1", JSON.stringify(next)); } catch { /* local preference only */ } return; }
    if (target.type === "courseType") { const next = { ...typeColors, [target.name]: color }; setTypeColors(next); try { localStorage.setItem("liufeng-workbench.course-type-colors.v1", JSON.stringify(next)); } catch { /* local preference only */ } return; }
    setCourses((current) => current.map((item) => item.id === target.course.id ? { ...item, color, fields: { ...item.fields, "看板颜色": color } } : item));
    try { await syncUpdates([{ recordIds: target.course.recordIds, fields: { "看板颜色": color } }]); } catch (syncError) { setError(syncError.message); await refresh(true); }
  }

  if (!payload && loading) return <div className="award-loading"><RefreshCw className="is-spinning" size={22} /><strong>正在同步课程表</strong><span>读取飞书多维表格课程与字段</span></div>;
  if (!payload && error) return <div className="award-loading is-error"><AlertCircle size={22} /><strong>暂时无法读取课程表</strong><span>{error}</span><button type="button" className="quiet-button" onClick={() => refresh(true)}>重新读取</button></div>;
  const schemaTypes = payload?.fields?.find((field) => field.name === "课程类型")?.options || [];
  const availableTypes = [...new Set([...DEFAULT_COURSE_TYPES, ...schemaTypes, ...visible.map((course) => course.courseType)])];
  const orderedTypes = [...new Set([...typeOrder.filter((type) => availableTypes.includes(type)), ...availableTypes])].filter((type) => visible.some((course) => course.courseType === type));
  return <section ref={boardRef} className={`award-board-page course-sync-board is-view-${viewPhase}`} aria-label="课程与结课看板">
    {payload?.missingFields?.length > 0 && <div className="course-schema-warning"><AlertCircle size={14} /><span>飞书表格尚缺 {payload.missingFields.length} 个结课字段；当前可查看课程，补齐字段后即可实时编辑。</span><a href={payload.sourceUrl} target="_blank" rel="noreferrer">打开课表<ExternalLink size={12} /></a></div>}
    {error && <div className="award-inline-error"><AlertCircle size={13} />{error}</div>}
    {incompleteOnly && <div className="course-filter-banner" role="status"><AlertCircle size={14} /><span>未填写结课信息 · {visible.length} 门课程</span><button type="button" onClick={onClearFilter}>清除筛选<X size={13} /></button></div>}
    <div className="award-board-scroll"><div className={`award-groups award-groups-${displayMode} course-sync-groups`}>
      {displayMode === "status" ? courseWorkGroups(visible).map(({ status, courses: statusCourses }) => {
        const items = [...statusCourses].sort((a, b) => a.workOrder - b.workOrder || a.name.localeCompare(b.name, "zh-CN"));
        const color = statusColors[status] || STATUS_COLORS[status];
        return <section key={status} className="award-group" style={{ "--award-group-color": color }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveWorkCourse(dragging, status); setDragging(null); }}><header className="award-group-heading"><h2>{status}</h2><span>{items.length}</span><button type="button" className="award-group-settings" onClick={() => setColorTarget({ type: "status", name: status, color })} aria-label={`设置${status}颜色`}><Settings2 size={16} /></button></header><div className="award-card-list">{items.map((course) => <CourseRecordCard key={course.id} course={course} mode="status" dragging={dragging === course.id} onOpen={() => setSelected(course)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-liufeng-course", course.id); setDragging(course.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveWorkCourse(dragging, status, course.id); setDragging(null); }} onDragEnd={() => setDragging(null)} />)}</div>{!items.length && <div className="course-group-empty">暂无{status}的课程</div>}</section>;
      }) : orderedTypes.map((courseType) => {
        const items = visible.filter((course) => course.courseType === courseType).sort((a, b) => a.courseOrder - b.courseOrder || a.name.localeCompare(b.name, "zh-CN"));
        const color = typeColors[courseType] || TYPE_COLORS[courseType] || defaultCourseColor(courseType);
        return <section key={courseType} className={`award-group ${dragging === `type:${courseType}` ? "is-card-dragging" : ""}`} style={{ "--award-group-color": color }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (String(dragging || "").startsWith("type:")) reorderType(dragging, courseType); else moveProjectCourse(dragging, courseType); setDragging(null); }}>
          <header className="award-group-heading"><button type="button" className="award-group-drag-handle" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; installDragPreview(event, event.currentTarget.closest("section")); setDragging(`type:${courseType}`); }} onDragEnd={() => setDragging(null)} aria-label={`拖动调整${courseType}顺序`}><GripVertical size={15} /></button><h2>{courseType}</h2><span>{items.length} 门</span><button type="button" className="award-group-settings" onClick={() => setColorTarget({ type: "courseType", name: courseType, color })} aria-label={`设置${courseType}颜色`}><Settings2 size={16} /></button></header>
          <div className="award-card-list">{items.map((course) => <CourseRecordCard key={course.id} course={course} mode="project" dragging={dragging === course.id} onOpen={() => setSelected(course)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDragging(course.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (String(dragging || "").startsWith("type:")) reorderType(dragging, courseType); else moveProjectCourse(dragging, courseType, course.id); setDragging(null); }} onDragEnd={() => setDragging(null)} />)}</div>
        </section>;
      })}
    </div>{!visible.length && displayMode === "project" && <div className="award-empty"><AlertCircle size={25} /><strong>{incompleteOnly ? "没有待补充的课程" : "没有匹配的课程"}</strong><span>{query ? "换一个关键词试试" : incompleteOnly ? "课程结课信息均已填写完整" : "可通过右上角新增课程"}</span></div>}{displayMode === "status" && <p className="course-work-note">仅展示已填写结课信息的作业课程；考试请在项目看板查看，未填写课程可通过右上角设置筛选。</p>}</div>
    {(selected || createOpen) && <CourseEditorDialog course={selected} readOnly={Boolean(selected && !editing)} typeColor={selected ? typeColors[selected.courseType] || TYPE_COLORS[selected.courseType] || selected.color : undefined} onEdit={() => setEditing(true)} payload={payload} SelectComponent={SelectComponent} DatePickerComponent={DatePickerComponent} onSaved={applySavedCourse} onClose={() => { setSelected(null); setEditing(null); setCreateOpen(false); }} />}
    {colorTarget && <ColorDialog name={colorTarget.name} color={colorTarget.color} onSave={(color) => saveColor(colorTarget, color)} onClose={() => setColorTarget(null)} />}
  </section>;
}
