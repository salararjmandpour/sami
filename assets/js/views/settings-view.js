import { escapeHtml } from "../utils/helpers.js";

export function renderHolidays(holidays) {
  const target = document.getElementById("holidayManager");
  target.innerHTML = `<div class="table-wrap"><table><thead><tr><th>فعال</th><th>تاریخ میلادی</th><th>تاریخ جلالی</th><th>عنوان</th></tr></thead><tbody>
    ${holidays.map((h) => `<tr data-holiday-id="${escapeHtml(h.id)}"><td><input data-holiday-field="enabled" type="checkbox" ${h.enabled ? "checked" : ""}></td><td><input data-holiday-field="gregorianDate" type="date" value="${escapeHtml(h.gregorianDate)}"></td><td><input data-holiday-field="jalaliDate" value="${escapeHtml(h.jalaliDate)}"></td><td><input data-holiday-field="title" value="${escapeHtml(h.title)}"></td></tr>`).join("")}
  </tbody></table></div>`;
}

export function readHolidayRows() {
  return [...document.querySelectorAll("#holidayManager tbody tr")].map((row) => ({
    id: row.dataset.holidayId,
    enabled: row.querySelector("[data-holiday-field='enabled']").checked,
    gregorianDate: row.querySelector("[data-holiday-field='gregorianDate']").value,
    jalaliDate: row.querySelector("[data-holiday-field='jalaliDate']").value,
    title: row.querySelector("[data-holiday-field='title']").value
  }));
}

