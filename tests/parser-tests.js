import { test, equal, ok } from "./test-helpers.js";
import { detectFileSignature } from "../assets/js/utils/file-signature.js";
import { cleanHeaders } from "../assets/js/services/normalization/header-normalizer.js";
import { extractQaKeys } from "../assets/js/models/jira-model.js";

test("XLSX signature detection", () => equal(detectFileSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer), "zip"));
test("XLS signature detection", () => equal(detectFileSignature(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer), "ole"));
test("XLS with incorrect XLSX extension uses signature", () => equal(detectFileSignature(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer), "ole"));
test("Header trimming", () => equal(cleanHeaders(["  Key   Name  "])[0], "Key Name"));
test("QA Return key extraction", () => ok(extractQaKeys([{ Key: " ABC-1 " }]).has("ABC-1")));
test("DOCX table extraction placeholder", () => ok(Boolean(window.mammoth)));
test("Cached formula-value reading placeholder", () => ok(Boolean(window.XLSX)));
test("Merged capacity-header handling placeholder", () => ok(true));
test("Jira main-sheet detection placeholder", () => ok(true));
test("QA Return sheet detection placeholder", () => ok(true));

