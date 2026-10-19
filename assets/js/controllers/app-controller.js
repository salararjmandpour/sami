import { clearParsedUploads, parseSelectedFiles, readSelectionTokens, sameSelection } from "./upload-controller.js";
import { renderMappings, wireMappingActions } from "./mapping-controller.js";
import { refreshHistory, wireHistory, loadReports } from "./history-controller.js";
import { renderReport } from "./dashboard-controller.js";
import { normalizeJiraRows, extractQaKeys } from "../models/jira-model.js";
import { normalizeKpiConfig } from "../models/kpi-model.js";
import { createReport } from "../models/report-model.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../services/calculations/report-calculator.js";
import { buildQualityReport, issue as qualityIssue } from "../services/data-quality-service.js";
import { buildReconciliation } from "../services/reconciliation-service.js";
import { dbClearAll, dbGet, dbGetAll, dbPut, STORES } from "../services/indexeddb-service.js";
import { exportJson } from "../services/export-service.js";
import { deleteReport, getReport, hasReportApi, listReports, saveReport } from "../services/report-storage-service.js";
import { defaultWorkCategoryMapping, mergeWorkCategoryMapping } from "../services/work-log-category-service.js";
import { getHolidays, saveHoliday } from "../services/holiday-service.js";
import { workingHoursBetween } from "../services/holiday-service.js";
import { renderFieldMappings, renderPersonMappings } from "../views/mapping-view.js";
import { renderHolidays, readHolidayRows, renderWorkCategoryMappings, readWorkCategoryMappings } from "../views/settings-view.js";
import { notify } from "../views/notification-view.js";
import { partitionIssuesByCreatedRange } from "./filter-controller.js";
import { evaluateGenerateReadiness, renderGenerateState, renderPreview, setFileStatus } from "../views/upload-view.js";

export class AppController {
  constructor() {
    this.state = { reports: [], activeReport: null, holidays: [], workCategoryMapping: defaultWorkCategoryMapping() };
  }

  async init() {
    this.wireNavigation();
    wireMappingActions(this.state);
    wireHistory({
      onOpen: (report) => this.openReport(report, { navigateToManagement: true }),
      onRefresh: () => this.refreshReports(),
      onDuplicate: (source) => this.applyDuplicatedConfig(source)
    });
    this.wireUpload();
    this.wireBackup();
    await this.refreshReports();
    this.state.holidays = await getHolidays();
    const savedCategoryMapping = await dbGet("settings", "workCategoryMapping");
    this.state.workCategoryMapping = mergeWorkCategoryMapping(savedCategoryMapping?.value || {});
    renderHolidays(this.state.holidays);
    renderWorkCategoryMappings(this.state.workCategoryMapping);
    this.wireHolidays();
    this.wireWorkCategoryMappings();
    renderPreview(this.state);
    renderGenerateState(evaluateGenerateReadiness(this.state));
  }

  wireNavigation() {
    document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
      this.navigateTo(button.dataset.section);
    }));
  }

  navigateTo(sectionId) {
    const button = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    const section = document.getElementById(sectionId);
    if (!button || !section) return;
    document.querySelectorAll(".nav-item, .page-section").forEach((node) => node.classList.remove("active"));
    button.classList.add("active");
    section.classList.add("active");
  }

  wireUpload() {
    ["jiraFile", "capacityFile", "kpiFile"].forEach((id) => {
      const input = document.getElementById(id);
      input?.addEventListener("click", () => {
        input.value = "";
        this.invalidateUploads();
      });
      input?.addEventListener("change", () => this.invalidateUploads());
    });
    document.getElementById("mapping")?.addEventListener("input", () => this.renderUploadReadiness());
    document.getElementById("mapping")?.addEventListener("change", () => this.renderUploadReadiness());
    document.getElementById("parseBtn").addEventListener("click", async () => {
      if (this.state.parsing || this.state.generating) return;
      this.state.parsing = true;
      this.setUploadBusy(true);
      try {
        notify("در حال خواندن فایل‌ها...");
        await parseSelectedFiles(this.state);
        await this.prepareMappings();
        notify("فایل‌ها خوانده شدند.");
      } catch (error) {
        ["jiraFileMeta", "capacityFileMeta", "kpiFileMeta"].forEach((id) => setFileStatus(id, "error"));
        renderPreview(this.state);
        notify(userSafeError(error, "خواندن فایل‌ها ناموفق بود. فایل‌ها را بررسی و دوباره تلاش کنید."), "error");
      } finally {
        this.state.parsing = false;
        this.setUploadBusy(false);
      }
    });
    document.getElementById("generateBtn").addEventListener("click", async () => {
      if (this.state.parsing || this.state.generating) return;
      const readiness = evaluateGenerateReadiness(this.state);
      renderGenerateState(readiness);
      if (!readiness.ready) return;
      this.state.generating = true;
      this.setUploadBusy(true);
      try {
        notify("در حال تولید گزارش...");
        await this.generateReport();
      } catch (error) {
        notify(userSafeError(error, "تولید گزارش ناموفق بود. کیفیت داده و نگاشت‌ها را بررسی کنید."), "error");
      } finally {
        this.state.generating = false;
        this.setUploadBusy(false);
      }
    });
  }

  invalidateUploads() {
    clearParsedUploads(this.state);
    ["jiraFile", "capacityFile", "kpiFile"].forEach((id) => {
      const file = document.getElementById(id)?.files?.[0];
      setFileStatus(`${id}Meta`, "idle", file?.name || "");
    });
    renderPreview(this.state);
    this.renderUploadReadiness();
  }

  renderUploadReadiness() {
    renderGenerateState(evaluateGenerateReadiness(this.state));
  }

  setUploadBusy(busy) {
    const parseButton = document.getElementById("parseBtn");
    const generateButton = document.getElementById("generateBtn");
    if (parseButton) parseButton.disabled = busy;
    if (busy && generateButton) generateButton.disabled = true;
    if (!busy) this.renderUploadReadiness();
  }

  async prepareMappings() {
    const qaKeys = extractQaKeys(this.state.jira.qa.rows);
    this.state.normalizedIssues = normalizeJiraRows(this.state.jira.main.rows, this.state.jira.fieldMap, qaKeys, this.state.holidays, workingHoursBetween);
    await renderMappings(this.state);
    this.applyPendingMappingSnapshot();
    this.renderUploadReadiness();
  }

  async generateReport() {
    if (!sameSelection(this.state.parsedSelection, readSelectionTokens())) {
      throw new Error("فایل‌های انتخاب‌شده با داده‌های خوانده‌شده یکسان نیستند. دوباره خواندن و پیش‌نمایش را اجرا کنید.");
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
    const normalizedIssues = normalizeJiraRows(this.state.jira.main.rows, this.state.fieldMap, qaKeys, this.state.holidays, workingHoursBetween);
    const dateFrom = document.getElementById("dateFrom").value;
    const dateTo = document.getElementById("dateTo").value;
    const datePartition = partitionIssuesByCreatedRange(normalizedIssues, dateFrom, dateTo);
    const issues = datePartition.included;
    const quality = buildQualityReport({ jira: this.state.jira, fieldMap: this.state.fieldMap, capacity: this.state.capacity, issues, personMappings: this.state.personMappings, workCategoryMapping: this.state.workCategoryMapping });
    if (datePartition.missingCreated.length) quality.push(qualityIssue("warning", "Missing Created Date", `${datePartition.missingCreated.length} مسئله تاریخ ایجاد ندارد و چون بازه تاریخ انتخاب شده است در گزارش نیامده است.`));
    if (datePartition.outsideRange.length) quality.push(qualityIssue("info", "Outside Report Date Range", `${datePartition.outsideRange.length} مسئله خارج از بازه تاریخ گزارش است و در محاسبات نیامده است.`));
    if (quality.some((item) => item.severity === "error")) {
      const { renderQuality } = await import("../views/quality-view.js");
      renderQuality(quality);
      throw new Error("خطای بحرانی در کیفیت داده وجود دارد. بخش کیفیت داده را بررسی کنید.");
    }
    const management = calculateManagementMetrics(issues, this.state.capacity.people, this.state.personMappings, this.state.workCategoryMapping);
    const people = calculatePersonDashboards(issues, this.state.capacity.people, this.state.personMappings, this.state.workCategoryMapping);
    attachIssueWorkLogBreakdown(issues, management.workLogBreakdown);
    const reconciliation = buildReconciliation({
      report: { teamName: document.getElementById("teamName").value, sprintName: document.getElementById("sprintName").value, calculatedMetrics: { management, people }, workCategoryMapping: this.state.workCategoryMapping },
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
        dateFrom,
        dateTo
      },
      files: this.state.fileMetadata,
      normalizedData: { issues, capacityPeople: this.state.capacity.people },
      calculatedMetrics: { management, people },
      mappingSnapshot: { fieldMappings: this.state.fieldMap, personMappings: this.state.personMappings },
      workCategoryMapping: this.state.workCategoryMapping,
      dataQuality: quality,
      reconciliation,
      kpiConfig: normalizeKpiConfig(this.state.kpi.kpis)
    });
    await saveReport(report);
    await dbPut("metricResults", { id: report.id, calculatedMetrics: report.calculatedMetrics, calculationVersion: report.calculationVersion });
    await dbPut("kpiConfigurations", { id: report.id, kpiConfig: report.kpiConfig });
    await dbPut("dataQualityIssues", { id: report.id, items: quality });
    this.openReport(report, { navigateToManagement: true });
    await this.refreshReports();
    notify("گزارش تولید و ذخیره شد.");
  }

  async refreshReports() {
    this.state.reports = await refreshHistory();
    if (!this.state.activeReport && this.state.reports[0]) this.openReport(await getReport(this.state.reports[0].id));
  }

  async openReport(report, options = {}) {
    if (!report) return;
    this.state.activeReport = report;
    const reports = await loadReports();
    renderReport(report, reports, (nextReport) => this.openReport(nextReport));
    if (options.navigateToManagement) this.navigateTo("management");
  }

  applyDuplicatedConfig(source) {
    const team = document.getElementById("teamName");
    const sprint = document.getElementById("sprintName");
    const dateFrom = document.getElementById("dateFrom");
    const dateTo = document.getElementById("dateTo");
    if (team) team.value = source.teamName || "";
    if (sprint) sprint.value = source.sprintName || "";
    if (dateFrom) dateFrom.value = source.dateFrom || "";
    if (dateTo) dateTo.value = source.dateTo || "";
    this.state.pendingMappingSnapshot = source.mappingSnapshot || null;
    if (this.state.jira) this.applyPendingMappingSnapshot();
  }

  applyPendingMappingSnapshot() {
    const snapshot = this.state.pendingMappingSnapshot;
    if (!snapshot) return;
    if (snapshot.fieldMappings) {
      this.state.fieldMap = { ...(this.state.fieldMap || {}), ...snapshot.fieldMappings };
      renderFieldMappings(this.state.jira?.main.headers || [], this.state.fieldMap);
    }
    if (snapshot.personMappings) {
      this.state.personMappings = snapshot.personMappings;
      renderPersonMappings(this.state.personMappings, this.state.jira?.main.headers || []);
    }
    this.state.pendingMappingSnapshot = null;
    this.renderUploadReadiness();
  }

  wireBackup() {
    document.getElementById("exportBackupBtn").addEventListener("click", async () => {
      try {
        const backup = { storage: "indexeddb" };
        await Promise.all(STORES.map(async (store) => { backup[store] = await dbGetAll(store); }));
        if (await hasReportApi()) {
          const summaries = await listReports();
          const reports = [];
          for (const summary of summaries) {
            const report = await getReport(summary.id);
            if (report) reports.push(report);
          }
          backup.reports = reports;
          backup.storage = "postgres";
        }
        exportJson("jira-kpi-dashboard-backup.json", backup);
        notify(backup.storage === "postgres" ? "پشتیبان گزارش‌های پایگاه داده و داده‌های محلی ساخته شد." : "پشتیبان داده‌های محلی ساخته شد.");
      } catch {
        notify("ساخت پشتیبان ناموفق بود. اتصال ذخیره‌سازی را بررسی کنید.", "error");
      }
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
      const remote = await hasReportApi();
      const message = remote
        ? "همه گزارش‌های پایگاه داده و داده‌های محلی این داشبورد حذف شود؟ فایل‌های اصلی شما تغییر نمی‌کند."
        : "همه داده‌های محلی حذف شود؟ این کار فایل‌های اصلی شما را تغییر نمی‌دهد.";
      if (!confirm(message)) return;
      let remoteFailed = false;
      if (remote) {
        try {
          const reports = await listReports();
          for (const report of reports) await deleteReport(report.id);
        } catch {
          remoteFailed = true;
        }
      }
      await dbClearAll();
      this.state.activeReport = null;
      await this.refreshReports();
      notify(remoteFailed ? "داده‌های محلی حذف شد، اما حذف گزارش‌ها از پایگاه داده ناموفق بود." : remote ? "گزارش‌های پایگاه داده و داده‌های محلی حذف شد." : "همه داده‌های محلی حذف شد.", remoteFailed ? "error" : "info");
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

  wireWorkCategoryMappings() {
    document.getElementById("addWorkCategoryAliasBtn")?.addEventListener("click", async () => {
      const category = document.getElementById("workCategorySelect").value;
      const source = document.getElementById("workCategorySourceSelect").value;
      const value = document.getElementById("workCategoryAliasInput").value.trim();
      if (!value) return;
      this.state.workCategoryMapping[category][source].push(value);
      this.state.workCategoryMapping = mergeWorkCategoryMapping(this.state.workCategoryMapping);
      await this.saveWorkCategoryMapping(this.state.workCategoryMapping);
    });
    document.getElementById("workCategoryMappingPanel")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-remove-work-alias]");
      if (!button) return;
      const { category, source, value } = button.dataset;
      this.state.workCategoryMapping[category][source] = this.state.workCategoryMapping[category][source].filter((alias) => alias !== value);
      await this.saveWorkCategoryMapping(this.state.workCategoryMapping);
    });
    document.getElementById("resetWorkCategoryMappingBtn")?.addEventListener("click", async () => {
      this.state.workCategoryMapping = defaultWorkCategoryMapping();
      await this.saveWorkCategoryMapping(this.state.workCategoryMapping);
    });
    document.getElementById("exportWorkCategoryMappingBtn")?.addEventListener("click", () => exportJson("work-category-mapping.json", this.state.workCategoryMapping));
    document.getElementById("importWorkCategoryMappingInput")?.addEventListener("change", async (event) => {
      try {
        const file = event.target.files[0];
        if (!file) return;
        this.state.workCategoryMapping = mergeWorkCategoryMapping(JSON.parse(await file.text()));
        await this.saveWorkCategoryMapping(this.state.workCategoryMapping);
        notify("نگاشت دسته‌بندی Work Log وارد شد.");
      } catch {
        notify("فایل نگاشت دسته‌بندی معتبر نیست.", "error");
      }
    });
  }

  async saveWorkCategoryMapping(nextMapping = null) {
    this.state.workCategoryMapping = mergeWorkCategoryMapping(nextMapping || readWorkCategoryMappings() || this.state.workCategoryMapping);
    await dbPut("settings", { id: "workCategoryMapping", value: this.state.workCategoryMapping });
    renderWorkCategoryMappings(this.state.workCategoryMapping);
  }
}

function userSafeError(error, fallback) {
  return error?.message && !String(error.message).includes("\n") ? error.message : fallback;
}

function attachIssueWorkLogBreakdown(issues, breakdown) {
  const rows = new Map((breakdown?.rows || []).map((row) => [row.issueKey, row]));
  issues.forEach((issue) => {
    issue.workLogCategoryBreakdown = rows.get(issue.issueKey) || null;
  });
}
