"use client";
import { useRef, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus } from "lucide-react";
import { LFDatePicker, LFSelect } from "./main.jsx";
import { DialogFrame } from "./course-plan.jsx";
import { PROJECT_COLORS, PROJECT_STATES, PROJECT_TYPES, TASK_STATES, progressFor, safeProjectLink } from "./project-management-model.js";

export const options = (items) => items.map((value) => ({ value, label: value }));
export const formatDate = (value) => value ? value.replaceAll("-", ".") : "未设日期";
export function blankRecord(entity, projectId = "") {
  const common = { id: entity + "-" + crypto.randomUUID(), name: "", deadline: "" };
  if (entity === "projects") return { ...common, type: "创作", status: "未开始", goal: "", start: "", owner: "我", members: "", color: PROJECT_COLORS[3], source: "", resources: "", archived: false };
  if (entity === "stages") return { ...common, projectId, goal: "", done: false };
  return { ...common, projectId, stageId: "", status: "未开始", owner: "我", blocked: "", notes: "", result: "", archived: false };
}
function Field({ label, wide, children }) { return <label className={wide ? "is-wide" : ""}><span>{label}</span>{children}</label>; }
function TextField({ label, name, values, patch, wide, multiline, required, placeholder }) {
  const props = { value: values[name] || "", onChange: (e) => patch(name, e.target.value), required, placeholder, maxLength: name === "name" ? 120 : 8000 };
  return <Field label={label} wide={wide}>{multiline ? <textarea {...props} rows={3} /> : <input {...props} />}</Field>;
}
function DateField({ label, name, values, patch }) { return <Field label={label}><LFDatePicker value={values[name] || ""} ariaLabel={label} onChange={(value) => patch(name, value)} /></Field>; }
function Links({ value }) {
  return !value?.trim() ? <span className="pm-muted">尚未添加</span> : <div className="pm-links">{value.split("\n").filter(Boolean).map((line, i) => {
    const href = safeProjectLink(line.trim());
    return href ? <a key={i} href={href} target="_blank" rel="noreferrer">{line}<ExternalLink size={12} /></a> : <span key={i}>{line}</span>;
  })}</div>;
}
export function Progress({ data, project }) {
  const p = progressFor(data, project.id);
  return <div className="pm-progress-summary" style={{ "--project-color": project.color }}><div><span>{p.total ? `任务完成 ${p.done} / ${p.total}` : "尚未拆解任务"}</span><span>{p.percent === null ? "—" : p.percent + "%"}</span></div><div className="pm-progress" role="progressbar" aria-label="任务完成比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent ?? undefined} aria-valuetext={p.total ? `完成 ${p.done} 项，共 ${p.total} 项` : "尚未拆解"}><span style={{ width: `${p.percent || 0}%` }} /></div></div>;
}
function Meta({ rows }) { return <dl className="award-detail-meta">{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>; }

// Keep one frame mounted across detail, edit and child-record navigation.
export default function ProjectRecordDialog({ initial, data, commit, onClose }) {
  const [screen, setScreen] = useState(initial);
  const [values, setValues] = useState(() => ({ ...(initial.record || data[initial.entity].find((x) => x.id === initial.id)) }));
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [newType, setNewType] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sections = useRef(null);
  const entity = screen.entity;
  const record = data[entity].find((x) => x.id === values.id) || values;
  const isNew = !data[entity].some((x) => x.id === values.id);
  const editing = screen.edit || isNew;
  const name = { projects: "项目", stages: "阶段", tasks: "任务" }[entity];
  const project = entity === "projects" ? record : data.projects.find((p) => p.id === record.projectId);
  const progress = project ? progressFor(data, project.id) : null;
  const patch = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  function show(next, nextTab = "overview") {
    setScreen(next); setValues({ ...(next.record || data[next.entity].find((x) => x.id === next.id)) });
    setTab(nextTab); setError(""); setNewType(false); setConfirmDelete(false);
  }
  function back() { show({ entity: "projects", id: screen.returnTo, edit: false }, entity === "stages" ? "stages" : "tasks"); }
  function run(command, close) {
    try {
      const apply = commit(command, !screen.returnTo);
      if (screen.returnTo) back(); else close(apply);
    } catch (e) { setConfirmDelete(false); setError(e.message || "本地保存失败，草稿仍保留。"); }
  }
  function save(event, close) {
    event.preventDefault();
    const updated = { ...values };
    if (entity === "projects") updated.type = updated.type.trim();
    if (entity === "tasks" && updated.status === "已完成") updated.blocked = "";
    run({ type: "save", entity, record: updated }, close);
  }
  const sectionNames = entity === "projects" ? ["基本信息", "目标与关联", "项目配色"] : entity === "tasks" ? ["任务信息", "说明与成果"] : ["阶段信息"];
  const navigation = editing ? <nav className="course-field-navigation" aria-label="编辑字段导航">{sectionNames.map((title, index) => <button type="button" key={title} onClick={() => {
    const section = sections.current?.children[index];
    section?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    section?.querySelector("input,button,textarea")?.focus({ preventScroll: true });
  }}>{title}<ChevronRight size={12} /></button>)}</nav> : entity === "projects" ? <nav className="pm-detail-tabs" aria-label="项目详情视图">{[["overview", "概览"], ["tasks", "任务"], ["stages", "阶段"]].map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{label}{value !== "overview" && <span>{data[value].filter((x) => x.projectId === record.id).length}</span>}</button>)}</nav> : null;
  const footer = (close) => confirmDelete ? <div className="pm-delete-confirm"><span>{entity === "stages" ? "删除阶段后，任务保留并移至未分阶段。" : "确认删除这项本地任务？"}</span><button type="button" className="quiet-button" onClick={() => setConfirmDelete(false)}>保留</button><button type="button" className="quiet-button is-destructive" onClick={() => run({ type: "remove", entity, id: record.id }, close)}>确认删除</button></div> : <>
    {screen.returnTo && <button type="button" className="quiet-button" onClick={back}><ChevronLeft size={13} />返回项目</button>}
    {!editing && (entity === "projects" || (entity === "tasks" && !project?.archived)) && <button type="button" className="quiet-button" onClick={() => run({ type: "save", entity, record: { ...record, archived: !record.archived } }, close)}><Archive size={13} />{record.archived ? "恢复" + name : "归档" + name}</button>}
    {!editing && entity === "tasks" && project?.archived && <button type="button" className="quiet-button" onClick={() => show({ entity: "projects", id: project.id, edit: false })}><Archive size={13} />查看已归档项目</button>}
    {editing && !isNew && entity !== "projects" && <button type="button" className="quiet-button is-destructive" onClick={() => setConfirmDelete(true)}>删除{name}</button>}
    <span className="pm-dialog-feedback" data-error={Boolean(error)} role="status">{error || (editing ? "仅保存在本机，不同步飞书" : "")}</span>
    {editing ? <><button type="button" className="quiet-button" onClick={() => isNew ? screen.returnTo ? back() : close() : show({ ...screen, edit: false }, tab)}>取消</button><button type="submit" form="project-prototype-form" className="primary-action"><Check size={14} />保存</button></> : <button type="button" className="primary-action" onClick={() => show({ ...screen, edit: true }, tab)}><Pencil size={14} />编辑{name}</button>}
  </>;
  const types = [...new Set([...PROJECT_TYPES, ...data.projects.map((p) => p.type), values.type].filter(Boolean))];
  const fieldProps = { values, patch };
  return <DialogFrame className="pm-record-dialog" eyebrow={editing ? (isNew ? "新建" : "编辑") + name : name + "详情"} title={record.name || "新的" + name} copy={editing ? "先填必要信息，其他内容可以随时补充。" : ""} onClose={onClose} variant={editing ? "editor" : "detail"} navigation={navigation} footer={footer} form={editing ? { id: "project-prototype-form", onSubmit: save } : null}>
    {editing ? <div ref={sections} className="course-record-form pm-record-form">
      <section className="award-form-section"><h3>{sectionNames[0]}</h3><div className="award-form-grid">
        <TextField {...fieldProps} label={name + "名称（必填）"} name="name" required wide />
        {entity === "projects" ? <>
          <Field label="项目类型"><LFSelect value={newType ? "__new__" : values.type} ariaLabel="项目类型" options={[...options(types), { value: "__new__", label: "新建类型…" }]} onChange={(value) => { setNewType(value === "__new__"); patch("type", value === "__new__" ? "" : value); }} /></Field>
          <Field label="项目状态"><LFSelect value={values.status} ariaLabel="项目状态" options={options(PROJECT_STATES)} onChange={(value) => patch("status", value)} /></Field>
          {newType && <TextField {...fieldProps} label="新类型名称" name="type" required wide />}
          <TextField {...fieldProps} label="负责人" name="owner" /><TextField {...fieldProps} label="项目成员" name="members" placeholder="用顿号分隔，可留空" />
          <DateField {...fieldProps} label="开始日期" name="start" /><DateField {...fieldProps} label="截止日期" name="deadline" />
        </> : entity === "tasks" ? <>
          <Field label="所属项目（必填）"><LFSelect value={values.projectId} ariaLabel="所属项目" options={[{ value: "", label: "请选择项目" }, ...data.projects.filter((p) => !p.archived || p.id === values.projectId).map((p) => ({ value: p.id, label: p.name }))]} onChange={(value) => setValues((current) => ({ ...current, projectId: value, stageId: "" }))} /></Field>
          <Field label="所属阶段"><LFSelect value={values.stageId || ""} ariaLabel="所属阶段" options={[{ value: "", label: "不分阶段" }, ...data.stages.filter((s) => s.projectId === values.projectId).map((s) => ({ value: s.id, label: s.name }))]} onChange={(value) => patch("stageId", value)} /></Field>
          <Field label="任务状态"><LFSelect value={values.status} ariaLabel="任务状态" options={options(TASK_STATES)} onChange={(value) => patch("status", value)} /></Field>
          <DateField {...fieldProps} label="截止日期" name="deadline" /><TextField {...fieldProps} label="负责人" name="owner" />
          {values.status !== "已完成" && <TextField {...fieldProps} label="受阻原因" name="blocked" placeholder="没有阻碍时留空" />}
        </> : <><TextField {...fieldProps} label="阶段成果 / 验收目标" name="goal" multiline wide /><DateField {...fieldProps} label="阶段截止日期" name="deadline" /><Field label="成果确认"><button type="button" className={`pm-confirm-toggle ${values.done ? "is-on" : ""}`} role="switch" aria-label="阶段成果已确认" aria-checked={values.done} onClick={() => patch("done", !values.done)}><Check size={15} />{values.done ? "已确认阶段成果" : "尚未确认阶段成果"}</button></Field></>}
      </div></section>
      {entity !== "stages" && <section className="award-form-section"><h3>{sectionNames[1]}</h3><div className="award-form-grid">{entity === "projects" ? <><TextField {...fieldProps} label="目标与交付物" name="goal" multiline wide placeholder="完成后，需要交付什么？" /><TextField {...fieldProps} label="关联课程 / 投奖 / 其他来源" name="source" multiline wide placeholder="每行填写名称或链接；原型仅记录引用，不同步其他看板" /><TextField {...fieldProps} label="资料与文档链接" name="resources" multiline wide placeholder="每行一个链接或一段说明" /></> : <><TextField {...fieldProps} label="任务说明" name="notes" multiline wide /><TextField {...fieldProps} label="成果链接 / 交付说明" name="result" multiline wide /></>}</div></section>}
      {entity === "projects" && <section className="award-form-section"><h3>项目配色</h3><p className="award-form-section-copy">项目卡片和所属任务使用同一颜色。</p><div className="pm-color-preview" style={{ "--project-color": values.color }}><i />{values.name || "项目卡片"}</div><div className="pm-palette" role="group" aria-label="项目颜色">{PROJECT_COLORS.map((color) => <button type="button" key={color} style={{ "--preset": color }} className={values.color === color ? "is-selected" : ""} title={color} aria-label={`选择颜色 ${color}`} aria-pressed={values.color === color} onClick={() => patch("color", color)} />)}</div></section>}
    </div> : entity === "projects" ? <>
      {tab === "overview" && <><div className="award-detail-tags"><span style={{ "--tag-color": record.color }}>{record.type}</span><span style={{ "--tag-color": record.color }}>{record.status}</span>{record.archived && <span>已归档</span>}</div><Progress data={data} project={record} /><Meta rows={[["当前阶段", progress.currentStage?.name || (progress.stageTotal ? "阶段成果均已确认" : "未分阶段")], ["阶段完成", progress.stageTotal ? `${progress.stageDone} / ${progress.stageTotal}` : "尚未建立阶段"], ["负责人", record.owner || "未分配"], ["项目成员", record.members || "个人项目"], ["开始日期", formatDate(record.start)], ["截止日期", formatDate(record.deadline)]]} />
        {progress.ready && record.status !== "已完成" && <p className="pm-inline-note"><Check size={14} />任务与阶段已完成，可在编辑中确认项目结束。</p>}
        <div className="award-detail-sections"><section><h3>目标与交付物</h3><p>{record.goal || "尚未填写"}</p></section><section><h3>关联来源</h3><Links value={record.source} /><small className="pm-muted">仅记录引用，不改变课程或投奖状态。</small></section><section><h3>资料与文档</h3><Links value={record.resources} /></section></div></>}
      {tab === "tasks" && <><div className="pm-detail-bar"><span>任务完成后，项目不会自动结束。</span><button type="button" className="quiet-button" onClick={() => show({ entity: "tasks", record: blankRecord("tasks", record.id), edit: true, returnTo: record.id })}><Plus size={13} />添加任务</button></div>{data.tasks.filter((t) => t.projectId === record.id).map((task) => <button type="button" className="pm-task-row" key={task.id} onClick={() => show({ entity: "tasks", id: task.id, edit: false, returnTo: record.id })}><span className={`pm-task-check ${task.status === "已完成" ? "is-done" : ""}`}>{task.status === "已完成" && <Check size={12} />}</span><span><strong>{task.name}</strong><small>{data.stages.find((s) => s.id === task.stageId)?.name || "未分阶段"} · {formatDate(task.deadline)}</small></span><em>{task.archived ? "已归档 · " : ""}{task.status}</em><ChevronRight size={14} /></button>)}{!data.tasks.some((t) => t.projectId === record.id) && <div className="pm-empty">还没有任务，先添加下一步要做的事。</div>}</>}
      {tab === "stages" && <><div className="pm-detail-bar"><span>阶段可选；完成后需确认阶段成果。</span><button type="button" className="quiet-button" onClick={() => show({ entity: "stages", record: blankRecord("stages", record.id), edit: true, returnTo: record.id })}><Plus size={13} />添加阶段</button></div>{data.stages.filter((s) => s.projectId === record.id).map((stage, index, all) => {
        const tasks = data.tasks.filter((t) => t.stageId === stage.id);
        return <div className={`pm-stage-row ${stage.done ? "is-complete" : ""}`} key={stage.id}><span className="pm-stage-number">{stage.done ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span><div><button type="button" className="pm-stage-title" onClick={() => show({ entity: "stages", id: stage.id, edit: true, returnTo: record.id })}>{stage.name}<Pencil size={12} /></button><p>{stage.goal || "尚未填写阶段成果"}</p><small>{formatDate(stage.deadline)} · 任务 {tasks.filter((t) => t.status === "已完成").length}/{tasks.length} · {stage.done ? "成果已确认" : "成果待确认"}</small></div><div className="pm-stage-actions">{[[-1, ArrowUp, "上移"], [1, ArrowDown, "下移"]].map(([offset, Icon, label]) => <button key={label} type="button" className="icon-button" disabled={!all[index + offset]} aria-label={label + stage.name} onClick={() => { try { commit({ type: "move", entity: "stages", id: stage.id, targetId: all[index + offset].id, after: offset > 0 }); } catch (e) { setError(e.message); } }}><Icon size={13} /></button>)}</div></div>;
      })}{!data.stages.some((s) => s.projectId === record.id) && <div className="pm-empty">还没有阶段。简单项目可以直接管理任务。</div>}</>}
    </> : entity === "tasks" ? <><div className="award-detail-tags"><span style={{ "--tag-color": project?.color }}>{record.status}</span>{(record.archived || project?.archived) && <span>{project?.archived ? "随项目归档" : "已归档"}</span>}{record.blocked && record.status !== "已完成" && <span>受阻</span>}</div><Meta rows={[["所属项目", project?.name || "未分配"], ["所属阶段", data.stages.find((s) => s.id === record.stageId)?.name || "未分阶段"], ["负责人", record.owner || "未分配"], ["截止日期", formatDate(record.deadline)]]} /><div className="award-detail-sections">{record.blocked && record.status !== "已完成" && <section><h3>受阻原因</h3><p>{record.blocked}</p></section>}<section><h3>任务说明</h3><p>{record.notes || "尚未填写"}</p></section><section><h3>成果与交付</h3><Links value={record.result} /></section></div></> : <div className="award-detail-sections"><section><h3>阶段成果</h3><p>{record.goal || "尚未填写"}</p></section><section><h3>完成确认</h3><p>{record.done ? "成果已确认" : "成果待确认"} · {formatDate(record.deadline)}</p></section></div>}
  </DialogFrame>;
}
