import { downloadText } from "../utils/helpers.js";
import { KPI_LABELS } from "../utils/constants.js";

export function exportJson(filename, data) {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

export function tableToCsv(rows) {
  const dangerous = /^[=+\-@]/;
  return rows.map((row) => row.map((cell) => {
    const safe = String(cell ?? "");
    const escaped = dangerous.test(safe) ? `'${safe}` : safe;
    return `"${escaped.replaceAll('"', '""')}"`;
  }).join(",")).join("\n");
}

export function exportCsv(filename, rows) {
  downloadText(filename, tableToCsv(rows), "text/csv;charset=utf-8");
}

export function exportXlsx(filename, sheets) {
  const xlsx = globalThis.XLSX;
  if (!xlsx) throw new Error("SheetJS برای خروجی Excel در دسترس نیست.");
  const workbook = xlsx.utils.book_new();
  sheets.forEach((sheet) => {
    const rows = sheet.rows?.length ? sheet.rows : [["پیام"], ["داده‌ای برای خروجی وجود ندارد."]];
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), safeSheetName(sheet.name));
  });
  xlsx.writeFile(workbook, filename);
}

export function exportReportExcel(report) {
  exportXlsx(reportExcelFilename(report), buildReportWorkbookSheets(report));
}

export function buildReportWorkbookSheets(report) {
  const issues = report?.normalizedData?.issues || [];
  const people = report?.calculatedMetrics?.people || [];
  const management = report?.calculatedMetrics?.management || {};
  const quality = report?.dataQuality || [];
  return [
    { name: "Summary", rows: buildSummaryRows(report, issues, people, quality) },
    { name: "Management KPI", rows: buildMetricRows(management) },
    { name: "People KPI", rows: buildPeopleRows(people) },
    { name: "Issues", rows: buildIssueRows(issues) },
    { name: "Data Quality", rows: buildQualityRows(quality) },
    { name: "Reconciliation", rows: buildReconciliationRows(report?.reconciliation || {}) }
  ];
}

function buildSummaryRows(report, issues, people, quality) {
  const counts = quality.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0, info: 0 });
  return [
    ["فیلد", "مقدار"],
    ["تیم", report?.teamName || ""],
    ["اسپرینت", report?.sprintName || ""],
    ["از تاریخ", report?.dateFrom || ""],
    ["تا تاریخ", report?.dateTo || ""],
    ["تاریخ ایجاد", report?.createdAt || ""],
    ["نسخه محاسبات", report?.calculationVersion || ""],
    ["تعداد Issue", issues.length],
    ["تعداد افراد", people.length],
    ["خطاهای کیفیت داده", counts.error],
    ["هشدارهای کیفیت داده", counts.warning],
    ["اطلاعات کیفیت داده", counts.info],
    ["وضعیت ممیزی", report?.reconciliation?.reconciliationStatus || ""]
  ];
}

function buildMetricRows(metrics) {
  const rows = [["KPI", "کلید", "مقدار نمایشی", "مقدار", "واحد", "دلیل"]];
  Object.entries(metrics).forEach(([key, metric]) => {
    if (!metric || typeof metric !== "object" || !("displayValue" in metric || "value" in metric)) return;
    rows.push([KPI_LABELS[key] || key, key, metric.displayValue ?? "", metric.value ?? "", metric.unit ?? "", metric.reason ?? ""]);
  });
  return rows;
}

function buildPeopleRows(people) {
  const rows = [["شخص", "نقش", "KPI", "کلید", "مقدار نمایشی", "مقدار", "واحد", "دلیل"]];
  people.forEach((person) => {
    Object.entries(person.metrics || {}).forEach(([key, metric]) => {
      rows.push([person.name || "", person.role || "", KPI_LABELS[key] || key, key, metric?.displayValue ?? "", metric?.value ?? "", metric?.unit ?? "", metric?.reason ?? ""]);
    });
  });
  return rows;
}

function buildIssueRows(issues) {
  const columns = [
    ["issueKey", "Issue Key"], ["summary", "Summary"], ["status", "Status"], ["assignee", "Assignee"], ["qaOwner", "QA Owner"],
    ["planType", "Plan Type"], ["devEstimate", "Dev Estimate"], ["testEstimate", "Test Estimate"], ["workLogged", "Work Logged"],
    ["created", "Created"], ["firstInProgress", "First In Progress"], ["firstAutomationTest", "First Automation Test"], ["doneDate", "Done Date"],
    ["leadTimeHours", "Lead Time"], ["cycleTimeHours", "Cycle Time"], ["blockedHours", "Blocked Hours"], ["labels", "Labels"], ["qaReturned", "QA Returned"]
  ];
  return [
    columns.map(([, title]) => title),
    ...issues.map((issue) => columns.map(([key]) => Array.isArray(issue[key]) ? issue[key].join("، ") : issue[key] ?? ""))
  ];
}

function buildQualityRows(items) {
  return [
    ["شدت", "کد", "پیام", "Issue Key", "فیلد", "مقدار"],
    ...items.map((item) => [item.severity || "", item.code || "", item.message || "", item.issueKey || "", item.field || "", item.value ?? ""])
  ];
}

function buildReconciliationRows(reconciliation) {
  return [
    ["بخش", "شاخص", "مقدار"],
    ["کلی", "وضعیت", reconciliation.reconciliationStatus || ""],
    ["Plan Type", "Carry Over Issues", reconciliation.planTypeReconciliation?.carryOverIssues?.length ?? 0],
    ["Work Log", "Residual Work Logged", reconciliation.workLogReconciliation?.totals?.residualWorkLogged ?? ""],
    ["Estimate", "Test Estimate Without QA Owner", reconciliation.estimateReconciliation?.ownershipTotals?.testEstimateWithoutQaOwner ?? ""],
    ["QA", "Blank QA Owner Issues", reconciliation.qaReconciliation?.buckets?.blankQaOwner?.issueCount ?? ""]
  ];
}

function reportExcelFilename(report) {
  const team = slugPart(report?.teamName || "team");
  const sprint = slugPart(report?.sprintName || "sprint");
  return `jira-kpi-${team}-${sprint}.xlsx`;
}

function slugPart(value) {
  return String(value).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 40) || "report";
}

function safeSheetName(name) {
  return String(name).replace(/[\[\]:*?/\\]/g, " ").slice(0, 31);
}
