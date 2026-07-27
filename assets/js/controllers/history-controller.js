import { dbDelete, dbGetAll, dbPut } from "../services/indexeddb-service.js";
import { renderHistory } from "../views/history-view.js";
import { notify } from "../views/notification-view.js";

export async function loadReports() {
  const reports = await dbGetAll("reports");
  return reports.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function wireHistory({ onOpen, onRefresh }) {
  document.getElementById("historyList").addEventListener("click", async (event) => {
    const openId = event.target.dataset.openReport;
    const deleteId = event.target.dataset.deleteReport;
    const duplicateId = event.target.dataset.duplicateReport;
    const reports = await loadReports();
    if (openId) onOpen(reports.find((report) => report.id === openId));
    if (deleteId && confirm("این گزارش حذف شود؟")) {
      await dbDelete("reports", deleteId);
      notify("گزارش حذف شد.");
      onRefresh();
    }
    if (duplicateId) {
      const source = reports.find((report) => report.id === duplicateId);
      await dbPut("settings", { id: "last-duplicated-config", metadata: { teamName: source.teamName, sprintName: source.sprintName }, mappingSnapshot: source.mappingSnapshot });
      notify("تنظیمات گزارش کپی شد.");
    }
  });
}

export async function refreshHistory() {
  const reports = await loadReports();
  renderHistory(reports);
  return reports;
}

