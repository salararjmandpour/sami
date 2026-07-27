import { normalizeString } from "../normalization/string-normalizer.js";

function extractTablesFromHtml(html) {
  if (typeof document === "undefined") return extractTablesWithRegex(html);
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.querySelectorAll("table")].map((table) => [...table.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => normalizeString(cell.textContent))));
}

function extractTablesWithRegex(html) {
  const tables = [];
  for (const tableMatch of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [];
    for (const rowMatch of tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)) {
        cells.push(normalizeString(cellMatch[0].replace(/<[^>]+>/g, " ")));
      }
      rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

export async function parseKpiDocx(file, arrayBuffer) {
  if (!window.mammoth) throw new Error("کتابخانه Mammoth بارگذاری نشده است.");
  console.group?.("KPI Parsing");
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const tables = extractTablesFromHtml(result.value);
  const rows = tables.flat().filter((cells) => cells.length >= 2);
  const body = rows.filter((cells, index) => index > 0 || !/kpi|شاخص/i.test(cells[0]));
  const parsed = {
    fileName: file.name,
    warnings: result.messages || [],
    diagnostics: {
      tableCount: tables.length,
      rowsPerTable: tables.map((table) => table.length),
      headers: tables.map((table) => table[0] || [])
    },
    kpis: body.map((cells) => ({
      name: cells[0],
      definition: cells[1] || "",
      formulaText: cells[2] || "",
      objective: cells[3] || "",
      interpretation: cells[4] || ""
    })).filter((kpi) => kpi.name && !/kpi|شاخص/i.test(kpi.name))
  };
  console.log?.({ fileName: file.name, tableCount: parsed.diagnostics.tableCount, kpis: parsed.kpis.length, warnings: parsed.warnings.length });
  console.groupEnd?.();
  return parsed;
}
