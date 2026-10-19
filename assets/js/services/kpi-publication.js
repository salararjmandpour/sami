import { distinctIssues } from "./calculations/issue-identity.js";
import { ratio } from "./calculations/time-calculator.js";
import { normalizeString } from "./normalization/string-normalizer.js";

const CONFIRMED_KEYS = new Set([
  "capacityUtilization",
  "deliveryRateDevelop",
  "submittedToQa",
  "qaReturnRate",
  "firstPassRate",
  "hotfixCount",
  "bugfixCount",
  "carryOver",
  "rawWorkLogged",
  "blockedTime",
  "leadTime",
  "cycleTime",
  "timeVariance"
]);

const DECISION_KEYS = new Set([
  "capacityUtilizationQa",
  "estimationAccuracy",
  "plannedWork",
  "unplannedWork",
  "deliveryRate"
]);

export function capacityPeriodFromRows(rows) {
  const labels = (rows || [])
    .map((row) => normalizeString(row?.[0]))
    .filter((value) => /^\d{4}\/\d{2}\/\d{2}$/.test(value));
  if (!labels.length) return null;
  const sorted = [...labels].sort((left, right) => left.localeCompare(right));
  return {
    from: sorted[0],
    to: sorted[sorted.length - 1],
    dayCount: labels.length,
    source: "ردیف‌های روزانه فایل ظرفیت"
  };
}

export function annotateManagementMetrics(metrics, issues, capacityPeople) {
  const context = { issues, capacityPeople, scope: "management", metrics };
  for (const [key, metric] of Object.entries(metrics || {})) {
    if (!isMetric(metric)) continue;
    metric.publication = buildPublication(key, metric, context);
  }
  return metrics;
}

export function annotatePersonMetrics(metrics, context = {}) {
  const publicationContext = { ...context, scope: "person", metrics };
  for (const [key, metric] of Object.entries(metrics || {})) {
    if (!isMetric(metric)) continue;
    metric.publication = buildPublication(key, metric, publicationContext);
  }
  return metrics;
}

export const LEGACY_PUBLICATION_STATUS = "نسخه ذخیره‌شده فراداده تعریف ندارد و مقدار رسمی آن تأیید نشده است";

export function isLegacyPublicationSnapshot(report) {
  const metrics = report?.calculatedMetrics?.management;
  if (!metrics || typeof metrics !== "object") return false;
  const values = Object.values(metrics).filter((metric) => metric && typeof metric === "object" && ("value" in metric || "displayValue" in metric));
  return values.length > 0 && values.every((metric) => !metric.publication);
}

export function publicationStatusLabel(status) {
  if (status === "requires_decision") return "نیازمند تأیید تعریف";
  if (status === "unavailable") return "داده منبع موجود نیست";
  if (status === "confirmed") return "مطابق تعریف سند";
  return "وضعیت تعریف ثبت نشده";
}

function isMetric(metric) {
  return Boolean(metric) && typeof metric === "object" && ("displayValue" in metric || "value" in metric);
}

function buildPublication(key, metric, context) {
  const calculatedValue = metric.value ?? null;
  const calculationPeriod = issuePeriod(context.issues);
  const capacityPeriod = readCapacityPeriod(context.capacityPeople);
  if (calculatedValue === null || calculatedValue === undefined || Number.isNaN(calculatedValue)) {
    return publication("unavailable", calculatedValue, null, calculationPeriod, capacityApplies(key) ? capacityPeriod : null, metric.reason || "داده منبع برای این شاخص موجود نیست.");
  }
  if (isDecisionKey(key, metric, context)) {
    return decisionPublication(key, metric, context, calculationPeriod, capacityPeriod);
  }
  if (CONFIRMED_KEYS.has(key) && context.scope === "management") {
    return publication("confirmed", calculatedValue, calculatedValue, calculationPeriod, capacityApplies(key) ? capacityPeriod : null, "فرمول این شاخص با تعریف سند KPI یکی است و فرض بازمانده‌ای برای آن ثبت نشده است.");
  }
  if (context.scope === "person" && key === "capacityUtilization" && context.role !== "qa") {
    return publication("confirmed", calculatedValue, calculatedValue, calculationPeriod, capacityPeriod, "بهره‌برداری فرد توسعه‌دهنده از DevEstimat کارهای planned و unplanned تقسیم بر ظرفیت همان فرد است.");
  }
  return publication("requires_decision", calculatedValue, null, calculationPeriod, capacityApplies(key) ? capacityPeriod : null, "این شاخص در سند KPI فرمول مستقلی ندارد. مقدار محاسبه‌شده رسمی تلقی نمی‌شود.");
}

function isDecisionKey(key, metric, context) {
  if (!DECISION_KEYS.has(key)) return false;
  if ((key === "plannedWork" || key === "unplannedWork") && metric.unit !== "%") return false;
  if (key === "capacityUtilizationQa") return context.scope === "management";
  if (key === "capacityUtilization" && context.scope === "person" && context.role === "qa") return true;
  return DECISION_KEYS.has(key) && key !== "capacityUtilization";
}

function decisionPublication(key, metric, context, calculationPeriod, capacityPeriod) {
  if (key === "capacityUtilizationQa" || (key === "capacityUtilization" && context.role === "qa")) {
    const blankHours = blankContactTestHours(context.issues);
    const workload = metric.workloadHours;
    const capacity = metric.capacityHours;
    const periodNote = calculationPeriod && capacityPeriod
      ? " بازه مسائل Jira و بازه ظرفیت جدا ثبت شده‌اند و سند KPI نگفته است که این دو یک دوره هستند."
      : "";
    const assumption = key === "capacityUtilizationQa"
      ? `فرمول تغییر نکرده است: TestEstimat کارهای planned، unplanned و carry-over (${hours(workload)}) تقسیم بر ظرفیت QA (${hours(capacity)}). ${hours(blankHours)} از این برآورد Contact point خالی دارد و حذف نشده است.${periodNote}`
      : `بهره‌برداری این فرد QA از TestEstimat کارهای خودش، شامل carry-over، تقسیم بر ظرفیت خودش است. ساعت‌های Contact point خالی در کارت فرد نیست.${periodNote}`;
    return publication("requires_decision", metric.value, null, calculationPeriod, capacityPeriod, assumption, [
      { id: "blankContactTestHours", label: "برآورد تست با Contact point خالی", value: blankHours, unit: "h" }
    ]);
  }
  if (key === "estimationAccuracy") {
    return publication("requires_decision", metric.value, null, calculationPeriod, null, `مقدار محاسبه‌شده ${metric.displayValue || ""} فقط کارهای productive را در صورت و مخرج می‌گذارد. این حذف قاعده برنامه است و در سند KPI نوشته نشده است. فرمول لفظی سند، (TestEstimat + DevEstimat) / Log Time، برای همین داده ${percent(metric.rawEstimationAccuracy)} است.`, [
      { id: "literalDocument", label: "فرمول لفظی سند", value: metric.rawEstimationAccuracy ?? null, unit: "%" }
    ]);
  }
  if (key === "plannedWork" || key === "unplannedWork") {
    const plannedHours = context.metrics?.plannedWork?.hours;
    const unplannedHours = context.metrics?.unplannedWork?.hours;
    const denominator = (plannedHours || 0) + (unplannedHours || 0);
    const alternative = key === "plannedWork" ? ratio(plannedHours, denominator) : ratio(unplannedHours, denominator);
    return publication("requires_decision", metric.value, null, calculationPeriod, null, `مقدار فعلی ${metric.displayValue || ""} سهم ساعت برآورد است و carry-over را در مخرج نگه می‌دارد. اگر carry-over از مخرج حذف شود، نتیجه ${percent(alternative)} می‌شود. سند KPI عبارت Total Work را تعریف نکرده است و هیچ‌کدام از این دو خوانش انتخاب نشده است.`, [
      { id: "withoutCarryOver", label: "بدون carry-over در مخرج", value: alternative, unit: "%" }
    ]);
  }
  if (key === "deliveryRate") {
    const reading = deliveryReadings(context.issues);
    if (!reading.hasStatusText) {
      return publication("requires_decision", metric.value, null, calculationPeriod, null, "مقدار محاسبه‌شده وضعیت Closed را Done حساب می‌کند. این نگاشت در سند KPI نیامده است. متن وضعیت برای ساخت درصد فقط-Done در این محاسبه موجود نیست.");
    }
    return publication("requires_decision", metric.value, null, calculationPeriod, null, `مقدار محاسبه‌شده ${metric.displayValue || ""} شامل ${reading.closed} مسئله Closed در کارهای planned و unplanned است. اگر فقط وضعیت Done شمرده شود، نتیجه ${percent(reading.doneOnlyRate)} است (${reading.doneWord} از ${reading.assigned}). نگاشت Closed به Done هنوز تأیید نشده است.`, [
      { id: "doneOnly", label: "فقط وضعیت Done", value: reading.doneOnlyRate, unit: "%" }
    ]);
  }
  return publication("requires_decision", metric.value, null, calculationPeriod, capacityPeriod, "تعریف این شاخص هنوز تأیید نشده است.");
}

function publication(definitionStatus, calculatedValue, officialValue, calculationPeriod, capacityPeriod, assumption, alternatives = []) {
  return {
    calculatedValue,
    officialValue,
    definitionStatus,
    calculationPeriod,
    capacityPeriod,
    assumption,
    alternatives
  };
}

function capacityApplies(key) {
  return key === "capacityUtilization" || key === "capacityUtilizationQa" || key === "plannedCapacityUtilization" || key === "unplannedCapacityUtilization";
}

function readCapacityPeriod(capacityPeople) {
  return (capacityPeople || []).find((person) => person?.capacityPeriod)?.capacityPeriod || null;
}

function issuePeriod(issues) {
  const stamps = [];
  distinctIssues(issues).forEach((issue) => {
    const value = issue?.firstInProgress || issue?.created || "";
    const time = value ? new Date(value).getTime() : NaN;
    if (Number.isFinite(time)) stamps.push(time);
  });
  if (!stamps.length) return null;
  return {
    from: new Date(Math.min(...stamps)).toISOString().slice(0, 10),
    to: new Date(Math.max(...stamps)).toISOString().slice(0, 10),
    source: "FirstInProgress و در نبود آن Created"
  };
}

function blankContactTestHours(issues) {
  return distinctIssues(issues)
    .filter((issue) => ["planned", "unplanned", "carry_over"].includes(issue.planType) && !normalizeString(issue.qaOwner))
    .reduce((total, issue) => total + (Number.isFinite(issue.testEstimate) ? issue.testEstimate : 0), 0);
}

function deliveryReadings(issues) {
  const assigned = distinctIssues(issues).filter((issue) => issue.planType === "planned" || issue.planType === "unplanned");
  const hasStatusText = assigned.some((issue) => normalizeString(issue.status));
  const doneWord = assigned.filter((issue) => normalizeString(issue.status).toLowerCase() === "done").length;
  const closed = assigned.filter((issue) => normalizeString(issue.status).toLowerCase() === "closed").length;
  return { hasStatusText, assigned: assigned.length, doneWord, closed, doneOnlyRate: ratio(doneWord, assigned.length) };
}

function hours(value) {
  return Number.isFinite(value) ? `${round(value)} ساعت` : "نامشخص";
}

function percent(value) {
  return Number.isFinite(value) ? `${round(value)}٪` : "نامشخص";
}

function round(value) {
  return Math.round(value * 100) / 100;
}
