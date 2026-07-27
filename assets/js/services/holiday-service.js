import { DEFAULT_HOLIDAYS, WORK_CALENDAR } from "../config/iran-holidays.js";
import { dbGetAll, dbPut } from "./indexeddb-service.js";

function minutesOf(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getHolidays() {
  const saved = await dbGetAll("holidays");
  return saved.length ? saved : DEFAULT_HOLIDAYS.map((h, index) => ({ id: `default-${index}`, ...h }));
}

export async function saveHoliday(holiday) {
  return dbPut("holidays", { id: holiday.id || crypto.randomUUID(), ...holiday });
}

export function workingHoursBetween(startIso, endIso, holidays = DEFAULT_HOLIDAYS, calendar = WORK_CALENDAR) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!startIso || !endIso || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const holidaySet = new Set(holidays.filter((h) => h.enabled).map((h) => h.gregorianDate));
  const dayStart = minutesOf(calendar.workdayStart);
  const dayEnd = minutesOf(calendar.workdayEnd);
  let cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  let totalMinutes = 0;
  while (cursor <= end) {
    const yyyyMmDd = localDateKey(cursor);
    const weekday = cursor.getDay();
    if (!calendar.weekendDays.includes(weekday) && !holidaySet.has(yyyyMmDd)) {
      const windowStart = new Date(cursor);
      windowStart.setHours(Math.floor(dayStart / 60), dayStart % 60, 0, 0);
      const windowEnd = new Date(cursor);
      windowEnd.setHours(Math.floor(dayEnd / 60), dayEnd % 60, 0, 0);
      const effectiveStart = start > windowStart ? start : windowStart;
      const effectiveEnd = end < windowEnd ? end : windowEnd;
      if (effectiveEnd > effectiveStart) totalMinutes += (effectiveEnd - effectiveStart) / 60000;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return totalMinutes / 60;
}
