/**
 * High-resolution HTML5 <canvas> PNG exporter (v6.7.1 — 100% visual parity with Android `ImageExporter.kt`):
 *  - Uses the active theme's `SkPalette` (`blue`, `emerald`, `purple`, `orange`, `rose`, `teal` in dark & light)
 *  - `drawAuroraBackdrop` + `drawGlassCard` + `drawShiftGradientChip` + `drawHolidayChip`
 *  - `renderMonthGridCanvas`: Outer frosted glass calendar card, glass day cells with inner rounded
 *    2-stop shift gradient pill (`drawShiftGradientChip`), `drawMonthlySummaryRow` (4/5 gradient summary cards),
 *    and holiday/occasion footer card — 100% matching Android's `renderMonthBitmap`!
 *  - `renderMonthTableCanvas`: Outer frosted glass table card, header row, alternating rows with shift pills,
 *    `drawMonthlySummaryRow`, and footer card — 100% matching Android's `renderMonthTableBitmap`!
 *  - `renderDayCanvas`: Outer frosted glass day card, Hijri + Gregorian sub-header, `myBadge` gradient chip,
 *    holiday/occasion card, 2x2 group cards with inner gradient pills, overtime/note card, and personnel rows.
 *  - `renderRosterCanvas`, `renderClassic1405RosterCanvas`, `renderAllShiftsRosterCanvas`, `renderWorkReportCanvas`
 */
import {
  JALALI_MONTHS,
  WEEKDAYS,
  jalaaliMonthLength,
  jalaaliWeekday,
  makeDateKey,
  parseDateKey,
  toPersianDigits,
  toJalaali,
  todayJalaali,
  formatJalali,
  formatHijri,
  formatGregorian,
  formatWeekday,
} from "./jalali";
import { jdnToGregorian } from "./islamic-calendar";
import { isHoliday, getDayEvents } from "./holidays";
import {
  calculateShift,
  getShiftCode,
  getShiftCodeForPattern,
  getAllGroupsForDate,
  getActivePattern,
  getActiveGroups,
  getGroupLetter,
  getGroupTitle,
  jalaliToJdn,
  resolvePattern,
} from "./shift-engine";
import {
  APP,
  CODE_FA,
  CODE_NUM_FA,
  SHIFT_KIND_FA,
  codeToKind,
  shiftCodeIndex,
  type GroupFilter,
  type ShiftCode,
  type ShiftGroup,
  type ShiftKind,
  type ThemeId,
} from "./models";
import { useShiftKar, type DayWorkRecord, type EmployeeProfile } from "./store";
import { getAllNotesSync } from "./notes-store";

const FONT = '"IRANSansX", Tahoma, system-ui, sans-serif';
const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export interface ClassicLoheCellData {
  jy: number;
  jm: number;
  day: number;
  isOfficialHoliday: boolean;
  isFriday: boolean;
}

export interface ClassicLoheRowData {
  rowIndex: number;
  codeA: ShiftCode;
  codeB: ShiftCode;
  codeC: ShiftCode;
  codeD: ShiftCode;
  monthCells: (ClassicLoheCellData | null)[];
}

function jdnToDateKey(jdn: number): string {
  const g = jdnToGregorian(jdn);
  const j = toJalaali(g.gy, g.gm, g.gd);
  return makeDateKey(j.jy, j.jm, j.jd);
}

/**
 * Exact port of `buildClassic1405LoheData` from Android `ImageExporter.kt`
 */
export function buildClassic1405LoheData(jy: number, showEvents = true): ClassicLoheRowData[] {
  const totalRows = 32;
  const jdnFarvardin1 = jalaliToJdn(jy, 1, 1);

  const monthColumns: (ClassicLoheCellData | null)[][] = Array.from({ length: 12 }, () =>
    Array.from({ length: totalRows }, () => null),
  );

  // Row 0 (top row) starts at 1 Farvardin (A=M1, B=N1, C=R3, D=R1 in 1405), matching the official printed Lohe!
  let startRowLeft = 0;
  for (let m = 1; m <= 6; m++) {
    const len = jalaaliMonthLength(jy, m);
    const firstWd = jalaaliWeekday(jy, m, 1);
    for (let d = 1; d <= len; d++) {
      const r = (startRowLeft + d - 1) % totalRows;
      const isHol = showEvents && isHoliday(jy, m, d);
      const isFri = (firstWd + d - 1) % 7 === 6;
      monthColumns[m - 1][r] = { jy, jm: m, day: d, isOfficialHoliday: isHol, isFriday: isFri };
    }
    startRowLeft = (startRowLeft + len) % totalRows;
  }

  // Right half (Mehr .. Esfand): 1 Mehr is +186 days after 1 Farvardin (186 mod 8 = 2 -> row index 2, 3rd row)
  let startRowRight = 2;
  for (let idx = 0; idx < 6; idx++) {
    const mMonth = idx + 7;
    const len = jalaaliMonthLength(jy, mMonth);
    const firstWd = jalaaliWeekday(jy, mMonth, 1);
    for (let d = 1; d <= len; d++) {
      const r = (startRowRight + d - 1) % totalRows;
      const isHol = showEvents && isHoliday(jy, mMonth, d);
      const isFri = (firstWd + d - 1) % 7 === 6;
      monthColumns[6 + idx][r] = {
        jy,
        jm: mMonth,
        day: d,
        isOfficialHoliday: isHol,
        isFriday: isFri,
      };
    }
    startRowRight = (startRowRight + len) % totalRows;
  }

  const rows: ClassicLoheRowData[] = [];
  for (let r = 0; r < totalRows; r++) {
    const refKey = jdnToDateKey(jdnFarvardin1 + r);
    const all = getAllGroupsForDate(refKey);
    rows.push({
      rowIndex: r,
      codeA: all.A,
      codeB: all.B,
      codeC: all.C,
      codeD: all.D,
      monthCells: Array.from({ length: 12 }, (_, col) => monthColumns[col][r]),
    });
  }
  return rows;
}

/* =========================================================================
   Theme-Aware Canvas Palette (`SkCanvasPalette` matching Android `SkPalette`)
   ========================================================================= */
interface SkCanvasPalette {
  bg: string;
  sheetSolid: string;
  glassHi: string;
  glassLo: string;
  surface: string;
  border: string;
  borderSoft: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primarySoft: string;
  glowA: string;
  glowB: string;
  glowC: string;
  holiday: string;
  holidaySoft: string;
  holidayEnd: string;
  noteBg: string;
  noteInk: string;
}

const THEME_ACCENTS: Record<
  ThemeId,
  {
    dark: { primary: string; primarySoft: string; glowA: string; glowB: string; glowC: string; bg: string; sheet: string };
    light: { primary: string; primarySoft: string; glowA: string; glowB: string; glowC: string; bg: string; sheet: string };
  }
> = {
  blue: {
    dark: {
      primary: "#5b8af7",
      primarySoft: "rgba(91,138,247,0.22)",
      glowA: "rgba(59,130,246,0.34)",
      glowB: "rgba(139,92,246,0.26)",
      glowC: "rgba(14,165,233,0.22)",
      bg: "#090f1d",
      sheet: "rgba(18,26,48,0.84)",
    },
    light: {
      primary: "#3d6bf5",
      primarySoft: "rgba(61,107,245,0.16)",
      glowA: "rgba(61,107,245,0.24)",
      glowB: "rgba(139,92,246,0.18)",
      glowC: "rgba(56,189,248,0.18)",
      bg: "#f2f5fc",
      sheet: "rgba(255,255,255,0.90)",
    },
  },
  emerald: {
    dark: {
      primary: "#34d399",
      primarySoft: "rgba(52,211,153,0.20)",
      glowA: "rgba(16,185,129,0.32)",
      glowB: "rgba(20,184,166,0.24)",
      glowC: "rgba(59,130,246,0.20)",
      bg: "#071412",
      sheet: "rgba(14,31,29,0.84)",
    },
    light: {
      primary: "#0f9d72",
      primarySoft: "rgba(15,157,114,0.16)",
      glowA: "rgba(16,185,129,0.24)",
      glowB: "rgba(20,184,166,0.18)",
      glowC: "rgba(52,211,153,0.18)",
      bg: "#f1f8f5",
      sheet: "rgba(255,255,255,0.90)",
    },
  },
  purple: {
    dark: {
      primary: "#a78bfa",
      primarySoft: "rgba(167,139,250,0.22)",
      glowA: "rgba(139,92,246,0.34)",
      glowB: "rgba(217,70,239,0.24)",
      glowC: "rgba(99,102,241,0.22)",
      bg: "#0c091c",
      sheet: "rgba(23,18,46,0.84)",
    },
    light: {
      primary: "#7c3aed",
      primarySoft: "rgba(124,58,237,0.16)",
      glowA: "rgba(139,92,246,0.24)",
      glowB: "rgba(217,70,239,0.18)",
      glowC: "rgba(99,102,241,0.18)",
      bg: "#f5f2fc",
      sheet: "rgba(255,255,255,0.90)",
    },
  },
  orange: {
    dark: {
      primary: "#fb923c",
      primarySoft: "rgba(251,146,60,0.22)",
      glowA: "rgba(249,115,22,0.32)",
      glowB: "rgba(245,158,11,0.24)",
      glowC: "rgba(244,63,94,0.20)",
      bg: "#140d08",
      sheet: "rgba(34,23,16,0.84)",
    },
    light: {
      primary: "#ea580c",
      primarySoft: "rgba(234,88,12,0.16)",
      glowA: "rgba(249,115,22,0.24)",
      glowB: "rgba(245,158,11,0.18)",
      glowC: "rgba(251,146,60,0.18)",
      bg: "#fcf6f1",
      sheet: "rgba(255,255,255,0.90)",
    },
  },
  rose: {
    dark: {
      primary: "#fb7185",
      primarySoft: "rgba(251,113,133,0.22)",
      glowA: "rgba(244,63,94,0.32)",
      glowB: "rgba(236,72,153,0.24)",
      glowC: "rgba(139,92,246,0.20)",
      bg: "#140910",
      sheet: "rgba(35,17,28,0.84)",
    },
    light: {
      primary: "#e11d48",
      primarySoft: "rgba(225,29,72,0.16)",
      glowA: "rgba(244,63,94,0.24)",
      glowB: "rgba(236,72,153,0.18)",
      glowC: "rgba(251,113,133,0.18)",
      bg: "#fcf2f5",
      sheet: "rgba(255,255,255,0.90)",
    },
  },
  teal: {
    dark: {
      primary: "#2dd4bf",
      primarySoft: "rgba(45,212,191,0.22)",
      glowA: "rgba(20,184,166,0.32)",
      glowB: "rgba(6,182,212,0.24)",
      glowC: "rgba(59,130,246,0.20)",
      bg: "#071417",
      sheet: "rgba(14,31,36,0.84)",
    },
    light: {
      primary: "#0d9488",
      primarySoft: "rgba(13,148,136,0.16)",
      glowA: "rgba(20,184,166,0.24)",
      glowB: "rgba(6,182,212,0.18)",
      glowC: "rgba(45,212,191,0.18)",
      bg: "#f1f9fa",
      sheet: "rgba(255,255,255,0.90)",
    },
  },
};

function getCanvasPalette(dark: boolean): SkCanvasPalette {
  const themeId: ThemeId = useShiftKar.getState().theme || "blue";
  const spec = (THEME_ACCENTS[themeId] ?? THEME_ACCENTS.blue)[dark ? "dark" : "light"];
  return {
    bg: spec.bg,
    sheetSolid: spec.sheet,
    glassHi: dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.94)",
    glassLo: dark ? "rgba(255,255,255,0.04)" : "rgba(244,247,255,0.88)",
    surface: dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)",
    border: dark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.11)",
    borderSoft: dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.07)",
    text: dark ? "#f3f5ff" : "#111528",
    textMuted: dark ? "#9aa3c2" : "#555c78",
    textFaint: dark ? "#6e7898" : "#7c84a3",
    primary: spec.primary,
    primarySoft: spec.primarySoft,
    glowA: spec.glowA,
    glowB: spec.glowB,
    glowC: spec.glowC,
    holiday: dark ? "#fb7185" : "#e11d48",
    holidaySoft: dark ? "rgba(251,113,133,0.20)" : "rgba(225,29,72,0.12)",
    holidayEnd: dark ? "rgba(190,18,60,0.14)" : "rgba(254,205,211,0.55)",
    noteBg: dark ? "rgba(245,158,11,0.16)" : "rgba(254,243,199,0.85)",
    noteInk: dark ? "#fbbf24" : "#b45309",
  };
}

interface GradStop {
  c1: string;
  c2: string;
  ink: string;
  border: string;
}

function getKindGrad(kind: ShiftKind | "HOLIDAY", dark: boolean): GradStop {
  if (kind === "HOLIDAY") {
    return dark
      ? {
          c1: "rgba(251,113,133,0.30)",
          c2: "rgba(190,18,60,0.18)",
          ink: "#fda4af",
          border: "rgba(251,113,133,0.48)",
        }
      : {
          c1: "#ffe4ea",
          c2: "#fecdd7",
          ink: "#be123c",
          border: "rgba(190,18,60,0.35)",
        };
  }
  switch (kind) {
    case "DAY":
      return dark
        ? {
            c1: "rgba(245,158,11,0.34)",
            c2: "rgba(180,83,9,0.20)",
            ink: "#fde68a",
            border: "rgba(253,230,138,0.38)",
          }
        : {
            c1: "#fef3c7",
            c2: "#fde68a",
            ink: "#8a5600",
            border: "rgba(138,86,0,0.30)",
          };
    case "EVENING":
      return dark
        ? {
            c1: "rgba(249,115,22,0.34)",
            c2: "rgba(194,65,12,0.20)",
            ink: "#fed7aa",
            border: "rgba(254,215,170,0.38)",
          }
        : {
            c1: "#ffedd5",
            c2: "#fed7aa",
            ink: "#9a3412",
            border: "rgba(154,52,18,0.30)",
          };
    case "NIGHT":
      return dark
        ? {
            c1: "rgba(99,102,241,0.36)",
            c2: "rgba(67,56,202,0.22)",
            ink: "#c7d2fe",
            border: "rgba(199,210,254,0.38)",
          }
        : {
            c1: "#e0e7ff",
            c2: "#c7d2fe",
            ink: "#2c359d",
            border: "rgba(44,53,157,0.30)",
          };
    case "REST":
      return dark
        ? {
            c1: "rgba(16,185,129,0.32)",
            c2: "rgba(5,150,105,0.18)",
            ink: "#a7f3d0",
            border: "rgba(167,243,208,0.36)",
          }
        : {
            c1: "#d1fae5",
            c2: "#a7f3d0",
            ink: "#076446",
            border: "rgba(7,100,70,0.30)",
          };
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawAuroraBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sk: SkCanvasPalette,
) {
  ctx.fillStyle = sk.bg;
  ctx.fillRect(0, 0, w, h);
  const vmax = Math.max(w, h);

  const pool = (cxFactor: number, cyFactor: number, rFactor: number, col: string) => {
    const radius = vmax * rFactor;
    const cx = cxFactor * w;
    const cy = cyFactor * h;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, col);
    g.addColorStop(0.75, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  pool(0.88, -0.05, 0.72, sk.glowA);
  pool(-0.12, 0.24, 0.60, sk.glowB);
  pool(1.10, 0.62, 0.66, sk.glowC);
  pool(0.14, 1.05, 0.64, sk.glowA);
  pool(0.55, 0.42, 0.48, sk.glowB);
}

function drawGlassCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  sk: SkCanvasPalette,
  opts?: {
    tintColor?: string | null;
    borderColor?: string | null;
    borderWidth?: number;
  },
) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = sk.sheetSolid;
  ctx.fill();

  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, sk.glassHi);
  g.addColorStop(1, sk.glassLo);
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();

  if (opts?.tintColor) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = opts.tintColor;
    ctx.fill();
  }

  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = opts?.borderColor || sk.border;
  ctx.lineWidth = opts?.borderWidth ?? 2;
  ctx.stroke();
}

function drawShiftGradientChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  kind: ShiftKind | "HOLIDAY",
  dark: boolean,
  drawBorder = true,
): string {
  const gr = getKindGrad(kind, dark);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, gr.c1);
  g.addColorStop(1, gr.c2);
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();

  if (drawBorder) {
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = gr.border;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  return gr.ink;
}

function createHiDpiCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("امکان ایجاد بوم تصویر (Canvas 2D) در این مرورگر فراهم نیست");
  }
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";
  return { canvas, ctx };
}

/** Effective kind helper — a personal swap/overtime record only applies to the
 * user's OWN group (parity with the on-screen calendar views). */
function effectiveKindForExport(
  group: ShiftGroup,
  code: ShiftCode,
  rec: DayWorkRecord | undefined,
): ShiftKind {
  const myGrp = useShiftKar.getState().myGroup || "A";
  if (group === myGrp && rec?.swapKind) return rec.swapKind;
  return codeToKind(code);
}

/** Resolve the pattern an employee actually follows ("ACTIVE" = the active one). */
function employeePatternForExport(emp: EmployeeProfile) {
  const { customPatterns } = useShiftKar.getState();
  return emp.patternId && emp.patternId !== "ACTIVE"
    ? resolvePattern(emp.patternId, customPatterns)
    : getActivePattern();
}

/**
 * Draws the 4/5 gradient summary pills below the monthly calendar grid & table
 * (matching `drawMonthlySummaryRow` in Android `ImageExporter.kt`).
 */
function drawMonthlySummaryRow(
  ctx: CanvasRenderingContext2D,
  sk: SkCanvasPalette,
  dark: boolean,
  jy: number,
  jm: number,
  effGroup: ShiftGroup,
  dayRecords: Record<string, DayWorkRecord>,
  pad: number,
  w: number,
  sumTop: number,
  sumH: number,
) {
  const mLen = jalaaliMonthLength(jy, jm);
  let dayCount = 0;
  let eveCount = 0;
  let nightCount = 0;
  let officialHolCount = 0;
  let restCount = 0;

  for (let d = 1; d <= mLen; d++) {
    if (isHoliday(jy, jm, d)) officialHolCount += 1;
    const dk = makeDateKey(jy, jm, d);
    const code = getShiftCode(dk, effGroup);
    const effK = effectiveKindForExport(effGroup, code, dayRecords[dk]);
    if (effK === "DAY") dayCount += 1;
    else if (effK === "EVENING") eveCount += 1;
    else if (effK === "NIGHT") nightCount += 1;
    else restCount += 1;
  }

  const summaryItems: { label: string; count: number; kind: ShiftKind | "HOLIDAY" }[] = [
    { label: "صبح‌کار", count: dayCount, kind: "DAY" },
    ...(eveCount > 0 ? [{ label: "عصرکار", count: eveCount, kind: "EVENING" as const }] : []),
    { label: "شب‌کار", count: nightCount, kind: "NIGHT" },
    { label: "تعطیل رسمی", count: officialHolCount, kind: "HOLIDAY" },
    { label: "استراحت", count: restCount, kind: "REST" },
  ];

  const sumGap = 14;
  const pillW = (w - pad * 2 - sumGap * (summaryItems.length - 1)) / summaryItems.length;

  summaryItems.forEach((item, idx) => {
    const pRight = w - pad - idx * (pillW + sumGap);
    const pLeft = pRight - pillW;
    drawGlassCard(ctx, pLeft, sumTop, pillW, sumH, 24, sk);
    const ink = drawShiftGradientChip(ctx, pLeft, sumTop, pillW, sumH, 24, item.kind, dark, true);

    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(item.label, pLeft + pillW / 2, sumTop + sumH * 0.36);

    ctx.font = `900 26px ${FONT}`;
    ctx.fillText(`${toPersianDigits(item.count)} روز`, pLeft + pillW / 2, sumTop + sumH * 0.72);
  });
}

/* =========================================================================
   1. Single-Group Annual Roster (12-Month Grid — matches `renderRosterBitmap`)
   ========================================================================= */
export function renderRosterCanvas(jy: number, group: ShiftGroup, dark: boolean): HTMLCanvasElement {
  const W = 1240;
  const H = 1980;
  const { canvas, ctx } = createHiDpiCanvas(W, H);
  const sk = getCanvasPalette(dark);
  const pat = getActivePattern();
  const groupTitle = getGroupTitle(group, pat);

  drawAuroraBackdrop(ctx, W, H, sk);

  const pad = 40;
  drawGlassCard(ctx, pad, 36, W - pad * 2, 116, 32, sk);

  ctx.fillStyle = sk.text;
  ctx.font = `900 38px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`لوحه سالانه ${toPersianDigits(jy)}`, W - pad - 32, 78);

  ctx.fillStyle = sk.textMuted;
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText(`${APP.name} — ${APP.tagline}`, W - pad - 32, 118);

  drawGlassCard(ctx, pad + 28, 64, 202, 60, 22, sk, {
    tintColor: sk.primarySoft,
    borderColor: sk.primary,
    borderWidth: 2.5,
  });
  ctx.fillStyle = sk.primary;
  ctx.font = `900 25px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(groupTitle, pad + 129, 94);

  const gridTop = 176;
  const gridBottom = H - 132;
  const gapX = 24;
  const gapY = 20;
  const colW = (W - pad * 2 - gapX) / 2;
  const rowH = (gridBottom - gridTop - gapY * 5) / 6;

  for (let idx = 0; idx < 12; idx++) {
    const jm = idx + 1;
    const r = Math.floor(idx / 2);
    const c = idx % 2;
    const left = c === 0 ? W - pad - colW : pad;
    const top = gridTop + r * (rowH + gapY);

    drawGlassCard(ctx, left, top, colW, rowH, 26, sk);

    ctx.fillStyle = sk.text;
    ctx.font = `800 23px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`, left + colW / 2, top + 26);

    const innerPad = 16;
    const cellGap = 4;
    const gridW = colW - innerPad * 2;
    const cellW = (gridW - cellGap * 6) / 7;
    const wdY = top + 54;

    for (let wd = 0; wd < 7; wd++) {
      const cx = left + colW - innerPad - wd * (cellW + cellGap) - cellW / 2;
      ctx.fillStyle = wd === 6 ? sk.textMuted : sk.textFaint;
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText(WEEKDAY_SHORT[wd], cx, wdY);
    }

    const len = jalaaliMonthLength(jy, jm);
    const firstWd = jalaaliWeekday(jy, jm, 1);
    const numRows = Math.ceil((firstWd + len) / 7);
    const cellsTop = top + 70;
    const availH = top + rowH - 12 - cellsTop;
    const cellH = Math.min(32, (availH - cellGap * (numRows - 1)) / Math.max(numRows, 5));

    for (let d = 1; d <= len; d++) {
      const pos = firstWd + d - 1;
      const cr = Math.floor(pos / 7);
      const cc = pos % 7;
      const cellRight = left + colW - innerPad - cc * (cellW + cellGap);
      const cellLeft = cellRight - cellW;
      const cellTop = cellsTop + cr * (cellH + cellGap);

      const dateKey = makeDateKey(jy, jm, d);
      const code = getShiftCode(dateKey, group);
      const kind = codeToKind(code);
      const hol = isHoliday(jy, jm, d);

      const ink = drawShiftGradientChip(
        ctx,
        cellLeft,
        cellTop,
        cellW,
        cellH,
        8,
        hol ? "HOLIDAY" : kind,
        dark,
        true,
      );

      ctx.fillStyle = ink;
      ctx.font = `800 15.5px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(toPersianDigits(d), cellLeft + cellW / 2, cellTop + cellH / 2 + 1);
    }
  }

  // Footer Legend
  drawGlassCard(ctx, pad, H - 108, W - pad * 2, 74, 24, sk);
  const legends: { label: string; kind: ShiftKind | "HOLIDAY" }[] = [
    { label: "صبح‌کار", kind: "DAY" },
    ...(pat.eveningCount > 0 ? [{ label: "عصرکار", kind: "EVENING" as const }] : []),
    { label: "شب‌کار", kind: "NIGHT" },
    { label: "استراحت", kind: "REST" },
    { label: "تعطیل رسمی", kind: "HOLIDAY" },
  ];
  const segW = (W - pad * 2) / legends.length;
  legends.forEach((item, i) => {
    const segRight = W - pad - i * segW;
    const segCenter = segRight - segW / 2;
    const chipW = legends.length >= 5 ? 188 : 216;
    const chipH = 44;
    const chipLeft = segCenter - chipW / 2;
    const chipTop = H - 71 - chipH / 2;
    const ink = drawShiftGradientChip(ctx, chipLeft, chipTop, chipW, chipH, 12, item.kind, dark, true);
    ctx.fillStyle = ink;
    ctx.font = `900 ${legends.length >= 5 ? 17.5 : 19}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(item.label, segCenter, H - 71);
  });

  return canvas;
}

/* =========================================================================
   2. Classic 1405 4-Shift Chart (Exact 17-Column × 32-Row Layout from `ImageExporter.kt`)
   ========================================================================= */
export function renderClassic1405RosterCanvas(jy: number, dark = true): HTMLCanvasElement {
  const W = 1520;
  const H = 2320;
  const { canvas, ctx } = createHiDpiCanvas(W, H);
  const sk = getCanvasPalette(dark);

  drawAuroraBackdrop(ctx, W, H, sk);

  const rowsData = buildClassic1405LoheData(jy, true);

  const pillTop = 34;
  const pillH = 104;
  const headerPadX = 34;

  // Left Credit Pill
  drawGlassCard(ctx, headerPadX, pillTop, 540 - headerPadX, pillH, 52, sk, {
    tintColor: sk.primarySoft,
    borderColor: sk.primary,
    borderWidth: 2.5,
  });
  ctx.fillStyle = sk.primary;
  ctx.font = `700 19px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("تهیه و تنظیم لوحه", (headerPadX + 540) / 2, pillTop + 36);

  ctx.fillStyle = sk.text;
  ctx.font = `900 25px ${FONT}`;
  ctx.fillText("سید حسین موسوی سعیدی", (headerPadX + 540) / 2, pillTop + 74);

  // Right Title Pill
  const titlePillX = 564;
  const titlePillW = W - headerPadX - titlePillX;
  drawGlassCard(ctx, titlePillX, pillTop, titlePillW, pillH, 52, sk, {
    tintColor: sk.primarySoft,
    borderColor: sk.primary,
    borderWidth: 3,
  });
  ctx.fillStyle = sk.text;
  ctx.font = `900 35px ${FONT}`;
  ctx.fillText(`لوحه نوبت‌کاری سال ${toPersianDigits(jy)}`, titlePillX + titlePillW / 2, pillTop + 40);

  ctx.fillStyle = sk.primary;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(`${APP.name} — ${APP.tagline}`, titlePillX + titlePillW / 2, pillTop + 78);

  const cardPadX = 34;
  const cardTop = 156;
  const cardBottom = H - 134;
  const cardW = W - cardPadX * 2;
  const cardH = cardBottom - cardTop;

  drawGlassCard(ctx, cardPadX, cardTop, cardW, cardH, 30, sk);

  const tablePad = 14;
  const tableLeft = cardPadX + tablePad;
  const tableRight = cardPadX + cardW - tablePad;
  const tableTop = cardTop + tablePad;
  const tableBottom = cardBottom - tablePad;
  const headerH = 152;
  const rowsTop = tableTop + headerH;
  const availRowsH = tableBottom - rowsTop;
  const rowH = availRowsH / 32;

  const totalTableW = tableRight - tableLeft;
  const monthColW = totalTableW / (12 + 4 * 1.24);
  const groupColW = monthColW * 1.24;

  const colLefts: number[] = [];
  const colRights: number[] = [];
  let curX = tableLeft;
  for (let c = 0; c < 16; c++) {
    const cw = c >= 6 && c <= 9 ? groupColW : monthColW;
    colLefts.push(curX);
    colRights.push(curX + cw);
    curX += cw;
  }

  const colHeaderColors = dark
    ? ["rgba(2,132,199,0.56)", "rgba(217,119,6,0.56)", "rgba(5,150,105,0.56)", "rgba(219,39,119,0.56)"]
    : ["rgba(125,211,252,0.68)", "rgba(251,191,36,0.72)", "rgba(74,222,128,0.68)", "rgba(244,114,182,0.68)"];
  const colBodyColors = dark
    ? ["rgba(56,189,248,0.24)", "rgba(251,191,36,0.24)", "rgba(52,211,153,0.24)", "rgba(244,114,182,0.24)"]
    : ["rgba(186,230,253,0.68)", "rgba(253,224,71,0.72)", "rgba(134,239,172,0.68)", "rgba(249,168,212,0.68)"];
  const colInks = dark
    ? ["#7dd3fc", "#fde047", "#6ee7b7", "#f9a8d4"]
    : ["#0369a1", "#92400e", "#065f46", "#9d174d"];

  const redHolColor = dark ? "rgba(251,113,133,0.82)" : "#ef4444";
  const yellowFriColor = dark ? "rgba(251,191,36,0.36)" : "#facc15";
  const yellowFriInk = dark ? "#fcd34d" : "#713f12";
  const normalCellBg = dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.75)";
  const emptyCellBg = dark ? "rgba(19,24,41,0.45)" : "rgba(241,245,249,0.6)";
  const headerMonthBg = dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.92)";
  const textMainColor = sk.text;
  const thinBorder = dark ? "rgba(255,255,255,0.09)" : "rgba(23,19,38,0.12)";
  const thickBorder = dark ? "rgba(255,255,255,0.24)" : "rgba(23,19,38,0.28)";

  const firstHalfNames = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور"];
  const secondHalfNames = [
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];
  const groupLetters = ["A", "B", "C", "D"];

  for (let c = 0; c < 16; c++) {
    const x = colLefts[c];
    const w = colRights[c] - x;
    if (c >= 6 && c <= 9) {
      const gIdx = c - 6;
      ctx.fillStyle = colHeaderColors[gIdx];
      ctx.fillRect(x, tableTop, w, headerH);
      ctx.strokeStyle = thickBorder;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, tableTop, w, headerH);

      ctx.fillStyle = colInks[gIdx];
      ctx.font = `900 32px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(groupLetters[gIdx], x + w / 2, tableTop + headerH / 2);
    } else {
      ctx.fillStyle = headerMonthBg;
      ctx.fillRect(x, tableTop, w, headerH);
      ctx.strokeStyle = thinBorder;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x, tableTop, w, headerH);

      const mLabel = c < 6 ? firstHalfNames[c] : secondHalfNames[c - 10];
      ctx.save();
      ctx.translate(x + w / 2, tableTop + headerH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = textMainColor;
      ctx.font = `900 24px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(mLabel, 0, 0);
      ctx.restore();
    }
  }

  for (let r = 0; r < 32; r++) {
    const row = rowsData[r];
    const rTop = rowsTop + r * rowH;

    for (let c = 0; c < 16; c++) {
      const x = colLefts[c];
      const w = colRights[c] - x;

      if (c >= 6 && c <= 9) {
        const gIdx = c - 6;
        const code = gIdx === 0 ? row.codeA : gIdx === 1 ? row.codeB : gIdx === 2 ? row.codeC : row.codeD;
        ctx.fillStyle = colBodyColors[gIdx];
        ctx.fillRect(x, rTop, w, rowH);
        ctx.strokeStyle = thinBorder;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, rTop, w, rowH);

        ctx.fillStyle = colInks[gIdx];
        ctx.font = `900 20px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(code, x + w / 2, rTop + rowH / 2 + 1);
      } else {
        const mColIdx = c < 6 ? c : c - 4;
        const cell = row.monthCells[mColIdx];
        if (!cell) {
          ctx.fillStyle = emptyCellBg;
          ctx.fillRect(x, rTop, w, rowH);
          ctx.strokeStyle = thinBorder;
          ctx.lineWidth = 1.1;
          ctx.strokeRect(x, rTop, w, rowH);
        } else {
          if (cell.isOfficialHoliday && cell.isFriday) {
            ctx.fillStyle = redHolColor;
            ctx.fillRect(x, rTop, w, rowH);
            ctx.fillStyle = yellowFriColor;
            roundRect(ctx, x + 6, rTop + 4, w - 12, rowH - 8, 4);
            ctx.fill();
          } else if (cell.isOfficialHoliday) {
            ctx.fillStyle = redHolColor;
            ctx.fillRect(x, rTop, w, rowH);
          } else if (cell.isFriday) {
            ctx.fillStyle = yellowFriColor;
            ctx.fillRect(x, rTop, w, rowH);
          } else {
            ctx.fillStyle = normalCellBg;
            ctx.fillRect(x, rTop, w, rowH);
          }
          ctx.strokeStyle = thinBorder;
          ctx.lineWidth = 1.1;
          ctx.strokeRect(x, rTop, w, rowH);

          ctx.fillStyle =
            cell.isOfficialHoliday && cell.isFriday
              ? yellowFriInk
              : cell.isOfficialHoliday
                ? "#ffffff"
                : cell.isFriday
                  ? yellowFriInk
                  : textMainColor;
          ctx.font = `800 20px ${FONT}`;
          ctx.textAlign = "center";
          ctx.fillText(toPersianDigits(cell.day), x + w / 2, rTop + rowH / 2 + 1);
        }
      }
    }

    if (r % 2 === 1 && r < 31) {
      ctx.strokeStyle = thickBorder;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(tableLeft, rTop + rowH);
      ctx.lineTo(tableRight, rTop + rowH);
      ctx.stroke();
    }
  }

  const fy = H - 110;
  drawGlassCard(ctx, cardPadX, fy, cardW, 78, 26, sk);

  const pat = getActivePattern();
  const guideItems: { text: string; kind: ShiftKind | "HOLIDAY" }[] = [
    { text: "M : صبح‌کار", kind: "DAY" },
    ...((pat.eveningCount ?? 0) > 0 ? [{ text: "E : عصرکار", kind: "EVENING" as const }] : []),
    { text: "N : شب‌کار", kind: "NIGHT" },
    { text: "R : استراحت", kind: "REST" },
    { text: "قرمز: تعطیل رسمی", kind: "HOLIDAY" },
  ];
  const bW = 240;
  const totGuideW = guideItems.length * bW + (guideItems.length - 1) * 20;
  let gx = (W - totGuideW) / 2;
  for (const gItem of guideItems) {
    const ink = drawShiftGradientChip(ctx, gx, fy + 17, bW, 44, 12, gItem.kind, dark, true);
    ctx.fillStyle = ink;
    ctx.font = `800 18.5px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(gItem.text, gx + bW / 2, fy + 39);
    gx += bW + 20;
  }

  return canvas;
}

/* =========================================================================
   3. All-Shifts Annual Roster (Official Role Lohe & 4-Shift Matrix)
   ========================================================================= */
export function renderAllShiftsRosterCanvas(
  jy: number,
  mode: "OFFICIAL_LOHE" | "MATRIX_4",
  dark: boolean,
): HTMLCanvasElement {
  const pat = getActivePattern();
  const hasEvening = pat.eveningCount > 0;
  const W = 1680;
  const H = mode === "OFFICIAL_LOHE" && !hasEvening ? 2320 : 2520;
  const { canvas, ctx } = createHiDpiCanvas(W, H);
  const sk = getCanvasPalette(dark);

  drawAuroraBackdrop(ctx, W, H, sk);

  const groups = getActiveGroups(pat);

  drawGlassCard(ctx, 40, 36, W - 80, 116, 30, sk);
  ctx.fillStyle = sk.text;
  ctx.font = `900 38px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`لوحه نوبت‌کاری سال ${toPersianDigits(jy)}`, W - 72, 76);

  ctx.fillStyle = sk.textMuted;
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText(
    mode === "OFFICIAL_LOHE"
      ? `${APP.name} — لوحهٔ کامل نوبت‌کاری (صبح‌کار / شب‌کار / استراحت)`
      : `${APP.name} — ماتریس سالانهٔ چهار شیفت`,
    W - 72,
    118,
  );

  const pad = 40;
  const listTop = 176;
  const listBottom = H - 128;
  const gapY = 14;
  const monthH = (listBottom - listTop - gapY * 11) / 12;

  for (let idx = 0; idx < 12; idx++) {
    const jm = idx + 1;
    const top = listTop + idx * (monthH + gapY);
    drawGlassCard(ctx, pad, top, W - pad * 2, monthH, 22, sk);

    const innerPad = 14;
    const monthColW = 118;
    const labelColW = 86;
    const colGap = 4;

    const mTitleRight = W - pad - innerPad;
    const mTitleLeft = mTitleRight - monthColW;
    drawGlassCard(ctx, mTitleLeft, top + innerPad, monthColW, monthH - innerPad * 2, 14, sk, {
      tintColor: sk.primarySoft,
      borderColor: sk.primary,
      borderWidth: 1.5,
    });
    ctx.fillStyle = sk.primary;
    ctx.font = `900 22px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(JALALI_MONTHS[jm - 1], mTitleLeft + monthColW / 2, top + monthH / 2);

    const lblRight = mTitleLeft - colGap - 4;
    const lblLeft = lblRight - labelColW;
    const daysAreaRight = lblLeft - colGap - 4;
    const daysAreaLeft = pad + innerPad;
    const daysAreaW = daysAreaRight - daysAreaLeft;
    const cellGapX = 3;
    const cellW = (daysAreaW - cellGapX * 30) / 31;

    const rowDefs: { label: string; kind: ShiftKind | null }[] =
      mode === "OFFICIAL_LOHE"
        ? [
            { label: "تاریخ", kind: null },
            { label: "صبح‌کار", kind: "DAY" },
            ...(hasEvening ? [{ label: "عصرکار", kind: "EVENING" as const }] : []),
            { label: "شب‌کار", kind: "NIGHT" },
            { label: "استراحت", kind: "REST" },
          ]
        : [
            { label: "تاریخ", kind: null },
            ...groups.map((g) => ({ label: getGroupLetter(g, pat), kind: null })),
          ];

    const numRows = rowDefs.length;
    const cellGapY = 3;
    const availH = monthH - innerPad * 2;
    const rowH = (availH - cellGapY * (numRows - 1)) / numRows;

    rowDefs.forEach((rd, rIdx) => {
      const rTop = top + innerPad + rIdx * (rowH + cellGapY);
      if (rd.kind) {
        const ink = drawShiftGradientChip(ctx, lblLeft, rTop, labelColW, rowH, 7, rd.kind, dark, true);
        ctx.fillStyle = ink;
      } else {
        drawGlassCard(ctx, lblLeft, rTop, labelColW, rowH, 7, sk);
        ctx.fillStyle = rIdx === 0 ? sk.textMuted : sk.primary;
      }
      ctx.font = `800 14px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(rd.label, lblLeft + labelColW / 2, rTop + rowH / 2);
    });

    const mLen = jalaaliMonthLength(jy, jm);
    for (let d = 1; d <= mLen; d++) {
      const cRight = daysAreaRight - (d - 1) * (cellW + cellGapX);
      const cLeft = cRight - cellW;
      const dk = makeDateKey(jy, jm, d);
      const allCodes = getAllGroupsForDate(dk);
      const hol = isHoliday(jy, jm, d);

      const r0Top = top + innerPad;
      if (hol) {
        const ink = drawShiftGradientChip(ctx, cLeft, r0Top, cellW, rowH, 6, "HOLIDAY", dark, true);
        ctx.fillStyle = ink;
      } else {
        drawGlassCard(ctx, cLeft, r0Top, cellW, rowH, 6, sk);
        ctx.fillStyle = sk.text;
      }
      ctx.font = `800 14px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(toPersianDigits(d), cLeft + cellW / 2, r0Top + rowH / 2);

      if (mode === "OFFICIAL_LOHE") {
        const dayG = groups.filter((g) => codeToKind(allCodes[g]) === "DAY").map((g) => getGroupLetter(g, pat)).join("") || "-";
        const eveG = groups.filter((g) => codeToKind(allCodes[g]) === "EVENING").map((g) => getGroupLetter(g, pat)).join("") || "-";
        const nightG = groups.filter((g) => codeToKind(allCodes[g]) === "NIGHT").map((g) => getGroupLetter(g, pat)).join("") || "-";
        const restG = groups.filter((g) => codeToKind(allCodes[g]) === "REST").map((g) => getGroupLetter(g, pat)).join("") || "-";

        const roleCells: { txt: string; kind: ShiftKind }[] = [
          { txt: dayG, kind: "DAY" },
          ...(hasEvening ? [{ txt: eveG, kind: "EVENING" as const }] : []),
          { txt: nightG, kind: "NIGHT" },
          { txt: restG, kind: "REST" },
        ];
        roleCells.forEach((rc, subIdx) => {
          const rTop = top + innerPad + (subIdx + 1) * (rowH + cellGapY);
          const ink = drawShiftGradientChip(ctx, cLeft, rTop, cellW, rowH, 6, rc.kind, dark, true);
          ctx.fillStyle = ink;
          ctx.font = `900 ${rc.txt.length > 1 ? 13 : 15}px ${FONT}`;
          ctx.fillText(rc.txt, cLeft + cellW / 2, rTop + rowH / 2);
        });
      } else {
        groups.forEach((g, gIdx) => {
          const rTop = top + innerPad + (gIdx + 1) * (rowH + cellGapY);
          const k = codeToKind(allCodes[g]);
          const shortTxt = k === "DAY" ? "ص" : k === "EVENING" ? "ع" : k === "NIGHT" ? "ش" : "ا";
          const ink = drawShiftGradientChip(ctx, cLeft, rTop, cellW, rowH, 6, k, dark, true);
          ctx.fillStyle = ink;
          ctx.font = `900 14px ${FONT}`;
          ctx.fillText(shortTxt, cLeft + cellW / 2, rTop + rowH / 2);
        });
      }
    }
  }

  return canvas;
}

/* =========================================================================
   4. Monthly Calendar Grid PNG (100% parity with Android `renderMonthBitmap`!)
   ========================================================================= */
export function renderMonthGridCanvas(
  jy: number,
  jm: number,
  filterGroup: GroupFilter,
  dark: boolean,
  dayRecords: Record<string, DayWorkRecord> = {},
): HTMLCanvasElement {
  const W = 1200;
  const H = 1520;
  const { canvas, ctx } = createHiDpiCanvas(W, H);
  const sk = getCanvasPalette(dark);
  const pat = getActivePattern();
  const state = useShiftKar.getState();
  const effGroup: ShiftGroup =
    filterGroup === "ALL" ? (state.myGroup || "A") : (filterGroup as ShiftGroup);
  const badgeLabel =
    filterGroup === "ALL" ? "همهٔ گروه‌ها" : getGroupTitle(effGroup, pat);
  const today = todayJalaali();

  drawAuroraBackdrop(ctx, W, H, sk);

  const pad = 40;
  // 1. Header Card (pad, 36, W - pad, 156)
  drawGlassCard(ctx, pad, 36, W - pad * 2, 120, 32, sk);

  ctx.fillStyle = sk.text;
  ctx.font = `900 40px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`, W - pad - 32, 80);

  ctx.fillStyle = sk.textMuted;
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText(`${APP.name} — برنامهٔ ماهانهٔ شیفت کاری (${pat.name})`, W - pad - 32, 124);

  // Left Group Badge
  drawGlassCard(ctx, pad + 28, 64, 210, 64, 22, sk, {
    tintColor: sk.primarySoft,
    borderColor: sk.primary,
    borderWidth: 2.5,
  });
  ctx.fillStyle = sk.primary;
  ctx.font = `900 25px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(badgeLabel, pad + 133, 96);

  // 2. Outer Frosted Glass Calendar Card (pad, 180, W - pad, 1180)
  const calTop = 180;
  const calH = 1000;
  drawGlassCard(ctx, pad, calTop, W - pad * 2, calH, 32, sk);

  const innerPad = 24;
  const cellGap = 10;
  const gridW = W - pad * 2 - innerPad * 2;
  const cellW = (gridW - cellGap * 6) / 7;

  // Weekday headers (full names: شنبه ... جمعه)
  for (let wd = 0; wd < 7; wd++) {
    const cx = W - pad - innerPad - wd * (cellW + cellGap) - cellW / 2;
    ctx.fillStyle = sk.textMuted;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(WEEKDAYS[wd], cx, calTop + 42);
  }

  const mLen = jalaaliMonthLength(jy, jm);
  const firstWd = jalaaliWeekday(jy, jm, 1);
  const totalCells = firstWd + mLen;
  const numRows = Math.ceil(totalCells / 7);
  const cellsTop = calTop + 78;
  const availH = calTop + calH - 24 - cellsTop;
  const cellH = (availH - cellGap * (numRows - 1)) / Math.max(numRows, 5);
  /* Show ALL active groups (up to 6, like the on-screen GridView) — patterns
   * with 5-8 groups must not silently lose groups E-H in the exported PNG. */
  const groups = getActiveGroups(pat).slice(0, 6);

  const holidaySummaries: string[] = [];

  for (let d = 1; d <= mLen; d++) {
    const pos = firstWd + d - 1;
    const r = Math.floor(pos / 7);
    const c = pos % 7;
    const cellRight = W - pad - innerPad - c * (cellW + cellGap);
    const cellLeft = cellRight - cellW;
    const cellTop = cellsTop + r * (cellH + cellGap);

    const dk = makeDateKey(jy, jm, d);
    const isHol = isHoliday(jy, jm, d);
    const isToday = jy === today.jy && jm === today.jm && d === today.jd;
    const rec = dayRecords[dk];

    if (isHol) {
      const holEv = getDayEvents(jy, jm, d).find((e) => e.isHoliday);
      if (holEv) {
        holidaySummaries.push(`${toPersianDigits(d)} ${JALALI_MONTHS[jm - 1]}: ${holEv.title}`);
      }
    }

    // Frosted Glass Day Cell (matching `drawGlassCard(canvas, cRect, 22f, sk, ...)` in Android!)
    drawGlassCard(ctx, cellLeft, cellTop, cellW, cellH, 22, sk, {
      tintColor: isHol ? sk.holidaySoft : null,
      borderColor: isToday ? sk.primary : isHol ? "rgba(251,113,133,0.40)" : sk.border,
      borderWidth: isToday ? 4 : 1.5,
    });

    // Day number in top half of the glass cell
    ctx.fillStyle = isHol ? sk.holiday : sk.text;
    ctx.font = `900 28px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(toPersianDigits(d), cellLeft + cellW / 2, cellTop + cellH * 0.28);

    // Overtime badge in top-left corner if present (only for the user's own group,
    // matching the on-screen DayCell guard `targetGroup === myGroup`)
    if (effGroup === (state.myGroup || "A") && (rec?.overtimeHours ?? 0) > 0) {
      ctx.fillStyle = sk.primary;
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(`+${toPersianDigits(rec!.overtimeHours)}س`, cellLeft + 12, cellTop + 22);
    }

    if (filterGroup === "ALL") {
      // Mini gradient pills inside the bottom half of the cell (2 or 3 columns,
      // mirroring the on-screen `grid-cols-2 / grid-cols-3` layout)
      const bGap = 5;
      const bCols = groups.length > 4 ? 3 : 2;
      const bRows = Math.ceil(groups.length / bCols);
      const bw = (cellW - 22 - bGap * (bCols - 1)) / bCols;
      const bh = (cellH * 0.48 - bGap * (bRows - 1)) / bRows;
      const bStartTop = cellTop + cellH * 0.46;
      groups.forEach((g, gi) => {
        const gr = Math.floor(gi / bCols);
        const gc = gi % bCols;
        const bRight = cellRight - 11 - gc * (bw + bGap);
        const bLeft = bRight - bw;
        const bTop = bStartTop + gr * (bh + bGap);
        const code = getShiftCode(dk, g);
        const gKind = effectiveKindForExport(g, code, rec);
        const ink = drawShiftGradientChip(ctx, bLeft, bTop, bw, bh, 8, gKind, dark, false);
        ctx.fillStyle = ink;
        ctx.font = `900 ${bw < 45 ? 12.5 : 14.5}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(
          `${getGroupLetter(g, pat)}${toPersianDigits(shiftCodeIndex(code))}`,
          bLeft + bw / 2,
          bTop + bh / 2,
        );
      });
    } else {
      // Inner rounded gradient pill in the bottom half of the glass cell!
      const code = getShiftCode(dk, effGroup);
      const kind = effectiveKindForExport(effGroup, code, rec);
      const mySwap = effGroup === (state.myGroup || "A") ? rec?.swapKind : undefined;
      const pillLeft = cellLeft + 12;
      const pillTop = cellTop + cellH * 0.52;
      const pillW = cellW - 24;
      const pillH = cellH * 0.48 - 12;
      const labelText = mySwap ? `${SHIFT_KIND_FA[mySwap]}*` : CODE_NUM_FA[code];
      const ink = drawShiftGradientChip(ctx, pillLeft, pillTop, pillW, pillH, 14, kind, dark, true);
      ctx.fillStyle = ink;
      ctx.font = `800 17px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(labelText, pillLeft + pillW / 2, pillTop + pillH / 2);
    }
  }

  // 3. Monthly Summary Row (4/5 gradient summary cards at sumTop = 1204, sumH = 124)
  drawMonthlySummaryRow(ctx, sk, dark, jy, jm, effGroup, dayRecords, pad, W, 1204, 124);

  // 4. Footer Card (pad, 1352, W - pad, H - 36)
  const footerTop = 1352;
  const footerH = H - 36 - footerTop;
  drawGlassCard(ctx, pad, footerTop, W - pad * 2, footerH, 24, sk);

  const monthHolidaysStr = holidaySummaries.join("  •  ");
  const footerLine = monthHolidaysStr
    ? monthHolidaysStr.length > 95
      ? monthHolidaysStr.slice(0, 95) + "…"
      : monthHolidaysStr
    : "بدون تعطیلات رسمی در این ماه";

  ctx.fillStyle = monthHolidaysStr ? sk.holiday : sk.textMuted;
  ctx.font = `700 19px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(footerLine, W / 2, footerTop + 44);

  ctx.fillStyle = sk.textFaint;
  ctx.font = `700 18px ${FONT}`;
  ctx.fillText(`${APP.name} (${getGroupTitle(effGroup, pat)}) — ${APP.tagline}`, W / 2, footerTop + 92);

  return canvas;
}

/* =========================================================================
   5. Monthly Schedule Table PNG (100% parity with Android `renderMonthTableBitmap`!)
   ========================================================================= */
export function renderMonthTableCanvas(
  jy: number,
  jm: number,
  filterGroup: GroupFilter,
  dark: boolean,
  dayRecords: Record<string, DayWorkRecord> = {},
): HTMLCanvasElement {
  const W = 1240;
  const H = 2480;
  const { canvas, ctx } = createHiDpiCanvas(W, H);
  const sk = getCanvasPalette(dark);
  const pat = getActivePattern();
  const state = useShiftKar.getState();
  const isAll = filterGroup === "ALL";
  const effGroup: ShiftGroup = isAll ? (state.myGroup || "A") : (filterGroup as ShiftGroup);
  const badgeLabel = isAll ? "همهٔ گروه‌ها" : getGroupTitle(effGroup, pat);
  const today = todayJalaali();
  const notesMap = getAllNotesSync();

  drawAuroraBackdrop(ctx, W, H, sk);

  const pad = 40;
  // 1. Header Card
  drawGlassCard(ctx, pad, 36, W - pad * 2, 120, 32, sk);

  ctx.fillStyle = sk.text;
  ctx.font = `900 38px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`جدول شیفت ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`, W - pad - 32, 78);

  ctx.fillStyle = sk.textMuted;
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText(`${APP.name} — برنامهٔ تفصیلی روزها، مناسبت‌ها و یادداشت‌ها`, W - pad - 32, 122);

  drawGlassCard(ctx, pad + 28, 64, 210, 64, 22, sk, {
    tintColor: sk.primarySoft,
    borderColor: sk.primary,
    borderWidth: 2.5,
  });
  ctx.fillStyle = sk.primary;
  ctx.font = `900 25px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(badgeLabel, pad + 133, 96);

  // 2. Outer Table Card
  const tableTop = 178;
  const tableBottom = 2208;
  const tableW = W - pad * 2;
  const tableH = tableBottom - tableTop;
  drawGlassCard(ctx, pad, tableTop, tableW, tableH, 32, sk);

  const thHeight = 62;
  roundRect(ctx, pad + 4, tableTop + 4, tableW - 8, thHeight, 28);
  ctx.fillStyle = sk.glassHi;
  ctx.fill();

  const tableRight = W - pad;
  const colDayCenter = tableRight - 45;
  const colWdCenter = tableRight - 153;
  const colShiftCenter = tableRight - 355;
  const colEventsRight = tableRight - 510;

  ctx.fillStyle = sk.textMuted;
  ctx.font = `800 19px ${FONT}`;
  ctx.textAlign = "center";
  const thCy = tableTop + 4 + thHeight / 2;
  ctx.fillText("روز", colDayCenter, thCy);
  ctx.fillText("هفته", colWdCenter, thCy);
  ctx.fillText(isAll ? "شیفت گروه‌ها" : "وضعیت شیفت", colShiftCenter, thCy);
  ctx.textAlign = "right";
  ctx.fillText("تعطیلات، مناسبت‌ها و یادداشت", colEventsRight, thCy);

  const mLen = jalaaliMonthLength(jy, jm);
  const rowsTop = tableTop + thHeight + 6;
  const rowsBottom = tableBottom - 12;
  const rowCount = Math.max(mLen, 29);
  const rowH = (rowsBottom - rowsTop) / rowCount;
  /* Show ALL active groups (patterns support up to 8 groups A-H). */
  const groups = getActiveGroups(pat);

  for (let d = 1; d <= mLen; d++) {
    const idx = d - 1;
    const rTop = rowsTop + idx * rowH;
    const rBottom = rTop + rowH;
    const rCy = (rTop + rBottom) / 2;
    const dk = makeDateKey(jy, jm, d);
    const isHol = isHoliday(jy, jm, d);
    const isToday = jy === today.jy && jm === today.jm && d === today.jd;
    const wd = jalaaliWeekday(jy, jm, d);
    const rec = dayRecords[dk];

    const rowX = pad + 12;
    const rowW = tableW - 24;
    if (isToday) {
      roundRect(ctx, rowX, rTop + 2, rowW, rowH - 4, 14);
      ctx.fillStyle = sk.primarySoft;
      ctx.fill();
      ctx.strokeStyle = sk.primary;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (isHol) {
      roundRect(ctx, rowX, rTop + 2, rowW, rowH - 4, 14);
      ctx.fillStyle = sk.holidaySoft;
      ctx.fill();
      roundRect(ctx, rowX + rowW - 6, rTop + 10, 6, rowH - 20, 3);
      ctx.fillStyle = sk.holiday;
      ctx.fill();
    } else if (idx % 2 === 1) {
      roundRect(ctx, rowX, rTop + 2, rowW, rowH - 4, 12);
      ctx.fillStyle = sk.surface;
      ctx.fill();
    }

    if (idx > 0) {
      ctx.strokeStyle = sk.borderSoft;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pad + 24, rTop);
      ctx.lineTo(tableRight - 24, rTop);
      ctx.stroke();
    }

    ctx.fillStyle = isToday ? sk.primary : isHol ? sk.holiday : sk.text;
    ctx.font = `900 21px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(toPersianDigits(String(d).padStart(2, "0")), colDayCenter, rCy);

    ctx.fillStyle = isHol ? sk.holiday : sk.textMuted;
    ctx.font = `700 19.5px ${FONT}`;
    ctx.fillText(WEEKDAYS[wd], colWdCenter, rCy);

    if (isAll) {
      /* Shrink the per-group badge so 5-8 groups still fit inside the shift
       * column (~295px) without colliding with the weekday/events columns. */
      const bGap = 6;
      const bW = Math.min(54, (295 - bGap * (groups.length - 1)) / groups.length);
      const bH = Math.min(rowH - 16, 38);
      const totalBW = bW * groups.length + bGap * (groups.length - 1);
      const startRight = colShiftCenter + totalBW / 2;
      groups.forEach((g, gi) => {
        const bRight = startRight - gi * (bW + bGap);
        const bLeft = bRight - bW;
        const code = getShiftCode(dk, g);
        /* Apply the user's own swap to their group's badge (parity with MiniBadge
         * `kindOverride` in the on-screen TableView ALL mode). */
        const gKind = effectiveKindForExport(g, code, rec);
        const ink = drawShiftGradientChip(ctx, bLeft, rCy - bH / 2, bW, bH, 10, gKind, dark, false);
        ctx.fillStyle = ink;
        ctx.font = `900 ${bW < 45 ? 13 : 16}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(
          `${getGroupLetter(g, pat)}${toPersianDigits(shiftCodeIndex(code))}`,
          bLeft + bW / 2,
          rCy,
        );
      });
    } else {
      const code = getShiftCode(dk, effGroup);
      const kind = effectiveKindForExport(effGroup, code, rec);
      const mySwap = effGroup === (state.myGroup || "A") ? rec?.swapKind : undefined;
      const pW = 210;
      const pH = Math.min(rowH - 14, 40);
      const pLeft = colShiftCenter - pW / 2;
      const pLabel = mySwap
        ? `جابه‌جایی: ${SHIFT_KIND_FA[mySwap]}`
        : `${CODE_FA[code]} (${code})`;
      const ink = drawShiftGradientChip(ctx, pLeft, rCy - pH / 2, pW, pH, 13, kind, dark, true);
      ctx.fillStyle = ink;
      ctx.font = `700 17px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(pLabel, colShiftCenter, rCy);
    }

    const dayEvs = getDayEvents(jy, jm, d);
    const holStr = dayEvs.filter((e) => e.isHoliday).map((e) => e.title).join("، ");
    const occStr = dayEvs.filter((e) => !e.isHoliday).map((e) => e.title).join("، ");
    const rawNote = (notesMap[dk] || "").replace(/[\r\n]+/g, " ").trim();
    const recParts: string[] = [];
    if ((rec?.overtimeHours ?? 0) > 0) {
      recParts.push(`اضافه‌کاری: ${toPersianDigits(rec!.overtimeHours)}س`);
    }
    if (rec?.swapKind) {
      recParts.push(`جابه‌جایی: ${SHIFT_KIND_FA[rec.swapKind]}`);
    }
    const noteStr = [recParts.join(" · "), rawNote].filter(Boolean).join(" | ");

    const primaryLine = holStr
      ? holStr
      : occStr
        ? occStr
        : noteStr
          ? `یادداشت: ${noteStr}`
          : "—";
    const primaryColor = holStr
      ? sk.holiday
      : occStr
        ? sk.text
        : noteStr
          ? sk.noteInk
          : sk.textFaint;
    const secondaryLine =
      holStr && noteStr
        ? `یادداشت: ${noteStr}`
        : holStr && occStr
          ? occStr
          : occStr && noteStr
            ? `یادداشت: ${noteStr}`
            : "";

    ctx.textAlign = "right";
    const clippedPrimary = primaryLine.length > 52 ? primaryLine.slice(0, 52) + "…" : primaryLine;
    if (!secondaryLine) {
      ctx.fillStyle = primaryColor;
      ctx.font = `${holStr ? 800 : 700} 18.5px ${FONT}`;
      ctx.fillText(clippedPrimary, colEventsRight, rCy);
    } else {
      const clippedSec = secondaryLine.length > 56 ? secondaryLine.slice(0, 56) + "…" : secondaryLine;
      ctx.fillStyle = primaryColor;
      ctx.font = `${holStr ? 800 : 700} 17px ${FONT}`;
      ctx.fillText(clippedPrimary, colEventsRight, rCy - rowH * 0.19);

      ctx.fillStyle = noteStr ? sk.noteInk : sk.textMuted;
      ctx.font = `700 15.5px ${FONT}`;
      ctx.fillText(clippedSec, colEventsRight, rCy + rowH * 0.22);
    }
  }

  // 3. Monthly Summary Row
  drawMonthlySummaryRow(ctx, sk, dark, jy, jm, effGroup, dayRecords, pad, W, 2230, 122);

  // 4. Footer Card
  drawGlassCard(ctx, pad, 2374, W - pad * 2, H - 32 - 2374, 22, sk);
  ctx.fillStyle = sk.textMuted;
  ctx.font = `700 19px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(
    `${APP.name} (نسخهٔ ${toPersianDigits(APP.version)}) — ${getGroupTitle(effGroup, pat)} • ${APP.tagline}`,
    W / 2,
    (2374 + H - 32) / 2,
  );

  return canvas;
}

/* =========================================================================
   6. Single Day Card PNG (100% parity with Android `renderDayBitmap`!)
   ========================================================================= */
export function renderDayCanvas(
  dateKey: string,
  myGroup: ShiftGroup,
  dark: boolean,
  dayRecord?: DayWorkRecord,
  noteText?: string,
  employees: EmployeeProfile[] = [],
): HTMLCanvasElement {
  const { jy, jm, jd } = parseDateKey(dateKey);
  const events = getDayEvents(jy, jm, jd);
  const holidays = events.filter((e) => e.isHoliday);
  const occasions = events.filter((e) => !e.isHoliday);
  const hasEvents = holidays.length > 0 || occasions.length > 0;
  const hasNote = Boolean(noteText?.trim()) || (dayRecord?.overtimeHours ?? 0) > 0;
  const extraEmpH = employees.length > 0 ? 74 + employees.length * 56 : 0;
  const pat = getActivePattern();
  /* Group cards grid: 2 columns × ceil(n/2) rows — grow the canvas height for
   * patterns with 5-8 groups so the extra rows never overflow the footer. */
  const groups = getActiveGroups(pat);
  const cardH = 148;
  const gGap = 20;
  const extraGroupRows = Math.max(0, Math.ceil(groups.length / 2) - 2);

  const W = 1080;
  const H =
    920 +
    (hasEvents ? 190 : 0) +
    (hasNote ? 210 : 0) +
    extraGroupRows * (cardH + gGap) +
    extraEmpH;
  const { canvas, ctx } = createHiDpiCanvas(W, H);
  const sk = getCanvasPalette(dark);

  drawAuroraBackdrop(ctx, W, H, sk);

  const pad = 44;
  drawGlassCard(ctx, pad, 44, W - pad * 2, H - 88, 38, sk);

  let curY = 86;
  const innerRight = W - pad - 38;
  const innerLeft = pad + 38;

  ctx.fillStyle = sk.primary;
  ctx.font = `700 25px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(formatWeekday(jy, jm, jd), innerRight, curY + 26);

  ctx.fillStyle = sk.text;
  ctx.font = `900 46px ${FONT}`;
  ctx.fillText(formatJalali(jy, jm, jd), innerRight, curY + 84);

  if (useShiftKar.getState().showSecondaryCalendars) {
    ctx.fillStyle = sk.textMuted;
    ctx.font = `700 21px ${FONT}`;
    ctx.fillText(`${formatHijri(jy, jm, jd)}  •  ${formatGregorian(jy, jm, jd)}`, innerRight, curY + 132);
  }

  const mine = calculateShift(dateKey, myGroup);
  const effKind = dayRecord?.swapKind ?? mine.type;
  const myBadgeW = 260;
  const myBadgeH = 120;
  drawGlassCard(ctx, innerLeft, curY + 8, myBadgeW, myBadgeH, 26, sk);
  const mineInk = drawShiftGradientChip(ctx, innerLeft, curY + 8, myBadgeW, myBadgeH, 26, effKind, dark, true);

  ctx.fillStyle = mineInk;
  ctx.textAlign = "center";
  ctx.font = `700 19px ${FONT}`;
  ctx.fillText(`شیفت شما (${getGroupTitle(myGroup, pat)})`, innerLeft + myBadgeW / 2, curY + 46);
  ctx.font = `900 27px ${FONT}`;
  ctx.fillText(
    dayRecord?.swapKind ? SHIFT_KIND_FA[dayRecord.swapKind] : CODE_FA[mine.code],
    innerLeft + myBadgeW / 2,
    curY + 92,
  );

  curY += 172;

  if (hasEvents) {
    const isHol = holidays.length > 0;
    drawGlassCard(ctx, innerLeft, curY, innerRight - innerLeft, 156, 26, sk, {
      tintColor: isHol ? sk.holidaySoft : sk.surface,
      borderColor: isHol ? "rgba(251,113,133,0.45)" : sk.border,
      borderWidth: 2,
    });
    const headline = isHol
      ? "تعطیل رسمی: " + holidays.map((e) => e.title).join("، ")
      : "مناسبت روز: " + occasions[0].title;
    ctx.fillStyle = isHol ? sk.holiday : sk.text;
    ctx.font = `800 23px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(
      headline.length > 62 ? headline.slice(0, 62) + "…" : headline,
      innerRight - 26,
      curY + 56,
    );

    const secondLine =
      isHol && occasions.length > 0
        ? occasions.map((e) => e.title).join(" • ")
        : !isHol && occasions.length > 1
          ? occasions.slice(1).map((e) => e.title).join(" • ")
          : "تقویم رسمی کشور";
    ctx.fillStyle = sk.textMuted;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(
      secondLine.length > 72 ? secondLine.slice(0, 72) + "…" : secondLine,
      innerRight - 26,
      curY + 108,
    );
    curY += 186;
  }

  ctx.fillStyle = sk.textMuted;
  ctx.font = `800 24px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("وضعیت شیفت گروه‌ها", innerRight, curY + 24);
  curY += 48;

  const cardW = (innerRight - innerLeft - gGap) / 2;

  groups.forEach((grp, idx) => {
    const r = Math.floor(idx / 2);
    const c = idx % 2;
    const cRight = innerRight - c * (cardW + gGap);
    const cLeft = cRight - cardW;
    const cTop = curY + r * (cardH + gGap);
    const shift = calculateShift(dateKey, grp);
    const isMine = grp === myGroup;
    /* The user's own card must respect a recorded swap (parity with the
     * on-screen DaySheet `displayKind`), otherwise the card contradicts the
     * header badge above. */
    const mySwap = isMine ? dayRecord?.swapKind : undefined;
    const displayKind = mySwap ?? shift.type;

    drawGlassCard(ctx, cLeft, cTop, cardW, cardH, 26, sk, {
      tintColor: isMine ? sk.primarySoft : null,
      borderColor: isMine ? sk.primary : sk.border,
      borderWidth: isMine ? 3.5 : 1.5,
    });

    const grpLabel = isMine
      ? `${getGroupTitle(grp, pat)} (شما)`
      : getGroupTitle(grp, pat);
    ctx.fillStyle = isMine ? sk.primary : sk.text;
    ctx.font = `900 25px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(grpLabel, cRight - 26, cTop + 52);

    ctx.fillStyle = sk.textMuted;
    ctx.font = `700 21px ${FONT}`;
    ctx.fillText(
      mySwap ? `جابه‌جایی: ${SHIFT_KIND_FA[mySwap]}` : `${shift.code}  •  ${CODE_FA[shift.code]}`,
      cRight - 26,
      cTop + 102,
    );

    const kPillLeft = cLeft + 22;
    const kPillTop = cTop + 38;
    const kPillW = 114;
    const kPillH = cardH - 76;
    const ink = drawShiftGradientChip(ctx, kPillLeft, kPillTop, kPillW, kPillH, 18, displayKind, dark, true);
    ctx.fillStyle = ink;
    ctx.font = `900 19px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(SHIFT_KIND_FA[displayKind], kPillLeft + kPillW / 2, kPillTop + kPillH / 2);
  });

  curY += Math.ceil(groups.length / 2) * cardH + gGap + 34;

  if (hasNote) {
    drawGlassCard(ctx, innerLeft, curY, innerRight - innerLeft, 170, 26, sk, {
      tintColor: sk.surface,
      borderColor: sk.primary,
      borderWidth: 2,
    });
    const otHours = dayRecord?.overtimeHours ?? 0;
    const headerTitle =
      otHours > 0
        ? `یادداشت و اضافه‌کاری روز (${toPersianDigits(otHours)} ساعت اضافه‌کاری):`
        : "یادداشت روز:";
    ctx.fillStyle = sk.primary;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(headerTitle, innerRight - 26, curY + 52);

    const cleanNote = (noteText || "").replace(/[\r\n]+/g, " ").trim() || "ثبت اضافه‌کاری در این روز";
    ctx.fillStyle = sk.text;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(
      cleanNote.length > 70 ? cleanNote.slice(0, 70) + "…" : cleanNote,
      innerRight - 26,
      curY + 112,
    );
    curY += 196;
  }

  if (employees.length > 0) {
    ctx.fillStyle = sk.textMuted;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(`وضعیت پرسنل (${toPersianDigits(employees.length)} نفر)`, innerRight, curY + 18);
    curY += 44;
    for (const emp of employees) {
      /* Use the employee's OWN pattern (parity with ManagerView / DaySheet). */
      const empPat = employeePatternForExport(emp);
      const empCode = getShiftCodeForPattern(dateKey, emp.group, empPat);
      const s = { code: empCode, type: codeToKind(empCode) };
      const log = emp.dayLogs?.[dateKey];
      const statusFa =
        log && log.status !== "AS_SCHEDULED"
          ? log.status === "LEAVE"
            ? "مرخصی"
            : SHIFT_KIND_FA[log.status]
          : CODE_NUM_FA[s.code];
      drawGlassCard(ctx, innerLeft, curY, innerRight - innerLeft, 46, 14, sk);
      ctx.fillStyle = sk.text;
      ctx.font = `700 19px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(`${emp.name} (${getGroupTitle(emp.group, empPat)})`, innerRight - 20, curY + 23);
      ctx.fillStyle = sk.primary;
      ctx.textAlign = "left";
      ctx.fillText(statusFa, innerLeft + 20, curY + 23);
      curY += 54;
    }
  }

  ctx.fillStyle = sk.textFaint;
  ctx.font = `700 20px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${APP.name} — ${APP.tagline}`, W / 2, H - 72);

  return canvas;
}

/* =========================================================================
   7. Work & Overtime Payslip Report PNG (100% parity with `renderWorkReportBitmap`)
   ========================================================================= */
export interface WorkReportSnapshot {
  periodTitle: string;
  groupTitle: string;
  patternName: string;
  totalWorkDays: number;
  dayShiftDays: number;
  eveningShiftDays: number;
  nightShiftDays: number;
  restDays: number;
  holidayWorkDays: number;
  fridayWorkDays: number;
  overtimeHours: number;
  swappedDaysCount: number;
  estimatedTotalHours: number;
  dark: boolean;
}

export function renderWorkReportCanvas(rep: WorkReportSnapshot): HTMLCanvasElement {
  const W = 1160;
  const H = 1160;
  const { canvas, ctx } = createHiDpiCanvas(W, H);
  const dark = rep.dark;
  const sk = getCanvasPalette(dark);

  drawAuroraBackdrop(ctx, W, H, sk);

  const pad = 40;
  drawGlassCard(ctx, pad, 36, W - pad * 2, 130, 32, sk);

  ctx.fillStyle = sk.text;
  ctx.font = `900 34px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`گزارش کارکرد و اضافه‌کاری — ${rep.periodTitle}`, W - pad - 32, 82);

  ctx.fillStyle = sk.textMuted;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(`الگوی فعال: ${rep.patternName}`, W - pad - 32, 126);

  drawGlassCard(ctx, pad + 28, 64, 222, 74, 22, sk, {
    tintColor: sk.primarySoft,
    borderColor: sk.primary,
    borderWidth: 2.5,
  });
  ctx.fillStyle = sk.primary;
  ctx.font = `900 24px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(rep.groupTitle, pad + 139, 101);

  const metrics = [
    {
      label: "کل روزهای کاری (نوبت فعال)",
      val: `${toPersianDigits(rep.totalWorkDays)} روز`,
      sub: `≈ ${toPersianDigits(rep.estimatedTotalHours)} ساعت کل کارکرد`,
    },
    {
      label: "مجموع اضافه‌کاری ثبت‌شده",
      val: `${toPersianDigits(rep.overtimeHours)} ساعت`,
      sub: `جابه‌جایی ثبت‌شده: ${toPersianDigits(rep.swappedDaysCount)} روز`,
    },
    {
      label: "نوبت کاری در تعطیلات رسمی",
      val: `${toPersianDigits(rep.holidayWorkDays)} روز`,
      sub: "تعطیل‌کاری رسمی",
    },
    {
      label: "نوبت کاری در روزهای جمعه",
      val: `${toPersianDigits(rep.fridayWorkDays)} روز`,
      sub: "جمعه‌کاری و تغییرات نوبت",
    },
  ];

  const gap = 18;
  const cardW = (W - pad * 2 - gap) / 2;
  const cardH = 152;
  metrics.forEach((m, idx) => {
    const r = Math.floor(idx / 2);
    const c = idx % 2;
    const mx = c === 0 ? W - pad - cardW : pad;
    const my = 192 + r * (cardH + gap);
    drawGlassCard(ctx, mx, my, cardW, cardH, 26, sk);

    ctx.fillStyle = sk.textMuted;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(m.label, mx + cardW - 28, my + 40);

    ctx.fillStyle = sk.primary;
    ctx.font = `900 36px ${FONT}`;
    ctx.fillText(m.val, mx + cardW - 28, my + 90);

    ctx.fillStyle = sk.textFaint;
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText(m.sub, mx + cardW - 28, my + 128);
  });

  const by = 548;
  drawGlassCard(ctx, pad, by, W - pad * 2, 510, 28, sk);

  ctx.fillStyle = sk.text;
  ctx.font = `900 26px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("تفکیک نوبت‌های کاری و استراحت", W - pad - 32, by + 52);

  const shiftRows: { label: string; days: number; kind: ShiftKind }[] = [
    { label: "نوبت صبح‌کار (M)", days: rep.dayShiftDays, kind: "DAY" },
    ...(rep.eveningShiftDays > 0
      ? [{ label: "نوبت عصرکار (E)", days: rep.eveningShiftDays, kind: "EVENING" as const }]
      : []),
    { label: "نوبت شب‌کار (N)", days: rep.nightShiftDays, kind: "NIGHT" },
    { label: "روزهای استراحت (R)", days: rep.restDays, kind: "REST" },
  ];

  shiftRows.forEach((sr, idx) => {
    const ry = by + 94 + idx * 96;
    const ink = drawShiftGradientChip(ctx, pad + 32, ry, W - pad * 2 - 64, 76, 18, sr.kind, dark, true);
    ctx.fillStyle = ink;
    ctx.font = `800 23px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(sr.label, W - pad - 60, ry + 38);
    ctx.textAlign = "left";
    ctx.font = `900 25px ${FONT}`;
    ctx.fillText(`${toPersianDigits(sr.days)} روز`, pad + 60, ry + 38);
  });

  ctx.fillStyle = sk.textFaint;
  ctx.font = `700 19px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${APP.name} (نسخهٔ ${toPersianDigits(APP.version)}) — ${APP.tagline}`, W / 2, H - 42);

  return canvas;
}

/* ============================================================================
 * PNG Download & Web Share Helpers
 * ============================================================================ */

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const safeName = filename.endsWith(".png") ? filename : `${filename}.png`;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

export async function shareOrDownloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  title: string,
): Promise<"shared" | "downloaded"> {
  const safeName = filename.endsWith(".png") ? filename : `${filename}.png`;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) {
    downloadCanvasAsPng(canvas, safeName);
    return "downloaded";
  }

  try {
    const file = new File([blob], safeName, { type: "image/png" });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title,
        text: title,
        files: [file],
      });
      return "shared";
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return "shared";
    }
  }

  downloadCanvasAsPng(canvas, safeName);
  return "downloaded";
}
