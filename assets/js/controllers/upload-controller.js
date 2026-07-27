import { parseJiraWorkbook } from "../services/parsers/jira-parser.js";
import { parseCapacityWorkbook } from "../services/parsers/capacity-parser.js";
import { parseKpiDocx } from "../services/parsers/kpi-docx-parser.js";
import { setFileMeta, setFileStatus, renderPreview } from "../views/upload-view.js";
import { sha256 } from "../utils/helpers.js";

export async function parseSelectedFiles(state) {
  const files = {
    jira: document.getElementById("jiraFile").files[0],
    capacity: document.getElementById("capacityFile").files[0],
    kpi: document.getElementById("kpiFile").files[0]
  };
  if (!files.jira || !files.capacity || !files.kpi) throw new Error("هر سه فایل باید انتخاب شوند.");
  setFileStatus("jiraFileMeta", "reading", files.jira.name);
  setFileStatus("capacityFileMeta", "reading", files.capacity.name);
  setFileStatus("kpiFileMeta", "reading", files.kpi.name);

  const jiraBuffer = await files.jira.arrayBuffer();
  const capacityBuffer = await files.capacity.arrayBuffer();
  const kpiBuffer = await files.kpi.arrayBuffer();
  state.fileMetadata = {
    jira: await meta(files.jira, jiraBuffer),
    capacity: await meta(files.capacity, capacityBuffer),
    kpi: await meta(files.kpi, kpiBuffer)
  };

  state.jira = await parseJiraWorkbook(files.jira, jiraBuffer);
  setFileMeta("jiraFileMeta", files.jira, state.fileMetadata.jira.sha256, "mapping");
  state.capacity = await parseCapacityWorkbook(files.capacity, capacityBuffer);
  setFileMeta("capacityFileMeta", files.capacity, state.fileMetadata.capacity.sha256, "mapping");
  state.kpi = await parseKpiDocx(files.kpi, kpiBuffer);
  setFileMeta("kpiFileMeta", files.kpi, state.fileMetadata.kpi.sha256, "ready");
  if (!document.getElementById("sprintName").value) document.getElementById("sprintName").value = state.jira.suggestedMainSheet || "";
  renderPreview(state);
}

async function meta(file, buffer) {
  return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, sha256: await sha256(buffer) };
}
