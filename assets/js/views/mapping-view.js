import { FIELD_ALIASES } from "../config/field-aliases.js";
import { REQUIRED_FIELDS } from "../utils/constants.js";
import { escapeHtml } from "../utils/helpers.js";

export function renderFieldMappings(headers, mapping) {
  const target = document.getElementById("fieldMappingTable");
  const options = (selected) => ["", ...headers].map((header) => `<option value="${escapeHtml(header)}" ${header === selected ? "selected" : ""}>${escapeHtml(header || "انتخاب نشده")}</option>`).join("");
  target.innerHTML = `<div class="table-wrap"><table><thead><tr><th>فیلد canonical</th><th>ستون انتخابی</th><th>Aliasها</th></tr></thead><tbody>
    ${Object.entries(FIELD_ALIASES).map(([key, aliases]) => `<tr><td>${escapeHtml(key)}${REQUIRED_FIELDS.includes(key) ? " *" : ""}</td><td><select class="mapping-input" data-field-key="${escapeHtml(key)}" data-required="${REQUIRED_FIELDS.includes(key)}">${options(mapping[key] || "")}</select></td><td>${aliases.map(escapeHtml).join("، ")}</td></tr>`).join("")}
  </tbody></table></div>`;
}

export function renderPersonMappings(mappings, workLogColumns = []) {
  const target = document.getElementById("personMappingTable");
  const workOptions = (selected) => ["", ...workLogColumns].map((col) => `<option value="${escapeHtml(col)}" ${col === selected ? "selected" : ""}>${escapeHtml(col || "انتخاب نشده")}</option>`).join("");
  target.innerHTML = `<div class="table-wrap"><table><thead><tr><th>فعال</th><th>ستون ظرفیت</th><th>نام Jira</th><th>نقش</th><th>ستون Work Log</th></tr></thead><tbody>
    ${mappings.map((m) => `<tr data-capacity-id="${escapeHtml(m.capacityId || "")}">
      <td><input data-person-field="enabled" type="checkbox" aria-label="فعال بودن نگاشت" ${m.enabled !== false ? "checked" : ""}></td>
      <td><input data-person-field="capacityName" aria-label="نام ظرفیت" value="${escapeHtml(m.capacityName || "")}"></td>
      <td><input data-person-field="jiraName" aria-label="نام Jira" value="${escapeHtml(m.jiraName || "")}"></td>
      <td><select data-person-field="role" aria-label="نقش"><option value="developer" ${m.role === "developer" ? "selected" : ""}>developer</option><option value="qa" ${m.role === "qa" ? "selected" : ""}>qa</option><option value="both" ${m.role === "both" ? "selected" : ""}>both</option></select></td>
      <td><select data-person-field="workLogColumn" aria-label="ستون Work Log">${workOptions(m.workLogColumn || "")}</select></td>
    </tr>`).join("")}
  </tbody></table></div>`;
}
