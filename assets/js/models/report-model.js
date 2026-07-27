import { CALCULATION_VERSION } from "../utils/constants.js";

export function createReport({ metadata, files, normalizedData, calculatedMetrics, reconciliation, mappingSnapshot, workCategoryMapping, dataQuality, kpiConfig }) {
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
    workLogBreakdown: calculatedMetrics?.management?.workLogBreakdown || null,
    personWorkLogBreakdowns: calculatedMetrics?.people?.map((person) => ({ person: person.name, role: person.role, ...person.workLogBreakdown })) || [],
    reconciliation,
    mappingSnapshot,
    workCategoryMapping,
    kpiConfig,
    dataQuality,
    calculationVersion: CALCULATION_VERSION
  };
}
