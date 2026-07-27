import { escapeHtml } from "../utils/helpers.js";
import { formatNumber } from "../utils/formatters.js";

export function renderReconciliation(reconciliation) {
  const target = document.getElementById("reconciliationReport");
  if (!target) return;
  if (!reconciliation) {
    target.innerHTML = `<div class="empty-state">گزارشی برای ممیزی وجود ندارد.</div>`;
    return;
  }
  const categoryRows = reconciliation.workLogCategoryReconciliation?.managementBreakdown?.rows || [];
  target.innerHTML = `
    <div class="panel">
      <h3>وضعیت: ${escapeHtml(reconciliation.reconciliationStatus)}</h3>
      <p>اختلاف تخمین مدیریت و مالکیت: ${formatNumber(reconciliation.estimateReconciliation.difference, "h")}</p>
      <p>Work Logged مدیریت: ${formatNumber(reconciliation.workLogReconciliation.totals.managementWorkLogged, "h")} | افراد mapped: ${formatNumber(reconciliation.workLogReconciliation.totals.mappedIndividualWorkLogged, "h")} | سایر/تخصیص‌نیافته: ${formatNumber(reconciliation.workLogReconciliation.totals.residualWorkLogged, "h")}</p>
      <p>اختلاف تطبیق دسته‌بندی Work Log: ${formatNumber(reconciliation.workLogCategoryReconciliation?.totals?.reconciliationDifference, "h")}</p>
    </div>
    <h3>Work Log Category Reconciliation</h3>
    ${table(reconciliation.workLogCategoryReconciliation?.rows || [])}
    <h3>Person Work Log Breakdown</h3>
    ${table((reconciliation.workLogCategoryReconciliation?.personBreakdowns || []).map((row) => ({ person: row.person, raw: row.totals.rawWorkLoggedHours, productive: row.totals.productiveWorkLoggedHours, block: row.totals.blockWorkLoggedHours, meeting: row.totals.meetingWorkLoggedHours, technical: row.totals.technicalWorkLoggedHours, version: row.totals.versionWorkLoggedHours, technicalVersion: row.totals.technicalVersionWorkLoggedHours, nonProductive: row.totals.nonProductiveWorkLoggedHours, reconciliationDifference: row.totals.reconciliationDifference })))}
    <h3>Work Log Breakdown Table</h3>
    <div class="action-row">
      <label>فیلتر دسته<select id="workLogCategoryFilter"><option value="">همه</option><option value="productive">Productive</option><option value="block">Block</option><option value="meeting">Meeting</option><option value="technical">Technical</option><option value="version">Version</option></select></label>
    </div>
    <div id="workLogCategoryRows">${workLogRows(categoryRows)}</div>
    <h3>تطبیق تخمین بر اساس مالکیت</h3>
    ${table(reconciliation.estimateReconciliation.rows.map((row) => ({ planType: row.planType, ownership: row.ownership, issueCount: row.issueCount, devEstimate: row.devEstimate, testEstimate: row.testEstimate, totalEstimate: row.totalEstimate })))}
    <h3>Plan Type</h3>
    ${table(reconciliation.planTypeReconciliation.rows.map((row) => ({ originalValue: row.originalValue, rawKind: row.rawKind, normalizedValue: row.normalizedValue, issueCount: row.issueCount, devEstimate: row.devEstimate, testEstimate: row.testEstimate, totalEstimate: row.totalEstimate })))}
    <h3>QA</h3>
    ${table(reconciliation.qaReconciliation.mappedQaByPlan.flatMap((person) => person.rows.map((row) => ({ person: person.person, ...row }))))}
    <h3>Blocked Time - Top 20</h3>
    ${table(reconciliation.blockedTimeDistribution.top20.map((row) => ({ issueKey: row.issueKey, status: row.status, blockedHours: row.normalizedHours, percentOfTotal: row.percentOfTotal })))}
    <h3>Unallocated Buckets</h3>
    ${table([reconciliation.unallocatedBuckets])}
  `;
  document.getElementById("workLogCategoryFilter")?.addEventListener("change", (event) => {
    const filtered = event.target.value ? categoryRows.filter((row) => row.workCategory === event.target.value) : categoryRows;
    document.getElementById("workLogCategoryRows").innerHTML = workLogRows(filtered);
  });
}

function workLogRows(rows) {
  return table(rows.map((row) => ({
    issueKey: row.issueKey,
    summary: row.summary,
    assignee: row.assignee,
    qaOwner: row.qaOwner,
    status: row.status,
    planType: row.planType,
    labels: row.labels,
    workCategory: row.workCategory,
    matchedBy: row.matchedBy.map((match) => `${match.source}:${match.category}`).join(", "),
    rawWorkLogged: row.rawWorkLoggedHours,
    productiveWorkLogged: row.productiveWorkLoggedHours,
    blockWorkLogged: row.blockWorkLoggedHours,
    meetingWorkLogged: row.meetingWorkLoggedHours,
    technicalWorkLogged: row.technicalWorkLoggedHours,
    versionWorkLogged: row.versionWorkLoggedHours,
    technicalVersionWorkLogged: row.technicalVersionWorkLoggedHours
  })));
}

function table(rows) {
  if (!rows.length) return `<div class="empty-state">بدون داده</div>`;
  const headers = Object.keys(rows[0]);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(display(row[header]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function display(value) {
  if (typeof value === "number") return formatNumber(value);
  if (Array.isArray(value)) return value.join(", ");
  return value ?? "";
}
