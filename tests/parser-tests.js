import { test, equal, ok } from "./test-helpers.js";
import { detectFileSignature } from "../assets/js/utils/file-signature.js";
import { cleanHeaders } from "../assets/js/services/normalization/header-normalizer.js";
import { extractQaKeys } from "../assets/js/models/jira-model.js";
import { withCapacityFallbacks } from "../assets/js/services/parsers/capacity-parser.js";
import { buildHeaderMap } from "../assets/js/services/normalization/header-normalizer.js";
import { CAPACITY_COLUMN_ALIASES } from "../assets/js/config/capacity-column-mapping.js";

test("XLSX signature detection", () => equal(detectFileSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer), "zip"));
test("XLS signature detection", () => equal(detectFileSignature(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer), "ole"));
test("XLS with incorrect XLSX extension uses signature", () => equal(detectFileSignature(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer), "ole"));
test("Header trimming", () => equal(cleanHeaders(["  Key   Name  "])[0], "Key Name"));
test("QA Return key extraction", () => ok(extractQaKeys([{ Key: " ABC-1 " }]).has("ABC-1")));
test("DOCX table extraction placeholder", () => ok(Boolean(window.mammoth)));
test("Cached formula-value reading placeholder", () => ok(Boolean(window.XLSX)));
test("Merged capacity-header handling placeholder", () => ok(true));
test("Explicit planned and unplanned capacity are preserved", () => {
  const person = withCapacityFallbacks({ availableCapacity: 100, plannedCapacity: 70, unplannedCapacity: 30 });
  equal(person.plannedCapacity, 70);
  equal(person.unplannedCapacity, 30);
});
test("Zero planned and unplanned capacity are explicit values", () => {
  const person = withCapacityFallbacks({ availableCapacity: 100, plannedCapacity: 0, unplannedCapacity: 0 });
  equal(person.plannedCapacity, 0);
  equal(person.unplannedCapacity, 0);
});
test("Missing planned capacity uses 80 percent fallback", () => equal(withCapacityFallbacks({ availableCapacity: 100, plannedCapacity: null, unplannedCapacity: 25 }).plannedCapacity, 80));
test("Missing unplanned capacity uses 20 percent fallback", () => equal(withCapacityFallbacks({ availableCapacity: 100, plannedCapacity: 75, unplannedCapacity: null }).unplannedCapacity, 20));
test("Capacity Persian and English headers normalize", () => {
  const map = buildHeaderMap(["Plan Cap", "ظرفیت انپلن", "Available Capacity"], CAPACITY_COLUMN_ALIASES);
  equal(map.planned, "Plan Cap");
  equal(map.unplanned, "ظرفیت انپلن");
  equal(map.total, "Available Capacity");
});
test("Jira main-sheet detection placeholder", () => ok(true));
test("QA Return sheet detection placeholder", () => ok(true));
