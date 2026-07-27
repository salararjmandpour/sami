const fs = require("fs");
const XLSX = require("../assets/vendor/xlsx.full.min.js");

for (const f of ["sample-data/jira.xlsx", "sample-data/capacity.xlsx"]) {
  const wb = XLSX.read(fs.readFileSync(f), { type: "buffer", cellDates: true, cellNF: true, cellFormula: true });
  console.log(`\nFILE ${f}`);
  for (const s of wb.SheetNames) {
    const sh = wb.Sheets[s];
    const range = XLSX.utils.decode_range(sh["!ref"] || "A1:A1");
    console.log("SHEET", JSON.stringify(s), "rows", range.e.r + 1, "cols", range.e.c + 1, "merges", JSON.stringify(sh["!merges"] || []));
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "", raw: true });
    console.log("row1", JSON.stringify(rows[0]));
    if (f.includes("capacity")) rows.slice(0, 23).forEach((r, i) => console.log(i + 1, JSON.stringify(r)));
    const formulas = [];
    for (const a of Object.keys(sh)) {
      if (a[0] !== "!" && sh[a].f) formulas.push({ a, f: sh[a].f, v: sh[a].v, w: sh[a].w, z: sh[a].z, t: sh[a].t });
    }
    console.log("formulas", formulas.length, JSON.stringify(formulas.slice(0, 20)));
  }
}

const jira = XLSX.read(fs.readFileSync("sample-data/jira.xlsx"), { type: "buffer", cellDates: true, cellNF: true, cellFormula: true });
const jiraSheet = jira.Sheets["sprint 26.1"];
const jiraRows = XLSX.utils.sheet_to_json(jiraSheet, { header: 1, defval: "", raw: true });
const jiraHeaders = jiraRows[0];
console.log("\nJIRA HEADERS");
jiraHeaders.forEach((h, i) => console.log(`${i + 1}:${JSON.stringify(h)}`));
const inspectCols = ["Time Spent", "Σ Time Spent", "Σ Work Logged AmirReza", "Work Logged Omid", "Work Logged mozhdeh", "Work Logged behzad", "Work Today abbas", "Work Logged sepideh", "Work Today Ali", "Time in block", "DevEstimat", "TestEstimat", "Story Points", "Created", " FirstInProgress", "FirstAutomationTest", " Done Date"];
for (const col of inspectCols) {
  const idx = jiraHeaders.indexOf(col);
  if (idx < 0) {
    console.log("missing", col);
    continue;
  }
  const colName = XLSX.utils.encode_col(idx);
  const vals = [];
  for (let r = 2; r <= Math.min(20, jiraRows.length); r += 1) {
    const c = jiraSheet[colName + r];
    if (c && c.v !== "") vals.push({ cell: colName + r, t: c.t, v: c.v, w: c.w, z: c.z });
  }
  console.log(`\nCOL ${JSON.stringify(col)}`, JSON.stringify(vals.slice(0, 10)));
}
