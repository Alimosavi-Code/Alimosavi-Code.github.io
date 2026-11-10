"use client";
/**
 * Calendar view — 100% parity with Android `CalendarScreen.kt`:
 *  - Portrait layout: Elastic viewport-fitting `GridView` + `MonthlySummaryStrip`.
 *  - Mobile Landscape layout: Unified vertical scroll with 2-column top header (`TodayBanner` + `MonthNav` side-by-side)
 *    and guaranteed full-height calendar cells (`min-height: 292px`) and full-width table.
 *  - `TableView` & `TableFullscreen`:
 *    - Month swipe (`onTouchStart`/`onTouchEnd`/`onWheel`) is strictly DISABLED in `table` mode.
 *    - Fits 100% of screen width (`w-full table-fixed`) with zero horizontal overflow needed.
 *    - Every row (`<tr>`) has a strict, uniform fixed height (`h-[46px]`) with single-line `truncate`
 *      so no row (like Fridays or multi-occasion days) ever stretches taller than other rows.
 *    - Strictly respects `filterGroup`: shows ONLY the selected group's shift when `A`/`B`/`C`/`D` is active,
 *      and shows all groups (`A۱ B۲ C۱ D۲`) only when `همه` (`ALL`) is active.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  JALALI_MONTHS,
  HIJRI_MONTHS,
  GREGORIAN_MONTHS,
  WEEKDAYS,
  jalaaliMonthLength,
  jalaaliWeekday,
  todayJalaali,
  makeDateKey,
  toPersianDigits,
  toGregorian,
  formatJalali,
  formatWeekday,
} from "@/lib/jalali";
import { gregorianToJdn, jdnToIslamic } from "@/lib/islamic-calendar";
import {
  calculateShift,
  calculateAllShifts,
  getActivePattern,
  getActiveGroups,
  getActiveGroupFilters,
  getGroupLetter,
  type ShiftGroup,
  type ShiftCode,
} from "@/lib/shift-engine";
import { getDayEvents } from "@/lib/holidays";
import {
  CODE_FA,
  CODE_NUM_FA,
  SHIFT_KIND_FA,
  codeToKind,
  shiftCodeIndex,
  type GroupFilter,
  type ShiftKind,
} from "@/lib/models";
import { useShiftKar, haptic, type DayWorkRecord, type ViewType } from "@/lib/store";
import { listNotes } from "@/lib/notes-store";
import { renderMonthGridCanvas, renderMonthTableCanvas } from "@/lib/image-exporter";
import { ExportImageDialog } from "./export-dialog";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  CalendarIcon,
  TableIcon,
  GridIcon,
  NotesIcon,
  SunIcon,
  SunsetIcon,
  MoonIcon,
  RestIcon,
  HolidayIcon,
  ExpandIcon,
  CollapseIcon,
  InfoIcon,
  ImageIcon,
} from "./icons";

const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const KIND_GRAD: Record<ShiftKind, string> = {
  DAY: "sk-grad-day",
  EVENING: "sk-grad-evening",
  NIGHT: "sk-grad-night",
  REST: "sk-grad-rest",
};

const KIND_ICON_SM: Record<ShiftKind, React.ReactNode> = {
  DAY: <SunIcon size={11} />,
  EVENING: <SunsetIcon size={11} />,
  NIGHT: <MoonIcon size={11} />,
  REST: <RestIcon size={11} />,
};

const KIND_ICON_MD: Record<ShiftKind, React.ReactNode> = {
  DAY: <SunIcon size={15} />,
  EVENING: <SunsetIcon size={15} />,
  NIGHT: <MoonIcon size={15} />,
  REST: <RestIcon size={15} />,
};

/** Mini group badge for TableView when filterGroup === "ALL". */
function MiniBadge({
  label,
  code,
  kindOverride,
}: {
  label: string;
  code: ShiftCode;
  kindOverride?: ShiftKind | null;
}) {
  const kind = kindOverride ?? codeToKind(code);
  const ord = toPersianDigits(shiftCodeIndex(code));
  return (
    <span
      className={`mini-badge inline-flex items-center justify-center w-[22px] h-[18px] rounded-[5px] text-[8.5px] font-black leading-none shrink-0 ${KIND_GRAD[kind]}`}
      title={`شیفت ${label}: ${CODE_FA[code]}`}
    >
      {label}
      {ord}
    </span>
  );
}

/**
 * GroupNumBadge — matches `GroupNumBadge` in `Glass.kt` lines 163-187:
 * Displays `${group.faLetter()}${ord}` (e.g. `A۱`, `B۲`) inside `همه` calendar cells.
 */
function GroupNumBadge({ label, code }: { label: string; code: ShiftCode }) {
  const kind = codeToKind(code);
  const ord = toPersianDigits(shiftCodeIndex(code));
  return (
    <span
      className={`inline-flex items-center justify-center w-[20px] h-[13.5px] sm:w-[23px] sm:h-[15.5px] rounded-[5px] text-[7.5px] sm:text-[8.5px] font-black leading-none ${KIND_GRAD[kind]}`}
      title={`شیفت ${label}: ${CODE_FA[code]}`}
    >
      {label}
      {ord}
    </span>
  );
}

function ShiftDayOrdinalBadge({
  kind,
  ordinal,
  swapped,
}: {
  kind: ShiftKind;
  ordinal: number;
  swapped: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-[2px] h-[20px] sm:h-[22px] px-1.5 sm:px-2 rounded-[7px] border border-current/35 text-[9.5px] sm:text-[10.5px] font-black leading-none ${KIND_GRAD[kind]}`}
    >
      {KIND_ICON_SM[kind]}
      <span>{swapped ? "*" : toPersianDigits(ordinal)}</span>
    </span>
  );
}

let todayChipSessionStarted = false;
let todayChipSessionCollapsed = false;
let offCurrentMonthCount = 0;

export function CalendarView({
  onOpenDay,
  onOpenNotes,
  onOpenMonthPicker,
  notesRefresh = 0,
}: {
  onOpenDay: (dateKey: string) => void;
  onOpenNotes: () => void;
  onOpenMonthPicker: () => void;
  notesRefresh?: number;
}) {
  const viewYear = useShiftKar((s) => s.viewYear);
  const viewMonth = useShiftKar((s) => s.viewMonth);
  const viewType = useShiftKar((s) => s.viewType);
  const filterGroup = useShiftKar((s) => s.filterGroup);
  const myGroup = useShiftKar((s) => s.myGroup);
  const selectedDateKey = useShiftKar((s) => s.selectedDateKey);
  const showEvents = useShiftKar((s) => s.showEvents);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const dayRecords = useShiftKar((s) => s.dayRecords);
  const activePatternId = useShiftKar((s) => s.activePatternId);
  const customPatterns = useShiftKar((s) => s.customPatterns);
  const employees = useShiftKar((s) => s.employees);
  const showEmployeesOnCalendar = useShiftKar((s) => s.showEmployeesOnCalendar);
  const calendarSyncRev = useShiftKar((s) => s.calendarSyncRev);
  const set = useShiftKar((s) => s.set);

  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [dir, setDir] = useState<1 | -1>(1);
  const [chipCollapsed, setChipCollapsed] = useState(todayChipSessionCollapsed);
  const [tableFs, setTableFs] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ViewType>(viewType);
  const [compareGroup, setCompareGroup] = useState<ShiftGroup | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const pat = useMemo(() => getActivePattern(), [activePatternId, customPatterns]);
  const activeGroups = useMemo(() => getActiveGroups(pat), [pat]);
  const groupFilters = useMemo(() => getActiveGroupFilters(pat), [pat]);
  const effectiveFilterGroup: GroupFilter = !pat.hasGroups ? "A" : filterGroup;

  useEffect(() => {
    set({ isTableFullscreen: tableFs });
    return () => set({ isTableFullscreen: false });
  }, [tableFs, set]);

  const today = useMemo(() => todayJalaali(), []);
  const todayKey = makeDateKey(today.jy, today.jm, today.jd);
  const isCurrentMonth = viewYear === today.jy && viewMonth === today.jm;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listNotes({ jy: viewYear, jm: viewMonth });
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const n of rows) map.set(n.dateKey, n.text);
        setNotes(map);
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth, notesRefresh]);

  useEffect(() => {
    if (isCurrentMonth) {
      todayChipSessionStarted = false;
      todayChipSessionCollapsed = false;
      offCurrentMonthCount = 0;
    }
  }, [isCurrentMonth]);

  const goMonth = useCallback(
    (delta: 1 | -1) => {
      haptic(hapticOn);
      setDir(delta);
      let y = viewYear;
      let m = viewMonth + delta;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      set({ viewYear: y, viewMonth: m });
    },
    [viewYear, viewMonth, set, hapticOn],
  );

  const goToday = useCallback(() => {
    haptic(hapticOn);
    setDir(today.jy * 12 + today.jm > viewYear * 12 + viewMonth ? 1 : -1);
    set({ viewYear: today.jy, viewMonth: today.jm, selectedDateKey: todayKey });
  }, [today, viewYear, viewMonth, todayKey, set, hapticOn]);

  useEffect(() => {
    if (isCurrentMonth) return;
    if (chipCollapsed) return;
    offCurrentMonthCount += 1;
    const hold = todayChipSessionStarted ? 900 : 2400;
    todayChipSessionStarted = true;
    const t = setTimeout(() => {
      setChipCollapsed(true);
      todayChipSessionCollapsed = true;
    }, offCurrentMonthCount <= 1 ? hold : 900);
    return () => clearTimeout(t);
  }, [isCurrentMonth, viewYear, viewMonth, chipCollapsed]);

  const ignoreClickUntilRef = useRef(0);
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const wheelLockUntilRef = useRef(0);

  const openDay = useCallback(
    (key: string) => {
      if (Date.now() < ignoreClickUntilRef.current) return;
      set({ selectedDateKey: key });
      onOpenDay(key);
    },
    [set, onOpenDay],
  );

  const monthLen = jalaaliMonthLength(viewYear, viewMonth);
  const firstWeekday = jalaaliWeekday(viewYear, viewMonth, 1);

  const dayInfo = useMemo(() => {
    void calendarSyncRev;
    const info: DayInfo[] = [];
    const targetGroup: ShiftGroup =
      effectiveFilterGroup === "ALL" ? myGroup : (effectiveFilterGroup as ShiftGroup);

    for (let d = 1; d <= monthLen; d++) {
      const key = makeDateKey(viewYear, viewMonth, d);
      const events = showEvents ? getDayEvents(viewYear, viewMonth, d) : [];
      const all = calculateAllShifts(key).map((s) => ({
        group: s.group,
        label: getGroupLetter(s.group, pat),
        code: s.code,
      }));
      const rec = dayRecords[key];
      const myCode = all.find((s) => s.group === targetGroup)?.code ?? all[0]?.code ?? "M1";
      const myEffKind =
        targetGroup === myGroup && rec?.swapKind ? rec.swapKind : codeToKind(myCode);

      const isSharedRest =
        compareGroup !== null &&
        myEffKind === "REST" &&
        codeToKind(all.find((x) => x.group === compareGroup)?.code ?? "M1") === "REST";

      let hasColleagueSharedRest = false;
      const colleagueSummary =
        showEmployeesOnCalendar && employees.length > 0
          ? employees
              .map((emp) => {
                const log = emp.dayLogs?.[key];
                const empCode = calculateShift(key, emp.group).code;
                const eKind: ShiftKind | null =
                  !log || log.status === "AS_SCHEDULED"
                    ? codeToKind(empCode)
                    : log.status === "LEAVE"
                      ? null
                      : log.status;
                if (myEffKind === "REST" && (eKind === "REST" || log?.status === "LEAVE")) {
                  hasColleagueSharedRest = true;
                }
                const stFa = eKind ? SHIFT_KIND_FA[eKind] : "مرخصی";
                return `${emp.name}: ${stFa}`;
              })
              .join(" · ")
          : "";

      const gDate = toGregorian(viewYear, viewMonth, d);
      const hDate = jdnToIslamic(gregorianToJdn(gDate.gy, gDate.gm, gDate.gd));
      const subDateText = `${toPersianDigits(hDate.hd)} ${HIJRI_MONTHS[hDate.hm - 1]} • ${toPersianDigits(gDate.gd)} ${GREGORIAN_MONTHS[gDate.gm - 1]}`;

      info.push({
        d,
        key,
        holiday: events.some((e) => e.isHoliday),
        holidayNames: events.filter((e) => e.isHoliday).map((e) => e.title),
        occasions: events.filter((e) => !e.isHoliday).map((e) => e.title),
        isToday: key === todayKey,
        isFriday: jalaaliWeekday(viewYear, viewMonth, d) === 6,
        weekday: jalaaliWeekday(viewYear, viewMonth, d),
        label: `${formatWeekday(viewYear, viewMonth, d)} ${formatJalali(viewYear, viewMonth, d)}`,
        subDateText,
        note: notes.get(key),
        record: rec,
        all,
        isSharedRest,
        hasColleagueSharedRest,
        colleagueSummary,
      });
    }
    return info;
  }, [
    viewYear,
    viewMonth,
    monthLen,
    todayKey,
    notes,
    showEvents,
    dayRecords,
    effectiveFilterGroup,
    myGroup,
    pat,
    compareGroup,
    showEmployeesOnCalendar,
    employees,
    calendarSyncRev,
  ]);

  /* Touch Swipe + Horizontal Wheel Month Navigation — ONLY active in GridView (`viewType === "grid"`),
   * strictly disabled in `TableView` (`viewType === "table"`). */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (viewType !== "grid") return;
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      touchStateRef.current = { startX: x, startY: y, lastX: x, lastY: y };
    },
    [viewType],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (viewType !== "grid") return;
      if (!touchStateRef.current || e.touches.length !== 1) return;
      touchStateRef.current.lastX = e.touches[0].clientX;
      touchStateRef.current.lastY = e.touches[0].clientY;
    },
    [viewType],
  );

  const handleTouchFinish = useCallback(
    (e: React.TouchEvent) => {
      if (viewType !== "grid") {
        touchStateRef.current = null;
        return;
      }
      const st = touchStateRef.current;
      touchStateRef.current = null;
      if (!st) return;
      const endX = e.changedTouches?.[0]?.clientX ?? st.lastX;
      const endY = e.changedTouches?.[0]?.clientY ?? st.lastY;
      const dx = endX - st.startX;
      const dy = endY - st.startY;
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        ignoreClickUntilRef.current = Date.now() + 450;
        goMonth(dx > 0 ? 1 : -1);
      }
    },
    [goMonth, viewType],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (viewType !== "grid") return;
      const dx = e.deltaX;
      const dy = e.deltaY;
      if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const now = Date.now();
      if (now < wheelLockUntilRef.current) return;
      wheelLockUntilRef.current = now + 350;
      goMonth(dx > 0 ? 1 : -1);
    },
    [goMonth, viewType],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      goMonth(1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      goMonth(-1);
      e.preventDefault();
    }
  };

  const setFilter = (g: GroupFilter) => {
    haptic(hapticOn);
    if (g === "ALL") {
      set({ filterGroup: "ALL" });
    } else {
      if (compareGroup === (g as ShiftGroup)) setCompareGroup(null);
      set({ filterGroup: g, myGroup: g as ShiftGroup });
    }
  };

  const toggleCompare = (g: ShiftGroup) => {
    haptic(hapticOn, 18);
    const baseG: ShiftGroup =
      effectiveFilterGroup === "ALL" ? myGroup : (effectiveFilterGroup as ShiftGroup);
    if (compareGroup === g || g === baseG) {
      setCompareGroup(null);
      toast("حالت مقایسهٔ دو شیفت غیرفعال شد");
    } else {
      setCompareGroup(g);
      toast(
        `مقایسه استراحت مشترک: شیفت ${getGroupLetter(baseG, pat)} و شیفت ${getGroupLetter(g, pat)}`,
      );
    }
  };

  const handleRenderMonthPng = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    return exportMode === "grid"
      ? renderMonthGridCanvas(viewYear, viewMonth, effectiveFilterGroup, isDark, dayRecords)
      : renderMonthTableCanvas(viewYear, viewMonth, effectiveFilterGroup, isDark, dayRecords);
  }, [exportMode, viewYear, viewMonth, effectiveFilterGroup, dayRecords]);

  const animClass = dir === 1 ? "sk-anim-next" : "sk-anim-prev";
  const summaryGroup: ShiftGroup =
    effectiveFilterGroup === "ALL" ? myGroup : (effectiveFilterGroup as ShiftGroup);

  return (
    <div
      className="sk-cal-root flex h-full flex-col gap-1.5 sm:gap-2 px-3.5 md:px-6 pt-2.5 overflow-hidden"
      onKeyDown={onKeyDown}
    >
      {/* ============ Top Pair (Stacked in Portrait, 2-Column Side-by-Side in Mobile Landscape) ============ */}
      <div className="sk-cal-top-pair flex flex-col gap-1.5 sm:gap-2 shrink-0">
        {/* Today banner */}
        <TodayBanner
          todayKey={todayKey}
          filterGroup={effectiveFilterGroup}
          myGroup={myGroup}
          activeGroups={activeGroups}
          dayRecord={dayRecords[todayKey]}
          onOpenDay={openDay}
        />

        {/* Month navigation row */}
        <div
          className="glass rounded-[16px] p-[5px] flex items-center gap-1 shrink-0"
          data-tour="month-nav"
        >
          <button
            onClick={() => goMonth(-1)}
            className="sk-sheet-btn !size-10 !rounded-[12px] shrink-0"
            aria-label="ماه قبل"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={onOpenNotes}
            className="sk-sheet-btn !size-10 !rounded-[12px] shrink-0"
            aria-label="همه یادداشت‌ها"
            data-tour="notes-btn"
          >
            <NotesIcon size={18} />
          </button>
          <button
            onClick={onOpenMonthPicker}
            className="sk-title-btn"
            aria-label="انتخاب ماه و سال"
          >
            <span className="truncate">
              {JALALI_MONTHS[viewMonth - 1]} {toPersianDigits(viewYear)}
            </span>
            <span className="sk-title-caret">
              <ChevronDown size={15} />
            </span>
          </button>
          <button
            onClick={() => {
              haptic(hapticOn);
              set({ viewType: viewType === "grid" ? "table" : "grid" });
            }}
            className="sk-sheet-btn !size-10 shrink-0"
            data-tour="view-toggle"
            aria-label={viewType === "grid" ? "تغییر به نمای جدولی" : "تغییر به نمای تقویم"}
            title={viewType === "grid" ? "نمای جدولی" : "نمای تقویم"}
          >
            {viewType === "grid" ? <TableIcon size={16} /> : <GridIcon size={16} />}
          </button>
          <button
            onClick={() => goMonth(1)}
            className="sk-sheet-btn !size-10 shrink-0"
            aria-label="ماه بعد"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {/* ============ Filter chips + PNG Export + Fullscreen + Today chip ============ */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto sk-scroll pb-0.5 shrink-0"
        data-tour="group-filter"
      >
        {!pat.hasGroups ? (
          <span className="shrink-0 h-9 px-3 rounded-full bg-[var(--sk-surface-strong)] text-[var(--sk-primary)] shadow-[inset_0_0_0_1.5px_var(--sk-primary)] text-[12px] font-bold inline-flex items-center">
            شیفت فردی (بدون گروه)
          </span>
        ) : (
          groupFilters.map((g) => {
            const active = effectiveFilterGroup === g;
            const isCompared = g !== "ALL" && compareGroup === (g as ShiftGroup);
            const label = g === "ALL" ? "همه" : getGroupLetter(g as ShiftGroup, pat);
            return (
              <button
                key={g}
                onClick={() => setFilter(g)}
                onContextMenu={(e) => {
                  if (g !== "ALL") {
                    e.preventDefault();
                    toggleCompare(g as ShiftGroup);
                  }
                }}
                className={`shrink-0 min-w-10 h-9 px-2.5 rounded-full text-[13px] font-bold transition-all ${
                  active
                    ? "bg-[var(--sk-surface-strong)] text-[var(--sk-primary)] shadow-[inset_0_0_0_1.5px_var(--sk-primary)]"
                    : isCompared
                      ? "bg-[var(--sk-rest-soft)] text-[var(--sk-rest-ink)] shadow-[inset_0_0_0_1.5px_var(--sk-rest-ink)]"
                      : "glass text-[var(--sk-text-muted)] hover:text-[var(--sk-primary)]"
                }`}
                aria-pressed={active}
                title={
                  g === "ALL"
                    ? "نمایش همه گروه‌ها"
                    : `شیفت ${label} (نگه‌داشتن یا کلیک راست برای مقایسه استراحت مشترک)`
                }
              >
                {label}
              </button>
            );
          })
        )}
        <div className="flex-1 min-w-1" />
        <button
          onClick={() => {
            haptic(hapticOn);
            setExportMode(viewType);
            setExportOpen(true);
          }}
          className="shrink-0 size-9 rounded-full glass grid place-items-center text-[var(--sk-primary)]"
          title="خروجی تصویر ماه"
          aria-label="خروجی تصویر ماه"
        >
          <ImageIcon size={15} />
        </button>
        {viewType === "table" && (
          <button
            onClick={() => setTableFs(true)}
            className="shrink-0 size-9 rounded-full glass grid place-items-center text-[var(--sk-primary)]"
            aria-label="جدول تمام‌صفحه"
          >
            <ExpandIcon size={16} />
          </button>
        )}
        {!isCurrentMonth && (
          <button
            onClick={goToday}
            className={`shrink-0 h-9 rounded-full glass text-[13px] font-semibold text-[var(--sk-primary)] flex items-center gap-1.5 transition-all duration-300 overflow-hidden ${
              chipCollapsed ? "w-9 px-0 justify-center" : "px-3.5"
            }`}
            data-tour="today-chip"
            title="برو به امروز"
            aria-label="رفتن به امروز"
          >
            <CalendarIcon size={15} className="shrink-0" />
            {!chipCollapsed && <span className="whitespace-nowrap">امروز</span>}
          </button>
        )}
      </div>

      {/* ============ Legend (grid + ALL) ============ */}
      {viewType === "grid" && effectiveFilterGroup === "ALL" && (
        <div
          className="flex items-center gap-3.5 px-1 flex-wrap shrink-0 leading-none"
          aria-label="راهنمای شیفت‌ها"
        >
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
            <span className="size-2 rounded-full bg-[var(--sk-day)]" />
            صبح‌کار
          </span>
          {pat.eveningCount > 0 && (
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-evening)]" />
              عصرکار
            </span>
          )}
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
            <span className="size-2 rounded-full bg-[var(--sk-night)]" />
            شب‌کار
          </span>
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
            <span className="size-2 rounded-full bg-[var(--sk-rest)]" />
            استراحت
          </span>
        </div>
      )}

      {/* ============ Body (Swipe enabled ONLY in `grid` mode; disabled in `table` mode!) ============ */}
      <div
        ref={bodyRef}
        onTouchStart={viewType === "grid" ? handleTouchStart : undefined}
        onTouchMove={viewType === "grid" ? handleTouchMove : undefined}
        onTouchEnd={viewType === "grid" ? handleTouchFinish : undefined}
        onTouchCancel={viewType === "grid" ? handleTouchFinish : undefined}
        onWheel={viewType === "grid" ? handleWheel : undefined}
        style={{ touchAction: viewType === "table" ? "pan-x pan-y" : "pan-y" }}
        className={`sk-cal-body flex-1 min-h-0 ${
          viewType === "grid"
            ? "flex flex-col overflow-hidden pb-[calc(env(safe-area-inset-bottom)+72px)]"
            : "overflow-y-auto sk-scroll overscroll-contain pb-[calc(env(safe-area-inset-bottom)+90px)]"
        }`}
      >
        <div
          key={`${viewYear}-${viewMonth}-${viewType}`}
          className={`${animClass} ${
            viewType === "grid" ? "flex-1 min-h-0 flex flex-col gap-1.5" : ""
          }`}
        >
          {viewType === "grid" ? (
            <>
              <GridView
                dayInfo={dayInfo}
                firstWeekday={firstWeekday}
                filterGroup={effectiveFilterGroup}
                myGroup={myGroup}
                selectedDateKey={selectedDateKey}
                onOpenDay={openDay}
              />
              <MonthlySummaryStrip
                dayInfo={dayInfo}
                effGroup={summaryGroup}
                myGroup={myGroup}
                compareGroup={compareGroup}
              />
            </>
          ) : (
            <TableView
              dayInfo={dayInfo}
              filterGroup={effectiveFilterGroup}
              myGroup={myGroup}
              onOpenDay={openDay}
            />
          )}
        </div>
      </div>

      {/* ============ Fullscreen table ============ */}
      {tableFs && (
        <TableFullscreen
          viewYear={viewYear}
          viewMonth={viewMonth}
          dayInfo={dayInfo}
          filterGroup={effectiveFilterGroup}
          myGroup={myGroup}
          isCurrentMonth={isCurrentMonth}
          onGoMonth={goMonth}
          onGoToday={goToday}
          onOpenDay={openDay}
          onOpenPicker={onOpenMonthPicker}
          onExportMonth={() => {
            setExportMode("table");
            setExportOpen(true);
          }}
          onClose={() => setTableFs(false)}
        />
      )}

      <ExportImageDialog
        open={exportOpen}
        title={`تصویر ${exportMode === "grid" ? "تقویم" : "جدول"} ${JALALI_MONTHS[viewMonth - 1]} ${toPersianDigits(viewYear)}`}
        filename={`shiftkar-month-${viewYear}-${String(viewMonth).padStart(2, "0")}-${effectiveFilterGroup}-${exportMode}.png`}
        headerExtra={
          <div className="sk-seg grid-cols-2">
            <button
              type="button"
              onClick={() => setExportMode("grid")}
              className={`sk-seg-item !min-h-9 !text-[12px] ${exportMode === "grid" ? "is-active" : ""}`}
            >
              قالب تقویم
            </button>
            <button
              type="button"
              onClick={() => setExportMode("table")}
              className={`sk-seg-item !min-h-9 !text-[12px] ${exportMode === "table" ? "is-active" : ""}`}
            >
              قالب جدولی
            </button>
          </div>
        }
        renderCanvas={handleRenderMonthPng}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

/* ================= Today banner (Single-Group & 4-Group AllTodayBanner) ================= */
function TodayBanner({
  todayKey,
  filterGroup,
  myGroup,
  activeGroups,
  dayRecord,
  onOpenDay,
}: {
  todayKey: string;
  filterGroup: GroupFilter;
  myGroup: ShiftGroup;
  activeGroups: ShiftGroup[];
  dayRecord?: DayWorkRecord;
  onOpenDay: (k: string) => void;
}) {
  const today = todayJalaali();
  const pat = getActivePattern();
  const weekday = formatWeekday(today.jy, today.jm, today.jd);
  const dateLine = `${weekday} ${toPersianDigits(today.jd)} ${JALALI_MONTHS[today.jm - 1]}`;

  if (filterGroup === "ALL") {
    return (
      <div
        onClick={() => onOpenDay(todayKey)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpenDay(todayKey);
        }}
        className="glass rounded-2xl px-3 py-2 flex flex-col gap-1.5 cursor-pointer hover:bg-[var(--sk-primary-soft)]/30 transition-colors shrink-0"
        data-tour="today-banner"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-[24px] rounded-[8px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center">
              <CalendarIcon size={13} />
            </span>
            <span className="text-[13px] font-extrabold">شیفت امروز</span>
          </div>
          <span className="text-[10.5px] text-[var(--sk-text-muted)]">{dateLine}</span>
        </div>
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${Math.min(4, activeGroups.length)}, minmax(0, 1fr))`,
          }}
        >
          {activeGroups.slice(0, 4).map((g) => {
            const s = calculateShift(todayKey, g);
            return (
              <div
                key={g}
                className={`rounded-[12px] py-1.5 px-1 flex flex-col items-center gap-0.5 ${KIND_GRAD[s.type]}`}
              >
                <span className="text-[9.5px] font-black leading-none">
                  {getGroupLetter(g, pat)}
                </span>
                {KIND_ICON_SM[s.type]}
                <span className="text-[8.5px] font-bold leading-none truncate max-w-full">
                  {CODE_NUM_FA[s.code]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const g = (filterGroup === "ALL" ? myGroup : filterGroup) as ShiftGroup;
  const shift = calculateShift(todayKey, g);
  const isMine = g === myGroup;
  const swapped = isMine ? dayRecord?.swapKind : null;
  const ot = isMine ? (dayRecord?.overtimeHours ?? 0) : 0;
  const effKind = swapped ?? shift.type;
  const label = `${swapped ? `جابه‌جایی: ${SHIFT_KIND_FA[swapped]}` : CODE_FA[shift.code]}${
    ot > 0 ? ` (+${toPersianDigits(ot)}س)` : ""
  }`;

  return (
    <button
      onClick={() => onOpenDay(todayKey)}
      className="glass rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 w-full text-start hover:bg-[var(--sk-primary-soft)]/40 transition-colors shrink-0"
      data-tour="today-banner"
      aria-label={`شیفت امروز — ${dateLine}، باز کردن جزئیات`}
    >
      <span className="min-w-0">
        <span className="block text-[11px] text-[var(--sk-text-muted)]">{dateLine}</span>
        <span className="block text-[15px] sm:text-[15.5px] font-extrabold mt-0.5 truncate">
          شیفت امروز: <span className="text-gradient">{label}</span>
        </span>
      </span>
      <span
        className={`shrink-0 size-11 rounded-[13px] grid place-items-center ${KIND_GRAD[effKind]}`}
      >
        {KIND_ICON_MD[effKind]}
      </span>
    </button>
  );
}

/* ================= Monthly Summary Strip ================= */
function MonthlySummaryStrip({
  dayInfo,
  effGroup,
  myGroup,
  compareGroup,
}: {
  dayInfo: DayInfo[];
  effGroup: ShiftGroup;
  myGroup: ShiftGroup;
  compareGroup: ShiftGroup | null;
}) {
  const pat = getActivePattern();
  const counts = useMemo(() => {
    let day = 0;
    let evening = 0;
    let night = 0;
    let officialHolidays = 0;
    let rest = 0;
    let sharedRest = 0;

    for (const info of dayInfo) {
      if (info.holiday) officialHolidays++;
      const c = info.all.find((x) => x.group === effGroup)?.code ?? "M1";
      const k =
        effGroup === myGroup && info.record?.swapKind
          ? info.record.swapKind
          : codeToKind(c);
      if (k === "DAY") day++;
      else if (k === "EVENING") evening++;
      else if (k === "NIGHT") night++;
      else rest++;

      if (compareGroup) {
        const c2 = info.all.find((x) => x.group === compareGroup)?.code ?? "M1";
        if (k === "REST" && codeToKind(c2) === "REST") sharedRest++;
      }
    }
    return { day, evening, night, officialHolidays, rest, sharedRest };
  }, [dayInfo, effGroup, myGroup, compareGroup]);

  const restLabel = compareGroup
    ? `مشترک ${getGroupLetter(effGroup, pat)}∩${getGroupLetter(compareGroup, pat)}`
    : "استراحت";
  const restValue = compareGroup ? counts.sharedRest : counts.rest;

  const items: { label: string; count: number; cls: string; icon: React.ReactNode }[] = [
    { label: "صبح‌کار", count: counts.day, cls: "sk-grad-day", icon: <SunIcon size={12} /> },
    ...(counts.evening > 0
      ? [
          {
            label: "عصرکار",
            count: counts.evening,
            cls: "sk-grad-evening",
            icon: <SunsetIcon size={12} />,
          },
        ]
      : []),
    { label: "شب‌کار", count: counts.night, cls: "sk-grad-night", icon: <MoonIcon size={12} /> },
    {
      label: "تعطیل",
      count: counts.officialHolidays,
      cls: "sk-grad-holiday",
      icon: <HolidayIcon size={12} />,
    },
    { label: restLabel, count: restValue, cls: "sk-grad-rest", icon: <RestIcon size={12} /> },
  ];

  return (
    <div
      className="glass rounded-[15px] sm:rounded-[16px] px-1.5 py-1 sm:py-1.5 flex items-center gap-1 sm:gap-1.5 shrink-0"
      data-tour="summary-strip"
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={`flex-1 h-[31px] sm:h-[36px] md:h-[40px] rounded-[10px] sm:rounded-[12px] px-1 sm:px-2 flex items-center justify-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-[12px] md:text-[13px] font-extrabold truncate ${it.cls}`}
        >
          {it.icon}
          <span className="truncate">
            {it.label} {toPersianDigits(it.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ================= Grid cell ================= */
interface DayInfo {
  d: number;
  key: string;
  holiday: boolean;
  holidayNames: string[];
  occasions: string[];
  isToday: boolean;
  isFriday: boolean;
  weekday: number;
  label: string;
  subDateText: string;
  note: string | undefined;
  record: DayWorkRecord | undefined;
  all: { group: ShiftGroup; label: string; code: ShiftCode }[];
  isSharedRest: boolean;
  hasColleagueSharedRest: boolean;
  colleagueSummary: string;
}

const DayCell = memo(function DayCell({
  info,
  filterGroup,
  myGroup,
  onOpenDay,
  isSelected,
  isTourCell,
}: {
  info: DayInfo;
  filterGroup: GroupFilter;
  myGroup: ShiftGroup;
  onOpenDay: (k: string) => void;
  isSelected: boolean;
  isTourCell?: boolean;
}) {
  const holiday = info.holiday;
  const targetGroup: ShiftGroup = filterGroup === "ALL" ? myGroup : (filterGroup as ShiftGroup);
  const code = info.all.find((s) => s.group === targetGroup)?.code ?? info.all[0]?.code ?? "M1";
  const swapKind = targetGroup === myGroup ? (info.record?.swapKind ?? null) : null;
  const kind = swapKind ?? codeToKind(code);
  const ordinal = shiftCodeIndex(code);
  const hasOvertime = targetGroup === myGroup && (info.record?.overtimeHours ?? 0) > 0;
  const delay = Math.min((info.d + 3) * 5, 180);

  return (
    <button
      onClick={() => onOpenDay(info.key)}
      data-tour={isTourCell ? "today-cell" : undefined}
      className={`sk-cell-in touch-pan-y relative rounded-[14px] sm:rounded-[16px] h-full w-full overflow-hidden flex flex-col items-center justify-center gap-[3px] sm:gap-[4px] p-0.5 select-none
        transition-[transform,border-color] active:scale-[0.97]
        ${
          holiday
            ? "bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/25"
            : info.isSharedRest
              ? "bg-[var(--sk-rest-soft)] border-[1.8px] border-[var(--sk-rest-ink)]"
              : "sk-tile"
        }
        ${info.isToday ? "ring-2 ring-inset ring-[var(--sk-primary)]" : ""}
        ${isSelected && !info.isToday ? "ring-2 ring-inset ring-[var(--sk-primary)]/40" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      aria-label={`${info.label}${holiday ? "، تعطیل رسمی" : ""}`}
    >
      <span className="flex items-center gap-0.5 leading-none">
        <span
          className={`text-[13.5px] sm:text-[15px] font-extrabold leading-none ${
            holiday
              ? "text-[var(--sk-holiday)]"
              : info.isFriday
                ? "text-[var(--sk-text-muted)]"
                : ""
          }`}
        >
          {toPersianDigits(info.d)}
        </span>
        {info.note && <span className="size-1 rounded-full bg-[var(--sk-primary)]" />}
        {(hasOvertime || swapKind !== null) && (
          <span className="size-1 rounded-full bg-[var(--sk-primary)]" />
        )}
        {info.hasColleagueSharedRest && (
          <span className="size-1 rounded-full bg-[var(--sk-rest)]" />
        )}
      </span>

      {filterGroup === "ALL" ? (
        <span
          className={`grid ${
            info.all.length > 4 ? "grid-cols-3" : "grid-cols-2"
          } gap-[2.5px] sm:gap-[3px] place-items-center`}
        >
          {info.all.slice(0, 6).map((s) => (
            <GroupNumBadge key={s.group} label={s.label} code={s.code} />
          ))}
        </span>
      ) : (
        <ShiftDayOrdinalBadge
          kind={kind}
          ordinal={ordinal}
          swapped={swapKind !== null}
        />
      )}
    </button>
  );
});

function GridView(props: {
  dayInfo: DayInfo[];
  firstWeekday: number;
  filterGroup: GroupFilter;
  myGroup: ShiftGroup;
  selectedDateKey: string | null;
  onOpenDay: (k: string) => void;
}) {
  const { dayInfo, firstWeekday, filterGroup, myGroup, selectedDateKey, onOpenDay } = props;
  const cells: (DayInfo | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...dayInfo,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = cells.length / 7;
  const hasTodayInMonth = dayInfo.some((d) => d.isToday);

  return (
    <div
      className={`sk-cal-grid-wrap flex-1 min-h-0 flex flex-col ${
        rows >= 6
          ? "max-h-[348px] sm:max-h-[396px] md:max-h-[436px]"
          : "max-h-[296px] sm:max-h-[340px] md:max-h-[376px]"
      }`}
    >
      <div className="grid grid-cols-7 mb-1 shrink-0" aria-hidden>
        {WEEKDAY_SHORT.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[12px] sm:text-[13px] font-bold leading-4 py-0.5 ${
              i === 6 ? "text-[var(--sk-text-muted)]" : "text-[var(--sk-text-faint)]"
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div
        className="flex-1 min-h-0 grid grid-cols-7 gap-1 sm:gap-1.5"
        style={{
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((info, i) =>
          info === null ? (
            <div key={`e${i}`} aria-hidden />
          ) : (
            <DayCell
              key={info.key}
              info={info}
              filterGroup={filterGroup}
              myGroup={myGroup}
              onOpenDay={onOpenDay}
              isSelected={selectedDateKey === info.key}
              isTourCell={info.isToday || (!hasTodayInMonth && info.d === 14)}
            />
          ),
        )}
      </div>
    </div>
  );
}

/* ================= Helper to build single-line cell summary ================= */
function renderRowDetailLine(info: DayInfo) {
  const parts: React.ReactNode[] = [];

  if (info.record && (info.record.overtimeHours > 0 || info.record.swapKind)) {
    const otText =
      info.record.overtimeHours > 0
        ? `اضافه‌کاری: ${toPersianDigits(info.record.overtimeHours)}س`
        : "";
    const swText = info.record.swapKind
      ? `جابجایی: ${SHIFT_KIND_FA[info.record.swapKind]}`
      : "";
    parts.push(
      <span key="rec" className="font-bold text-[var(--sk-primary)]">
        {[otText, swText].filter(Boolean).join(" • ")}
      </span>,
    );
  }

  if (info.holidayNames.length > 0) {
    parts.push(
      <span key="hol" className="font-bold text-[var(--sk-holiday)]">
        {info.holidayNames.join("، ")}
      </span>,
    );
  }

  if (info.note) {
    parts.push(
      <span key="note" className="font-bold text-[var(--sk-text)]">
        یادداشت: {info.note}
      </span>,
    );
  }

  if (info.occasions.length > 0) {
    parts.push(
      <span key="occ" className="text-[var(--sk-text-muted)]">
        {info.occasions.join("، ")}
      </span>,
    );
  }

  if (info.colleagueSummary) {
    parts.push(
      <span key="col" className="text-[var(--sk-rest-ink)] font-semibold">
        {info.colleagueSummary}
      </span>,
    );
  }

  if (parts.length === 0) {
    return (
      <span className="text-[11px] text-[var(--sk-text-faint)]">
        {info.subDateText}
      </span>
    );
  }

  return parts.map((node, idx) => (
    <span key={idx}>
      {idx > 0 && <span className="mx-1.5 text-[var(--sk-text-faint)]">•</span>}
      {node}
    </span>
  ));
}

/* ================= Table view (Strict Uniform Row Height, Zero Swipe, Filter-Aware) ================= */
function TableView(props: {
  dayInfo: DayInfo[];
  filterGroup: GroupFilter;
  myGroup: ShiftGroup;
  onOpenDay: (k: string) => void;
}) {
  const { dayInfo, filterGroup, myGroup, onOpenDay } = props;
  const all = filterGroup === "ALL";
  const pat = getActivePattern();
  const activeSingleGroup = (all ? myGroup : filterGroup) as ShiftGroup;

  return (
    <div className="card-soft rounded-2xl overflow-hidden">
      <div
        className="px-3 py-2 border-b border-[var(--sk-border-soft)] flex items-center justify-between gap-2 flex-wrap"
        data-table-head
      >
        <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--sk-text-faint)]">
          <InfoIcon size={13} />
          برای جزئیات کامل، ثبت یادداشت یا اضافه‌کاری روی هر ردیف ضربه بزنید
        </span>
        {all && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-day)]" />
              صبح‌کار
            </span>
            {pat.eveningCount > 0 && (
              <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
                <span className="size-2 rounded-full bg-[var(--sk-evening)]" />
                عصرکار
              </span>
            )}
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-night)]" />
              شب‌کار
            </span>
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-rest)]" />
              استراحت
            </span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto sk-scroll" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}>
      <table className="w-max min-w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="h-[38px] text-[11px] font-bold text-[var(--sk-text-faint)] border-b border-[var(--sk-border-soft)] sk-thead">
            <th className="w-[44px] sm:w-[52px] px-1.5 font-bold text-center whitespace-nowrap">روز</th>
            <th className="w-[64px] sm:w-[76px] px-1.5 font-bold text-center whitespace-nowrap">هفته</th>
            <th
              className={`${
                all ? "w-[110px] sm:w-[126px]" : "w-[96px] sm:w-[114px]"
              } px-1.5 font-bold text-center whitespace-nowrap`}
            >
              {all
                ? "شیفت گروه‌ها"
                : pat.hasGroups
                  ? `شیفت ${getGroupLetter(activeSingleGroup, pat)}`
                  : "شیفت"}
            </th>
            <th className="font-bold text-start ps-2.5 pe-4 whitespace-nowrap">مناسبت و یادداشت</th>
          </tr>
        </thead>
        <tbody>
          {dayInfo.map((info) => {
            const holiday = info.holiday;
            const code =
              info.all.find((s) => s.group === activeSingleGroup)?.code ?? "M1";
            const swappedKind =
              activeSingleGroup === myGroup ? (info.record?.swapKind ?? null) : null;
            const kind = swappedKind ?? codeToKind(code);
            const badgeText = swappedKind
              ? `${SHIFT_KIND_FA[swappedKind]}*`
              : CODE_NUM_FA[code];

            return (
              <tr
                key={info.key}
                onClick={() => onOpenDay(info.key)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenDay(info.key);
                  }
                }}
                className={`h-[46px] cursor-pointer border-b border-[var(--sk-border-soft)] last:border-0 transition-colors hover:bg-[var(--sk-primary-soft)]/50
                  ${holiday ? "bg-[var(--sk-holiday-soft)]/60" : info.isFriday ? "bg-[var(--sk-surface-strong)]/35" : ""}
                  ${info.isToday ? "bg-[var(--sk-primary-soft)]" : ""}`}
              >
                <td
                  className={`h-[46px] py-0 text-center font-extrabold align-middle whitespace-nowrap ${
                    info.isToday
                      ? "text-[var(--sk-primary)]"
                      : holiday
                        ? "text-[var(--sk-holiday)]"
                        : ""
                  }`}
                >
                  {toPersianDigits(String(info.d).padStart(2, "۰"))}
                </td>
                <td
                  className={`h-[46px] py-0 text-center text-[12px] font-semibold align-middle whitespace-nowrap truncate ${
                    holiday ? "text-[var(--sk-holiday)]" : "text-[var(--sk-text-muted)]"
                  }`}
                >
                  {WEEKDAYS[info.weekday]}
                </td>
                <td className="h-[46px] py-0 text-center align-middle whitespace-nowrap">
                  {all ? (
                    <span className="inline-flex items-center justify-center gap-[3px]">
                      {info.all.slice(0, 4).map((s) => {
                        const gSwap =
                          s.group === myGroup ? (info.record?.swapKind ?? null) : null;
                        return (
                          <MiniBadge
                            key={s.group}
                            label={s.label}
                            code={s.code}
                            kindOverride={gSwap}
                          />
                        );
                      })}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-[8px] text-[10.5px] font-black whitespace-nowrap ${KIND_GRAD[kind]}`}
                    >
                      {KIND_ICON_SM[kind]}
                      <span>{badgeText}</span>
                    </span>
                  )}
                </td>
                <td className="h-[46px] py-0 ps-2.5 pe-4 text-start align-middle whitespace-nowrap">
                  <div className="whitespace-nowrap text-[11.5px] leading-[46px]">
                    {renderRowDetailLine(info)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ================= Fullscreen table (matching TableView uniform rows & filter behavior) ================= */
function TableFullscreen(props: {
  viewYear: number;
  viewMonth: number;
  dayInfo: DayInfo[];
  filterGroup: GroupFilter;
  myGroup: ShiftGroup;
  isCurrentMonth: boolean;
  onGoMonth: (d: 1 | -1) => void;
  onGoToday: () => void;
  onOpenDay: (k: string) => void;
  onOpenPicker: () => void;
  onExportMonth: () => void;
  onClose: () => void;
}) {
  const {
    viewYear,
    viewMonth,
    dayInfo,
    filterGroup,
    myGroup,
    isCurrentMonth,
    onGoMonth,
    onGoToday,
    onOpenDay,
    onOpenPicker,
    onExportMonth,
    onClose,
  } = props;
  const all = filterGroup === "ALL";
  const pat = getActivePattern();
  const activeSingleGroup = (all ? myGroup : filterGroup) as ShiftGroup;
  const headerRef = useRef<HTMLDivElement>(null);
  const todayRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (isCurrentMonth && todayRowRef.current) {
      todayRowRef.current.scrollIntoView({ block: "center" });
    }
  }, [isCurrentMonth]);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-[var(--sk-bg)] flex flex-col sk-fs-in touch-pan-y"
      role="dialog"
      aria-modal="true"
      aria-label="جدول شیفت‌کاری تمام‌صفحه"
    >
      <div className="aurora-bg" aria-hidden />
      <div
        ref={headerRef}
        className="relative z-10 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-2 shrink-0 touch-pan-y"
      >
        <div className="glass rounded-2xl p-1.5 flex items-center gap-1">
          <button
            onClick={() => onGoMonth(-1)}
            className="sk-sheet-btn !size-10"
            aria-label="ماه قبل"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex min-w-0 flex-1 justify-center">
            <button onClick={onOpenPicker} className="sk-title-btn" aria-label="انتخاب ماه و سال">
              <span className="truncate">
                {JALALI_MONTHS[viewMonth - 1]} {toPersianDigits(viewYear)}
              </span>
              <span className="sk-title-caret">
                <ChevronDown size={15} />
              </span>
            </button>
          </div>
          <button
            onClick={() => onGoMonth(1)}
            className="sk-sheet-btn !size-10"
            aria-label="ماه بعد"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onExportMonth}
            className="sk-sheet-btn !size-10 !text-[var(--sk-primary)]"
            aria-label="خروجی تصویر ماه"
          >
            <ImageIcon size={17} />
          </button>
          <button
            onClick={onClose}
            className="sk-sheet-btn !size-10 !text-[var(--sk-primary)]"
            aria-label="بازگشت به نمای تقویم"
          >
            <CollapseIcon size={17} />
          </button>
        </div>

        {all && (
          <div className="flex items-center justify-center gap-4 pt-2">
            <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-day)]" />
              صبح‌کار
            </span>
            {pat.eveningCount > 0 && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--sk-text-muted)]">
                <span className="size-2 rounded-full bg-[var(--sk-evening)]" />
                عصرکار
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-night)]" />
              شب‌کار
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-rest)]" />
              استراحت
            </span>
          </div>
        )}
      </div>

      <div className="relative z-10 flex-1 min-h-0 flex px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="card-soft rounded-2xl w-full flex-1 min-h-0 overflow-auto sk-scroll overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}>
          <table className="w-max min-w-full border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-10 backdrop-blur-md">
              <tr className="h-[38px] text-[11px] font-bold text-[var(--sk-text-faint)] border-b border-[var(--sk-border-soft)] sk-thead">
                <th className="w-[44px] sm:w-[52px] px-1.5 font-bold text-center whitespace-nowrap">روز</th>
                <th className="w-[64px] sm:w-[76px] px-1.5 font-bold text-center whitespace-nowrap">هفته</th>
                <th
                  className={`${
                    all ? "w-[110px] sm:w-[126px]" : "w-[96px] sm:w-[114px]"
                  } px-1.5 font-bold text-center whitespace-nowrap`}
                >
                  {all
                    ? "شیفت گروه‌ها"
                    : pat.hasGroups
                      ? `شیفت ${getGroupLetter(activeSingleGroup, pat)}`
                      : "شیفت"}
                </th>
                <th className="font-bold text-start ps-2.5 pe-4 whitespace-nowrap">مناسبت و یادداشت</th>
              </tr>
            </thead>
            <tbody>
              {dayInfo.map((info) => {
                const holiday = info.holiday;
                const code =
                  info.all.find((s) => s.group === activeSingleGroup)?.code ?? "M1";
                const swappedKind =
                  activeSingleGroup === myGroup ? (info.record?.swapKind ?? null) : null;
                const kind = swappedKind ?? codeToKind(code);
                const badgeText = swappedKind
                  ? `${SHIFT_KIND_FA[swappedKind]}*`
                  : CODE_NUM_FA[code];

                return (
                  <tr
                    key={info.key}
                    ref={info.isToday ? todayRowRef : undefined}
                    onClick={() => onOpenDay(info.key)}
                    className={`h-[46px] cursor-pointer border-b border-[var(--sk-border-soft)] last:border-0 ${
                      holiday
                        ? "bg-[var(--sk-holiday-soft)]/60"
                        : info.isFriday
                          ? "bg-[var(--sk-surface-strong)]/35"
                          : ""
                    } ${info.isToday ? "bg-[var(--sk-primary-soft)]" : ""}`}
                  >
                    <td
                      className={`h-[46px] py-0 text-center font-extrabold align-middle whitespace-nowrap ${
                        info.isToday
                          ? "text-[var(--sk-primary)]"
                          : holiday
                            ? "text-[var(--sk-holiday)]"
                            : ""
                      }`}
                    >
                      {toPersianDigits(String(info.d).padStart(2, "۰"))}
                    </td>
                    <td
                      className={`h-[46px] py-0 text-center text-[12px] font-semibold align-middle whitespace-nowrap truncate ${
                        holiday ? "text-[var(--sk-holiday)]" : "text-[var(--sk-text-muted)]"
                      }`}
                    >
                      {WEEKDAYS[info.weekday]}
                    </td>
                    <td className="h-[46px] py-0 text-center align-middle whitespace-nowrap">
                      {all ? (
                        <span className="inline-flex items-center justify-center gap-[3px]">
                          {info.all.slice(0, 4).map((s) => {
                            const gSwap =
                              s.group === myGroup ? (info.record?.swapKind ?? null) : null;
                            return (
                              <MiniBadge
                                key={s.group}
                                label={s.label}
                                code={s.code}
                                kindOverride={gSwap}
                              />
                            );
                          })}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-[8px] text-[10.5px] font-black whitespace-nowrap ${KIND_GRAD[kind]}`}
                        >
                          {KIND_ICON_SM[kind]}
                          <span>{badgeText}</span>
                        </span>
                      )}
                    </td>
                    <td className="h-[46px] py-0 ps-2.5 pe-4 text-start align-middle whitespace-nowrap">
                      <div className="whitespace-nowrap text-[11.5px] leading-[46px]">
                        {renderRowDetailLine(info)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!isCurrentMonth && (
        <button
          onClick={onGoToday}
          className="fixed top-1/2 -translate-y-1/2 left-4 z-20 size-11 rounded-full bg-[var(--sk-primary)] text-white grid place-items-center shadow-[0_10px_30px_-6px_var(--sk-glow-a)]"
          aria-label="برو به امروز"
          title="برو به امروز"
        >
          <CalendarIcon size={19} />
        </button>
      )}
    </div>,
    document.body,
  );
}
