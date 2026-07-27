import { test, equal, close } from "./test-helpers.js";
import { workingHoursBetween } from "../assets/js/services/holiday-service.js";

const holidays = [{ gregorianDate: "2026-03-21", enabled: true, title: "holiday" }];

test("Exclude Thursday", () => equal(workingHoursBetween("2026-07-23T08:00:00", "2026-07-23T17:00:00", holidays), 0));
test("Exclude Friday", () => equal(workingHoursBetween("2026-07-24T08:00:00", "2026-07-24T17:00:00", holidays), 0));
test("Exclude official holiday", () => equal(workingHoursBetween("2026-03-21T08:00:00", "2026-03-21T17:00:00", holidays), 0));
test("Handle range starting on holiday", () => close(workingHoursBetween("2026-03-21T08:00:00", "2026-03-22T17:00:00", holidays), 9));
test("Handle range ending on holiday", () => close(workingHoursBetween("2026-03-20T08:00:00", "2026-03-21T17:00:00", holidays), 0));
test("Handle invalid date order", () => equal(workingHoursBetween("2026-01-02T08:00:00", "2026-01-01T08:00:00", holidays), null));

