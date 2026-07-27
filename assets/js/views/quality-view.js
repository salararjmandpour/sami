import { escapeHtml } from "../utils/helpers.js";

export function renderQuality(items) {
  const target = document.getElementById("qualityReport");
  if (!items?.length) {
    target.className = "quality-list empty-state";
    target.textContent = "موردی گزارش نشده است.";
    return;
  }
  target.className = "quality-list";
  target.innerHTML = items.map((item) => `<div class="quality-item"><span class="severity-${item.severity}">${escapeHtml(item.severity)}</span><div><b>${escapeHtml(item.code)}</b><p>${escapeHtml(item.message)}</p></div></div>`).join("");
}

