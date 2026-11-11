/**
 * Dual-mode notes store + Unified Cross-Platform Backup/Restore (Android ↔ Web v6.7.2):
 *  - Tries the `/api/notes` SQLite endpoint when available, otherwise falls back to `localStorage`.
 *  - `exportFullBackupJson` / `importFullBackupJson` uses a unified JSON schema (`version: 3`, `app: "ShiftKar"`)
 *    that is 100% compatible with Android `NotesDb.kt` & `SettingsRepository.kt` in both directions:
 *      • `notes`: `[{dateKey, text, updatedAt}]` (also accepts object map `{[dateKey]: text}` on import)
 *      • `dayRecords`: `{[dateKey]: {ot, sw, overtimeHours, swapKind}}`
 *      • `customPatterns`: `[{..., offsets, groupOffsets}]`
 *      • `employees`: `[{..., dayLogs: {[dateKey]: {st, ot, status, overtimeHours}}}]`
 *      • `activePatternId`
 *  - Resilient JSON parser recovers cleanly even if Android SAF `openOutputStream` left trailing bytes
 *    after overwriting a longer file or included UTF-8 BOM / null bytes.
 */
import { useShiftKar, type DayWorkRecord, type EmployeeProfile, type EmployeeDayStatus } from "./store";
import { ALL_SHIFT_GROUPS, type ShiftGroup, type ShiftKind } from "./models";
import { DEFAULT_BASE_JDN, type ShiftPatternSpec, type ShiftPhase } from "./shift-engine";

export interface NoteRow {
  dateKey: string;
  text: string;
  updatedAt?: number;
}

const LS_KEY = "shiftkar_notes_v1";
let apiMode: "unknown" | "up" | "down" =
  process.env.NEXT_PUBLIC_STATIC === "1" ? "down" : "unknown";

function readLocal(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocal(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function getAllNotesSync(): Record<string, string> {
  return readLocal();
}

export async function listNotes(filter?: {
  jy?: number;
  jm?: number;
  q?: string;
}): Promise<NoteRow[]> {
  if (apiMode !== "down") {
    try {
      const sp = new URLSearchParams();
      if (filter?.jy != null) sp.set("jy", String(filter.jy));
      if (filter?.jm != null) sp.set("jm", String(filter.jm));
      if (filter?.q) sp.set("q", filter.q);
      const q = sp.toString();
      const res = await fetch(`/api/notes${q ? `?${q}` : ""}`, { cache: "no-store" });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        const data = await res.json();
        if (Array.isArray(data.notes)) {
          apiMode = "up";
          const local = readLocal();
          for (const n of data.notes as NoteRow[]) local[n.dateKey] = n.text;
          writeLocal(local);
          return data.notes;
        }
      }
      apiMode = "down";
    } catch {
      apiMode = "down";
    }
  }

  const all = readLocal();
  const prefix =
    filter?.jy != null && filter?.jm != null
      ? `${String(filter.jy).padStart(4, "0")}-${String(filter.jm).padStart(2, "0")}-`
      : null;
  const q = filter?.q?.trim();
  return Object.entries(all)
    .filter(([k, v]) => {
      if (!v || !String(v).trim()) return false;
      if (prefix && !k.startsWith(prefix)) return false;
      if (q && !v.includes(q) && !k.includes(q)) return false;
      return true;
    })
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, text]) => ({ dateKey, text }));
}

export async function getNote(dateKey: string): Promise<string> {
  if (apiMode !== "down") {
    try {
      const res = await fetch(`/api/notes?dateKey=${encodeURIComponent(dateKey)}`, {
        cache: "no-store",
      });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        const data = await res.json();
        apiMode = "up";
        /* Prefer the single-note shape `{ note }`; fall back to searching the
         * full `{ notes: [] }` list so an older backend can never wipe a
         * locally stored note by answering with an unexpected shape. */
        let text = "";
        if (data && data.note && typeof data.note.text === "string") {
          text = data.note.text;
        } else if (Array.isArray(data.notes)) {
          const hit = (data.notes as NoteRow[]).find((n) => n && n.dateKey === dateKey);
          text = hit?.text || "";
        } else {
          /* Unknown response shape — do not touch the local copy. */
          return readLocal()[dateKey] || "";
        }
        const local = readLocal();
        if (text) local[dateKey] = text;
        else delete local[dateKey];
        writeLocal(local);
        return text;
      }
      apiMode = "down";
    } catch {
      apiMode = "down";
    }
  }
  return readLocal()[dateKey] || "";
}

export async function saveNote(dateKey: string, text: string): Promise<void> {
  const trimmed = text.trim();
  const local = readLocal();
  if (trimmed) local[dateKey] = trimmed;
  else delete local[dateKey];
  writeLocal(local);

  if (apiMode !== "down") {
    try {
      /* NOTE: the API route upserts via POST (PUT is not exported and returns 405). */
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dateKey, text: trimmed }),
      });
      if (!res.ok) apiMode = "down";
    } catch {
      apiMode = "down";
    }
  }
}

export async function deleteNote(dateKey: string): Promise<void> {
  const local = readLocal();
  delete local[dateKey];
  writeLocal(local);

  if (apiMode !== "down") {
    try {
      const res = await fetch(`/api/notes?dateKey=${encodeURIComponent(dateKey)}`, {
        method: "DELETE",
      });
      if (!res.ok) apiMode = "down";
    } catch {
      apiMode = "down";
    }
  }
}

function toAsciiDigits(str: string): string {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  let out = "";
  for (const ch of str) {
    const pi = persian.indexOf(ch);
    const ai = arabic.indexOf(ch);
    if (pi >= 0) out += String(pi);
    else if (ai >= 0) out += String(ai);
    else out += ch;
  }
  return out;
}

function normalizeDateKey(raw: string): string | null {
  const cleaned = toAsciiDigits(String(raw || "").trim());
  const m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function mapEmployeeStatusFromBackup(raw: string | undefined): EmployeeDayStatus {
  if (!raw) return "AS_SCHEDULED";
  switch (String(raw).trim().toUpperCase()) {
    case "AS_SCHEDULED":
    case "SCHEDULED":
      return "AS_SCHEDULED";
    case "LEAVE":
      return "LEAVE";
    case "DAY":
    case "SWAP_DAY":
      return "DAY";
    case "EVENING":
    case "SWAP_EVENING":
      return "EVENING";
    case "NIGHT":
    case "SWAP_NIGHT":
      return "NIGHT";
    case "REST":
    case "SWAP_REST":
      return "REST";
    default:
      return "AS_SCHEDULED";
  }
}

function mapEmployeeStatusToAndroid(st: EmployeeDayStatus): string {
  switch (st) {
    case "AS_SCHEDULED":
      return "SCHEDULED";
    case "LEAVE":
      return "LEAVE";
    case "DAY":
      return "SWAP_DAY";
    case "EVENING":
      return "SWAP_EVENING";
    case "NIGHT":
      return "SWAP_NIGHT";
    case "REST":
      return "SWAP_REST";
  }
}

/**
 * Resilient JSON parser that handles:
 *  - UTF-8 BOM (`\uFEFF`) and NUL (`\0`) bytes
 *  - Trailing garbage bytes left by Android SAF `openOutputStream(uri)` when overwriting a longer file
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBackupJsonResilient(rawText: string): any {
  const cleaned = rawText.replace(/^\uFEFF/, "").replace(/\0+/g, "").trim();
  if (!cleaned) throw new Error("فایل انتخابی خالی است");

  try {
    return JSON.parse(cleaned);
  } catch {
    // Extract the first balanced JSON object `{...}` or array `[...]`
    const startIdx = cleaned.search(/[{[]/);
    if (startIdx < 0) throw new Error("فرمت JSON در فایل یافت نشد");
    const openCh = cleaned[startIdx];
    const closeCh = openCh === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = startIdx; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (c === "\\") {
          esc = true;
        } else if (c === '"') {
          inStr = false;
        }
      } else {
        if (c === '"') inStr = true;
        else if (c === openCh) depth++;
        else if (c === closeCh) {
          depth--;
          if (depth === 0) {
            const slice = cleaned.slice(startIdx, i + 1);
            return JSON.parse(slice);
          }
        }
      }
    }
    throw new Error("ساختار فایل پشتیبان ناقص است");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function maybeParseSubJson(val: any): any {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return val;
      }
    }
  }
  return val;
}

/**
 * Unified Full Backup Export (100% identical to Android `NotesDb.exportJson` schema v3):
 * Can be restored directly in both the Android app (`NotesDb.importFullBackup`) and the Web PWA!
 */
export async function exportFullBackupJson(): Promise<string> {
  const rows = await listNotes();
  const now = Date.now();
  const notesArr = rows
    .filter((r) => r.text.trim())
    .map((r) => ({
      dateKey: r.dateKey,
      text: r.text.trim(),
      updatedAt: r.updatedAt ?? now,
    }));

  const state = useShiftKar.getState();

  const dayRecordsOut: Record<
    string,
    { ot?: number; sw?: string; overtimeHours: number; swapKind: ShiftKind | null }
  > = {};
  for (const [dk, rec] of Object.entries(state.dayRecords)) {
    const ot = Number(rec.overtimeHours) || 0;
    const sw = rec.swapKind ?? null;
    if (ot > 0 || sw !== null) {
      const entry: { ot?: number; sw?: string; overtimeHours: number; swapKind: ShiftKind | null } = {
        overtimeHours: ot,
        swapKind: sw,
      };
      if (ot > 0) entry.ot = ot;
      if (sw !== null) entry.sw = sw;
      dayRecordsOut[dk] = entry;
    }
  }

  const customPatternsOut = state.customPatterns.map((p) => {
    const offsetsObj: Record<string, number> = {};
    const labelsObj: Record<string, string> = {};
    for (const g of ALL_SHIFT_GROUPS) {
      offsetsObj[g] = p.groupOffsets?.[g] ?? 0;
      labelsObj[g] = p.groupLabels?.[g] ?? g;
    }
    return {
      id: p.id,
      name: p.name,
      subtitle: p.subtitle,
      dayCount: p.dayCount,
      eveningCount: p.eveningCount ?? 0,
      nightCount: p.nightCount,
      restCount: p.restCount,
      anchorJdn: p.anchorJdn,
      hasGroups: p.hasGroups,
      groupCount: p.groupCount,
      groupLabels: labelsObj,
      phases: p.phases ?? [],
      offsets: offsetsObj,
      groupOffsets: offsetsObj,
    };
  });

  const employeesOut = state.employees.map((emp) => {
    const dayLogsOut: Record<
      string,
      { st: string; ot: number; status: EmployeeDayStatus; overtimeHours: number }
    > = {};
    for (const [dk, dl] of Object.entries(emp.dayLogs || {})) {
      if (dl.status === "AS_SCHEDULED" && (dl.overtimeHours ?? 0) <= 0) continue;
      dayLogsOut[dk] = {
        st: mapEmployeeStatusToAndroid(dl.status),
        ot: dl.overtimeHours || 0,
        status: dl.status,
        overtimeHours: dl.overtimeHours || 0,
      };
    }
    return {
      id: emp.id,
      name: emp.name,
      role: emp.role || "",
      group: emp.group,
      patternId: emp.patternId || "ACTIVE",
      dayLogs: dayLogsOut,
    };
  });

  const payload = {
    app: "ShiftKar",
    version: 3,
    exportedAt: now,
    activePatternId: state.activePatternId,
    notes: notesArr,
    dayRecords: dayRecordsOut,
    customPatterns: customPatternsOut,
    employees: employeesOut,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Unified Full Backup Restore — accepts any backup file from:
 *  - Android ShiftKar (`NotesDb.exportJson` v1 / v2 / v3)
 *  - Web ShiftKar (`exportFullBackupJson`)
 *  - Legacy `{ "1405-08-12": "note" }` or `[{ "dateKey": "1405-08-12", "text": "note" }]` files
 */
export async function importFullBackupJson(rawText: string): Promise<{
  notesCount: number;
  recordsCount: number;
  employeesCount: number;
  patternsCount: number;
}> {
  const parsed = parseBackupJsonResilient(rawText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("فرمت فایل پشتیبان معتبر نیست");
  }

  const local = readLocal();
  let notesCount = 0;

  // 1. Notes (supports Array of {dateKey, text} OR Object map {[dateKey]: text} OR top-level Array)
  const rawNotes = Array.isArray(parsed)
    ? parsed
    : parsed.notes !== undefined
      ? maybeParseSubJson(parsed.notes)
      : !parsed.app && !parsed.dayRecords && !parsed.employees && !parsed.customPatterns
        ? parsed
        : null;

  if (Array.isArray(rawNotes)) {
    for (const item of rawNotes) {
      if (!item || typeof item !== "object") continue;
      const dk = normalizeDateKey(item.dateKey || item.date || item.key || "");
      const text =
        typeof item.text === "string"
          ? item.text.trim()
          : typeof item.note === "string"
            ? item.note.trim()
            : "";
      if (!dk || !text) continue;
      local[dk] = text;
      notesCount += 1;
    }
  } else if (rawNotes && typeof rawNotes === "object") {
    for (const [k, v] of Object.entries(rawNotes)) {
      const dk = normalizeDateKey(k);
      if (!dk) continue;
      const text =
        typeof v === "string"
          ? v.trim()
          : v && typeof v === "object" && typeof (v as { text?: string }).text === "string"
            ? (v as { text: string }).text.trim()
            : "";
      if (!text) continue;
      local[dk] = text;
      notesCount += 1;
    }
  }
  writeLocal(local);

  const curState = useShiftKar.getState();

  // 2. Day Records (supports Android `{ot, sw}` AND PWA `{overtimeHours, swapKind}`)
  const nextRecords: Record<string, DayWorkRecord> = { ...curState.dayRecords };
  let recordsCount = 0;
  const rawDayRecords = maybeParseSubJson(parsed.dayRecords);
  if (rawDayRecords && typeof rawDayRecords === "object" && !Array.isArray(rawDayRecords)) {
    for (const [k, rec] of Object.entries(rawDayRecords)) {
      const dk = normalizeDateKey(k);
      if (!dk || !rec || typeof rec !== "object") continue;
      const rObj = rec as {
        overtimeHours?: number;
        ot?: number;
        swapKind?: string | null;
        sw?: string | null;
      };
      const rawOt = rObj.overtimeHours !== undefined ? rObj.overtimeHours : rObj.ot;
      const ot = Math.max(0, Math.min(24, Math.round(Number(rawOt) || 0)));
      const rawSw = String(rObj.swapKind ?? rObj.sw ?? "").trim().toUpperCase();
      const sk = ["DAY", "EVENING", "NIGHT", "REST"].includes(rawSw)
        ? (rawSw as ShiftKind)
        : null;
      if (ot > 0 || sk !== null) {
        nextRecords[dk] = { overtimeHours: ot, swapKind: sk };
        recordsCount += 1;
      }
    }
  }

  // 3. Custom Patterns (supports Android `offsets` AND PWA `groupOffsets`)
  const nextCustomPatterns: ShiftPatternSpec[] = [...curState.customPatterns];
  let patternsCount = 0;
  const rawPatterns = maybeParseSubJson(parsed.customPatterns);
  if (Array.isArray(rawPatterns)) {
    for (const item of rawPatterns) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim()) continue;
      const offsets: Partial<Record<ShiftGroup, number>> = {};
      const srcOffsets = maybeParseSubJson(item.groupOffsets ?? item.offsets);
      if (srcOffsets && typeof srcOffsets === "object") {
        for (const g of ALL_SHIFT_GROUPS) {
          if (typeof srcOffsets[g] === "number" && Number.isFinite(srcOffsets[g])) {
            offsets[g] = Math.trunc(srcOffsets[g]);
          }
        }
      }
      const labels: Partial<Record<ShiftGroup, string>> = {};
      const srcLabels = maybeParseSubJson(item.groupLabels);
      if (srcLabels && typeof srcLabels === "object") {
        for (const g of ALL_SHIFT_GROUPS) {
          if (typeof srcLabels[g] === "string" && srcLabels[g].trim()) {
            labels[g] = srcLabels[g].trim();
          }
        }
      }
      const phases: ShiftPhase[] = [];
      const srcPhases = maybeParseSubJson(item.phases);
      if (Array.isArray(srcPhases)) {
        for (const ph of srcPhases) {
          if (!ph || typeof ph !== "object") continue;
          const pk = String(ph.kind || "").trim().toUpperCase();
          const pc = Math.trunc(Number(ph.count) || 0);
          if (["DAY", "EVENING", "NIGHT", "REST"].includes(pk) && pc > 0) {
            phases.push({ kind: pk as ShiftKind, count: Math.max(1, Math.min(24, pc)) });
          }
        }
      }
      const spec: ShiftPatternSpec = {
        id: item.id.trim(),
        name: String(item.name || "الگوی سفارشی").trim(),
        subtitle: String(item.subtitle || "").trim(),
        dayCount: Math.max(0, Math.min(24, Math.trunc(Number(item.dayCount) || 0))),
        eveningCount: Math.max(0, Math.min(24, Math.trunc(Number(item.eveningCount) || 0))),
        nightCount: Math.max(0, Math.min(24, Math.trunc(Number(item.nightCount) || 0))),
        restCount: Math.max(1, Math.min(24, Math.trunc(Number(item.restCount) || 4))),
        anchorJdn: Number(item.anchorJdn) || DEFAULT_BASE_JDN,
        groupOffsets: Object.keys(offsets).length > 0 ? offsets : { A: 7, B: 1, C: 5, D: 3 },
        isWeeklyAdmin: Boolean(item.isWeeklyAdmin),
        isCustom: item.isCustom !== undefined ? Boolean(item.isCustom) : true,
        hasGroups: item.hasGroups !== undefined ? Boolean(item.hasGroups) : true,
        groupCount: Math.max(1, Math.min(8, Math.trunc(Number(item.groupCount) || 4))),
        groupLabels: Object.keys(labels).length > 0 ? labels : undefined,
        phases: phases.length > 0 ? phases : undefined,
      };
      const existingIdx = nextCustomPatterns.findIndex((p) => p.id === spec.id);
      if (existingIdx >= 0) nextCustomPatterns[existingIdx] = spec;
      else nextCustomPatterns.push(spec);
      patternsCount += 1;
    }
  }

  // 4. Employees (supports Android `{st, ot}` AND PWA `{status, overtimeHours}`)
  const nextEmployees: EmployeeProfile[] = [...curState.employees];
  let employeesCount = 0;
  const rawEmployees = maybeParseSubJson(parsed.employees);
  if (Array.isArray(rawEmployees)) {
    for (const emp of rawEmployees) {
      if (!emp || typeof emp !== "object" || !emp.id || !emp.name) continue;
      const dayLogs: Record<string, { status: EmployeeDayStatus; overtimeHours: number }> = {};
      const srcLogs = maybeParseSubJson(emp.dayLogs);
      if (srcLogs && typeof srcLogs === "object") {
        for (const [rawDk, dl] of Object.entries(srcLogs)) {
          const dk = normalizeDateKey(rawDk);
          if (!dk || !dl || typeof dl !== "object") continue;
          const dObj = dl as {
            status?: string;
            st?: string;
            overtimeHours?: number;
            ot?: number;
          };
          const st = mapEmployeeStatusFromBackup(dObj.status ?? dObj.st);
          const rawOt = dObj.overtimeHours !== undefined ? dObj.overtimeHours : dObj.ot;
          const ot = Math.max(0, Math.min(24, Math.round(Number(rawOt) || 0)));
          if (st !== "AS_SCHEDULED" || ot > 0) {
            dayLogs[dk] = { status: st, overtimeHours: ot };
          }
        }
      }
      const grpRaw = String(emp.group || "A").trim().toUpperCase() as ShiftGroup;
      const profile: EmployeeProfile = {
        id: String(emp.id).trim(),
        name: String(emp.name).trim(),
        role: String(emp.role || "").trim(),
        group: ALL_SHIFT_GROUPS.includes(grpRaw) ? grpRaw : "A",
        patternId: String(emp.patternId || curState.activePatternId).trim(),
        dayLogs,
      };
      const idx = nextEmployees.findIndex((e) => e.id === profile.id);
      if (idx >= 0) nextEmployees[idx] = profile;
      else nextEmployees.push(profile);
      employeesCount += 1;
    }
  }

  const nextPatternId =
    typeof parsed.activePatternId === "string" && parsed.activePatternId.trim()
      ? parsed.activePatternId.trim()
      : curState.activePatternId;

  useShiftKar.getState().set({
    dayRecords: nextRecords,
    customPatterns: nextCustomPatterns,
    employees: nextEmployees,
  });
  useShiftKar.getState().selectPattern(nextPatternId);

  return { notesCount, recordsCount, employeesCount, patternsCount };
}
