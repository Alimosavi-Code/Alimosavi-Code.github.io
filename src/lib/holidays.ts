/**
 * Official Iranian holidays & events + Remote Calendar & Hijri Sync Engine (`calendar-sync.json`).
 * 100% parity with Android `Holidays.kt` + `HolidaysInit.kt` (v6.7.1).
 */
import { toJalaali, toGregorian, jalaaliMonthLength } from "./jalali";
import {
  islamicToJdn,
  jdnToIslamic,
  islamicMonthLength,
  gregorianToJdn,
  jdnToGregorian,
  weekDayOrdinal,
  rebuildHijriTableWithOverrides,
  setHijriDayOffsets,
} from "./islamic-calendar";
import { RECURRING_EVENTS, IRREGULAR_EVENTS, type EventCalendar, type IrregularEvent } from "./events-data";

export const HOLIDAY_SOURCE_LABEL = "تعطیلات رسمی ایران";

export interface DayEvent {
  title: string;
  isHoliday: boolean;
}

export interface RemoteExtraEvent {
  date: string; // "1405-08-20" or "08-20"
  title: string;
  isHoliday: boolean;
}

export type SyncOutcome = "UPDATED" | "UP_TO_DATE";

/* ---------------- Remote CalendarSync Engine (v6.7.1) ---------------- */

const DEFAULT_CALENDAR_SYNC_URL =
  "https://raw.githubusercontent.com/Alimosavi-Code/Shiftkar/refs/heads/main/calendar-sync.json";
const STORAGE_KEY_SYNC_JSON = "shiftkar_neo_calendar_sync_json_v1";

let _syncVersion = 1;
let _updatedAt = "پیش‌فرض برنامه";
let _extraEvents: RemoteExtraEvent[] = [];
let _removeHolidayDates = new Set<string>();
let _removeEventsOnDates = new Set<string>();
let _cachedLoaded = false;

function normYm(raw: string): string {
  const parts = raw.trim().split(/[-/]/);
  if (parts.length !== 2) return raw.trim();
  const y = parseInt(parts[0].trim(), 10);
  const m = parseInt(parts[1].trim(), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return raw.trim();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function normYmd(raw: string): string {
  const parts = raw.trim().split(/[-/]/);
  if (parts.length === 3) {
    const y = parseInt(parts[0].trim(), 10);
    const m = parseInt(parts[1].trim(), 10);
    const d = parseInt(parts[2].trim(), 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return raw.trim();
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0].trim(), 10);
    const d = parseInt(parts[1].trim(), 10);
    if (!Number.isFinite(m) || !Number.isFinite(d)) return raw.trim();
    return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return raw.trim();
}

/**
 * Strips single-line (`//`) and multi-line (`/* *\/`) comments outside strings
 * and trailing commas before `}` or `]` so `calendar-sync.json` can keep all
 * example commands commented out directly in the file.
 */
export function preprocessJsonWithComments(raw: string): string {
  let out = "";
  let i = 0;
  const n = raw.length;
  let inString = false;
  while (i < n) {
    const c = raw[i];
    if (inString) {
      if (c === "\\" && i + 1 < n) {
        out += c + raw[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      out += c;
      i++;
    } else {
      if (c === '"') {
        inString = true;
        out += c;
        i++;
      } else if (c === "/" && i + 1 < n && raw[i + 1] === "/") {
        i += 2;
        while (i < n && raw[i] !== "\n") i++;
      } else if (c === "/" && i + 1 < n && raw[i + 1] === "*") {
        i += 2;
        while (i + 1 < n && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
        i += 2;
      } else {
        out += c;
        i++;
      }
    }
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

function canonicalizeJson(rawJson: string): string {
  try {
    return JSON.stringify(JSON.parse(preprocessJsonWithComments(rawJson)));
  } catch {
    return "";
  }
}

function isDefaultNoOpState(): boolean {
  return (
    _syncVersion === 1 &&
    _extraEvents.length === 0 &&
    _removeHolidayDates.size === 0 &&
    _removeEventsOnDates.size === 0
  );
}

const yearCache = new Map<number, Map<string, DayEvent[]>>();

export function clearHolidaysCache() {
  yearCache.clear();
}

export function applyCalendarSyncJson(rawJson: string): boolean {
  try {
    const clean = preprocessJsonWithComments(rawJson);
    const root = JSON.parse(clean);
    /* A valid calendar-sync payload must be a JSON *object* — arrays/scalars
     * (e.g. a truncated or hijacked remote file) are rejected outright so they
     * can never wipe the applied overrides. */
    if (!root || typeof root !== "object" || Array.isArray(root)) return false;

    const ver = typeof root.syncVersion === "number" ? root.syncVersion : 1;
    const upd = typeof root.updatedAt === "string" && root.updatedAt.trim() ? root.updatedAt.trim() : "پیش‌فرض برنامه";
    const globalOff =
      typeof root.globalHijriDayOffset === "number"
        ? Math.max(-5, Math.min(5, Math.trunc(root.globalHijriDayOffset)))
        : 0;

    const newMonthOffsets: Record<string, number> = {};
    if (root.hijriMonthDayOffset && typeof root.hijriMonthDayOffset === "object") {
      for (const [k, v] of Object.entries(root.hijriMonthDayOffset)) {
        if (k.startsWith("_")) continue;
        const n = Number(v);
        if (Number.isFinite(n) && n !== 0) {
          newMonthOffsets[normYm(k)] = Math.max(-5, Math.min(5, Math.trunc(n)));
        }
      }
    }

    const newMonthLengths: Record<string, number> = {};
    if (root.hijriMonthLengthOverrides && typeof root.hijriMonthLengthOverrides === "object") {
      for (const [k, v] of Object.entries(root.hijriMonthLengthOverrides)) {
        if (k.startsWith("_")) continue;
        const n = Number(v);
        if (n === 29 || n === 30) newMonthLengths[normYm(k)] = n;
      }
    }

    const newYearMonths: Record<number, number[]> = {};
    if (root.hijriYearMonths && typeof root.hijriYearMonths === "object") {
      for (const [k, v] of Object.entries(root.hijriYearMonths)) {
        if (k.startsWith("_")) continue;
        const hy = parseInt(k.trim(), 10);
        if (!Number.isFinite(hy) || !Array.isArray(v) || v.length !== 12) continue;
        newYearMonths[hy] = v.map((len) => (Number(len) === 30 ? 30 : 29));
      }
    }

    const newExtras: RemoteExtraEvent[] = [];
    if (Array.isArray(root.extraEvents)) {
      for (const item of root.extraEvents) {
        if (!item || typeof item !== "object") continue;
        const d = typeof item.date === "string" ? item.date.trim() : "";
        const t = typeof item.title === "string" ? item.title.trim() : "";
        const h = Boolean(item.isHoliday);
        if (d && t) newExtras.push({ date: normYmd(d), title: t, isHoliday: h });
      }
    }

    const newRemoveHol = new Set<string>();
    if (Array.isArray(root.removeHolidayDates)) {
      for (const d of root.removeHolidayDates) {
        if (typeof d === "string" && d.trim()) newRemoveHol.add(normYmd(d.trim()));
      }
    }

    const newRemoveEv = new Set<string>();
    if (Array.isArray(root.removeEventsOnDates)) {
      for (const d of root.removeEventsOnDates) {
        if (typeof d === "string" && d.trim()) newRemoveEv.add(normYmd(d.trim()));
      }
    }

    _syncVersion = ver;
    _updatedAt = upd;
    _extraEvents = newExtras;
    _removeHolidayDates = newRemoveHol;
    _removeEventsOnDates = newRemoveEv;

    setHijriDayOffsets(globalOff, newMonthOffsets);
    rebuildHijriTableWithOverrides(newYearMonths, newMonthLengths);
    clearHolidaysCache();
    return true;
  } catch {
    return false;
  }
}

export function ensureCalendarSyncLoaded() {
  if (_cachedLoaded || typeof window === "undefined") return;
  _cachedLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNC_JSON);
    if (raw) applyCalendarSyncJson(raw);
  } catch {
    /* ignore */
  }
}

export function getCalendarSyncStatus() {
  ensureCalendarSyncLoaded();
  return {
    syncVersion: _syncVersion,
    updatedAt: _updatedAt,
  };
}

export async function syncCalendarNow(
  onRebuilt?: () => void,
  customUrl?: string,
): Promise<{ ok: true; outcome: SyncOutcome; syncVersion: number; updatedAt: string } | { ok: false; error: string }> {
  ensureCalendarSyncLoaded();
  try {
    const baseUrl = customUrl?.trim() || DEFAULT_CALENDAR_SYNC_URL;
    const sep = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${sep}t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.text();
    if (!body.trim()) {
      return { ok: false, error: "فایل دریافتی خالی است" };
    }

    let prevCached = "";
    try {
      prevCached = localStorage.getItem(STORAGE_KEY_SYNC_JSON) || "";
    } catch {
      /* ignore */
    }
    const prevCanon = prevCached ? canonicalizeJson(prevCached) : "";
    const newCanon = canonicalizeJson(body);

    const applied = applyCalendarSyncJson(body);
    if (!applied) {
      return { ok: false, error: "ساختار JSON معتبر نیست" };
    }

    const wasAlreadySame = prevCanon ? prevCanon === newCanon : isDefaultNoOpState();

    try {
      localStorage.setItem(STORAGE_KEY_SYNC_JSON, body);
    } catch {
      /* ignore */
    }

    if (onRebuilt) onRebuilt();
    return {
      ok: true,
      outcome: wasAlreadySame ? "UP_TO_DATE" : "UPDATED",
      syncVersion: _syncVersion,
      updatedAt: _updatedAt,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطا در ارتباط با گیت‌هاب" };
  }
}

/* ---------------- calendar helpers ---------------- */

function jalaliToJdn(jy: number, jm: number, jd: number) {
  const g = toGregorian(jy, jm, jd);
  return gregorianToJdn(g.gy, g.gm, g.gd);
}

function jdnToJalali(jdn: number) {
  const g = jdnToGregorian(jdn);
  return toJalaali(g.gy, g.gm, g.gd);
}

function gregorianMonthLength(gy: number, gm: number) {
  return new Date(Date.UTC(gy, gm, 0)).getUTCDate();
}

function dataWeekDayOrdinal(wd: number) {
  return wd % 7;
}

function nthWeekDayOfMonth(jdnOfDay1: number, weekDay: number, nth: number) {
  const appWd = dataWeekDayOrdinal(weekDay);
  const monthStartWd = weekDayOrdinal(jdnOfDay1);
  return appWd + 1 - monthStartWd + nth * 7 - (monthStartWd <= appWd ? 7 : 0);
}

function lastWeekDayOfMonth(jdnOfDay1: number, monthLength: number, weekDay: number) {
  const appWd = dataWeekDayOrdinal(weekDay);
  return monthLength - weekDayOrdinal(jdnOfDay1 + monthLength - 1 - appWd);
}

/* ---------------- irregular rule resolution ---------------- */

function monthLengthOf(calendar: EventCalendar, year: number, month: number) {
  if (calendar === "Hijri") return islamicMonthLength(year, month);
  if (calendar === "Gregorian") return gregorianMonthLength(year, month);
  return jalaaliMonthLength(year, month);
}

function calendarJdn(calendar: EventCalendar, year: number, month: number, day: number) {
  if (calendar === "Hijri") return islamicToJdn(year, month, day);
  if (calendar === "Gregorian") return gregorianToJdn(year, month, day);
  return jalaliToJdn(year, month, day);
}

function resolveRule(e: IrregularEvent, year: number) {
  const month = e.month ?? 1;
  const day = e.day ?? 1;
  const jdnOf = (m: number, d: number) => calendarJdn(e.calendar, year, m, d);
  const monthLen = (m: number) => monthLengthOf(e.calendar, year, m);
  switch (e.rule) {
    case "single event":
      if (e.year !== year) return null;
      return jdnOf(month, day);
    case "end of month":
      return jdnOf(month, monthLen(month));
    case "last weekday of month": {
      const len = monthLen(month);
      const d = lastWeekDayOfMonth(jdnOf(month, 1), len, e.weekday ?? 0) + (e.offset || 0);
      return jdnOf(month, d);
    }
    case "nth weekday of month": {
      const d = nthWeekDayOfMonth(jdnOf(month, 1), e.weekday ?? 0, e.nth ?? 1);
      return jdnOf(month, d);
    }
    case "nth day from":
      return jdnOf(month, day) + (e.nth ?? 1) - 1;
    default:
      return null;
  }
}

/* ---------------- per-year resolution ---------------- */

function inRange(jy: number, e: { begin: number | null; end: number | null }) {
  if (e.begin != null && jy < e.begin) return false;
  if (e.end != null && jy > e.end) return false;
  return true;
}

function resolveYear(jy: number): Map<string, DayEvent[]> {
  ensureCalendarSyncLoaded();
  const cached = yearCache.get(jy);
  if (cached) return cached;

  const map = new Map<string, DayEvent[]>();

  const add = (jm: number, jd: number, title: string, isHoliday: boolean) => {
    if (!jm || !jd || jm < 1 || jm > 12 || jd < 1 || jd > jalaaliMonthLength(jy, jm)) return;
    const key = `${jm}-${jd}`;
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push({ title, isHoliday: !!isHoliday });
  };

  // Persian (solar) recurring events
  for (const e of RECURRING_EVENTS) {
    if (e.calendar !== "Persian" || !inRange(jy, e)) continue;
    add(e.month, e.day, e.title, e.holiday);
  }

  // Hijri recurring events
  const jdnStart = jalaliToJdn(jy, 1, 1);
  const jdnEnd = jalaliToJdn(jy, 12, jalaaliMonthLength(jy, 12));
  const hyStart = jdnToIslamic(jdnStart).hy;
  const hyEnd = jdnToIslamic(jdnEnd).hy;
  for (let hy = hyStart; hy <= hyEnd; hy += 1) {
    for (const e of RECURRING_EVENTS) {
      if (e.calendar !== "Hijri") continue;
      const j = jdnToJalali(islamicToJdn(hy, e.month, e.day));
      if (j.jy !== jy || !inRange(jy, e)) continue;
      add(j.jm, j.jd, e.title, e.holiday);
    }
  }

  // Gregorian recurring events
  const gy1 = toGregorian(jy, 1, 1).gy;
  const gy2 = toGregorian(jy, 12, jalaaliMonthLength(jy, 12)).gy;
  for (let gy = gy1; gy <= gy2; gy += 1) {
    for (const e of RECURRING_EVENTS) {
      if (e.calendar !== "Gregorian") continue;
      const j = toJalaali(gy, e.month, e.day);
      if (j.jy !== jy || !inRange(jy, e)) continue;
      add(j.jm, j.jd, e.title, e.holiday);
    }
  }

  // Irregular events
  for (const e of IRREGULAR_EVENTS) {
    if (!inRange(jy, e)) continue;
    if (e.calendar === "Hijri") {
      for (let hy = hyStart; hy <= hyEnd; hy += 1) {
        const r = resolveRule(e, hy);
        if (r == null) continue;
        const j = jdnToJalali(r);
        if (j.jy === jy) add(j.jm, j.jd, e.title, e.holiday);
      }
    } else if (e.calendar === "Gregorian") {
      for (let gy = gy1; gy <= gy2; gy += 1) {
        const r = resolveRule(e, gy);
        if (r == null) continue;
        const j = jdnToJalali(r);
        if (j.jy === jy) add(j.jm, j.jd, e.title, e.holiday);
      }
    } else {
      const r = resolveRule(e, jy);
      if (r == null) continue;
      const j = jdnToJalali(r);
      if (j.jy === jy) add(j.jm, j.jd, e.title, e.holiday);
    }
  }

  // Apply remote CalendarSync overrides (removeEventsOnDates, removeHolidayDates, extraEvents)
  if (_removeEventsOnDates.size > 0 || _removeHolidayDates.size > 0) {
    for (let jm = 1; jm <= 12; jm++) {
      const len = jalaaliMonthLength(jy, jm);
      for (let jd = 1; jd <= len; jd++) {
        const ymd = `${String(jy).padStart(4, "0")}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
        const md = `${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
        const key = `${jm}-${jd}`;
        if (_removeEventsOnDates.has(ymd) || _removeEventsOnDates.has(md)) {
          map.delete(key);
        } else if (_removeHolidayDates.has(ymd) || _removeHolidayDates.has(md)) {
          const existing = map.get(key);
          if (existing) {
            map.set(
              key,
              existing.map((ev) => ({ ...ev, isHoliday: false })),
            );
          }
        }
      }
    }
  }

  if (_extraEvents.length > 0) {
    for (const ex of _extraEvents) {
      const parts = ex.date.split("-");
      if (parts.length === 3) {
        const ey = parseInt(parts[0], 10);
        const em = parseInt(parts[1], 10);
        const ed = parseInt(parts[2], 10);
        if (ey === jy) add(em, ed, ex.title, ex.isHoliday);
      } else if (parts.length === 2) {
        const em = parseInt(parts[0], 10);
        const ed = parseInt(parts[1], 10);
        add(em, ed, ex.title, ex.isHoliday);
      }
    }
  }

  // Sort: official holidays first, then Persian alphabetical
  for (const list of map.values()) {
    list.sort(
      (a, b) => (b.isHoliday ? 1 : 0) - (a.isHoliday ? 1 : 0) || a.title.localeCompare(b.title, "fa"),
    );
  }

  yearCache.set(jy, map);
  return map;
}

/* ---------------- public API ---------------- */

export function getDayEvents(jy: number, jm: number, jd: number): DayEvent[] {
  return resolveYear(jy).get(`${jm}-${jd}`) || [];
}

export function getHoliday(jy: number, jm: number, jd: number) {
  const holidays = getDayEvents(jy, jm, jd).filter((e) => e.isHoliday);
  if (!holidays.length) return null;
  return { name: holidays.map((e) => e.title).join("، "), source: HOLIDAY_SOURCE_LABEL };
}

export function isHoliday(jy: number, jm: number, jd: number): boolean {
  return getDayEvents(jy, jm, jd).some((e) => e.isHoliday);
}
