import { KPI_CARD_ORDER, KPI_LABELS } from "../utils/constants.js";
import { escapeHtml } from "../utils/helpers.js";
import { formatNumber } from "../utils/formatters.js";

export function renderFilters(reports, activeReport) {
  const target = document.getElementById("filters");
  const people = activeReport?.calculatedMetrics?.people || [];
  const team = activeReport?.teamName || "";
  const sprint = activeReport?.sprintName || "";
  target.innerHTML = `
    <label>تیم<input id="teamFilter" type="text" value="${escapeHtml(team)}" placeholder="همه تیم‌ها"></label>
    <label>اسپرینت<input id="sprintFilter" type="text" value="${escapeHtml(sprint)}" placeholder="همه اسپرینت‌ها"></label>
    <label>گزارش<select id="reportFilter">${reports.map((r) => `<option value="${r.id}" ${activeReport?.id === r.id ? "selected" : ""}>${escapeHtml(r.teamName || "بدون تیم")} - ${escapeHtml(r.sprintName || "بدون اسپرینت")}</option>`).join("")}</select></label>
    <label>از تاریخ<input id="filterDateFrom" type="date" value="${escapeHtml(activeReport?.dateFrom || "")}"></label>
    <label>تا تاریخ<input id="filterDateTo" type="date" value="${escapeHtml(activeReport?.dateTo || "")}"></label>
    <label>شخص<select id="personFilter"><option value="">همه</option>${people.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("")}</select></label>
    <label>نقش<select id="roleFilter"><option value="">همه</option><option value="developer">developer</option><option value="qa">qa</option><option value="both">both</option></select></label>
    <label>وضعیت<select id="statusFilter"><option value="">همه</option><option value="done">Done</option><option value="in_progress">In Progress</option><option value="unknown">Unknown</option></select></label>
    <label>نوع برنامه<select id="planFilter"><option value="">همه</option><option value="planned">Planned</option><option value="unplanned">Unplanned</option><option value="carry_over">Carry Over</option><option value="unknown">Unknown</option></select></label>`;
}

export function renderQualitySummary(report) {
  const target = document.getElementById("qualitySummaryPanel");
  if (!target) return;
  const items = report?.dataQuality || [];
  const counts = countSeverities(items);
  const reconciliation = report?.reconciliation;
  const warnings = buildProminentWarnings(report);
  target.innerHTML = `<section class="panel quality-summary" aria-labelledby="qualitySummaryTitle">
    <h3 id="qualitySummaryTitle">خلاصه کیفیت داده</h3>
    <div class="summary-metrics">
      <span><b>${counts.error}</b> Errors</span>
      <span><b>${counts.warning}</b> Warnings</span>
      <span><b>${counts.info}</b> Information</span>
    </div>
    ${counts.error === 0 && counts.warning > 0 ? `<p class="warning-message">گزارش محاسبه شده است، اما برخی داده‌های منبع نیاز به بررسی دارند.</p>` : ""}
    <div class="warning-links">${warnings.map((item) => `<a href="#${escapeHtml(item.target)}" data-nav-target="${escapeHtml(item.section)}">${escapeHtml(item.label)}</a>`).join("")}</div>
    <p class="status-note">وضعیت ممیزی: ${escapeHtml(reconciliation?.reconciliationStatus || "نامشخص")}</p>
  </section>`;
  target.querySelectorAll("[data-nav-target]").forEach((link) => link.addEventListener("click", () => {
    document.querySelector(`[data-section="${link.dataset.navTarget}"]`)?.click();
  }));
}

export function renderSourceActions(report) {
  const target = document.getElementById("sourceActionsPanel");
  if (!target) return;
  const actions = buildSourceActions(report);
  target.innerHTML = `<section class="panel source-actions" aria-labelledby="sourceActionsTitle">
    <h3 id="sourceActionsTitle">اقدامات پیشنهادی برای اصلاح داده‌های Jira</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>شدت</th><th>مسئله</th><th>تعداد</th><th>ساعت</th><th>Issue Keyها</th><th>اقدام پیشنهادی در Jira</th></tr></thead>
      <tbody>${actions.map((item) => `<tr>
        <td>${escapeHtml(item.severity)}</td>
        <td>${escapeHtml(item.problem)}</td>
        <td>${escapeHtml(String(item.count))}</td>
        <td>${escapeHtml(item.hours)}</td>
        <td>${escapeHtml(item.keys)}</td>
        <td>${escapeHtml(item.action)}</td>
      </tr>`).join("")}</tbody>
    </table></div>
  </section>`;
}

export function renderKpiCards(metrics, drillDown = {}, report = null, activeFilters = {}) {
  const target = document.getElementById("managementCards");
  target.innerHTML = KPI_CARD_ORDER.map((key) => {
    const item = metrics?.[key] || { displayValue: "N/A", reason: "گزارشی موجود نیست." };
    const accuracy = key === "estimationAccuracy" ? estimationAccuracyNote(drillDown[key], item) : "";
    return `<article class="kpi-card">
      <h3>${escapeHtml(KPI_LABELS[key] || key)}</h3>
      <div class="kpi-value">${escapeHtml(item.displayValue)}</div>
      ${item.reason ? `<div class="kpi-reason">${escapeHtml(readableNaReason(key, item.reason))}</div>` : ""}
      ${accuracy}
      <button class="button button-secondary drill-button" data-drill="${escapeHtml(key)}" type="button">جزئیات</button>
    </article>`;
  }).join("");
  target.querySelectorAll("[data-drill]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.drill;
    showDrillDown(key, completeDrillDown(key, metrics?.[key], drillDown[key], report, activeFilters));
  }));
}

function showDrillDown(key, detail) {
  document.getElementById("kpiDrillDialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "kpiDrillDialog";
  dialog.className = "drill-dialog";
  dialog.setAttribute("aria-labelledby", "kpiDrillTitle");
  dialog.innerHTML = `<form method="dialog">
    <h3 id="kpiDrillTitle">${escapeHtml(KPI_LABELS[key] || key)}</h3>
    <pre>${escapeHtml(JSON.stringify(detail, null, 2))}</pre>
    <button class="button button-primary">بستن</button>
  </form>`;
  document.body.append(dialog);
  dialog.showModal();
}

function completeDrillDown(key, metric, detail = {}, report, activeFilters) {
  const warnings = (report?.dataQuality || []).filter((item) => item.severity !== "info").map((item) => ({ code: item.code, message: item.message, issueKey: item.issueKey || null }));
  const result = metric?.value ?? null;
  const displayValue = metric?.displayValue || "N/A";
  const reason = metric?.reason || detail.reason || null;
  const includedKeys = detail.includedIssueKeys || detail.issueKeys || report?.normalizedData?.issues?.map((issue) => issue.issueKey) || [];
  return {
    kpiName: KPI_LABELS[key] || key,
    definition: definitionFor(key),
    formula: detail.formula || formulaFor(key),
    numerator: detail.numerator ?? null,
    denominator: detail.denominator ?? null,
    result,
    displayValue,
    unit: metric?.unit || unitFor(key),
    includedIssueCount: detail.contributingIssueCount ?? includedKeys.length,
    includedIssueKeys: includedKeys,
    excludedIssueCount: detail.excludedIssueCount ?? (detail.exclusionReasons?.length ? detail.exclusionReasons.length : 0),
    exclusionReasons: detail.exclusionReasons || [],
    activeFilters,
    calculationTimestamp: detail.calculationTimestamp || new Date().toISOString(),
    calculationVersion: detail.calculationVersion || "1.0.0",
    dataQualityWarnings: warnings,
    reason: displayValue === "N/A" ? readableNaReason(key, reason) : null,
    ...detail
  };
}

function definitionFor(key) {
  const definitions = {
    averageStorySize: "میانگین Story Points کارهای تکمیل‌شده.",
    reworkRate: "نسبت زمان Rework به کل زمان کار.",
    wip: "میانگین کارهای در جریان در بازه زمانی.",
    estimationAccuracy: "نسبت زمان برآوردشده به زمان ثبت‌شده."
  };
  return definitions[key] || `محاسبه KPI ${KPI_LABELS[key] || key}`;
}

function formulaFor(key) {
  const formulas = {
    estimationAccuracy: "Estimated Hours / Work Logged Hours × 100",
    averageStorySize: "Story Points / Done Issues",
    reworkRate: "Rework Time / Work Logged Time × 100",
    wip: "Average count of in-progress issues over time"
  };
  return formulas[key] || "براساس فرمول تاییدشده KPI در سرویس محاسبات.";
}

function unitFor(key) {
  if (["plannedWork", "unplannedWork", "carryOver", "leadTime", "cycleTime", "blockedTime"].includes(key)) return "h";
  if (["capacityUtilization", "deliveryRateDevelop", "deliveryRate", "qaReturnRate", "firstPassRate", "estimationAccuracy"].includes(key)) return "%";
  return "";
}

function readableNaReason(key, reason) {
  if (key === "averageStorySize") return "Average Story Size قابل محاسبه نیست چون Story Points خالی است.";
  if (key === "reworkRate") return "Rework Rate قابل محاسبه نیست چون فیلد Rework Time وجود ندارد.";
  if (key === "wip") return "Average WIP قابل محاسبه نیست چون تاریخچه انتقال یا snapshot در دسترس نیست.";
  return reason || "دلیل N/A در داده موجود نیست.";
}

function estimationAccuracyNote(detail, metric) {
  const estimated = detail?.numerator;
  const logged = detail?.denominator;
  const value = metric?.value;
  const interpretation = value == null ? "" : value > 100 ? "بیشتر از ۱۰۰٪: زمان برآوردشده بیشتر از زمان ثبت‌شده است." : value < 100 ? "کمتر از ۱۰۰٪: زمان ثبت‌شده بیشتر از زمان برآوردشده است." : "نزدیک به ۱۰۰٪: زمان برآوردشده به زمان ثبت‌شده نزدیک است.";
  return `<div class="kpi-reason">Estimation Accuracy = Estimated Hours / Work Logged Hours × 100</div>
    <div class="kpi-reason">تخمین: ${formatNumber(estimated, "h")} | زمان ثبت‌شده: ${formatNumber(logged, "h")} | دقت: ${metric?.displayValue || "N/A"}</div>
    <div class="kpi-reason">${escapeHtml(interpretation)}</div>`;
}

function countSeverities(items) {
  return items.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0, info: 0 });
}

function buildProminentWarnings(report) {
  const r = report?.reconciliation || {};
  const carry = r.planTypeReconciliation?.rows?.find((row) => row.normalizedValue === "carry_over") || {};
  const data = [
    { label: `${carry.issueCount || 0} Carry Over issues`, section: "reconciliation", target: "reconciliation" },
    { label: `${formatNumber(r.estimateReconciliation?.ownershipTotals?.testEstimateWithoutQaOwner, "h")} Test Estimate بدون QA Owner`, section: "reconciliation", target: "reconciliation" },
    { label: `${formatNumber(r.workLogReconciliation?.totals?.residualWorkLogged, "h")} Work Logged سایر/تخصیص‌نیافته`, section: "reconciliation", target: "reconciliation" },
    { label: "PODCM-3527 Blocked Time outlier", section: "reconciliation", target: "reconciliation" },
    { label: "سه QA Return نامطابق", section: "quality", target: "quality" },
    { label: "Story Points خالی", section: "quality", target: "quality" },
    { label: "Rework Time موجود نیست", section: "quality", target: "quality" },
    { label: "تاریخچه WIP موجود نیست", section: "quality", target: "quality" }
  ];
  return data;
}

function buildSourceActions(report) {
  const r = report?.reconciliation || {};
  const carry = r.planTypeReconciliation?.rows?.find((row) => row.normalizedValue === "carry_over") || {};
  const noQa = r.estimateReconciliation?.ownershipTotals || {};
  const blocked = r.blockedTimeDistribution?.top20?.[0];
  return [
    action("warning", "Plan Type خالی باعث Carry Over شده است.", carry.issueCount || 0, formatNumber(carry.totalEstimate, "h"), r.planTypeReconciliation?.carryOverIssues?.map((i) => i.issueKey), "در صورت مناسب بودن، Planned Release Management Task را برای Carry Overها تکمیل کنید."),
    action("warning", "Issueهایی Test Estimate دارند اما Contact Point / QA Owner خالی است.", r.qaReconciliation?.buckets?.blankQaOwner?.issueCount || 0, formatNumber(noQa.testEstimateWithoutQaOwner, "h"), r.qaReconciliation?.buckets?.blankQaOwner?.issueKeys, "برای این Issueها QA Owner تعیین کنید."),
    action("warning", "Time in block برای PODCM-3527 بسیار بزرگ است.", 1, formatNumber(blocked?.normalizedHours, "h"), ["PODCM-3527"], "مقدار منبع Time in block را در Jira بررسی کنید."),
    action("warning", "Σ Time Spent شامل کاربرانی خارج از ستون‌های mapped است.", "نامشخص", formatNumber(r.workLogReconciliation?.totals?.residualWorkLogged, "h"), r.workLogReconciliation?.rows?.filter((row) => row.residual > 0).slice(0, 20).map((row) => row.issueKey), "کاربران موجود در Σ Time Spent و ستون‌های Work Log فردی را تطبیق دهید."),
    action("warning", "QA Return keyها با اسپرینت اصلی match نشده‌اند.", 3, "", ["RCA-3299", "RCA-3288", "PODCM-4922"], "کلیدها یا محدوده خروجی QA Return را بازبینی کنید."),
    action("info", "Story Points برای Average Story Size کافی نیست.", "نامشخص", "", [], "اگر Average Story Size لازم است، Story Points را تکمیل کنید."),
    action("info", "فیلد Rework Time برای Rework Rate وجود ندارد.", "نامشخص", "", [], "اگر Rework Rate لازم است، داده Rework Time را تامین کنید."),
    action("info", "تاریخچه انتقال برای Average WIP در فایل نیست.", "نامشخص", "", [], "برای Average WIP، transition history یا snapshotهای تاریخی تامین کنید.")
  ];
}

function action(severity, problem, count, hours, keys = [], jiraAction) {
  return {
    severity,
    problem,
    count,
    hours: hours || "N/A",
    keys: (keys || []).slice(0, 25).join("، ") || "N/A",
    action: jiraAction
  };
}
