import { escapeHtml } from "../utils/helpers.js";

export function renderHistory(reports) {
  const target = document.getElementById("historyList");
  if (!reports.length) {
    target.innerHTML = `<div class="empty-state">هنوز گزارشی ذخیره نشده است.</div>`;
    return;
  }
  target.innerHTML = `<div class="table-wrap"><table><thead><tr><th>تیم</th><th>اسپرینت</th><th>تاریخ ایجاد</th><th>عملیات گزارش</th></tr></thead><tbody>
    ${reports.map((report) => `<tr><td>${escapeHtml(report.teamName || "N/A")}</td><td>${escapeHtml(report.sprintName || "N/A")}</td><td>${new Date(report.createdAt).toLocaleString("fa-IR")}</td>
    <td><button class="button" data-open-report="${report.id}">باز کردن گزارش</button> <button class="button button-secondary" data-export-report="${report.id}">خروجی Excel گزارش</button> <button class="button button-secondary" data-duplicate-report="${report.id}">کپی تنظیمات</button> <button class="button button-danger" data-delete-report="${report.id}">حذف</button></td></tr>`).join("")}
  </tbody></table></div>`;
}
