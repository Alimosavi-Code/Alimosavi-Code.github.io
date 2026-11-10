import { toPersianDigits } from "./jalali";

/**
 * Shared domain constants and Persian labels (v6.7.1):
 *  - Supports 4 shift kinds: DAY (صبح‌کار), EVENING (عصرکار), NIGHT (شب‌کار), REST (استراحت)
 *  - Supports up to 8 shift groups (A..H) + individual shift mode (`hasGroups = false`)
 *  - Supports M1..M24, E1..E24, N1..N24, R1..R24
 */

export const ALL_SHIFT_GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type ShiftGroup = (typeof ALL_SHIFT_GROUPS)[number];
export type Group = ShiftGroup;

export const ALL_GROUP_FILTERS = ["ALL", "A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type GroupFilter = (typeof ALL_GROUP_FILTERS)[number];

export const DEFAULT_GROUP_LETTERS: Record<ShiftGroup, string> = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
  G: "G",
  H: "H",
};

export const GROUP_FA_DEFAULT: Record<ShiftGroup, string> = {
  A: "شیفت A",
  B: "شیفت B",
  C: "شیفت C",
  D: "شیفت D",
  E: "شیفت E",
  F: "شیفت F",
  G: "شیفت G",
  H: "شیفت H",
};

export type ShiftKind = "DAY" | "EVENING" | "NIGHT" | "REST";

export const SHIFT_KIND_FA: Record<ShiftKind, string> = {
  DAY: "صبح‌کار",
  EVENING: "عصرکار",
  NIGHT: "شب‌کار",
  REST: "استراحت",
};

export type ShiftCode =
  | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "M8" | "M9" | "M10" | "M11" | "M12"
  | "M13" | "M14" | "M15" | "M16" | "M17" | "M18" | "M19" | "M20" | "M21" | "M22" | "M23" | "M24"
  | "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9" | "E10" | "E11" | "E12"
  | "E13" | "E14" | "E15" | "E16" | "E17" | "E18" | "E19" | "E20" | "E21" | "E22" | "E23" | "E24"
  | "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N7" | "N8" | "N9" | "N10" | "N11" | "N12"
  | "N13" | "N14" | "N15" | "N16" | "N17" | "N18" | "N19" | "N20" | "N21" | "N22" | "N23" | "N24"
  | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "R10" | "R11" | "R12"
  | "R13" | "R14" | "R15" | "R16" | "R17" | "R18" | "R19" | "R20" | "R21" | "R22" | "R23" | "R24";

const ORDINAL_FA = [
  "اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم",
  "هشتم", "نهم", "دهم", "یازدهم", "دوازدهم", "سیزدهم", "چهاردهم",
  "پانزدهم", "شانزدهم", "هفدهم", "هجدهم", "نوزدهم", "بیستم",
  "بیست‌ویکم", "بیست‌ودوم", "بیست‌وسوم", "بیست‌وچهارم",
];

export function codeToKind(code: ShiftCode | string): ShiftKind {
  if (code.startsWith("M")) return "DAY";
  if (code.startsWith("E")) return "EVENING";
  if (code.startsWith("N")) return "NIGHT";
  return "REST";
}

export function shiftCodeIndex(code: ShiftCode | string): number {
  const n = parseInt(code.slice(1), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function forKindAndOrdinal(kind: ShiftKind, ord1Based: number): ShiftCode {
  const idx = Math.max(1, Math.min(24, Math.floor(ord1Based)));
  const prefix = kind === "DAY" ? "M" : kind === "EVENING" ? "E" : kind === "NIGHT" ? "N" : "R";
  return `${prefix}${idx}` as ShiftCode;
}

const ALL_CODES: ShiftCode[] = [];
for (const p of ["M", "E", "N", "R"] as const) {
  for (let i = 1; i <= 24; i++) {
    ALL_CODES.push(`${p}${i}` as ShiftCode);
  }
}

export const CODE_FA: Record<ShiftCode, string> = Object.fromEntries(
  ALL_CODES.map((code) => {
    const idx = shiftCodeIndex(code);
    const ord = ORDINAL_FA[idx - 1] ?? toPersianDigits(idx);
    const kind = codeToKind(code);
    return [code, `${SHIFT_KIND_FA[kind]} ${ord}`];
  }),
) as Record<ShiftCode, string>;

export const CODE_NUM_FA: Record<ShiftCode, string> = Object.fromEntries(
  ALL_CODES.map((code) => {
    const idx = toPersianDigits(shiftCodeIndex(code));
    const kind = codeToKind(code);
    return [code, `${SHIFT_KIND_FA[kind]} ${idx}`];
  }),
) as Record<ShiftCode, string>;

export const THEMES = [
  { id: "blue", fa: "آبی", hex: "#3d6bf5" },
  { id: "emerald", fa: "زمردی", hex: "#0f9d72" },
  { id: "purple", fa: "بنفش", hex: "#8b5cf6" },
  { id: "orange", fa: "نارنجی", hex: "#f46b16" },
  { id: "rose", fa: "رز", hex: "#f43f5e" },
  { id: "teal", fa: "فیروزه‌ای", hex: "#0ea5a0" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_MODES = [
  { id: "light", fa: "روشن" },
  { id: "dark", fa: "تیره" },
  { id: "system", fa: "هماهنگ با سیستم" },
] as const;

export type ThemeMode = (typeof THEME_MODES)[number]["id"];

export const CALENDAR_SYSTEMS = [
  { id: "jalali", fa: "هجری شمسی" },
  { id: "hijri", fa: "هجری قمری" },
  { id: "gregorian", fa: "میلادی" },
] as const;

export const APP = {
  name: "شیفت‌کار",
  nameEn: "ShiftKar",
  version: "6.7.3",
  tagline: "تقویم هوشمند شیفت کاری",
} as const;
