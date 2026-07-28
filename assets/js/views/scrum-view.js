import { escapeHtml } from "../utils/helpers.js";
import { KPI_LABELS } from "../utils/constants.js";

const PERSON_KEYS = ["totalCapacity", "plannedCapacity", "unplannedCapacity", "plannedIssueCount", "startedPlannedIssueCount", "unplannedIssueCount", "startedUnplannedIssueCount", "plannedProductiveWork", "unplannedProductiveWork", "plannedCapacityUtilization", "unplannedCapacityUtilization", "carryOverWorkLogged", "productiveWorkLogged", "nonProductiveWorkLogged", "availableCapacity", "plannedWork", "unplannedWork", "carryOver", "capacityUtilization", "deliveryRateDevelop", "deliveryRate", "submittedToQa", "qaReturnCount", "qaReturnRate", "firstPassRate", "rawWorkLogged", "blockWorkLogged", "meetingWorkLogged", "technicalVersionWorkLogged", "estimationAccuracy", "leadTime", "cycleTime", "blockedTime", "hotfixCount", "bugfixCount"];
const PERSON_DRILL_KEYS = {
  plannedIssueCount: "plannedIssueKeys",
  startedPlannedIssueCount: "startedPlannedIssueKeys",
  unplannedIssueCount: "unplannedIssueKeys",
  startedUnplannedIssueCount: "startedUnplannedIssueKeys",
  carryOverWorkLogged: "carryOverLoggedIssueKeys"
};

export function renderScrumDashboards(people) {
  const target = document.getElementById("scrumDashboards");
  if (!people?.length) {
    target.innerHTML = `<div class="empty-state">داشبورد فردی موجود نیست.</div>`;
    return;
  }
  target.innerHTML = people.map((person, personIndex) => `<section class="person-dashboard panel">
    <h3>${escapeHtml(person.name)} <span class="badge">${escapeHtml(person.role)}</span></h3>
    <div class="kpi-grid">${personKeysForRole(person.role).map((key) => `<article class="kpi-card"><h3>${escapeHtml(KPI_LABELS[key] || key)}</h3><div class="kpi-value">${escapeHtml(person.metrics[key]?.displayValue || "N/A")}</div>${PERSON_DRILL_KEYS[key] && person.planningDrillDown?.[PERSON_DRILL_KEYS[key]] ? `<button class="button button-secondary drill-button" data-person-index="${personIndex}" data-person-drill="${escapeHtml(key)}" type="button">Ø¬Ø²Ø¦ÛŒØ§Øª</button>` : ""}</article>`).join("")}</div>
  </section>`).join("");
  target.querySelectorAll("[data-person-drill]").forEach((button) => button.addEventListener("click", () => {
    const person = people[Number(button.dataset.personIndex)];
    const metricKey = button.dataset.personDrill;
    const drillKey = PERSON_DRILL_KEYS[metricKey];
    showPersonDrillDown(person, metricKey, person?.planningDrillDown?.[drillKey] || []);
  }));
}

function personKeysForRole(role) {
  if (role === "developer") return PERSON_KEYS.filter((key) => key !== "carryOver");
  return PERSON_KEYS;
}

function showPersonDrillDown(person, metricKey, rows) {
  document.getElementById("personKpiDrillDialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "personKpiDrillDialog";
  dialog.className = "drill-dialog";
  dialog.setAttribute("aria-labelledby", "personKpiDrillTitle");
  dialog.innerHTML = `<form method="dialog">
    <h3 id="personKpiDrillTitle">${escapeHtml(person?.name || "")} - ${escapeHtml(KPI_LABELS[metricKey] || metricKey)}</h3>
    <pre>${escapeHtml(JSON.stringify({
      person: person?.name || "",
      role: person?.role || "",
      metric: KPI_LABELS[metricKey] || metricKey,
      includedIssueCount: rows.length,
      includedIssueKeys: rows.map((row) => row.issueKey),
      rows
    }, null, 2))}</pre>
    <button class="button button-primary">Ø¨Ø³ØªÙ†</button>
  </form>`;
  document.body.append(dialog);
  dialog.showModal();
}
