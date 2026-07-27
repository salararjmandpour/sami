import { buildInitialPersonMappings } from "../models/capacity-model.js";
import { renderFieldMappings, renderPersonMappings } from "../views/mapping-view.js";
import { serializeFieldMappings, serializePersonMappings } from "../models/mapping-model.js";
import { dbGetAll, dbPut } from "../services/indexeddb-service.js";
import { exportJson } from "../services/export-service.js";
import { notify } from "../views/notification-view.js";

export async function renderMappings(state) {
  const savedFields = (await dbGetAll("fieldMappings"))[0]?.mapping || {};
  state.fieldMap = { ...state.jira?.fieldMap, ...savedFields };
  renderFieldMappings(state.jira?.main.headers || [], state.fieldMap || {});
  const savedPeople = (await dbGetAll("personMappings"))[0]?.mappings || [];
  state.personMappings = buildInitialPersonMappings(state.capacity?.people || [], state.normalizedIssues || [], savedPeople);
  renderPersonMappings(state.personMappings, state.jira?.main.headers || []);
}

export function wireMappingActions(state) {
  document.getElementById("saveFieldMappingsBtn").addEventListener("click", async () => {
    state.fieldMap = serializeFieldMappings(document.getElementById("fieldMappingTable"));
    await dbPut("fieldMappings", { id: "default", mapping: state.fieldMap, updatedAt: new Date().toISOString() });
    notify("نگاشت فیلدها ذخیره شد.");
  });
  document.getElementById("savePersonMappingsBtn").addEventListener("click", async () => {
    state.personMappings = serializePersonMappings(document.getElementById("personMappingTable"));
    await dbPut("personMappings", { id: "default", mappings: state.personMappings, updatedAt: new Date().toISOString() });
    notify("نگاشت افراد ذخیره شد.");
  });
  document.getElementById("exportMappingsBtn").addEventListener("click", () => exportJson("person-mappings.json", serializePersonMappings(document.getElementById("personMappingTable"))));
  document.getElementById("importMappingsInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const mappings = JSON.parse(await file.text());
    if (!Array.isArray(mappings)) throw new Error("فایل نگاشت معتبر نیست.");
    state.personMappings = mappings;
    renderPersonMappings(mappings, state.jira?.main.headers || []);
    await dbPut("personMappings", { id: "default", mappings, updatedAt: new Date().toISOString() });
    notify("نگاشت افراد وارد شد.");
  });
}

