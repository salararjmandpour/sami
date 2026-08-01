import { dbPut } from "../services/indexeddb-service.js";
import { exportReportExcel } from "../services/export-service.js";
import { deleteReport, getReport, listReports } from "../services/report-storage-service.js";
import { renderHistory } from "../views/history-view.js";
import { notify } from "../views/notification-view.js";

export async function loadReports() {
  return listReports();
}

export function wireHistory({ onOpen, onRefresh }) {
  document.getElementById("historyList").addEventListener("click", async (event) => {
    const openId = event.target.dataset.openReport;
    const deleteId = event.target.dataset.deleteReport;
    const duplicateId = event.target.dataset.duplicateReport;
    const exportId = event.target.dataset.exportReport;
    if (openId) onOpen(await getReport(openId));
    if (exportId) {
      const report = await getReport(exportId);
      if (!report) return notify("گزارش برای خروجی Excel پیدا نشد.", "error");
      exportReportExcel(report);
    }
    if (deleteId && confirm("این گزارش حذف شود؟")) {
      await deleteReport(deleteId);
      notify("گزارش حذف شد.");
      onRefresh();
    }
    if (duplicateId) {
      const source = await getReport(duplicateId);
      if (!source) return notify("گزارش برای کپی تنظیمات پیدا نشد.", "error");
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
