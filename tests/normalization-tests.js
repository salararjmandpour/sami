import { test, equal, close } from "./test-helpers.js";
import { normalizeNumber } from "../assets/js/services/normalization/number-normalizer.js";
import { normalizeString } from "../assets/js/services/normalization/string-normalizer.js";
import { hasReachedInProgress, normalizePlanType, normalizeStatus } from "../assets/js/services/normalization/status-normalizer.js";
import { normalizeLabels } from "../assets/js/services/normalization/label-normalizer.js";
import { buildHeaderMap } from "../assets/js/services/normalization/header-normalizer.js";
import { FIELD_ALIASES } from "../assets/js/config/field-aliases.js";
import { normalizePossibleExcelHours } from "../assets/js/services/normalization/unit-normalizer.js";

function mojibakeUtf8(text) {
  const cp1252 = {
    0x80: "\u20AC", 0x82: "\u201A", 0x83: "\u0192", 0x84: "\u201E", 0x85: "\u2026", 0x86: "\u2020", 0x87: "\u2021",
    0x88: "\u02C6", 0x89: "\u2030", 0x8A: "\u0160", 0x8B: "\u2039", 0x8C: "\u0152", 0x8E: "\u017D",
    0x91: "\u2018", 0x92: "\u2019", 0x93: "\u201C", 0x94: "\u201D", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
    0x98: "\u02DC", 0x99: "\u2122", 0x9A: "\u0161", 0x9B: "\u203A", 0x9C: "\u0153", 0x9E: "\u017E", 0x9F: "\u0178"
  };
  return Array.from(new TextEncoder().encode(text), (byte) => cp1252[byte] || String.fromCharCode(byte)).join("");
}

test("Persian digit conversion", () => equal(normalizeNumber("۱۲۳"), 123));
test("Arabic digit conversion", () => equal(normalizeNumber("١٢٣"), 123));
test("Mojibake Persian digit conversion", () => equal(normalizeNumber(mojibakeUtf8("۱۲۳")), 123));
test("Mojibake Persian UI text is repaired centrally", () => equal(normalizeString(mojibakeUtf8("جزئیات")), "جزئیات"));
test("Double-encoded Sigma header is repaired centrally", () => equal(normalizeString(mojibakeUtf8(mojibakeUtf8("Σ Time Spent"))), "Σ Time Spent"));
test("Plan normalization", () => equal(normalizePlanType("Plan"), "planned"));
test("Unplan normalization", () => equal(normalizePlanType("Unplanned"), "unplanned"));
test("Empty Carry Over classification", () => equal(normalizePlanType(" "), "carry_over"));
test("Plan normalization ignores punctuation", () => equal(normalizePlanType(" planned. "), "planned"));
test("Automatic Test normalization", () => equal(normalizeStatus("Automatic Test"), "automation_test"));
test("Current In Progress is started", () => equal(hasReachedInProgress({ status: "In Progress" }), true));
test("Current Done is started", () => equal(hasReachedInProgress({ status: "Done" }), true));
test("Backlog with previous In Progress is started", () => equal(hasReachedInProgress({ status: "Backlog", statusHistory: "Ready > In Progress > Backlog" }), true));
test("Never In Progress is not started", () => equal(hasReachedInProgress({ status: "Ready", statusHistory: "Draft > Ready" }), false));
test("BugFix normalization", () => equal(normalizeLabels("Bug Fix").includes("bugfix"), true));
test("HotFix normalization", () => equal(normalizeLabels("HotFix").includes("hotfix"), true));
test("Contact Point alias mapping", () => equal(buildHeaderMap(["Contact Point"], FIELD_ALIASES).qaOwner, "Contact Point"));
test("Content Point alias mapping", () => equal(buildHeaderMap(["Content Point"], FIELD_ALIASES).qaOwner, "Content Point"));
test("Mojibake Sigma header alias mapping", () => equal(buildHeaderMap([mojibakeUtf8("Σ Time Spent")], FIELD_ALIASES).totalWorkLogged, mojibakeUtf8("Σ Time Spent")));
test("0.0416666667 Excel day = 1 hour", () => close(normalizePossibleExcelHours(0.0416666667).hours, 1));
test("0.125 Excel day = 3 hours", () => close(normalizePossibleExcelHours(0.125).hours, 3));
