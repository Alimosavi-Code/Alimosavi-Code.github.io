"use client";
/**
 * Roster view (`RosterView`) — 100% parity with Android `RosterScreen.kt` (v6.7.1):
 *  - Header with `لوحه سالانه`, centered year stepper, and `تصویر` PNG export button
 *  - Segmented group filter (`همه | شیفت A | شیفت B | شیفت C | شیفت D`)
 *  - 3 All-Shift sub-modes when `همه` is active:
 *      1. `لوحه کلاسیک` (`CLASSIC_1405`) — Exact 17-column × 32-row annual chart
 *         (6 first-half months on left, Cyan/Amber/Emerald/Magenta A/B/C/D columns in center,
 *         7 second-half + next Farvardin months on right, red official holidays, yellow Fridays,
 *         and bottom legend bar).
 *      2. `لوحه رسمی (نوبت‌ها)` (`OFFICIAL_LOHE`) — Two 16-day half strips per month (`تاریخ / صبح‌کار / شب‌کار / استراحت`).
 *      3. `ماتریس ۴ شیفت` (`MATRIX_4`) — Two 16-day half strips per month (`تاریخ / A / B / C / D` with `ص / ع / ش / ا`).
 *  - Single-group 2-column 12-month grid with 2-stop shift gradients (normal Fridays not red).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  JALALI_MONTHS,
  jalaaliMonthLength,
  jalaaliWeekday,
  makeDateKey,
  todayJalaali,
  toPersianDigits,
} from "@/lib/jalali";
import {
  getShiftCode,
  getAllGroupsForDate,
  getActivePattern,
  getActiveGroups,
  getActiveGroupFilters,
  getGroupLetter,
  getGroupTitle,
  type ShiftGroup,
} from "@/lib/shift-engine";
import { isHoliday } from "@/lib/holidays";
import { codeToKind, type GroupFilter, type ShiftKind } from "@/lib/models";
import { useShiftKar, haptic } from "@/lib/store";
import {
  buildClassic1405LoheData,
  renderRosterCanvas,
  renderClassic1405RosterCanvas,
  renderAllShiftsRosterCanvas,
} from "@/lib/image-exporter";
import { ExportImageDialog } from "./export-dialog";
import {
  ChevronRight,
  ChevronLeft,
  RosterIcon,
  ImageIcon,
} from "./icons";

const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const MIN_YEAR = 1300;
const MAX_YEAR = 1500;

type AllRosterMode = "CLASSIC_1405" | "OFFICIAL_LOHE" | "MATRIX_4";

const CELL_GRAD: Record<ShiftKind | "HOLIDAY", string> = {
  DAY: "sk-grad-day",
  EVENING: "sk-grad-evening",
  NIGHT: "sk-grad-night",
  REST: "sk-grad-rest",
  HOLIDAY: "sk-grad-holiday",
};

export function RosterView({
  onOpenMonth,
}: {
  onOpenMonth: (jy: number, jm: number) => void;
}) {
  const rosterYear = useShiftKar((s) => s.rosterYear);
  const rosterGroup = useShiftKar((s) => s.rosterGroup);
  const showEvents = useShiftKar((s) => s.showEvents);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const activePatternId = useShiftKar((s) => s.activePatternId);
  const customPatterns = useShiftKar((s) => s.customPatterns);
  const calendarSyncRev = useShiftKar((s) => s.calendarSyncRev);
  const set = useShiftKar((s) => s.set);

  const [allMode, setAllMode] = useState<AllRosterMode>("CLASSIC_1405");
  const [exportOpen, setExportOpen] = useState(false);

  const pat = useMemo(() => getActivePattern(), [activePatternId, customPatterns]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt?.tagName === "INPUT" || tgt?.tagName === "TEXTAREA" || tgt?.isContentEditable) return;
      if (document.body.classList.contains("sk-sheet-open") || exportOpen) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        haptic(hapticOn);
        set({ rosterYear: Math.max(1300, rosterYear - 1) });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        haptic(hapticOn);
        set({ rosterYear: Math.min(1500, rosterYear + 1) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rosterYear, exportOpen, hapticOn, set]);

  const activeGroups = useMemo(() => getActiveGroups(pat), [pat]);
  const groupFilters = useMemo(() => getActiveGroupFilters(pat), [pat]);
  const today = useMemo(() => todayJalaali(), []);
  const effectiveFilter: GroupFilter = !pat.hasGroups ? "A" : rosterGroup;

  void calendarSyncRev;

  const setYear = (y: number) => {
    const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
    haptic(hapticOn);
    set({ rosterYear: clamped });
  };

  const setGroupFilter = (g: GroupFilter) => {
    haptic(hapticOn);
    set({ rosterGroup: g });
  };

  const handleRenderPng = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    if (effectiveFilter === "ALL" && pat.hasGroups) {
      if (allMode === "CLASSIC_1405") {
        return renderClassic1405RosterCanvas(rosterYear, isDark);
      }
      return renderAllShiftsRosterCanvas(rosterYear, allMode, isDark);
    }
    return renderRosterCanvas(rosterYear, effectiveFilter as ShiftGroup, isDark);
  }, [effectiveFilter, pat.hasGroups, allMode, rosterYear]);

  const exportTitle =
    effectiveFilter === "ALL" && pat.hasGroups
      ? allMode === "CLASSIC_1405"
        ? `تصویر لوحه کلاسیک سال ${toPersianDigits(rosterYear)}`
        : allMode === "OFFICIAL_LOHE"
          ? `تصویر لوحه سالانه ${toPersianDigits(rosterYear)} (رسمی)`
          : `تصویر لوحه سالانه ${toPersianDigits(rosterYear)} (ماتریس ۴ شیفت)`
      : `تصویر لوحه سالانه ${toPersianDigits(rosterYear)} (${getGroupTitle(effectiveFilter as ShiftGroup, pat)})`;

  return (
    <div className="h-full overflow-y-auto sk-scroll overscroll-contain px-3 md:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+104px)] space-y-2.5">
      {/* Top Bar: Title + Centered Year Stepper + Image Export Button (matching RosterScreen.kt) */}
      <div className="relative flex items-center justify-between min-h-10">
        <h1 className="text-[18.5px] font-black">لوحه سالانه</h1>

        {/* Centered Year Stepper */}
        <div className="glass rounded-[14px] p-1 flex items-center gap-1">
          <button
            onClick={() => setYear(rosterYear - 1)}
            disabled={rosterYear <= MIN_YEAR}
            className="size-[30px] rounded-[10px] bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] grid place-items-center text-[var(--sk-text-muted)] disabled:opacity-40"
            aria-label="سال قبل"
          >
            <ChevronRight size={15} />
          </button>
          <button
            onClick={() => {
              if (rosterYear !== today.jy) setYear(today.jy);
            }}
            className="h-[30px] px-3.5 rounded-full bg-[var(--sk-surface-strong)] border border-[var(--sk-border)] text-[14.5px] font-extrabold"
          >
            {toPersianDigits(rosterYear)}
          </button>
          <button
            onClick={() => setYear(rosterYear + 1)}
            disabled={rosterYear >= MAX_YEAR}
            className="size-[30px] rounded-[10px] bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] grid place-items-center text-[var(--sk-text-muted)] disabled:opacity-40"
            aria-label="سال بعد"
          >
            <ChevronLeft size={15} />
          </button>
        </div>

        {/* Image Export Button */}
        <button
          onClick={() => {
            haptic(hapticOn);
            setExportOpen(true);
          }}
          className="h-[34px] px-2.5 rounded-[11px] glass bg-[var(--sk-primary-soft)] border border-[var(--sk-primary)]/45 text-[var(--sk-primary)] text-[11.5px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
          aria-label="خروجی تصویر لوحه"
        >
          <ImageIcon size={14} />
          <span>تصویر</span>
        </button>
      </div>

      {/* Group Segmented Control: همه | شیفت A | شیفت B | شیفت C | شیفت D */}
      {pat.hasGroups ? (
        <div className="sk-seg overflow-x-auto sk-scroll">
          {groupFilters.map((g) => {
            const active = effectiveFilter === g;
            const label = g === "ALL" ? "همه" : getGroupTitle(g as ShiftGroup, pat);
            return (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`sk-seg-item !text-[11.5px] !min-h-9 px-2 whitespace-nowrap ${
                  active ? "is-active" : ""
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[14px] bg-[var(--sk-primary-soft)] border border-[var(--sk-primary)] py-2 text-center text-[12px] font-black text-[var(--sk-primary)]">
          لوحه سالانه — شیفت فردی (بدون گروه)
        </div>
      )}

      {/* 3 Sub-Modes when ALL is selected */}
      {effectiveFilter === "ALL" && pat.hasGroups && (
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: "CLASSIC_1405", fa: "لوحه کلاسیک" },
              { id: "OFFICIAL_LOHE", fa: "لوحه رسمی (نوبت‌ها)" },
              { id: "MATRIX_4", fa: "ماتریس ۴ شیفت" },
            ] as const
          ).map((m) => {
            const active = allMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  haptic(hapticOn);
                  setAllMode(m.id);
                }}
                className={`h-8 rounded-[11px] text-[10.5px] font-bold transition-all ${
                  active
                    ? "bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] border-[1.3px] border-[var(--sk-primary)]"
                    : "bg-[var(--sk-surface)] text-[var(--sk-text-muted)] border border-[var(--sk-border-soft)]"
                }`}
              >
                {m.fa}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      {effectiveFilter !== "ALL" || !pat.hasGroups ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
          {Array.from({ length: 12 }, (_, idx) => idx + 1).map((jm) => (
            <MonthBlock
              key={jm}
              jy={rosterYear}
              jm={jm}
              today={today}
              group={effectiveFilter as ShiftGroup}
              showEvents={showEvents}
              onClick={() => {
                haptic(hapticOn);
                onOpenMonth(rosterYear, jm);
              }}
            />
          ))}
        </div>
      ) : allMode === "CLASSIC_1405" ? (
        <Classic1405LoheView
          jy={rosterYear}
          today={today}
          showEvents={showEvents}
          onOpenMonth={(y, m) => {
            haptic(hapticOn);
            onOpenMonth(y, m);
          }}
        />
      ) : (
        <div className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {Array.from({ length: 12 }, (_, idx) => idx + 1).map((jm) => (
            <AllShiftsMonthBlock
              key={jm}
              jy={rosterYear}
              jm={jm}
              today={today}
              showEvents={showEvents}
              groups={activeGroups}
              mode={allMode}
              onClick={() => {
                haptic(hapticOn);
                onOpenMonth(rosterYear, jm);
              }}
            />
          ))}
        </div>
      )}

      <ExportImageDialog
        open={exportOpen}
        title={exportTitle}
        filename={`shiftkar-roster-${rosterYear}-${effectiveFilter}-${allMode.toLowerCase()}.png`}
        headerExtra={
          effectiveFilter === "ALL" && pat.hasGroups ? (
            <div className="sk-seg grid-cols-3">
              {(
                [
                  { id: "CLASSIC_1405", fa: "لوحه کلاسیک" },
                  { id: "OFFICIAL_LOHE", fa: "لوحه رسمی" },
                  { id: "MATRIX_4", fa: "ماتریس ۴ شیفت" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAllMode(m.id)}
                  className={`sk-seg-item !min-h-8 !text-[11px] ${
                    allMode === m.id ? "is-active" : ""
                  }`}
                >
                  {m.fa}
                </button>
              ))}
            </div>
          ) : undefined
        }
        renderCanvas={handleRenderPng}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

/* ================= 1. Single-Group MonthBlock (2-Column Grid) ================= */
function MonthBlock({
  jy,
  jm,
  today,
  group,
  showEvents,
  onClick,
}: {
  jy: number;
  jm: number;
  today: { jy: number; jm: number; jd: number };
  group: ShiftGroup;
  showEvents: boolean;
  onClick: () => void;
}) {
  const len = jalaaliMonthLength(jy, jm);
  const firstWd = jalaaliWeekday(jy, jm, 1);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start glass rounded-[18px] p-2 active:scale-[0.98] transition-transform"
    >
      <div className="text-center text-[11.5px] font-extrabold mb-1">
        {JALALI_MONTHS[jm - 1]} {toPersianDigits(jy)}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[7.5px] font-bold text-[var(--sk-text-faint)] mb-0.5">
        {WEEKDAY_SHORT.map((w, i) => (
          <span key={w} className={i === 6 ? "text-[var(--sk-text-muted)]" : ""}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[2px]">
        {Array.from({ length: firstWd }).map((_, i) => (
          <div key={`e${i}`} className="h-[17px]" />
        ))}
        {Array.from({ length: len }, (_, i) => i + 1).map((d) => {
          const key = makeDateKey(jy, jm, d);
          const code = getShiftCode(key, group);
          const kind = codeToKind(code);
          const isHol = showEvents && isHoliday(jy, jm, d);
          const isToday = today.jy === jy && today.jm === jm && today.jd === d;
          return (
            <span
              key={d}
              className={`h-[17px] rounded-[4px] text-[8px] font-bold grid place-items-center ${
                CELL_GRAD[isHol ? "HOLIDAY" : kind]
              } ${isToday ? "ring-1.5 ring-[var(--sk-primary)] font-black" : ""}`}
            >
              {toPersianDigits(d)}
            </span>
          );
        })}
      </div>
    </button>
  );
}

/* ================= 2. Classic 1405 4-Shift Chart (17 Columns × 32 Rows, matching RosterScreen.kt) ================= */
function Classic1405LoheView({
  jy,
  today,
  showEvents,
  onOpenMonth,
}: {
  jy: number;
  today: { jy: number; jm: number; jd: number };
  showEvents: boolean;
  onOpenMonth: (jy: number, jm: number) => void;
}) {
  const pat = getActivePattern();
  const hasEvening = (pat.eveningCount ?? 0) > 0;
  const rowsData = useMemo(() => buildClassic1405LoheData(jy, showEvents), [jy, showEvents]);

  const firstHalfMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور"];
  const secondHalfMonths = ["مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

  const grpCols = [
    {
      letter: "A",
      headCls: "bg-sky-500/45 text-sky-300 light:text-sky-800",
      cellCls: "bg-sky-400/22 text-sky-300 light:bg-sky-200/70 light:text-sky-900",
    },
    {
      letter: "B",
      headCls: "bg-amber-500/45 text-amber-300 light:text-amber-900",
      cellCls: "bg-amber-400/22 text-amber-300 light:bg-amber-200/70 light:text-amber-900",
    },
    {
      letter: "C",
      headCls: "bg-emerald-500/45 text-emerald-300 light:text-emerald-900",
      cellCls: "bg-emerald-400/22 text-emerald-300 light:bg-emerald-200/70 light:text-emerald-900",
    },
    {
      letter: "D",
      headCls: "bg-pink-500/45 text-pink-300 light:text-pink-900",
      cellCls: "bg-pink-400/22 text-pink-300 light:bg-pink-200/70 light:text-pink-900",
    },
  ];

  // Grid template: 6 left months (1fr each) + 4 center groups (1.22fr each) + 6 right months (1fr each)
  const gridCols =
    "repeat(6, minmax(0, 1fr)) repeat(4, minmax(0, 1.22fr)) repeat(6, minmax(0, 1fr))";

  return (
    <div className="space-y-2">
      {/* 1. Sleek Glassy Pill Title Header */}
      <div className="flex justify-center">
        <div className="glass rounded-full px-4 py-1.5 border border-[var(--sk-primary)]/50 inline-flex items-center gap-2">
          <span className="size-[22px] rounded-full bg-[var(--sk-primary)] text-white grid place-items-center">
            <RosterIcon size={12} />
          </span>
          <span className="text-[13px] font-black">
            لوحه نوبت‌کاری سال {toPersianDigits(jy)}
          </span>
        </div>
      </div>

      {/* 2. 16-Column × 32-Row Chart Card (LTR layout direction matching RosterScreen.kt) */}
      <div dir="ltr" className="glass rounded-[18px] p-1 border border-[var(--sk-border)]">
        {/* Header Row */}
        <div
          className="grid h-[58px] rounded-t-[13px] bg-[var(--sk-surface-strong)] border border-[var(--sk-border)] overflow-hidden"
          style={{ gridTemplateColumns: gridCols }}
        >
          {firstHalfMonths.map((mName, idx) => (
            <button
              key={`lh-${idx}`}
              type="button"
              onClick={() => onOpenMonth(jy, idx + 1)}
              className="h-full border-r border-[var(--sk-border-soft)] flex items-center justify-center overflow-hidden"
            >
              <span className="-rotate-90 whitespace-nowrap text-[8px] sm:text-[9.5px] font-extrabold">
                {mName}
              </span>
            </button>
          ))}

          {grpCols.map((g) => (
            <div
              key={g.letter}
              className={`h-full border-x border-[var(--sk-border)] flex items-center justify-center text-[10.5px] sm:text-[12px] font-black ${g.headCls}`}
            >
              {g.letter}
            </div>
          ))}

          {secondHalfMonths.map((mName, idx) => {
            const targetMonth = idx + 7;
            return (
              <button
                key={`rh-${idx}`}
                type="button"
                onClick={() => onOpenMonth(jy, targetMonth)}
                className="h-full border-l border-[var(--sk-border-soft)] flex items-center justify-center overflow-hidden"
              >
                <span className="-rotate-90 whitespace-nowrap text-[8px] sm:text-[9.5px] font-extrabold">
                  {mName}
                </span>
              </button>
            );
          })}
        </div>

        {/* 32 Cycle Rows */}
        <div>
          {rowsData.map((row, rIdx) => {
            const codes = [row.codeA, row.codeB, row.codeC, row.codeD];
            const thickBottom = rIdx % 2 === 1 && rIdx < rowsData.length - 1;
            return (
              <div
                key={row.rowIndex}
                className={`grid h-[20px] sm:h-[23px] ${
                  thickBottom
                    ? "border-b-[1.5px] border-[var(--sk-border)]"
                    : "border-b border-[var(--sk-border-soft)]"
                }`}
                style={{ gridTemplateColumns: gridCols }}
              >
                {/* Left 6 months (0..5) */}
                {Array.from({ length: 6 }, (_, mIdx) => {
                  const cell = row.monthCells[mIdx];
                  const isToday =
                    cell != null &&
                    today.jy === cell.jy &&
                    today.jm === cell.jm &&
                    today.jd === cell.day;
                  return (
                    <div
                      key={`lc-${mIdx}`}
                      className={`h-full border-r border-[var(--sk-border-soft)] grid place-items-center text-[8px] sm:text-[9.5px] font-bold ${
                        !cell
                          ? "bg-transparent"
                          : cell.isOfficialHoliday
                            ? "bg-[var(--sk-holiday)]/80 text-white font-black"
                            : cell.isFriday
                              ? "bg-[var(--sk-day)]/35 text-[var(--sk-day-ink)]"
                              : "bg-[var(--sk-surface)]"
                      } ${isToday ? "ring-1 ring-inset ring-[var(--sk-primary)]" : ""}`}
                    >
                      {cell ? toPersianDigits(cell.day) : ""}
                    </div>
                  );
                })}

                {/* Center 4 groups (A, B, C, D) */}
                {codes.map((code, gIdx) => (
                  <div
                    key={`gc-${gIdx}`}
                    className={`h-full border-x border-[var(--sk-border)] grid place-items-center text-[7.5px] sm:text-[9px] font-black ${grpCols[gIdx].cellCls}`}
                  >
                    {code}
                  </div>
                ))}

                {/* Right 6 months (6..11) */}
                {Array.from({ length: 6 }, (_, idx) => {
                  const mIdx = 6 + idx;
                  const cell = row.monthCells[mIdx];
                  const isToday =
                    cell != null &&
                    today.jy === cell.jy &&
                    today.jm === cell.jm &&
                    today.jd === cell.day;
                  return (
                    <div
                      key={`rc-${mIdx}`}
                      className={`h-full border-l border-[var(--sk-border-soft)] grid place-items-center text-[8px] sm:text-[9.5px] font-bold ${
                        !cell
                          ? "bg-transparent"
                          : cell.isOfficialHoliday
                            ? "bg-[var(--sk-holiday)]/80 text-white font-black"
                            : cell.isFriday
                              ? "bg-[var(--sk-day)]/35 text-[var(--sk-day-ink)]"
                              : "bg-[var(--sk-surface)]"
                      } ${isToday ? "ring-1 ring-inset ring-[var(--sk-primary)]" : ""}`}
                    >
                      {cell ? toPersianDigits(cell.day) : ""}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Glassy Legend Bar (matching RosterScreen.kt lines 833-856) */}
      <div className="glass rounded-[14px] px-3 py-2 flex flex-wrap items-center justify-evenly gap-2 text-[10px] font-bold">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-[var(--sk-holiday)]/80 inline-block" />
          تعطیل رسمی
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-[var(--sk-day)]/35 border border-[var(--sk-day-ink)] inline-block" />
          جمعه
        </span>
        <span className="text-[var(--sk-text-muted)]">
          {hasEvening
            ? "M: صبح‌کار · E: عصرکار · N: شب‌کار · R: استراحت"
            : "M: صبح‌کار · N: شب‌کار · R: استراحت"}
        </span>
      </div>
    </div>
  );
}

/* ================= 3. Official Role Lohe & 4-Shift Matrix (Two 16-Day Half Strips per Month) ================= */
interface AllShiftsDayCell {
  d: number;
  isOfficialHoliday: boolean;
  isFriday: boolean;
  isToday: boolean;
  dayGroup: string;
  eveningGroup: string;
  nightGroup: string;
  restGroups: string;
  groupKinds: Record<ShiftGroup, ShiftKind>;
}

function AllShiftsMonthBlock({
  jy,
  jm,
  today,
  showEvents,
  groups,
  mode,
  onClick,
}: {
  jy: number;
  jm: number;
  today: { jy: number; jm: number; jd: number };
  showEvents: boolean;
  groups: ShiftGroup[];
  mode: "OFFICIAL_LOHE" | "MATRIX_4";
  onClick: () => void;
}) {
  const pat = getActivePattern();
  const days = useMemo(() => {
    const len = jalaaliMonthLength(jy, jm);
    const firstWd = jalaaliWeekday(jy, jm, 1);
    const out: AllShiftsDayCell[] = [];
    for (let d = 1; d <= len; d++) {
      const key = makeDateKey(jy, jm, d);
      const allCodes = getAllGroupsForDate(key);
      const kinds = {} as Record<ShiftGroup, ShiftKind>;
      for (const g of groups) kinds[g] = codeToKind(allCodes[g]);
      const dayG =
        groups
          .filter((g) => kinds[g] === "DAY")
          .map((g) => getGroupLetter(g, pat))
          .join("") || "-";
      const eveG =
        groups
          .filter((g) => kinds[g] === "EVENING")
          .map((g) => getGroupLetter(g, pat))
          .join("") || "-";
      const nightG =
        groups
          .filter((g) => kinds[g] === "NIGHT")
          .map((g) => getGroupLetter(g, pat))
          .join("") || "-";
      const restG =
        groups
          .filter((g) => kinds[g] === "REST")
          .map((g) => getGroupLetter(g, pat))
          .join("") || "-";
      out.push({
        d,
        isOfficialHoliday: showEvents && isHoliday(jy, jm, d),
        isFriday: (firstWd + d - 1) % 7 === 6,
        isToday: today.jy === jy && today.jm === jm && today.jd === d,
        dayGroup: dayG,
        eveningGroup: eveG,
        nightGroup: nightG,
        restGroups: restG,
        groupKinds: kinds,
      });
    }
    return out;
  }, [jy, jm, today, showEvents, groups, pat]);

  const tier1 = days.slice(0, 16);
  const tier2 = days.slice(16);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start glass rounded-[18px] p-2.5 space-y-1.5 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-black">
          {JALALI_MONTHS[jm - 1]} {toPersianDigits(jy)}
        </span>
        <span className="text-[9.5px] font-bold text-[var(--sk-primary)]">
          برای مشاهده در تقویم لمس کنید ‹
        </span>
      </div>
      <AllShiftsHalfStrip tier={tier1} groups={groups} mode={mode} />
      <AllShiftsHalfStrip tier={tier2} groups={groups} mode={mode} />
    </button>
  );
}

function AllShiftsHalfStrip({
  tier,
  groups,
  mode,
}: {
  tier: AllShiftsDayCell[];
  groups: ShiftGroup[];
  mode: "OFFICIAL_LOHE" | "MATRIX_4";
}) {
  const pat = getActivePattern();
  const hasEvening = pat.eveningCount > 0;
  const slots = 16;
  const gridCols = "40px repeat(16, minmax(0, 1fr))";

  return (
    <div className="space-y-0.5">
      {/* 1. Day Number Row */}
      <div className="grid gap-[2px] items-center" style={{ gridTemplateColumns: gridCols }}>
        <span className="h-4 rounded-[4px] bg-[var(--sk-surface-strong)] text-[var(--sk-text-muted)] text-[7px] font-extrabold grid place-items-center">
          تاریخ
        </span>
        {Array.from({ length: slots }, (_, i) => {
          const cell = tier[i];
          if (!cell) return <span key={i} className="h-4" />;
          return (
            <span
              key={cell.d}
              className={`h-4 rounded-[4px] text-[7.5px] font-bold grid place-items-center ${
                cell.isOfficialHoliday
                  ? "sk-grad-holiday"
                  : cell.isFriday
                    ? "bg-[var(--sk-surface)] text-[var(--sk-text-muted)]"
                    : "bg-[var(--sk-surface-strong)]"
              } ${cell.isToday ? "ring-1 ring-[var(--sk-primary)] font-black" : ""}`}
            >
              {toPersianDigits(cell.d)}
            </span>
          );
        })}
      </div>

      {mode === "OFFICIAL_LOHE" ? (
        <>
          {(
            [
              { label: "صبح‌کار", cls: "sk-grad-day", pick: (c: AllShiftsDayCell) => c.dayGroup },
              ...(hasEvening
                ? [
                    {
                      label: "عصرکار",
                      cls: "sk-grad-evening",
                      pick: (c: AllShiftsDayCell) => c.eveningGroup,
                    },
                  ]
                : []),
              { label: "شب‌کار", cls: "sk-grad-night", pick: (c: AllShiftsDayCell) => c.nightGroup },
              { label: "استراحت", cls: "sk-grad-rest", pick: (c: AllShiftsDayCell) => c.restGroups },
            ] as const
          ).map((r) => (
            <div
              key={r.label}
              className="grid gap-[2px] items-center"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span
                className={`h-4 rounded-[4px] text-[6.8px] font-extrabold grid place-items-center ${r.cls}`}
              >
                {r.label}
              </span>
              {Array.from({ length: slots }, (_, i) => {
                const cell = tier[i];
                if (!cell) return <span key={i} className="h-4" />;
                const txt = r.pick(cell);
                return (
                  <span
                    key={cell.d}
                    className={`h-4 rounded-[4px] font-black grid place-items-center ${
                      txt.length > 1 ? "text-[6.8px]" : "text-[7.8px]"
                    } ${r.cls}`}
                  >
                    {txt}
                  </span>
                );
              })}
            </div>
          ))}
        </>
      ) : (
        <>
          {groups.map((g) => (
            <div
              key={g}
              className="grid gap-[2px] items-center"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span className="h-[15px] rounded-[4px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] text-[7px] font-extrabold grid place-items-center">
                {getGroupLetter(g, pat)}
              </span>
              {Array.from({ length: slots }, (_, i) => {
                const cell = tier[i];
                if (!cell) return <span key={i} className="h-[15px]" />;
                const k = cell.groupKinds[g] ?? "REST";
                const shortFa =
                  k === "DAY" ? "ص" : k === "EVENING" ? "ع" : k === "NIGHT" ? "ش" : "ا";
                return (
                  <span
                    key={`${g}-${cell.d}`}
                    className={`h-[15px] rounded-[4px] text-[7px] font-black grid place-items-center ${CELL_GRAD[k]}`}
                  >
                    {shortFa}
                  </span>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
