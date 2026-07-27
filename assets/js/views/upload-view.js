import { escapeHtml } from "../utils/helpers.js";

export const FILE_STATUS = {
  idle: "انتخاب نشده",
  reading: "در حال خواندن",
  parsed: "خوانده شد",
  mapping: "نیازمند نگاشت",
  ready: "آماده",
  error: "خطا"
};

export function setFileMeta(id, file, hash, status = "parsed") {
  const target = document.getElementById(id);
  const label = FILE_STATUS[status] || status;
  target.dataset.status = status;
  target.textContent = file ? `${label}: ${file.name} (${Math.round(file.size / 1024)} KB)${hash ? ` - ${hash.slice(0, 10)}` : ""}` : FILE_STATUS.idle;
}

export function setFileStatus(id, status, note = "") {
  const target = document.getElementById(id);
  target.dataset.status = status;
  target.textContent = `${FILE_STATUS[status] || status}${note ? `: ${note}` : ""}`;
}

export function renderGenerateState({ ready, reason }) {
  const button = document.getElementById("generateBtn");
  const reasonNode = document.getElementById("generateDisabledReason");
  if (!button || !reasonNode) return;
  button.disabled = !ready;
  reasonNode.textContent = ready ? "همه ورودی‌های ضروری و نگاشت‌ها آماده هستند." : reason;
}

export function renderPreview(state) {
  const target = document.getElementById("filePreview");
  if (!state.jira && !state.capacity && !state.kpi) {
    target.className = "preview-panel empty-state";
    target.textContent = "هنوز فایلی خوانده نشده است.";
    renderGenerateState({ ready: false, reason: "برای تولید گزارش، هر سه فایل را انتخاب و سپس نگاشت‌ها را بررسی کنید." });
    return;
  }
  target.className = "preview-panel";
  target.innerHTML = `
    <div class="split-layout">
      <div>
        <h3>Jira</h3>
        ${state.jira ? `<p>شیت‌ها: ${state.jira.sheetNames.map(escapeHtml).join("، ")}</p>
        <p>شیت اصلی پیشنهادی: <b>${escapeHtml(state.jira.suggestedMainSheet)}</b></p>
        <p>QA Return: <b>${escapeHtml(state.jira.suggestedQaSheet || "یافت نشد")}</b></p>
        <p>ستون‌ها: ${state.jira.main.headers.map(escapeHtml).join("، ")}</p>` : "<p>خوانده نشده</p>"}
      </div>
      <div>
        <h3>ظرفیت و KPI</h3>
        ${state.capacity ? `<p>شیت ظرفیت: ${escapeHtml(state.capacity.selectedSheet)}</p><p>افراد/ستون‌ها: ${state.capacity.people.map((p) => escapeHtml(p.capacityName)).join("، ")}</p>` : "<p>ظرفیت خوانده نشده</p>"}
        ${state.kpi ? `<p>KPIهای سند: ${state.kpi.kpis.map((k) => escapeHtml(k.name)).join("، ")}</p>` : "<p>KPI خوانده نشده</p>"}
      </div>
    </div>`;
}

export function evaluateGenerateReadiness(state) {
  if (!state.jira || !state.capacity || !state.kpi) {
    return { ready: false, reason: "برای تولید گزارش، هر سه فایل Jira، ظرفیت و KPI باید خوانده شوند." };
  }
  const fieldInputs = [...document.querySelectorAll("[data-field-key]")];
  const personRows = [...document.querySelectorAll("#personMappingTable tbody tr")];
  if (!fieldInputs.length || !personRows.length) {
    return { ready: false, reason: "نگاشت ستون‌ها و اعضای تیم هنوز ساخته نشده است. ابتدا خواندن و پیش‌نمایش را اجرا کنید." };
  }
  const emptyRequired = fieldInputs.filter((input) => input.dataset.required === "true" && !input.value);
  if (emptyRequired.length) {
    return { ready: false, reason: "برخی نگاشت‌های ضروری خالی هستند." };
  }
  const enabledPeople = personRows.filter((row) => row.querySelector("[data-person-field='enabled']")?.checked);
  if (!enabledPeople.length) {
    return { ready: false, reason: "حداقل یک عضو تیم باید در نگاشت افراد فعال باشد." };
  }
  return { ready: true, reason: "" };
}
