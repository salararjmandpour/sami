import { CALCULATION_VERSION } from "../utils/constants.js";

export function createReport({ metadata, files, normalizedData, calculatedMetrics, reconciliation, mappingSnapshot, dataQuality, kpiConfig }) {
  return {
    id: crypto.randomUUID(),
    teamName: metadata.teamName || "",
    sprintName: metadata.sprintName || "",
    dateFrom: metadata.dateFrom || "",
    dateTo: metadata.dateTo || "",
    createdAt: new Date().toISOString(),
    jiraFileMetadata: files.jira,
    capacityFileMetadata: files.capacity,
    kpiFileMetadata: files.kpi,
    normalizedData,
    calculatedMetrics,
    reconciliation,
    mappingSnapshot,
    kpiConfig,
    dataQuality,
    calculationVersion: CALCULATION_VERSION
  };
}
