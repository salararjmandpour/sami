import { dbDelete, dbGet, dbGetAll, dbPut } from "./indexeddb-service.js";

let apiStatus = null;
let storageNotice = null;

export function postgresApiIsConnected(payload) {
  return payload?.ok === true && payload?.storage === "postgres" && payload?.database === "connected";
}

export function storageSavedMessage(result) {
  if (result?.storage === "postgres" && !result?.fallback) return "گزارش در PostgreSQL ذخیره شد.";
  if (result?.fallback) return "ذخیره در PostgreSQL ناموفق بود. گزارش فقط در مرورگر ذخیره شد، نه در پایگاه داده.";
  return "گزارش در مرورگر ذخیره شد. PostgreSQL برای این ذخیره استفاده نشد.";
}

export function consumeStorageNotice() {
  const notice = storageNotice;
  storageNotice = null;
  return notice;
}

export async function saveReport(report, io = {}) {
  const put = io.put || ((item) => dbPut("reports", item));
  if (await hasReportApi()) {
    try {
      await apiJson("/api/reports", { method: "POST", body: JSON.stringify({ report }) });
      return { report, storage: "postgres", fallback: false };
    } catch (error) {
      console.warn("PostgreSQL report save failed; saving the report in IndexedDB instead.", error);
      apiStatus = false;
      storageNotice = { storage: "indexeddb", fallback: true, operation: "save" };
      await put(report);
      return { report, storage: "indexeddb", fallback: true };
    }
  }
  await put(report);
  return { report, storage: "indexeddb", fallback: false };
}

export async function listReports() {
  if (await hasReportApi()) {
    try {
      const payload = await apiJson("/api/reports");
      return normalizeReportList(payload.reports || payload);
    } catch (error) {
      console.warn("PostgreSQL report list failed; using IndexedDB.", error);
      apiStatus = false;
      storageNotice = { storage: "indexeddb", fallback: true, operation: "list" };
    }
  }
  return normalizeReportList(await dbGetAll("reports"));
}

export async function getReport(id) {
  if (!id) return null;
  if (await hasReportApi()) {
    try {
      const payload = await apiJson(`/api/reports/${encodeURIComponent(id)}`);
      const report = payload.report || payload;
      if (report?.id) return report;
    } catch (error) {
      console.warn("PostgreSQL report retrieval failed; using IndexedDB.", error);
      apiStatus = false;
      storageNotice = { storage: "indexeddb", fallback: true, operation: "get" };
    }
  }
  return dbGet("reports", id);
}

export async function deleteReport(id) {
  if (!id) return;
  if (await hasReportApi()) {
    await apiJson(`/api/reports/${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  await dbDelete("reports", id);
}

export async function hasReportApi() {
  if (apiStatus !== null) return apiStatus;
  if (!globalThis.fetch) {
    apiStatus = false;
    return apiStatus;
  }
  try {
    const payload = await apiJson("/api/health", {}, 1200);
    apiStatus = postgresApiIsConnected(payload);
  } catch {
    apiStatus = false;
  }
  return apiStatus;
}

export function resetReportApiProbe() {
  apiStatus = null;
}

function normalizeReportList(reports) {
  return [...(reports || [])]
    .map((report) => ({
      id: report.id,
      teamName: report.teamName || "",
      sprintName: report.sprintName || "",
      dateFrom: report.dateFrom || "",
      dateTo: report.dateTo || "",
      createdAt: report.createdAt || report.created_at || "",
      calculationVersion: report.calculationVersion || report.calculation_version || "",
      mappingSnapshot: report.mappingSnapshot
    }))
    .filter((report) => report.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function apiJson(path, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    if (response.status === 204) return {};
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function apiUrl(path) {
  const configured = globalThis.JIRA_KPI_API_BASE || globalThis.localStorage?.getItem?.("jiraKpiApiBase") || "";
  return configured ? `${String(configured).replace(/\/$/, "")}${path}` : path;
}
