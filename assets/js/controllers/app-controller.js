import { parseSelectedFiles } from "./upload-controller.js";
import { renderMappings, wireMappingActions } from "./mapping-controller.js";
import { refreshHistory, wireHistory, loadReports } from "./history-controller.js";
import { renderReport } from "./dashboard-controller.js";
import { normalizeJiraRows, extractQaKeys } from "../models/jira-model.js";
import { normalizeKpiConfig } from "../models/kpi-model.js";
import { createReport } from "../models/report-model.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../services/calculations/report-calculator.js";
import { buildQualityReport } from "../services/data-quality-service.js";
import { buildReconciliation } from "../services/reconciliation-service.js";
import { dbClearAll, dbGetAll, dbPut, STORES } from "../services/indexeddb-service.js";
import { exportJson } from "../services/export-service.js";
import { getHolidays, saveHoliday } from "../services/holiday-service.js";
import { workingHoursBetween } from "../services/holiday-service.js";
import { renderHolidays, readHolidayRows } from "../views/settings-view.js";
import { notify } from "../views/notification-view.js";
import { evaluateGenerateReadiness, renderGenerateState, renderPreview, setFileStatus } from "../views/upload-view.js";

export class AppController {
  constructor() {
    this.state = { reports: [], activeReport: null, holidays: [] };
  }

  async init() {
    this.wireNavigation();
    wireMappingActions(this.state);
    wireHistory({ onOpen: (report) => this.openReport(report), onRefresh: () => this.refreshReports() });
    this.wireUpload();
    this.wireBackup();
    await this.refreshReports();
    this.state.holidays = await getHolidays();
    renderHolidays(this.state.holidays);
    this.wireHolidays();
    renderPreview(this.state);
    renderGenerateState(evaluateGenerateReadiness(this.state));
  }

  wireNavigation() {
    document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item, .page-section").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.section).classList.add("active");
    }));
  }

  wireUpload() {
    ["jiraFile", "capacityFile", "kpiFile"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", (event) => {
        setFileStatus(`${id}Meta`, "idle", event.target.files[0]?.name || "");
        renderGenerateState(evaluateGenerateReadiness(this.state));
      });
    });
    document.getElementById("parseBtn").addEventListener("click", async () => {
      try {
        notify("در حال خواندن فایل‌ها...");
        await parseSelectedFiles(this.state);
        await this.prepareMappings();
        notify("فایل‌ها خوانده شدند.");
      } catch (error) {
        ["jiraFileMeta", "capacityFileMeta", "kpiFileMeta"].forEach((id) => {
          if (document.getElementById(id)?.dataset.status === "reading") setFileStatus(id, "error");
        });
        renderGenerateState(evaluateGenerateReadiness(this.state));
        notify(userSafeError(error, "خواندن فایل‌ها ناموفق بود. فایل‌ها را بررسی و دوباره تلاش کنید."), "error");
      }
    });
    document.getElementById("generateBtn").addEventListener("click", async () => {
      try {
        const readiness = evaluateGenerateReadiness(this.state);
        renderGenerateState(readiness);
        if (!readiness.ready) return;
        await this.generateReport();
      } catch (error) {
        notify(userSafeError(error, "تولید گزارش ناموفق بود. کیفیت داده و نگاشت‌ها را بررسی کنید."), "error");
      }
    });
  }

  async prepareMappings() {
    const qaKeys = extractQaKeys(this.state.jira.qa.rows);
    this.state.normalizedIssues = normalizeJiraRows(this.state.jira.main.rows, this.state.jira.fieldMap, qaKeys, this.state.holidays, workingHoursBetween);
    await renderMappings(this.state);
    document.getElementById("mapping")?.addEventListener("input", () => renderGenerateState(evaluateGenerateReadiness(this.state)));
    document.getElementById("mapping")?.addEventListener("change", () => renderGenerateState(evaluateGenerateReadiness(this.state)));
    renderGenerateState(evaluateGenerateReadiness(this.state));
  }

  async generateReport() {
    if (!this.state.jira || !this.state.capacity || !this.state.kpi) {
      await parseSelectedFiles(this.state);
      await this.prepareMappings();
    }
    this.state.fieldMap = Object.fromEntries([...document.querySelectorAll("[data-field-key]")].map((input) => [input.dataset.fieldKey, input.value]));
    this.state.personMappings = [...document.querySelectorAll("#personMappingTable tbody tr")].map((row) => ({
      capacityId: row.dataset.capacityId,
      capacityName: row.querySelector("[data-person-field='capacityName']").value,
      jiraName: row.querySelector("[data-person-field='jiraName']").value,
      role: row.querySelector("[data-person-field='role']").value,
      workLogColumn: row.querySelector("[data-person-field='workLogColumn']").value,
      enabled: row.querySelector("[data-person-field='enabled']").checked
    }));
    const qaKeys = extractQaKeys(this.state.jira.qa.rows);
    const issues = normalizeJiraRows(this.state.jira.main.rows, this.state.fieldMap, qaKeys, this.state.holidays, workingHoursBetween);
    const quality = buildQualityReport({ jira: this.state.jira, fieldMap: this.state.fieldMap, capacity: this.state.capacity, issues });
    if (quality.some((item) => item.severity === "error")) {
      const { renderQuality } = await import("../views/quality-view.js");
      renderQuality(quality);
      throw new Error("خطای بحرانی در کیفیت داده وجود دارد. بخش کیفیت داده را بررسی کنید.");
    }
    const management = calculateManagementMetrics(issues, this.state.capacity.people, this.state.personMappings);
    const people = calculatePersonDashboards(issues, this.state.capacity.people, this.state.personMappings);
    const reconciliation = buildReconciliation({
      report: { teamName: document.getElementById("teamName").value, sprintName: document.getElementById("sprintName").value, calculatedMetrics: { management, people } },
      issues,
      capacityPeople: this.state.capacity.people,
      personMappings: this.state.personMappings,
      fieldMappings: this.state.fieldMap,
      fileMetadata: this.state.fileMetadata,
      dataQualityIssues: quality
    });
    const report = createReport({
      metadata: {
        teamName: document.getElementById("teamName").value,
        sprintName: document.getElementById("sprintName").value,
        dateFrom: document.getElementById("dateFrom").value,
        dateTo: document.getElementById("dateTo").value
      },
      files: this.state.fileMetadata,
      normalizedData: { issues, capacityPeople: this.state.capacity.people },
      calculatedMetrics: { management, people },
      mappingSnapshot: { fieldMappings: this.state.fieldMap, personMappings: this.state.personMappings },
      dataQuality: quality,
      reconciliation,
      kpiConfig: normalizeKpiConfig(this.state.kpi.kpis)
    });
    await dbPut("reports", report);
    await dbPut("metricResults", { id: report.id, calculatedMetrics: report.calculatedMetrics });
    await dbPut("kpiConfigurations", { id: report.id, kpiConfig: report.kpiConfig });
    await dbPut("dataQualityIssues", { id: report.id, items: quality });
    this.openReport(report);
    await this.refreshReports();
    notify("گزارش تولید و ذخیره شد.");
  }

  async refreshReports() {
    this.state.reports = await refreshHistory();
    if (!this.state.activeReport && this.state.reports[0]) this.openReport(this.state.reports[0]);
  }

  async openReport(report) {
    if (!report) return;
    this.state.activeReport = report;
    const reports = await loadReports();
    renderReport(report, reports, (nextReport) => this.openReport(nextReport));
  }

  wireBackup() {
    document.getElementById("exportBackupBtn").addEventListener("click", async () => {
      const backup = {};
      await Promise.all(STORES.map(async (store) => { backup[store] = await dbGetAll(store); }));
      exportJson("jira-kpi-dashboard-backup.json", backup);
    });
    document.getElementById("restoreBackupInput").addEventListener("change", async (event) => {
      try {
        const file = event.target.files[0];
        if (!file) return;
        const backup = JSON.parse(await file.text());
        if (!backup || typeof backup !== "object") throw new Error("Invalid backup");
        for (const store of STORES) {
          if (!Array.isArray(backup[store])) continue;
          for (const item of backup[store]) await dbPut(store, item);
        }
        await this.refreshReports();
        notify("پشتیبان بازیابی شد.");
      } catch {
        notify("فایل پشتیبان معتبر نیست. یک خروجی پشتیبان JSON سالم انتخاب کنید.", "error");
      }
    });
    document.getElementById("clearDataBtn").addEventListener("click", async () => {
      if (!confirm("همه داده‌های محلی حذف شود؟ این کار فایل‌های اصلی شما را تغییر نمی‌دهد.")) return;
      await dbClearAll();
      this.state.activeReport = null;
      await this.refreshReports();
      notify("همه داده‌های محلی حذف شد.");
    });
  }

  wireHolidays() {
    document.getElementById("addHolidayBtn").addEventListener("click", async () => {
      const holiday = { id: crypto.randomUUID(), gregorianDate: new Date().toISOString().slice(0, 10), jalaliDate: "", title: "تعطیلی", enabled: true };
      this.state.holidays.push(holiday);
      await saveHoliday(holiday);
      renderHolidays(this.state.holidays);
    });
    document.getElementById("holidayManager").addEventListener("change", async () => {
      this.state.holidays = readHolidayRows();
      await Promise.all(this.state.holidays.map(saveHoliday));
    });
    document.getElementById("exportHolidaysBtn").addEventListener("click", () => exportJson("iran-holidays.json", readHolidayRows()));
    document.getElementById("importHolidaysInput").addEventListener("change", async (event) => {
      try {
        const file = event.target.files[0];
        if (!file) return;
        const holidays = JSON.parse(await file.text());
        if (!Array.isArray(holidays)) throw new Error("Invalid holidays");
        this.state.holidays = holidays.map((h) => ({ id: h.id || crypto.randomUUID(), ...h }));
        await Promise.all(this.state.holidays.map(saveHoliday));
        renderHolidays(this.state.holidays);
      } catch {
        notify("فایل تعطیلات معتبر نیست. یک فایل JSON سالم انتخاب کنید.", "error");
      }
    });
  }
}

function userSafeError(error, fallback) {
  return error?.message && !String(error.message).includes("\n") ? error.message : fallback;
}
