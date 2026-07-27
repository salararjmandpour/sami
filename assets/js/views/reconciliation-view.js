import { escapeHtml } from "../utils/helpers.js";
import { formatNumber } from "../utils/formatters.js";

export function renderReconciliation(reconciliation) {
  const target = document.getElementById("reconciliationReport");
  if (!target) return;
  if (!reconciliation) {
    target.innerHTML = `<div class="empty-state">گزارشی برای ممیزی وجود ندارد.</div>`;
    return;
  }
  target.innerHTML = `
    <div class="panel">
      <h3>وضعیت: ${escapeHtml(reconciliation.reconciliationStatus)}</h3>
      <p>اختلاف تخمین مدیریت و مالکیت: ${formatNumber(reconciliation.estimateReconciliation.difference, "h")}</p>
      <p>Work Logged مدیریت: ${formatNumber(reconciliation.workLogReconciliation.totals.managementWorkLogged, "h")} | افراد mapped: ${formatNumber(reconciliation.workLogReconciliation.totals.mappedIndividualWorkLogged, "h")} | سایر/تخصیص‌نیافته: ${formatNumber(reconciliation.workLogReconciliation.totals.residualWorkLogged, "h")}</p>
    </div>
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
