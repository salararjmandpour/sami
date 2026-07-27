const charts = new Map();

function replaceChart(id, config) {
  if (!window.Chart) return;
  if (charts.has(id)) charts.get(id).destroy();
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts.set(id, new Chart(canvas, config));
}

export function renderCharts(report) {
  const people = report?.calculatedMetrics?.people || [];
  const management = report?.calculatedMetrics?.management || {};
  const issues = report?.normalizedData?.issues || [];
  const blockedRows = issues.filter((issue) => Number.isFinite(issue.blockedHours) && issue.blockedHours > 0).sort((a, b) => b.blockedHours - a.blockedHours).slice(0, 12);
  replaceChart("capacityChart", bar("بهره‌برداری ظرفیت", people.map((p) => p.name), people.map((p) => valueOrNull(p.metrics.capacityUtilization.value)), "%"));
  replaceChart("workMixChart", doughnut("ترکیب کار", ["Planned", "Unplanned", "Carry Over"], [management.workMix?.planned ?? null, management.workMix?.unplanned ?? null, management.workMix?.carry_over ?? null], "h"));
  replaceChart("deliveryChart", bar("نرخ تحویل افراد", people.map((p) => p.name), people.map((p) => valueOrNull(p.metrics.deliveryRate.value)), "%"));
  replaceChart("qaChart", doughnut("QA Return / First Pass", ["Returned", "First Pass"], [valueOrNull(management.qaReturnRate?.value), valueOrNull(management.firstPassRate?.value)], "%"));
  replaceChart("blockedChart", bar("زمان بلاک", blockedRows.map((issue) => issue.issueKey), blockedRows.map((issue) => issue.blockedHours), "h"));
  renderBlockedOutlierNote(blockedRows);
}

function valueOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function bar(label, labels, data, unit) {
  return {
    type: "bar",
    data: { labels: labels.length ? labels : ["بدون داده"], datasets: [{ label, data: labels.length ? data : [null], backgroundColor: "#146b5f" }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y ?? "N/A"}${unit ? ` ${unit}` : ""}` } }
      },
      scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } } }
    }
  };
}

function doughnut(label, labels, data, unit) {
  return {
    type: "doughnut",
    data: { labels, datasets: [{ label, data, backgroundColor: ["#146b5f", "#c76b2a", "#5e7c87"] }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed ?? "N/A"}${unit ? ` ${unit}` : ""}` } } }
    }
  };
}

function renderBlockedOutlierNote(blockedRows) {
  const target = document.getElementById("blockedChartNote");
  if (!target) return;
  if (!blockedRows.length) {
    target.textContent = "برای زمان بلاک داده‌ای وجود ندارد.";
    return;
  }
  const top = blockedRows[0];
  const total = blockedRows.reduce((sum, issue) => sum + (issue.blockedHours || 0), 0);
  const share = total ? (top.blockedHours / total) * 100 : 0;
  target.textContent = top.issueKey === "PODCM-3527"
    ? `PODCM-3527 یک outlier شدید است (${top.blockedHours.toFixed(2)}h، حدود ${share.toFixed(2)}٪ از نمودار). مقدار حذف یا cap نشده است.`
    : `بزرگ‌ترین مقدار زمان بلاک: ${top.issueKey} (${top.blockedHours.toFixed(2)}h).`;
}
