// Isolated UI QA: no write can reach Feishu. All course data lives in this process.
import http from "node:http";
import { normalizeCourseRecord } from "../../app/api/[...path]/route.js";
const fields = [
  ...["课程名称", "授课教师", "授课安排", "结课内容", "结课要求", "班委姓名", "小组成员", "联合作业课程", "看板颜色"].map(name => ({name, type: 1})),
  {name:"课程类型", type:3, options:["通识课", "必修课", "专业核心课", "专业选修课"]},
  {name:"结课类型", type:3, options:["作业", "考试"]},
  {name:"结课状态", type:3, options:["尚未填写结课信息", "未开始", "进行中", "待提交", "已完成"]},
  {name:"提交方式", type:3, options:["线下考试", "结课汇报", "畅课提交", "班委收集", "其他"]},
  {name:"结课日期",type:5}, {name:"是否组队",type:7}, {name:"工作看板排序",type:2}, {name:"课程看板排序",type:2},
];
const records = ["未开始", "进行中", "待提交", "已完成", "尚未填写结课信息", "考试"].map((status,index) => ({id:`testCourse${index}`, fields:{"课程名称":`测试课程${index + 1}`, "课程类型":fields.find(f=>f.name==="课程类型").options[index % 4], "授课教师":"测试教师", "授课安排":"周一｜第1 - 17周｜第1 - 4节｜测试教室｜每周", "看板颜色":"#75a7f0", ...(status === "尚未填写结课信息" ? {} : {"结课类型":status === "考试" ? "考试" : "作业", "结课状态":status === "考试" ? null : status, "结课内容":"本地交互测试，不会同步到真实表格", "结课要求":"测试要求", "提交方式":"畅课提交", "结课日期":Date.parse("2026-12-20T00:00:00+08:00")})}}));
let failNext = false;
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, "http://127.0.0.1:4318");
  const reply = (value,status=200) => {res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(value));};
  try {
    if(url.pathname === "/__qa/fail-next" && req.method === "POST") {failNext=true;return reply({ok:true});}
    if(url.pathname === "/api/courses" && req.method === "GET") return reply({records,fields,missingFields:[],sourceUrl:"http://127.0.0.1:4318/",generatedAt:new Date().toISOString()});
    if(url.pathname === "/api/courses/records" && ["POST","PATCH"].includes(req.method)) {
      if(failNext) {failNext=false;return reply({error:"模拟保存失败，请重试"},503);}
      let body="";for await(const chunk of req) body+=chunk;
      const data=JSON.parse(body);
      const updates=data.updates || [{recordIds:data.recordIds,fields:data.fields}];
      for(const update of updates) {
        const method=update.fields?.["提交方式"];
        const submit=fields.find(f=>f.name==="提交方式");if(method&&!submit.options.includes(method))submit.options.push(method);
        const normalized=normalizeCourseRecord(update.fields,fields,req.method==="POST");
        if(req.method==="POST") {const created={id:`testCourse${records.length}`,fields:normalized};records.push(created);return reply({ok:true,record:created},201);}
        for(const id of update.recordIds||[]) {const record=records.find(r=>r.id===id);if(record)Object.assign(record.fields,normalized);}
      }
      return reply({updated:updates.length});
    }
    if(req.method !== "GET") return reply({error:"QA proxy blocks all other writes"},403);
    const upstream=await fetch(`http://127.0.0.1:4317${req.url}`);
    res.writeHead(upstream.status,{"content-type":upstream.headers.get("content-type")||"text/plain"});
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch(error) {reply({error:error.message},500);}
});
server.listen(4318,"127.0.0.1",()=>console.log("Isolated course QA: http://127.0.0.1:4318/"));
