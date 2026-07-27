import { WORK_CATEGORY_PRIORITY } from "../config/work-category-mapping.js";
import { escapeHtml } from "../utils/helpers.js";

export function renderHolidays(holidays) {
  const target = document.getElementById("holidayManager");
  target.innerHTML = `<div class="table-wrap"><table><thead><tr><th>فعال</th><th>تاریخ میلادی</th><th>تاریخ جلالی</th><th>عنوان</th></tr></thead><tbody>
    ${holidays.map((h) => `<tr data-holiday-id="${escapeHtml(h.id)}"><td><input data-holiday-field="enabled" type="checkbox" aria-label="فعال" ${h.enabled ? "checked" : ""}></td><td><input data-holiday-field="gregorianDate" type="date" value="${escapeHtml(h.gregorianDate)}"></td><td><input data-holiday-field="jalaliDate" value="${escapeHtml(h.jalaliDate)}"></td><td><input data-holiday-field="title" value="${escapeHtml(h.title)}"></td></tr>`).join("")}
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

export function renderWorkCategoryMappings(mapping) {
  const target = document.getElementById("workCategoryMappingPanel");
  if (!target) return;
  target.innerHTML = `<section class="panel">
    <h3>نگاشت دسته‌بندی Work Log</h3>
    <p class="status-note">اولویت انتخاب: block سپس meeting سپس technical سپس version سپس productive. فیلد Fix Version/s برای دسته‌بندی استفاده نمی‌شود.</p>
    <div class="action-row">
      <label>دسته<select id="workCategorySelect">${WORK_CATEGORY_PRIORITY.map((category) => `<option value="${category}">${category}</option>`).join("")}</select></label>
      <label>نوع alias<select id="workCategorySourceSelect"><option value="labels">Label</option><option value="titlePatterns">Summary / Title</option></select></label>
      <label>Alias جدید<input id="workCategoryAliasInput" type="text" placeholder="مثلا جلسه"></label>
      <button id="addWorkCategoryAliasBtn" class="button" type="button">افزودن alias</button>
      <button id="resetWorkCategoryMappingBtn" class="button button-secondary" type="button">بازنشانی پیش‌فرض</button>
      <button id="exportWorkCategoryMappingBtn" class="button button-secondary" type="button">خروجی JSON</button>
      <label class="button button-secondary file-action">ورود JSON<input id="importWorkCategoryMappingInput" type="file" accept="application/json" aria-label="ورود نگاشت دسته‌بندی Work Log"></label>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>دسته</th><th>Label aliases</th><th>Summary aliases</th></tr></thead>
      <tbody>${WORK_CATEGORY_PRIORITY.map((category) => `<tr data-work-category="${category}">
        <td>${category}</td>
        <td>${aliasButtons(category, "labels", mapping[category]?.labels || [])}</td>
        <td>${aliasButtons(category, "titlePatterns", mapping[category]?.titlePatterns || [])}</td>
      </tr>`).join("")}</tbody>
    </table></div>
  </section>`;
}

export function readWorkCategoryMappings() {
  const rows = [...document.querySelectorAll("[data-work-category]")];
  if (!rows.length) return null;
  return Object.fromEntries(rows.map((row) => {
    const category = row.dataset.workCategory;
    return [category, {
      labels: [...row.querySelectorAll("[data-source='labels']")].map((button) => button.dataset.value),
      titlePatterns: [...row.querySelectorAll("[data-source='titlePatterns']")].map((button) => button.dataset.value)
    }];
  }));
}

function aliasButtons(category, source, values) {
  return values.map((value) => `<span class="badge">${escapeHtml(value)} <button class="inline-remove" type="button" aria-label="حذف alias ${escapeHtml(value)}" data-remove-work-alias data-category="${category}" data-source="${source}" data-value="${escapeHtml(value)}">×</button><span hidden data-source="${source}" data-value="${escapeHtml(value)}"></span></span>`).join(" ");
}
