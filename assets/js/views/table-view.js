import { escapeHtml } from "../utils/helpers.js";
import { formatDate, formatNumber } from "../utils/formatters.js";

let tableState = { page: 1, pageSize: 50, sortKey: "issueKey", direction: "asc", search: "" };

const COLUMNS = [
  ["issueKey", "Issue Key"], ["summary", "Summary"], ["status", "Status"], ["assignee", "Assignee"], ["qaOwner", "QA Owner"],
  ["planType", "Plan Type"], ["workCategory", "Work Category"], ["devEstimate", "Dev Estimate"], ["testEstimate", "Test Estimate"], ["workLogged", "Work Logged"],
  ["rawWorkLoggedHours", "Raw Work Logged"], ["productiveWorkLoggedHours", "Productive Work Logged"], ["blockWorkLoggedHours", "Block Work Logged"],
  ["meetingWorkLoggedHours", "Meeting Work Logged"], ["technicalWorkLoggedHours", "Technical Work Logged"], ["versionWorkLoggedHours", "Version Work Logged"], ["technicalVersionWorkLoggedHours", "Technical + Version Work Logged"],
  ["created", "Created"], ["firstInProgress", "First In Progress"], ["firstAutomationTest", "First Automation Test"], ["doneDate", "Done Date"],
  ["leadTimeHours", "Lead Time"], ["cycleTimeHours", "Cycle Time"], ["blockedHours", "Blocked Hours"], ["labels", "Labels"], ["qaReturned", "QA Returned"]
];

export function renderIssueTable(issues) {
  const target = document.getElementById("issueTable");
  const filtered = issues.filter((issue) => JSON.stringify(issue).toLowerCase().includes(tableState.search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => String(a[tableState.sortKey] ?? "").localeCompare(String(b[tableState.sortKey] ?? "")) * (tableState.direction === "asc" ? 1 : -1));
  const pages = Math.max(1, Math.ceil(sorted.length / tableState.pageSize));
  tableState.page = Math.min(tableState.page, pages);
  const visible = sorted.slice((tableState.page - 1) * tableState.pageSize, tableState.page * tableState.pageSize);
  target.innerHTML = `
    <div class="table-toolbar">
      <input id="issueSearch" type="search" placeholder="جستجو" value="${escapeHtml(tableState.search)}">
      <button id="exportIssueCsvBtn" class="button button-secondary" type="button">خروجی CSV</button>
    </div>
    <div class="table-wrap"><table><thead><tr>${COLUMNS.map(([key, title]) => `<th><button class="button button-secondary" data-sort="${key}" type="button">${escapeHtml(title)}</button></th>`).join("")}</tr></thead>
    <tbody>${visible.map((issue) => `<tr>${COLUMNS.map(([key]) => `<td>${escapeHtml(display(issue, key))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${COLUMNS.length}" class="empty-state">ردیفی برای نمایش وجود ندارد.</td></tr>`}</tbody></table></div>
    <div class="pagination"><button id="prevPageBtn" class="button" ${tableState.page <= 1 ? "disabled" : ""}>قبلی</button><span>صفحه ${tableState.page} از ${pages} - ${filtered.length} ردیف</span><button id="nextPageBtn" class="button" ${tableState.page >= pages ? "disabled" : ""}>بعدی</button></div>`;
  target.querySelector("#issueSearch").addEventListener("input", (event) => { tableState.search = event.target.value; tableState.page = 1; renderIssueTable(issues); });
  target.querySelector("#prevPageBtn").addEventListener("click", () => { tableState.page -= 1; renderIssueTable(issues); });
  target.querySelector("#nextPageBtn").addEventListener("click", () => { tableState.page += 1; renderIssueTable(issues); });
  target.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    tableState.direction = tableState.sortKey === key && tableState.direction === "asc" ? "desc" : "asc";
    tableState.sortKey = key;
    renderIssueTable(issues);
  }));
}

function display(issue, key) {
  if (["created", "firstInProgress", "firstAutomationTest", "doneDate"].includes(key)) return formatDate(issue[key]);
  const breakdown = issue.workLogCategoryBreakdown || {};
  if (key in breakdown) return formatNumber(breakdown[key]);
  if (key === "workCategory") return breakdown.workCategory || "productive";
  if (["devEstimate", "testEstimate", "workLogged", "leadTimeHours", "cycleTimeHours", "blockedHours"].includes(key)) return formatNumber(issue[key]);
  if (key === "labels") return issue.labels.join("، ") || "N/A";
  if (key === "qaReturned") return issue.qaReturned ? "بله" : "خیر";
  return issue[key] || "N/A";
}

export function getIssueCsvRows(issues) {
  return [COLUMNS.map(([, title]) => title), ...issues.map((issue) => COLUMNS.map(([key]) => display(issue, key)))];
}
