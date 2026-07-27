import { escapeHtml } from "../utils/helpers.js";
import { KPI_LABELS } from "../utils/constants.js";

const PERSON_KEYS = ["availableCapacity", "plannedWork", "unplannedWork", "carryOver", "capacityUtilization", "deliveryRateDevelop", "deliveryRate", "submittedToQa", "qaReturnCount", "qaReturnRate", "firstPassRate", "workLogged", "estimationAccuracy", "leadTime", "cycleTime", "blockedTime", "hotfixCount", "bugfixCount"];

export function renderScrumDashboards(people) {
  const target = document.getElementById("scrumDashboards");
  if (!people?.length) {
    target.innerHTML = `<div class="empty-state">داشبورد فردی موجود نیست.</div>`;
    return;
  }
  target.innerHTML = people.map((person) => `<section class="person-dashboard panel">
    <h3>${escapeHtml(person.name)} <span class="badge">${escapeHtml(person.role)}</span></h3>
    <div class="kpi-grid">${PERSON_KEYS.map((key) => `<article class="kpi-card"><h3>${escapeHtml(KPI_LABELS[key] || key)}</h3><div class="kpi-value">${escapeHtml(person.metrics[key]?.displayValue || "N/A")}</div></article>`).join("")}</div>
  </section>`).join("");
}

