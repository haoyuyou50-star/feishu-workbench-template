export const runtime = "edge";

const BASE_URL = "https://open.feishu.cn/open-apis";
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;
const CACHE_SECONDS = 30;
const COURSE_REQUIRED_FIELDS = ["结课类型", "结课状态", "结课内容", "结课要求", "结课日期", "提交方式", "班委姓名", "是否组队", "小组成员", "联合作业课程", "看板颜色", "工作看板排序", "课程看板排序"];
const WIKI_SCOPE = "wiki:wiki:readonly";
const OAUTH_SCOPES = [
  "calendar:calendar:readonly",
  "calendar:calendar.event:read",
  "calendar:calendar.event:reply",
  "task:task:read",
  "task:task:write",
];
const payloadCache = new Map();
const userRefreshFlights = new Map();
let awardCache = { at: 0, payload: null };
let courseCache = { at: 0, payload: null };
const appTokens = {
  tenant: "",
  tenantExpires: 0,
  app: "",
  appExpires: 0,
};

function envValue(name, fallback = "") {
  return process.env?.[name] || fallback;
}

function tenantOrigin() {
  const value = envValue("FEISHU_TENANT_ORIGIN").trim().replace(/\/+$/, "");
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

function bitableConfig(prefix, label) {
  const appToken = envValue(`FEISHU_${prefix}_APP_TOKEN`).trim();
  const tableId = envValue(`FEISHU_${prefix}_TABLE_ID`).trim();
  if (!appToken || !tableId) throw new Error(`${label}未配置，请设置 FEISHU_${prefix}_APP_TOKEN 与 FEISHU_${prefix}_TABLE_ID`);
  return { appToken, tableId };
}

function json(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (extraHeaders instanceof Headers) {
    extraHeaders.forEach((value, key) => headers.append(key, value));
  } else {
    Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

function credentials() {
  const appId = envValue("FEISHU_APP_ID").trim();
  const appSecret = envValue("FEISHU_APP_SECRET").trim();
  if (!appId || !appSecret) throw new Error("未配置 FEISHU_APP_ID 与 FEISHU_APP_SECRET");
  return { appId, appSecret };
}

async function feishuRequest(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = result.code ?? result.error?.code;
    const message = result.msg || result.message || result.error_description || result.error?.message || response.statusText || "未知错误";
    const detail = code === undefined ? message : `${code}: ${message}`;
    throw new Error(`飞书接口 HTTP ${response.status}，${detail}`);
  }
  const resultCode = Number(result.code ?? 0);
  if (Number.isFinite(resultCode) && resultCode !== 0) throw new Error(`飞书接口错误 ${result.code}: ${result.msg || result.error_description || "未知错误"}`);
  return result;
}

async function appToken(kind) {
  const now = Date.now();
  const tokenKey = kind === "tenant" ? "tenant" : "app";
  const expiresKey = kind === "tenant" ? "tenantExpires" : "appExpires";
  if (appTokens[tokenKey] && appTokens[expiresKey] > now + 180000) return appTokens[tokenKey];
  const { appId, appSecret } = credentials();
  const result = await feishuRequest(
    "POST",
    kind === "tenant" ? "/auth/v3/tenant_access_token/internal" : "/auth/v3/app_access_token/internal",
    { body: { app_id: appId, app_secret: appSecret } },
  );
  const token = kind === "tenant" ? result.tenant_access_token : result.app_access_token;
  appTokens[tokenKey] = token;
  appTokens[expiresKey] = now + Number(result.expire || 7200) * 1000;
  return token;
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      const value = rest.join("=");
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return "";
}

function userSessionFromTokenResult(result, { fallbackRefreshToken = "", fallbackScope = "" } = {}) {
  const data = result.data || result;
  const accessToken = data.access_token || result.access_token;
  if (!accessToken) throw new Error("飞书未返回 user_access_token");
  const refreshToken = data.refresh_token || result.refresh_token || fallbackRefreshToken;
  const accessSeconds = Number(data.expires_in || result.expires_in || 7200);
  const refreshSeconds = Number(
    data.refresh_token_expires_in
    || data.refresh_expires_in
    || result.refresh_token_expires_in
    || result.refresh_expires_in
    || 30 * 24 * 60 * 60,
  );
  return {
    accessToken,
    accessMaxAge: Math.max(60, accessSeconds - 120),
    refreshToken,
    refreshMaxAge: Math.max(60, refreshSeconds - 120),
    scope: data.scope || result.scope || fallbackScope,
  };
}

function userSessionCookies(session) {
  const cookies = [
    `feishu_user_token=${encodeURIComponent(session.accessToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${session.accessMaxAge}`,
    `feishu_user_scope=${encodeURIComponent(session.scope || "")}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${session.accessMaxAge}`,
  ];
  if (session.refreshToken) {
    cookies.push(`feishu_user_refresh_token=${encodeURIComponent(session.refreshToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${session.refreshMaxAge}`);
  } else {
    cookies.push("feishu_user_refresh_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  }
  return cookies;
}

function clearedUserSessionCookies() {
  return ["feishu_user_token", "feishu_user_scope", "feishu_user_refresh_token"]
    .map((name) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function withUserSessionCookies(response, context) {
  for (const cookie of context?.setCookies || []) response.headers.append("Set-Cookie", cookie);
  return response;
}

async function refreshUserSession(refreshToken, fallbackScope = "") {
  let flight = userRefreshFlights.get(refreshToken);
  if (!flight) {
    flight = (async () => {
      const { appId, appSecret } = credentials();
      const result = await feishuRequest("POST", "/authen/v2/oauth/token", {
        body: {
          grant_type: "refresh_token",
          client_id: appId,
          client_secret: appSecret,
          refresh_token: refreshToken,
        },
      });
      return userSessionFromTokenResult(result, { fallbackRefreshToken: refreshToken, fallbackScope });
    })();
    userRefreshFlights.set(refreshToken, flight);
    flight.finally(() => userRefreshFlights.delete(refreshToken)).catch(() => {});
  }
  return flight;
}

async function accessContext(request) {
  const userToken = cookieValue(request, "feishu_user_token");
  const grantedScope = cookieValue(request, "feishu_user_scope");
  if (userToken) return { token: userToken, mode: "user", grantedScope, setCookies: [] };
  const refreshToken = cookieValue(request, "feishu_user_refresh_token");
  if (refreshToken) {
    try {
      const session = await refreshUserSession(refreshToken, grantedScope);
      return {
        token: session.accessToken,
        mode: "user",
        grantedScope: session.scope,
        setCookies: userSessionCookies(session),
      };
    } catch {
      return {
        token: await appToken("tenant"),
        mode: "tenant",
        grantedScope: "",
        setCookies: clearedUserSessionCookies(),
      };
    }
  }
  return { token: await appToken("tenant"), mode: "tenant", grantedScope: "", setCookies: [] };
}

async function exchangeUserCode(code, redirectUri) {
  const { appId, appSecret } = credentials();
  const result = await feishuRequest("POST", "/authen/v2/oauth/token", {
    body: {
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: redirectUri,
    },
  });
  return userSessionFromTokenResult(result);
}

async function exchangeClientCode(code) {
  const result = await feishuRequest("POST", "/authen/v1/access_token", {
    token: await appToken("app"),
    body: {
      grant_type: "authorization_code",
      code,
    },
  });
  try {
    return userSessionFromTokenResult(result);
  } catch {
    throw new Error("飞书端内免登未返回 user_access_token");
  }
}

async function listAll(token, path, itemKeys = ["items"]) {
  const items = [];
  let pageToken = "";
  do {
    const url = new URL(`${BASE_URL}${path}`);
    if (!url.searchParams.has("page_size")) url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const pagePath = `${url.pathname.replace("/open-apis", "")}${url.search}`;
    const result = await feishuRequest("GET", pagePath, { token });
    const data = result.data || {};
    const pageItems = itemKeys.map((key) => data[key]).find(Array.isArray) || [];
    items.push(...pageItems);
    pageToken = data.has_more && data.page_token ? data.page_token : "";
  } while (pageToken);
  return items;
}

async function visibleCalendars(token) {
  const actorOpenId = envValue("FEISHU_ACTOR_OPEN_ID").trim();
  const visiblePromise = listAll(token, "/calendar/v4/calendars?page_size=500", ["calendar_list", "items"]);
  const primaryPromise = actorOpenId
    ? feishuRequest("POST", "/calendar/v4/calendars/primarys?user_id_type=open_id", {
        token,
        body: { user_ids: [actorOpenId] },
      })
        .then((result) => (result.data?.calendars || []).map((item) => item.calendar).filter(Boolean))
        .catch(() => [])
    : Promise.resolve([]);
  const [visible, primary] = await Promise.all([visiblePromise, primaryPromise]);
  return [...new Map([...visible, ...primary].filter((item) => item?.calendar_id).map((item) => [item.calendar_id, item])).values()];
}

function colorIntToHex(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0 || number === -1) return null;
  return `#${((number >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function normalizeCalendar(calendar) {
  const role = calendar.role || "reader";
  return {
    id: calendar.calendar_id,
    name: calendar.summary_alias || calendar.summary || "未命名日历",
    color: colorIntToHex(calendar.color) || "#70b78e",
    role,
    type: calendar.type || "unknown",
    isThirdParty: Boolean(calendar.is_third_party),
    group: role === "owner" || role === "writer" ? "managed" : "subscribed",
  };
}

function taskGuidFromSearchItem(item) {
  const direct = String(item?.guid || item?.task_guid || "").trim();
  if (direct) return direct;
  const appLink = item?.meta_data?.app_link || item?.app_link || "";
  try {
    const guid = new URL(appLink).searchParams.get("guid");
    if (guid) return guid;
  } catch {
    // Ignore malformed search links and fall back to a UUID-shaped result ID.
  }
  const id = String(item?.id || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) ? id : "";
}

async function searchTasksBySelfRole(token, openId, roleField) {
  const items = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "30", user_id_type: "open_id" });
    if (pageToken) query.set("page_token", pageToken);
    const result = await feishuRequest("POST", `/task/v2/tasks/search?${query}`, {
      token,
      body: { query: "", filter: { [roleField]: [openId], is_completed: false } },
    });
    const data = result.data || {};
    items.push(...(data.items || []));
    pageToken = data.has_more && data.page_token ? data.page_token : "";
  } while (pageToken);
  return items;
}

export async function visibleTasks(token) {
  const responsible = await listAll(token, "/task/v2/tasks?page_size=100&type=my_tasks&user_id_type=open_id");
  const userResult = await feishuRequest("GET", "/authen/v1/user_info", { token });
  const openId = userResult.data?.open_id || "";
  if (!openId) return { items: responsible, coverageComplete: false, error: "无法识别当前飞书用户，暂时只同步我负责的任务" };

  let roleResults;
  try {
    roleResults = await Promise.all([
      searchTasksBySelfRole(token, openId, "assignee_ids"),
      searchTasksBySelfRole(token, openId, "creator_ids"),
      searchTasksBySelfRole(token, openId, "follower_ids"),
    ]);
  } catch (error) {
    return {
      items: responsible,
      coverageComplete: false,
      error: `参与任务补充读取失败：${error.message || "飞书任务搜索暂时不可用"}`,
    };
  }

  const taskByGuid = new Map();
  for (const task of responsible) {
    const guid = task.guid || task.task_id;
    if (guid) taskByGuid.set(String(guid), task);
  }
  const missingGuids = [...new Set(roleResults.flat().map(taskGuidFromSearchItem).filter(Boolean))]
    .filter((guid) => !taskByGuid.has(guid));
  const details = await mapWithConcurrency(missingGuids, 8, async (guid) => {
    try {
      const result = await feishuRequest("GET", `/task/v2/tasks/${encodeURIComponent(guid)}?user_id_type=open_id`, { token });
      return result.data?.task || null;
    } catch {
      return null;
    }
  });
  details.filter(Boolean).forEach((task) => {
    const guid = task.guid || task.task_id;
    if (guid) taskByGuid.set(String(guid), task);
  });
  const failedDetails = missingGuids.length - details.filter(Boolean).length;
  return {
    items: [...taskByGuid.values()],
    coverageComplete: failedDetails === 0,
    error: failedDetails ? `${failedDetails} 项参与任务详情读取失败` : "",
  };
}

async function updateTaskCompletion(token, guid, completed) {
  const completedAt = completed ? String(Date.now()) : "0";
  const result = await feishuRequest("PATCH", `/task/v2/tasks/${encodeURIComponent(guid)}`, {
    token,
    body: {
      task: { completed_at: completedAt },
      update_fields: ["completed_at"],
    },
  });
  const confirmedAt = result.data?.task?.completed_at ?? completedAt;
  return {
    guid,
    completed: String(confirmedAt) !== "0",
    completedAt: String(confirmedAt),
  };
}

async function recentDocs(token) {
  const queries = envValue("FEISHU_RECENT_DOC_QUERIES")
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!queries.length) return [];
  const results = await Promise.all(
    queries.map((searchKey) =>
      feishuRequest("POST", "/suite/docs-api/search/object", {
        token,
        body: { search_key: searchKey, count: 20, offset: 0 },
      })
        .then((result) => result.data?.docs_entities || result.data?.items || result.data?.objects || [])
        .catch(() => []),
    ),
  );
  const found = new Map();
  for (const item of results.flat()) {
    const key = String(item.docs_token || item.token || item.url || JSON.stringify(item));
    found.set(key, item);
  }
  return [...found.values()].slice(0, 12);
}

async function visibleWikiSpaces(token) {
  const origin = tenantOrigin();
  if (!origin) throw new Error("知识库链接未配置，请设置 FEISHU_TENANT_ORIGIN");
  const spaces = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "50" });
    if (pageToken) query.set("page_token", pageToken);
    const result = await feishuRequest("GET", `/wiki/v2/spaces?${query}`, { token });
    const data = result.data || {};
    spaces.push(...(data.items || []));
    pageToken = data.has_more && data.page_token ? data.page_token : "";
  } while (pageToken);

  const roots = await Promise.allSettled(spaces.map((space) =>
    feishuRequest("GET", `/wiki/v2/spaces/${encodeURIComponent(space.space_id)}/nodes?page_size=1`, { token })
      .then((result) => result.data?.items?.[0] || null),
  ));
  return spaces.map((space, index) => {
    const root = roots[index].status === "fulfilled" ? roots[index].value : null;
    const url = root?.node_token ? `${origin}/wiki/${root.node_token}` : `${origin}/wiki/`;
    return {
      id: String(space.space_id),
      name: space.name || "未命名知识库",
      description: space.description || "",
      spaceType: space.space_type === "person" ? "个人" : space.space_type === "team" ? "团队" : "知识库",
      url,
    };
  });
}

async function wikiPayload(token, authMode, grantedScope) {
  const grantedScopes = grantedScope.split(/\s+/).filter(Boolean);
  if (authMode !== "user" || !grantedScopes.includes(WIKI_SCOPE)) {
    return {
      error: "需要授权读取飞书知识库",
      requiresAuthorization: true,
      requiredScope: WIKI_SCOPE,
    };
  }
  return {
    spaces: await visibleWikiSpaces(token),
    source: { authMode, personalAccess: true, requiresAuthorization: false, grantedScopes },
  };
}

function docUrl(item) {
  if (item.url) return item.url;
  const token = item.docs_token || item.token || "";
  const type = item.docs_type || item.type || "docx";
  const path = { bitable: "base", docx: "docx", wiki: "wiki" }[type] || "docx";
  const origin = tenantOrigin();
  return token && origin ? `${origin}/${path}/${token}` : "https://www.feishu.cn/";
}

function dateText(date = new Date()) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function dayStartMs(value) {
  return Date.parse(`${value}T00:00:00+08:00`);
}

function awardConfig() {
  return bitableConfig("AWARDS", "投奖看板");
}

async function awardSchema(token) {
  const { appToken, tableId } = awardConfig();
  const fields = await listAll(token, `/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`);
  return fields.map((field) => {
    const options = field.property?.options || [];
    return {
      id: field.field_id,
      name: field.field_name,
      type: field.type,
      uiType: field.ui_type,
      primary: Boolean(field.is_primary),
      options: options.map((option) => option.name).filter(Boolean),
      optionDetails: options
        .filter((option) => option.name)
        .map((option) => Object.fromEntries(["id", "name", "color"].filter((key) => option[key] !== undefined).map((key) => [key, option[key]]))),
    };
  });
}

async function awardPayload(token, force = false) {
  if (!force && awardCache.payload && Date.now() - awardCache.at < CACHE_SECONDS * 1000) return awardCache.payload;
  const { appToken, tableId } = awardConfig();
  const tablePath = `/bitable/v1/apps/${appToken}/tables/${tableId}`;
  const [tables, fields, views, records] = await Promise.all([
    listAll(token, `/bitable/v1/apps/${appToken}/tables?page_size=100`),
    awardSchema(token),
    listAll(token, `${tablePath}/views?page_size=100`),
    listAll(token, `${tablePath}/records?page_size=500`),
  ]);
  const payload = {
    appToken,
    tableId,
    tableName: tables.find((table) => table.table_id === tableId)?.name || "投奖台账",
    fields,
    views: views.map((view) => ({ id: view.view_id, name: view.view_name, type: view.view_type })),
    records: records.map((record) => ({ id: record.record_id || record.id, fields: record.fields || {} })),
    generatedAt: shanghaiIso(Date.now()),
  };
  awardCache = { at: Date.now(), payload };
  return payload;
}

export function normalizeAwardRecord(values, fields, { includeEmpty = false } = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("记录字段格式无效");
  const input = { ...values };
  const primary = fields.find((field) => field.primary)?.name || "投奖条目";
  if (!String(input[primary] || "").trim()) {
    input[primary] = [input["项目名称"], input["比赛名称"]].map((value) => String(value || "").trim()).filter(Boolean).join(" | ");
  }
  const normalized = {};
  for (const field of fields) {
    const name = String(field.name || "");
    if (!name || !Object.hasOwn(input, name)) continue;
    if (input[name] === null || input[name] === "") {
      if (includeEmpty && !field.primary) normalized[name] = null;
      continue;
    }
    const raw = input[name];
    const fieldType = Number(field.type || 0);
    if (fieldType === 5) {
      const value = String(raw).trim();
      const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) throw new Error(`${name} 不是有效日期`);
      const canonical = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      const timestamp = dayStartMs(canonical);
      if (!Number.isFinite(timestamp) || dateText(new Date(timestamp)) !== canonical) throw new Error(`${name} 不是有效日期`);
      normalized[name] = timestamp;
    } else if (fieldType === 15) {
      const link = String(raw).trim();
      if (!/^https?:\/\//i.test(link)) throw new Error(`${name} 需要填写完整网址`);
      normalized[name] = { link, text: link };
    } else if (fieldType === 3) {
      const option = String(raw).trim();
      if (field.options?.length && !field.options.includes(option)) throw new Error(`${name} 的选项无效`);
      normalized[name] = option;
    } else {
      normalized[name] = String(raw).trim();
    }
  }
  if (!normalized[primary]) throw new Error(`${primary} 为必填项`);
  return normalized;
}

async function ensureAwardProjectOption(token, fields, projectName) {
  const name = String(projectName || "").trim();
  const projectField = fields.find((field) => field.name === "项目名称");
  if (!name || !projectField || Number(projectField.type) !== 3 || projectField.options?.includes(name)) return fields;
  const { appToken, tableId } = awardConfig();
  await feishuRequest("PUT", `/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${projectField.id}`, {
    token,
    body: {
      field_name: "项目名称",
      type: 3,
      property: { options: [...(projectField.optionDetails || []).map((option) => ({ ...option })), { name, color: 15 }] },
    },
  });
  return awardSchema(token);
}

async function createAwardRecord(token, values, createProject = false) {
  let fields = await awardSchema(token);
  if (createProject) fields = await ensureAwardProjectOption(token, fields, values?.["项目名称"]);
  const normalized = normalizeAwardRecord(values, fields);
  const { appToken, tableId } = awardConfig();
  const result = await feishuRequest("POST", `/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
    token,
    body: { fields: normalized },
  });
  awardCache = { at: 0, payload: null };
  const record = result.data?.record || result.data || {};
  return { id: record.record_id || record.id, fields: record.fields || normalized };
}

async function updateAwardRecord(token, recordId, values, createProject = false) {
  let fields = await awardSchema(token);
  if (createProject) fields = await ensureAwardProjectOption(token, fields, values?.["项目名称"]);
  const normalized = normalizeAwardRecord(values, fields, { includeEmpty: true });
  const { appToken, tableId } = awardConfig();
  const result = await feishuRequest(
    "PUT",
    `/bitable/v1/apps/${appToken}/tables/${tableId}/records/${encodeURIComponent(recordId)}`,
    { token, body: { fields: normalized } },
  );
  awardCache = { at: 0, payload: null };
  const record = result.data?.record || result.data || {};
  return { id: record.record_id || record.id || recordId, fields: record.fields || normalized };
}

function courseConfig() {
  return bitableConfig("COURSES", "课程看板");
}

async function courseSchema(token) {
  const { appToken, tableId } = courseConfig();
  const fields = await listAll(token, `/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`);
  return fields.map((field) => {
    const options = field.property?.options || [];
    return {
      id: field.field_id,
      name: field.field_name,
      type: field.type,
      uiType: field.ui_type,
      primary: Boolean(field.is_primary),
      options: options.map((option) => option.name).filter(Boolean),
      optionDetails: options.filter((option) => option.name).map((option) => Object.fromEntries(["id", "name", "color"].filter((key) => option[key] !== undefined).map((key) => [key, option[key]]))),
    };
  });
}

async function coursePayload(token, force = false) {
  if (!force && courseCache.payload && Date.now() - courseCache.at < CACHE_SECONDS * 1000) return courseCache.payload;
  const { appToken, tableId } = courseConfig();
  const tablePath = `/bitable/v1/apps/${appToken}/tables/${tableId}`;
  const [tables, fields, records] = await Promise.all([
    listAll(token, `/bitable/v1/apps/${appToken}/tables?page_size=100`),
    courseSchema(token),
    listAll(token, `${tablePath}/records?page_size=500`),
  ]);
  const fieldNames = new Set(fields.map((field) => field.name));
  const payload = {
    appToken,
    tableId,
    tableName: tables.find((table) => table.table_id === tableId)?.name || "课程表",
    sourceUrl: tenantOrigin() ? `${tenantOrigin()}/base/${appToken}` : "",
    fields,
    missingFields: COURSE_REQUIRED_FIELDS.filter((name) => !fieldNames.has(name)),
    records: records.map((record) => ({ id: record.record_id || record.id, fields: record.fields || {} })),
    generatedAt: shanghaiIso(Date.now()),
  };
  courseCache = { at: Date.now(), payload };
  return payload;
}

export function normalizeCourseRecord(values, fields, requireCourseName = false) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("课程字段格式无效");
  const normalized = {};
  for (const field of fields) {
    const name = String(field.name || "");
    if (!name || !Object.hasOwn(values, name)) continue;
    const raw = values[name];
    if (raw === null || raw === "") {
      normalized[name] = null;
      continue;
    }
    const type = Number(field.type || 0);
    if (type === 5) {
      const value = String(raw).trim();
      const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) throw new Error(`${name} 不是有效日期`);
      const canonical = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      const timestamp = dayStartMs(canonical);
      if (!Number.isFinite(timestamp) || dateText(new Date(timestamp)) !== canonical) throw new Error(`${name} 不是有效日期`);
      normalized[name] = timestamp;
    } else if (type === 3) {
      const option = String(raw).trim();
      if (field.options?.length && !field.options.includes(option)) throw new Error(`${name} 的选项无效`);
      normalized[name] = option;
    } else if (type === 7) {
      normalized[name] = Boolean(raw);
    } else if (type === 2) {
      const number = Number(raw);
      if (!Number.isFinite(number)) throw new Error(`${name} 不是有效数字`);
      normalized[name] = number;
    } else {
      normalized[name] = String(raw).trim();
    }
  }
  if (String(values["结课类型"] || "") === "考试") {
    if (fields.some((field) => field.name === "结课状态")) normalized["结课状态"] = null;
    if (fields.some((field) => field.name === "是否组队")) normalized["是否组队"] = false;
    if (fields.some((field) => field.name === "小组成员")) normalized["小组成员"] = null;
    if (fields.some((field) => field.name === "联合作业课程")) normalized["联合作业课程"] = null;
  }
  if (requireCourseName && !String(normalized["课程名称"] || "").trim()) throw new Error("课程名称为必填项");
  return normalized;
}

async function ensureCourseSubmitOption(token, fields, submitMethod) {
  const name = String(submitMethod || "").trim();
  const field = fields.find((item) => item.name === "提交方式");
  if (!name || !field || Number(field.type) !== 3 || field.options?.includes(name)) return fields;
  const { appToken, tableId } = courseConfig();
  await feishuRequest("PUT", `/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${field.id}`, {
    token,
    body: {
      field_name: "提交方式",
      type: 3,
      property: { options: [...(field.optionDetails || []).map((option) => ({ ...option })), { name, color: 15 }] },
    },
  });
  return courseSchema(token);
}

async function createCourseRecord(token, values) {
  let fields = await courseSchema(token);
  const missing = COURSE_REQUIRED_FIELDS.filter((name) => !fields.some((field) => field.name === name));
  if (missing.length) throw new Error(`课程表尚未完成结课字段配置：${missing.join("、")}`);
  fields = await ensureCourseSubmitOption(token, fields, values?.["提交方式"]);
  const normalized = normalizeCourseRecord(values, fields, true);
  const { appToken, tableId } = courseConfig();
  const result = await feishuRequest("POST", `/bitable/v1/apps/${appToken}/tables/${tableId}/records`, { token, body: { fields: normalized } });
  courseCache = { at: 0, payload: null };
  const record = result.data?.record || result.data || {};
  return { id: record.record_id || record.id, fields: record.fields || normalized };
}

async function updateCourseRecords(token, updates) {
  let fields = await courseSchema(token);
  const missing = COURSE_REQUIRED_FIELDS.filter((name) => !fields.some((field) => field.name === name));
  if (missing.length) throw new Error(`课程表尚未完成结课字段配置：${missing.join("、")}`);
  for (const update of updates) fields = await ensureCourseSubmitOption(token, fields, update?.fields?.["提交方式"]);
  const records = [];
  for (const update of updates) {
    const ids = Array.isArray(update?.recordIds) ? [...new Set(update.recordIds.map(String))] : [];
    if (!ids.length || ids.some((id) => !/^[A-Za-z0-9_-]{6,128}$/.test(id))) throw new Error("课程记录 ID 无效");
    const normalized = normalizeCourseRecord(update.fields, fields, false);
    for (const recordId of ids) records.push({ record_id: recordId, fields: normalized });
  }
  if (!records.length) throw new Error("没有需要更新的课程记录");
  const { appToken, tableId } = courseConfig();
  const tablePath = `/bitable/v1/apps/${appToken}/tables/${tableId}`;
  for (let index = 0; index < records.length; index += 500) {
    await feishuRequest("POST", `${tablePath}/records/batch_update`, { token, body: { records: records.slice(index, index + 500) } });
  }
  courseCache = { at: 0, payload: null };
  return { updated: records.length };
}

function shanghaiIso(milliseconds) {
  const shifted = new Date(milliseconds + SHANGHAI_OFFSET).toISOString().replace("Z", "");
  return `${shifted}+08:00`;
}

function timestampMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number >= 1e12 ? number : number * 1000;
}

function eventBounds(event, baseDate) {
  const startData = event.start_time || {};
  const endData = event.end_time || {};
  const startTimestamp = timestampMs(startData.timestamp);
  const endTimestamp = timestampMs(endData.timestamp);
  const start = startTimestamp ?? dayStartMs(startData.date || baseDate);
  const end = endTimestamp ?? dayStartMs(endData.date || dateText(new Date(dayStartMs(baseDate) + 86400000)));
  return { start, end: Math.max(start + 60000, end) };
}

export function normalizeEvent(event, baseDate) {
  const { start, end } = eventBounds(event, baseDate);
  const dayStart = dayStartMs(baseDate);
  const location = event.location || {};
  return {
    id: event.event_id || `${event.summary || ""}-${start}`,
    calendarId: event.calendar_id || "",
    title: event.summary || "未命名日程",
    calendar: event.calendar_name || "飞书日历",
    calendarColor: colorIntToHex(event.calendar_color) || "#70b78e",
    color: colorIntToHex(event.color) || colorIntToHex(event.calendar_color) || "#70b78e",
    start: shanghaiIso(start),
    end: shanghaiIso(end),
    startMinute: Math.max(0, Math.floor((start - dayStart) / 60000)),
    endMinute: Math.min(1440, Math.floor((end - dayStart) / 60000)),
    allDay: !event.start_time?.timestamp,
    location: location.name || "",
    description: event.description || "",
    status: event.status || "confirmed",
    rsvpStatus: event.rsvp_status || (event.status === "tentative" ? "needs_action" : event.status === "cancelled" ? "decline" : "accept"),
    canReply: Boolean(event.rsvp_status && !event.calendar_is_third_party && !event.is_self_organizer),
    isOrganizer: Boolean(event.is_self_organizer),
    url: event.app_link || "",
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function fallbackRsvpStatus(event, openId) {
  if (openId && event.event_organizer?.user_id === openId) return "accept";
  if (event.status === "cancelled") return "decline";
  return "needs_action";
}

async function enrichEventRsvp(token, events, authMode) {
  if (authMode !== "user" || events.length === 0) return events;
  const userResult = await feishuRequest("GET", "/authen/v1/user_info", { token }).catch(() => null);
  const openId = userResult?.data?.open_id || "";
  if (!openId) return events;
  return mapWithConcurrency(events, 8, async (event) => {
    const isOrganizer = event.event_organizer?.user_id === openId;
    if (isOrganizer) return { ...event, rsvp_status: "accept", is_self_organizer: true };
    const fallback = fallbackRsvpStatus(event, openId);
    if (event.calendar_is_third_party) return { ...event, rsvp_status: fallback, is_self_organizer: false };
    try {
      const attendees = await listAll(
        token,
        `/calendar/v4/calendars/${encodeURIComponent(event.calendar_id)}/events/${encodeURIComponent(event.event_id)}/attendees?user_id_type=open_id&page_size=100`,
      );
      const self = attendees.find((attendee) => attendee.type === "user" && attendee.user_id === openId);
      return { ...event, rsvp_status: self?.rsvp_status || fallback, is_self_organizer: false };
    } catch {
      return { ...event, rsvp_status: fallback, is_self_organizer: false };
    }
  });
}

async function eventsInRange(token, calendars, start, end) {
  const batches = await Promise.all(
    calendars.map(async (calendar) => {
      const path = `/calendar/v4/calendars/${encodeURIComponent(calendar.calendar_id)}/events?page_size=100&start_time=${Math.floor(start / 1000)}&end_time=${Math.floor(end / 1000)}`;
      try {
        const events = await listAll(token, path);
        return {
          events: events
          .map((event) => ({
            ...event,
            calendar_id: calendar.calendar_id,
            calendar_name: calendar.summary || calendar.summary_alias || "未命名日历",
            calendar_color: calendar.color,
            calendar_is_third_party: calendar.is_third_party,
          })),
          error: null,
        };
      } catch (error) {
        return { events: [], error };
      }
    }),
  );
  const failed = batches.filter((batch) => batch.error);
  if (calendars.length > 0 && failed.length === calendars.length) throw failed[0].error;
  const unique = new Map();
  for (const event of batches.flatMap((batch) => batch.events)) {
    const key = `${event.calendar_id || "calendar"}|${event.event_id || [
      event.summary || "",
      event.start_time?.timestamp || event.start_time?.date || "",
      event.end_time?.timestamp || event.end_time?.date || "",
    ].join("|")}`;
    if (!unique.has(key)) unique.set(key, event);
  }
  return [...unique.values()].sort((a, b) =>
    String(a.start_time?.timestamp || a.start_time?.date || "").localeCompare(String(b.start_time?.timestamp || b.start_time?.date || "")),
  );
}

export function normalizeTask(task, nowMs) {
  const due = timestampMs(task.due?.timestamp);
  const completedAt = timestampMs(task.completed_at);
  const completed = Boolean(completedAt && completedAt > 0) || task.status === "done";
  const guid = task.guid || task.task_id || "";
  return {
    id: guid || task.summary || JSON.stringify(task),
    guid,
    title: task.summary || "未命名任务",
    due: due ? shanghaiIso(due) : null,
    completedAt: completedAt ? shanghaiIso(completedAt) : null,
    overdue: Boolean(!completed && due && due < nowMs),
    completed,
    url: task.url || (guid ? `https://applink.feishu.cn/client/todo/detail?guid=${guid}` : ""),
  };
}

export function isTaskVisibleToday(task, today) {
  const dueToday = Boolean(task.due && dateText(new Date(task.due)) === today);
  if (task.completed) {
    const completedToday = Boolean(task.completedAt && dateText(new Date(task.completedAt)) === today);
    return dueToday || completedToday;
  }
  return !task.due || task.overdue || dueToday;
}

export function prepareDashboardTasks(sourceTasks, nowMs = Date.now()) {
  const today = dateText(new Date(nowMs));
  return sourceTasks
    .map((task) => normalizeTask(task, nowMs))
    .map((task) => ({ ...task, defaultToday: isTaskVisibleToday(task, today) }))
    .sort((left, right) => Number(left.completed) - Number(right.completed));
}

async function buildDashboard(token, authMode, grantedScope = "") {
  const now = new Date();
  const today = dateText(now);
  const start = dayStartMs(today);
  const sources = await Promise.allSettled([visibleCalendars(token), visibleTasks(token), recentDocs(token)]);
  const sourceNames = ["日历", "任务", "项目"];
  const errors = sources
    .map((source, index) => (source.status === "rejected" ? `${sourceNames[index]}：${source.reason?.message || "加载失败"}` : ""))
    .filter(Boolean);
  const grantedScopes = grantedScope.split(/\s+/).filter(Boolean);
  const missingScopes = authMode === "user" ? OAUTH_SCOPES.filter((scope) => !grantedScopes.includes(scope)) : OAUTH_SCOPES;
  const calendars = sources[0].status === "fulfilled" ? sources[0].value : [];
  const taskSource = sources[1].status === "fulfilled"
    ? sources[1].value
    : { items: [], coverageComplete: false, error: "" };
  const sourceTasks = taskSource.items || [];
  const sourceDocs = sources[2].status === "fulfilled" ? sources[2].value : [];
  if (taskSource.error) errors.push(`任务：${taskSource.error}`);
  let events = [];
  let eventDetailsAvailable = sources[0].status === "fulfilled";
  try {
    const rawEvents = await eventsInRange(token, calendars, start, start + 86400000);
    events = (await enrichEventRsvp(token, rawEvents, authMode)).map((event) => normalizeEvent(event, today));
  } catch (error) {
    eventDetailsAvailable = false;
    errors.push(`日程详情：${error.message || "加载失败"}`);
  }
  const reauthorizationRequired = errors.some((error) => error.includes("99991679")) || (authMode === "user" && missingScopes.length > 0);
  const tasks = prepareDashboardTasks(sourceTasks, now.getTime());
  const projects = sourceDocs.map((item, index) => ({
    id: item.docs_token || String(index + 1),
    title: item.title || "未命名文档",
    kind: { bitable: "多维表格", docx: "文档", wiki: "知识库" }[item.docs_type] || "资料",
    url: docUrl(item),
  }));
  const futureEvents = events.filter((event) => new Date(event.end) >= now).sort((a, b) => new Date(a.start) - new Date(b.start));
  return {
    generatedAt: shanghaiIso(now.getTime()),
    source: {
      calendarCount: calendars.length,
      authMode,
      personalAccess: authMode === "user",
      calendarDetailsAvailable: authMode === "user" && eventDetailsAvailable,
      tasksPersonalAvailable: authMode === "user" && sources[1].status === "fulfilled",
      tasksCoverageComplete: authMode === "user" && sources[1].status === "fulfilled" && taskSource.coverageComplete !== false,
      taskCount: tasks.length,
      tasksWriteAvailable: authMode === "user" && grantedScopes.includes("task:task:write"),
      calendarReplyAvailable: authMode === "user" && grantedScopes.includes("calendar:calendar.event:reply"),
      scope: authMode === "user" && errors.length === 0 ? "飞书个人数据已同步" : "飞书应用可见范围",
      requestedScopes: OAUTH_SCOPES,
      grantedScopes,
      missingScopes,
      errors,
      reauthorizationRequired,
    },
    calendars: calendars.map(normalizeCalendar),
    events,
    tasks,
    nextEvent: futureEvents[0] || null,
    projects,
    quickActions: [
      { id: "event", label: "新建日程", url: "https://applink.feishu.cn/client/calendar/event/create" },
      { id: "task", label: "新建任务", url: "https://applink.feishu.cn/client/todo/create" },
      { id: "minutes", label: "新建妙记", url: "https://applink.feishu.cn/minutes/home" },
    ],
  };
}

async function cachedDashboard(token, mode, grantedScope, force) {
  const cached = payloadCache.get(token);
  if (!force && cached && Date.now() - cached.at < CACHE_SECONDS * 1000) return cached.payload;
  const payload = await buildDashboard(token, mode, grantedScope);
  payloadCache.set(token, { at: Date.now(), payload });
  return payload;
}

async function calendarPayload(token, authMode, grantedScope, startText, endText) {
  const start = dayStartMs(startText);
  const end = dayStartMs(endText);
  const days = (end - start) / 86400000;
  if (!Number.isFinite(days) || days < 1 || days > 50) throw new Error("日历查询范围需为 1 至 50 天");
  const calendars = await visibleCalendars(token);
  const rawEvents = await eventsInRange(token, calendars, start, end);
  const events = (await enrichEventRsvp(token, rawEvents, authMode)).map((event) => normalizeEvent(event, startText));
  return {
    start: startText,
    end: endText,
    calendars: calendars.map(normalizeCalendar),
    events,
    source: {
      authMode,
      personalAccess: authMode === "user",
      calendarDetailsAvailable: authMode === "user",
      calendarCount: calendars.length,
      calendarReplyAvailable: authMode === "user" && grantedScope.split(/\s+/).includes("calendar:calendar.event:reply"),
      grantedScopes: grantedScope.split(/\s+/).filter(Boolean),
    },
  };
}

export async function GET(request) {
  let requestAccess = null;
  try {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/start") {
      const { appId } = credentials();
      const state = crypto.randomUUID();
      const reauthorize = url.searchParams.get("reauthorize") === "1";
      const redirectUri = `${url.origin}/api/auth/callback`;
      const authorizeUrl = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
      authorizeUrl.searchParams.set("app_id", appId);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      const requestedScopes = url.searchParams.get("include_wiki") === "1" ? [...OAUTH_SCOPES, WIKI_SCOPE] : OAUTH_SCOPES;
      authorizeUrl.searchParams.set("scope", requestedScopes.join(" "));
      authorizeUrl.searchParams.set("state", state);
      const headers = new Headers({ Location: authorizeUrl.toString(), "Cache-Control": "no-store" });
      headers.append("Set-Cookie", `feishu_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
      if (reauthorize) {
        headers.append("Set-Cookie", "feishu_user_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
        headers.append("Set-Cookie", "feishu_user_scope=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
        headers.append("Set-Cookie", "feishu_user_refresh_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
      }
      return new Response(null, { status: 302, headers });
    }
    if (url.pathname === "/api/auth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expectedState = cookieValue(request, "feishu_oauth_state");
      if (!code) return json({ error: "飞书授权回调缺少 code" }, 400);
      if (!state || !expectedState || state !== expectedState) return json({ error: "飞书授权状态校验失败" }, 400);
      const redirectUri = `${url.origin}/api/auth/callback`;
      const session = await exchangeUserCode(code, redirectUri);
      const headers = new Headers({ Location: "/", "Cache-Control": "no-store" });
      userSessionCookies(session).forEach((cookie) => headers.append("Set-Cookie", cookie));
      headers.append("Set-Cookie", "feishu_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
      return new Response(null, { status: 303, headers });
    }
    if (url.pathname === "/api/health") {
      const { appId } = credentials();
      return json({ ok: true, appConfigured: Boolean(appId), runtime: "edge" });
    }
    if (url.pathname === "/api/config") {
      const { appId } = credentials();
      return json({ appId, inAppAuthEnabled: true });
    }
    if (url.pathname === "/api/auth/status") {
      requestAccess = await accessContext(request);
      const { mode, grantedScope } = requestAccess;
      return withUserSessionCookies(json({ authMode: mode, personalAccess: mode === "user", grantedScopes: grantedScope.split(/\s+/).filter(Boolean) }), requestAccess);
    }
    if (url.pathname === "/api/awards") {
      return json(await awardPayload(await appToken("tenant"), url.searchParams.get("refresh") === "1"));
    }
    if (url.pathname === "/api/courses") {
      return json(await coursePayload(await appToken("tenant"), url.searchParams.get("refresh") === "1"));
    }
    requestAccess = await accessContext(request);
    const { token, mode, grantedScope } = requestAccess;
    if (url.pathname === "/api/dashboard") {
      return withUserSessionCookies(json(await cachedDashboard(token, mode, grantedScope, url.searchParams.get("refresh") === "1")), requestAccess);
    }
    if (url.pathname === "/api/calendar") {
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      if (!start || !end) return withUserSessionCookies(json({ error: "start 与 end 为必填日期" }, 400), requestAccess);
      return withUserSessionCookies(json(await calendarPayload(token, mode, grantedScope, start, end)), requestAccess);
    }
    if (url.pathname === "/api/wiki") {
      const payload = await wikiPayload(token, mode, grantedScope);
      return withUserSessionCookies(json(payload, payload.requiresAuthorization ? 403 : 200), requestAccess);
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return withUserSessionCookies(json({ error: error.message || "服务暂时不可用" }, 500), requestAccess);
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/api/courses/records") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "请求来源校验失败" }, 403);
      const body = await request.json().catch(() => null);
      if (!body || typeof body.fields !== "object" || Array.isArray(body.fields)) return json({ error: "课程字段格式无效" }, 400);
      const record = await createCourseRecord(await appToken("tenant"), body.fields);
      return json({ ok: true, record }, 201);
    }
    if (url.pathname === "/api/awards/records") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "请求来源校验失败" }, 403);
      const body = await request.json().catch(() => null);
      if (!body || typeof body.fields !== "object" || Array.isArray(body.fields)) return json({ error: "记录字段格式无效" }, 400);
      const record = await createAwardRecord(await appToken("tenant"), body.fields, Boolean(body.createProject));
      return json({ ok: true, record }, 201);
    }
    if (url.pathname !== "/api/auth/exchange") return json({ error: "Not found" }, 404);
    const { code, flow } = await request.json();
    if (!code) return json({ error: "缺少飞书授权码" }, 400);
    const redirectUri = `${url.origin}/api/auth/callback`;
    const session = flow === "client"
      ? await exchangeClientCode(code)
      : await exchangeUserCode(code, redirectUri);
    const headers = new Headers();
    userSessionCookies(session).forEach((cookie) => headers.append("Set-Cookie", cookie));
    return json({ ok: true, personalAccess: true, grantedScopes: session.scope.split(/\s+/).filter(Boolean) }, 200, headers);
  } catch (error) {
    return json({ error: error.message || "飞书授权失败" }, 500);
  }
}

export async function PATCH(request) {
  let requestAccess = null;
  try {
    const url = new URL(request.url);
    const awardRecordMatch = url.pathname.match(/^\/api\/awards\/records\/([^/]+)$/);
    if (awardRecordMatch) {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "请求来源校验失败" }, 403);
      const recordId = decodeURIComponent(awardRecordMatch[1]);
      if (!/^[A-Za-z0-9_-]{4,128}$/.test(recordId)) return json({ error: "投奖记录 ID 无效" }, 400);
      const body = await request.json().catch(() => null);
      if (!body || typeof body.fields !== "object" || Array.isArray(body.fields)) return json({ error: "记录字段格式无效" }, 400);
      const record = await updateAwardRecord(await appToken("tenant"), recordId, body.fields, Boolean(body.createProject));
      return json({ ok: true, record });
    }
    if (url.pathname === "/api/courses/records") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "请求来源校验失败" }, 403);
      const body = await request.json().catch(() => null);
      const updates = Array.isArray(body?.updates) ? body.updates : body?.recordIds && body?.fields ? [{ recordIds: body.recordIds, fields: body.fields }] : [];
      if (!updates.length || updates.some((item) => !item || typeof item.fields !== "object" || Array.isArray(item.fields))) return json({ error: "课程更新格式无效" }, 400);
      const result = await updateCourseRecords(await appToken("tenant"), updates);
      return json({ ok: true, ...result });
    }
    if (url.pathname === "/api/calendar/events/rsvp") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "请求来源校验失败" }, 403);
      const body = await request.json().catch(() => null);
      const calendarId = String(body?.calendarId || "");
      const eventId = String(body?.eventId || "");
      const rsvpStatus = String(body?.rsvpStatus || "");
      if (!calendarId || calendarId.length > 256 || calendarId.includes("/")) return json({ error: "日历 ID 无效" }, 400);
      if (!eventId || eventId.length > 256 || eventId.includes("/")) return json({ error: "日程 ID 无效" }, 400);
      if (!new Set(["accept", "tentative", "decline"]).has(rsvpStatus)) return json({ error: "RSVP 状态无效" }, 400);
      requestAccess = await accessContext(request);
      const { token, mode, grantedScope } = requestAccess;
      if (mode !== "user") return withUserSessionCookies(json({ error: "请先授权飞书个人日历" }, 401), requestAccess);
      if (!grantedScope.split(/\s+/).includes("calendar:calendar.event:reply")) {
        return withUserSessionCookies(json({ error: "需要重新授权飞书日程回复权限", reauthorizationRequired: true }, 403), requestAccess);
      }
      await feishuRequest(
        "POST",
        `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/reply`,
        { token, body: { rsvp_status: rsvpStatus } },
      );
      payloadCache.delete(token);
      return withUserSessionCookies(json({ ok: true, event: { calendarId, eventId, rsvpStatus } }), requestAccess);
    }
    const match = url.pathname.match(/^\/api\/tasks\/([^/]+)\/completion$/);
    if (!match) return json({ error: "Not found" }, 404);

    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return json({ error: "请求来源校验失败" }, 403);

    const guid = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(guid)) return json({ error: "任务 ID 无效" }, 400);

    requestAccess = await accessContext(request);
    const { token, mode, grantedScope } = requestAccess;
    if (mode !== "user") return withUserSessionCookies(json({ error: "请先授权飞书个人任务" }, 401), requestAccess);

    const grantedScopes = grantedScope.split(/\s+/).filter(Boolean);
    if (!grantedScopes.includes("task:task:write")) {
      return withUserSessionCookies(json({ error: "需要重新授权飞书任务写入权限", reauthorizationRequired: true }, 403), requestAccess);
    }

    const body = await request.json().catch(() => null);
    if (typeof body?.completed !== "boolean") return json({ error: "completed 必须为布尔值" }, 400);

    const task = await updateTaskCompletion(token, guid, body.completed);
    payloadCache.delete(token);
    return withUserSessionCookies(json({ ok: true, task }), requestAccess);
  } catch (error) {
    const pathname = new URL(request.url).pathname;
    const isCalendarReply = pathname === "/api/calendar/events/rsvp";
    const isAwardUpdate = pathname.startsWith("/api/awards/records/");
    const message = error.message || (isCalendarReply ? "飞书日程回复失败" : isAwardUpdate ? "投奖记录更新失败" : "飞书任务更新失败");
    const permissionError = /99991679|Unauthorized|permission/i.test(message);
    return withUserSessionCookies(json({ error: message, reauthorizationRequired: permissionError }, permissionError ? 403 : 502), requestAccess);
  }
}
