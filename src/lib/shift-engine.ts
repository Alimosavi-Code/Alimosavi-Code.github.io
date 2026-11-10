/**
 * Shift calculation engine (v6.7.1 — 100% parity with Android ShiftEngine.kt):
 *  - Supports Morning (صبح‌کار / M1..M24), Evening (عصرکار / E1..E24),
 *    Night (شب‌کار / N1..N24), and Rest (استراحت / R1..R24).
 *  - Includes all 45 built-in presets (Bandar Imam 2-2-4 default + 44 presets).
 *  - Supports dynamic number of shift groups (`groupCount` 1..8, or `hasGroups = false` for individual shifts).
 *  - Supports editing and restoring any built-in preset or creating custom patterns.
 */
import { parseDateKey, toGregorian, jalaaliWeekday, toPersianDigits } from "./jalali";
import { gregorianToJdn } from "./islamic-calendar";
import {
  ALL_SHIFT_GROUPS,
  DEFAULT_GROUP_LETTERS,
  SHIFT_KIND_FA,
  codeToKind,
  forKindAndOrdinal,
  type GroupFilter,
  type ShiftCode,
  type ShiftGroup,
  type ShiftKind,
} from "./models";

export type { ShiftGroup, ShiftCode, ShiftKind };

export function jalaliToJdn(jy: number, jm: number, jd: number): number {
  const g = toGregorian(jy, jm, jd);
  return gregorianToJdn(g.gy, g.gm, g.gd);
}

export const BASE_JY = 1405;
export const BASE_JM = 5;
export const BASE_JD = 4;
export const DEFAULT_BASE_JDN = jalaliToJdn(BASE_JY, BASE_JM, BASE_JD);
export const DEFAULT_PATTERN_ID = "bipc_2_2_4";

export const SHIFT_CYCLE: ShiftCode[] = ["M1", "M2", "N1", "N2", "R1", "R2", "R3", "R4"];

export const GROUP_OFFSETS: Record<ShiftGroup, number> = {
  A: 7,
  B: 1,
  C: 5,
  D: 3,
  E: 0,
  F: 2,
  G: 4,
  H: 6,
};

export interface ShiftPhase {
  kind: ShiftKind;
  count: number;
}

export interface ShiftPatternSpec {
  id: string;
  name: string;
  subtitle: string;
  dayCount: number;
  eveningCount: number;
  nightCount: number;
  restCount: number;
  anchorJdn: number;
  groupOffsets: Partial<Record<ShiftGroup, number>>;
  isWeeklyAdmin?: boolean;
  isCustom?: boolean;
  hasGroups: boolean;
  groupCount: number;
  groupLabels?: Partial<Record<ShiftGroup, string>>;
  phases?: ShiftPhase[];
}

export function getEffectivePhases(pat: ShiftPatternSpec): ShiftPhase[] {
  if (pat.phases && pat.phases.length > 0) {
    return pat.phases.filter((p) => p.count > 0);
  }
  const list: ShiftPhase[] = [];
  if (pat.dayCount > 0) list.push({ kind: "DAY", count: pat.dayCount });
  if ((pat.eveningCount ?? 0) > 0) list.push({ kind: "EVENING", count: pat.eveningCount });
  if (pat.nightCount > 0) list.push({ kind: "NIGHT", count: pat.nightCount });
  if (pat.restCount > 0) list.push({ kind: "REST", count: pat.restCount });
  return list;
}

export function getTotalCycleDays(pat: ShiftPatternSpec): number {
  const sum = getEffectivePhases(pat).reduce((acc, p) => acc + p.count, 0);
  return Math.max(1, sum);
}

export function buildCycleList(pat: ShiftPatternSpec): ShiftCode[] {
  const phases = getEffectivePhases(pat);
  const list: ShiftCode[] = [];
  for (const phase of phases) {
    for (let i = 1; i <= phase.count; i++) {
      list.push(forKindAndOrdinal(phase.kind, i));
    }
  }
  if (list.length === 0) list.push("R1");
  return list;
}

const m = (count: number): ShiftPhase => ({ kind: "DAY", count });
const e = (count: number): ShiftPhase => ({ kind: "EVENING", count });
const n = (count: number): ShiftPhase => ({ kind: "NIGHT", count });
const r = (count: number): ShiftPhase => ({ kind: "REST", count });

function presetFromPhases(id: string, phases: ShiftPhase[]): ShiftPatternSpec {
  const total = Math.max(1, phases.reduce((acc, p) => acc + p.count, 0));
  const dayTotal = phases.filter((p) => p.kind === "DAY").reduce((a, p) => a + p.count, 0);
  const eveTotal = phases.filter((p) => p.kind === "EVENING").reduce((a, p) => a + p.count, 0);
  const nightTotal = phases.filter((p) => p.kind === "NIGHT").reduce((a, p) => a + p.count, 0);
  const restTotal = phases.filter((p) => p.kind === "REST").reduce((a, p) => a + p.count, 0);

  const title = phases.map((p) => `${toPersianDigits(p.count)} ${SHIFT_KIND_FA[p.kind]}`).join(" ");
  const sub = `${phases.map((p) => `${toPersianDigits(p.count)} روز ${SHIFT_KIND_FA[p.kind]}`).join(" · ")} (چرخه ${toPersianDigits(total)} روزه)`;
  const step = Math.max(1, Math.floor(total / 4));
  const offsets: Partial<Record<ShiftGroup, number>> = {
    A: 0,
    B: step % total,
    C: (step * 2) % total,
    D: (step * 3) % total,
  };
  return {
    id,
    name: title,
    subtitle: sub,
    dayCount: dayTotal,
    eveningCount: eveTotal,
    nightCount: nightTotal,
    restCount: restTotal,
    anchorJdn: DEFAULT_BASE_JDN,
    groupOffsets: offsets,
    hasGroups: true,
    groupCount: 4,
    groupLabels: { ...DEFAULT_GROUP_LETTERS },
    phases,
  };
}

export const DEFAULT_PATTERN: ShiftPatternSpec = {
  id: DEFAULT_PATTERN_ID,
  name: "پتروشیمی بندر امام (۲-۲-۴ — پیش‌فرض)",
  subtitle: "۲ روز صبح‌کار · ۲ روز شب‌کار · ۴ روز استراحت (۱۲ ساعته — پیش‌فرض)",
  dayCount: 2,
  eveningCount: 0,
  nightCount: 2,
  restCount: 4,
  anchorJdn: DEFAULT_BASE_JDN,
  groupOffsets: { A: 7, B: 1, C: 5, D: 3 },
  isWeeklyAdmin: false,
  isCustom: false,
  hasGroups: true,
  groupCount: 4,
  groupLabels: { ...DEFAULT_GROUP_LETTERS },
  phases: [m(2), n(2), r(4)],
};

export const PRESET_PATTERNS: ShiftPatternSpec[] = [
  DEFAULT_PATTERN,
  presetFromPhases("ref_1m_3r", [m(1), r(3)]),
  presetFromPhases("ref_1m_2r", [m(1), r(2)]),
  presetFromPhases("ref_1m_1r", [m(1), r(1)]),
  presetFromPhases("ref_1m_1e_1n_2r", [m(1), e(1), n(1), r(2)]),
  presetFromPhases("ref_1m_1n_2r", [m(1), n(1), r(2)]),
  presetFromPhases("ref_1m_1n_1r", [m(1), n(1), r(1)]),
  presetFromPhases("ref_2m_2r_2n_2r", [m(2), r(2), n(2), r(2)]),
  presetFromPhases("ref_2m_2r", [m(2), r(2)]),
  presetFromPhases("ref_2m_1r_2e_1r_2n_3r", [m(2), r(1), e(2), r(1), n(2), r(3)]),
  presetFromPhases("ref_2m_1r_2e_1r_2n_1r", [m(2), r(1), e(2), r(1), n(2), r(1)]),
  presetFromPhases("ref_2m_1r_2n_3r", [m(2), r(1), n(2), r(3)]),
  presetFromPhases("ref_2m_1r", [m(2), r(1)]),
  presetFromPhases("ref_2m_2e_2r", [m(2), e(2), r(2)]),
  presetFromPhases("ref_2m_2e_2n_2r", [m(2), e(2), n(2), r(2)]),
  presetFromPhases("ref_2m_2e_2n_6r", [m(2), e(2), n(2), r(6)]),
  presetFromPhases("ref_2m_2n_2r", [m(2), n(2), r(2)]),
  presetFromPhases("ref_2m_2e_1r_2n_1r", [m(2), e(2), r(1), n(2), r(1)]),
  presetFromPhases("ref_3m_3r_3n_3r", [m(3), r(3), n(3), r(3)]),
  presetFromPhases("ref_3m_3r", [m(3), r(3)]),
  presetFromPhases("ref_3m_2r_3e_1r", [m(3), r(2), e(3), r(1)]),
  presetFromPhases("ref_3m_1r_3e_1r_3n_1r", [m(3), r(1), e(3), r(1), n(3), r(1)]),
  presetFromPhases("ref_3m_3e_3r", [m(3), e(3), r(3)]),
  presetFromPhases("ref_3m_3e_3n_3r", [m(3), e(3), n(3), r(3)]),
  presetFromPhases("ref_4m_4r", [m(4), r(4)]),
  presetFromPhases("ref_4m_3r", [m(4), r(3)]),
  presetFromPhases("ref_4m_2r", [m(4), r(2)]),
  presetFromPhases("ref_4m_4n_4r", [m(4), n(4), r(4)]),
  presetFromPhases("ref_4m_1r_4e_1r_4n_2r", [m(4), r(1), e(4), r(1), n(4), r(2)]),
  presetFromPhases("ref_4m_1r_4e_1r", [m(4), r(1), e(4), r(1)]),
  presetFromPhases("ref_4m_4e_4n_4r", [m(4), e(4), n(4), r(4)]),
  presetFromPhases("ref_5m_2r_5e_2r", [m(5), r(2), e(5), r(2)]),
  presetFromPhases("ref_5m_2r", [m(5), r(2)]),
  presetFromPhases("ref_6m_1r_6e_1r", [m(6), r(1), e(6), r(1)]),
  presetFromPhases("ref_7m_7r", [m(7), r(7)]),
  presetFromPhases("ref_7m_7n_7r", [m(7), n(7), r(7)]),
  presetFromPhases("ref_12m_4r", [m(12), r(4)]),
  presetFromPhases("ref_22m_8r", [m(22), r(8)]),
  presetFromPhases("ref_14m_14r", [m(14), r(14)]),
  presetFromPhases("ref_14m_7r", [m(14), r(7)]),
  presetFromPhases("ref_3e_3m_3n_3r", [e(3), m(3), n(3), r(3)]),
  presetFromPhases("ref_1n_1r", [n(1), r(1)]),
  presetFromPhases("ref_2n_2r", [n(2), r(2)]),
  presetFromPhases("ref_3n_2r_3m_2r_3e_2r", [n(3), r(2), m(3), r(2), e(3), r(2)]),
  presetFromPhases("ref_4n_1r_4e_1r_4m_2r", [n(4), r(1), e(4), r(1), m(4), r(2)]),
];

let _activePattern: ShiftPatternSpec = DEFAULT_PATTERN;
let _activeCycleList: ShiftCode[] = SHIFT_CYCLE;

export function getActivePattern(): ShiftPatternSpec {
  return _activePattern;
}

export function setActivePattern(pattern: ShiftPatternSpec): void {
  _activePattern = pattern;
  _activeCycleList =
    pattern.id === DEFAULT_PATTERN_ID && !pattern.isCustom
      ? SHIFT_CYCLE
      : buildCycleList(pattern);
}

export function getActiveGroups(pattern: ShiftPatternSpec = _activePattern): ShiftGroup[] {
  if (!pattern.hasGroups) return ["A"];
  const cnt = Math.max(1, Math.min(ALL_SHIFT_GROUPS.length, pattern.groupCount || 4));
  return ALL_SHIFT_GROUPS.slice(0, cnt);
}

export function getActiveGroupFilters(pattern: ShiftPatternSpec = _activePattern): GroupFilter[] {
  const grps = getActiveGroups(pattern);
  if (!pattern.hasGroups || grps.length <= 1) return ["A"];
  return ["ALL", ...grps];
}

export function getGroupLetter(group: ShiftGroup, pattern: ShiftPatternSpec = _activePattern): string {
  if (!pattern.hasGroups) return "—";
  const lbl = pattern.groupLabels?.[group]?.trim();
  return lbl && lbl.length > 0 ? lbl : group;
}

export function getGroupTitle(group: ShiftGroup, pattern: ShiftPatternSpec = _activePattern): string {
  if (!pattern.hasGroups) return "شیفت فردی";
  const letter = getGroupLetter(group, pattern);
  return letter.startsWith("شیفت") ? letter : `شیفت ${letter}`;
}

export function isBuiltInPreset(patternId: string): boolean {
  return PRESET_PATTERNS.some((p) => p.id === patternId);
}

export function isPresetModified(patternId: string, customPatterns: ShiftPatternSpec[]): boolean {
  return isBuiltInPreset(patternId) && customPatterns.some((p) => p.id === patternId);
}

export function getDefaultPreset(patternId: string): ShiftPatternSpec | undefined {
  return PRESET_PATTERNS.find((p) => p.id === patternId);
}

export function resolvePattern(patternId: string, customPatterns: ShiftPatternSpec[]): ShiftPatternSpec {
  return (
    customPatterns.find((p) => p.id === patternId) ??
    PRESET_PATTERNS.find((p) => p.id === patternId) ??
    DEFAULT_PATTERN
  );
}

export function floorMod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function getGroupOffset(group: ShiftGroup, pattern: ShiftPatternSpec = _activePattern): number {
  if (!pattern.hasGroups) return 0;
  return pattern.groupOffsets?.[group] ?? 0;
}

export function daysBetweenFromBase(dateKey: string, pattern: ShiftPatternSpec = _activePattern): number {
  const d = parseDateKey(dateKey);
  return jalaliToJdn(d.jy, d.jm, d.jd) - (pattern.anchorJdn || DEFAULT_BASE_JDN);
}

export function getCycleIndex(dateKey: string, group: ShiftGroup): number {
  if (_activePattern.isWeeklyAdmin) {
    const d = parseDateKey(dateKey);
    return jalaaliWeekday(d.jy, d.jm, d.jd);
  }
  const cycle = _activeCycleList;
  return floorMod(daysBetweenFromBase(dateKey, _activePattern) + getGroupOffset(group, _activePattern), cycle.length);
}

export function getShiftCodeForPattern(
  dateKey: string,
  group: ShiftGroup,
  pattern: ShiftPatternSpec,
): ShiftCode {
  if (pattern.id === DEFAULT_PATTERN_ID && !pattern.isCustom) {
    const d = parseDateKey(dateKey);
    const days = jalaliToJdn(d.jy, d.jm, d.jd) - DEFAULT_BASE_JDN;
    const off = GROUP_OFFSETS[group] ?? 0;
    const idx = floorMod(days + off, 8);
    return SHIFT_CYCLE[idx];
  }
  if (pattern.isWeeklyAdmin) {
    const d = parseDateKey(dateKey);
    const wd = jalaaliWeekday(d.jy, d.jm, d.jd);
    return wd <= 4 ? forKindAndOrdinal("DAY", wd + 1) : forKindAndOrdinal("REST", wd - 4);
  }
  const cycle = buildCycleList(pattern);
  const d = parseDateKey(dateKey);
  const days = jalaliToJdn(d.jy, d.jm, d.jd) - (pattern.anchorJdn || DEFAULT_BASE_JDN);
  const off = !pattern.hasGroups ? 0 : (pattern.groupOffsets?.[group] ?? 0);
  const idx = floorMod(days + off, cycle.length);
  return cycle[idx];
}

export function getShiftCode(dateKey: string, group: ShiftGroup = "A"): ShiftCode {
  return getShiftCodeForPattern(dateKey, group, _activePattern);
}

export interface ShiftResult {
  code: ShiftCode;
  type: ShiftKind;
  group: ShiftGroup;
}

export function calculateShift(dateKey: string, group: ShiftGroup = "A"): ShiftResult {
  const code = getShiftCode(dateKey, group);
  return { code, type: codeToKind(code), group };
}

export function calculateAllShifts(dateKey: string): ShiftResult[] {
  const groups = getActiveGroups(_activePattern);
  return groups.map((g) => calculateShift(dateKey, g));
}

export function getAllGroupsForDate(dateKey: string): Record<ShiftGroup, ShiftCode> {
  const out = {} as Record<ShiftGroup, ShiftCode>;
  for (const g of ALL_SHIFT_GROUPS) {
    out[g] = getShiftCode(dateKey, g);
  }
  return out;
}
