const fs = require("fs");
const path = require("path");
const nodeCrypto = require("crypto");

global.window = global;
global.XLSX = require("../assets/vendor/xlsx.full.min.js");
global.mammoth = require("../assets/vendor/mammoth.browser.min.js");
global.crypto = { randomUUID: nodeCrypto.randomUUID };

async function main() {
  const { runRealDataValidation } = await import("./real-data-validation-core.js");
  const result = await runRealDataValidation(async (spec) => {
    const absolute = path.join(__dirname, "..", "sample-data", spec.name);
    const buffer = fs.readFileSync(absolute);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return { spec, file: { name: spec.name, size: buffer.byteLength }, arrayBuffer };
  });
  const outPath = path.join(__dirname, "real-data-validation-result.json");
  const reconciliationPath = path.join(__dirname, "reconciliation-result.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
  fs.writeFileSync(reconciliationPath, JSON.stringify(result.reconciliation, null, 2), "utf8");
  const passed = result.checks.filter((check) => check.pass).length;
  console.log(JSON.stringify({
    output: outPath,
    reconciliationOutput: reconciliationPath,
    checks: `${passed}/${result.checks.length}`,
    files: result.files,
    jiraIssueCount: result.jira.issueCount,
    qaReturnCount: result.qaReturn.uniqueCount,
    capacityPersonCount: result.capacity.personCount,
    kpiDefinitionCount: result.kpi.definitionCount,
    dataQuality: result.dataQuality.counts
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
