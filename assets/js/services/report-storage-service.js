import { dbDelete, dbGet, dbGetAll, dbPut } from "./indexeddb-service.js";

let apiStatus = null;

export async function saveReport(report) {
  if (await hasReportApi()) {
    try {
      await apiJson("/api/reports", { method: "POST", body: JSON.stringify({ report }) });
      return report;
    } catch (error) {
      console.warn("PostgreSQL report save failed; IndexedDB copy was kept.", error);
      apiStatus = false;
    }
  }
  await dbPut("reports", report);
  return report;
}

export async function listReports() {
  if (await hasReportApi()) {
    try {
      const payload = await apiJson("/api/reports");
      return normalizeReportList(payload.reports || payload);
    } catch (error) {
      console.warn("PostgreSQL report list failed; using IndexedDB.", error);
      apiStatus = false;
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
    }
  }
  return dbGet("reports", id);
}

export async function deleteReport(id) {
  if (!id) return;
  if (await hasReportApi()) {
    try {
      await apiJson(`/api/reports/${encodeURIComponent(id)}`, { method: "DELETE" });
      return;
    } catch (error) {
      console.warn("PostgreSQL report delete failed; deleting local IndexedDB copy only.", error);
      apiStatus = false;
    }
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
    apiStatus = payload?.storage === "postgres";
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
