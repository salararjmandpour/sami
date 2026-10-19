import { parseJiraWorkbook } from "../services/parsers/jira-parser.js";
import { parseCapacityWorkbook } from "../services/parsers/capacity-parser.js";
import { parseKpiDocx } from "../services/parsers/kpi-docx-parser.js";
import { setFileMeta, setFileStatus, renderPreview } from "../views/upload-view.js";
import { sha256 } from "../utils/helpers.js";
import { readSelectedFiles, selectionTokensFromFiles } from "../utils/upload-selection.js";

export { fileSelectionToken, sameSelection, selectionTokensFromFiles, readSelectionTokens } from "../utils/upload-selection.js";

export function clearParsedUploads(state) {
  state.jira = null;
  state.capacity = null;
  state.kpi = null;
  state.fileMetadata = null;
  state.parsedSelection = null;
  state.normalizedIssues = null;
}

export function commitParsedUpload(state, parsed, metadata, tokens) {
  state.jira = parsed.jira;
  state.capacity = parsed.capacity;
  state.kpi = parsed.kpi;
  state.fileMetadata = metadata;
  state.parsedSelection = tokens;
}

export async function parseUploadBuffers(files, buffers) {
  const jira = await parseJiraWorkbook(files.jira, buffers.jira);
  const capacity = await parseCapacityWorkbook(files.capacity, buffers.capacity);
  const kpi = await parseKpiDocx(files.kpi, buffers.kpi);
  return { jira, capacity, kpi };
}

export async function parseIntoState(state, files, buffers, tokens, metadata) {
  try {
    const parsed = await parseUploadBuffers(files, buffers);
    commitParsedUpload(state, parsed, metadata, tokens);
    return parsed;
  } catch (error) {
    clearParsedUploads(state);
    throw error;
  }
}

export async function parseSelectedFiles(state) {
  const files = readSelectedFiles();
  if (!files.jira || !files.capacity || !files.kpi) throw new Error("هر سه فایل باید انتخاب شوند.");
  setFileStatus("jiraFileMeta", "reading", files.jira.name);
  setFileStatus("capacityFileMeta", "reading", files.capacity.name);
  setFileStatus("kpiFileMeta", "reading", files.kpi.name);

  const buffers = {
    jira: await files.jira.arrayBuffer(),
    capacity: await files.capacity.arrayBuffer(),
    kpi: await files.kpi.arrayBuffer()
  };
  const metadata = {
    jira: await meta(files.jira, buffers.jira),
    capacity: await meta(files.capacity, buffers.capacity),
    kpi: await meta(files.kpi, buffers.kpi)
  };
  await parseIntoState(state, files, buffers, selectionTokensFromFiles(files), metadata);
  setFileMeta("jiraFileMeta", files.jira, state.fileMetadata.jira.sha256, "mapping");
  setFileMeta("capacityFileMeta", files.capacity, state.fileMetadata.capacity.sha256, "mapping");
  setFileMeta("kpiFileMeta", files.kpi, state.fileMetadata.kpi.sha256, "ready");
  if (!document.getElementById("sprintName").value) document.getElementById("sprintName").value = state.jira.suggestedMainSheet || "";
  renderPreview(state);
}

async function meta(file, buffer) {
  return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, sha256: await sha256(buffer) };
}
