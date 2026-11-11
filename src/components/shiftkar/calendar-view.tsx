"use client";
/**
 * Calendar view (`CalendarView`):
 *  - Desktop Split Layout (`lg:` in `grid` mode, matching Desktop App `153863.jpg`):
 *      • Top Row 1: Month Navigation Bar
 *      • Top Row 2: Group Filter Chips (`همه`, `A`, `B`, `C`, `D`) + Image Export + Today button
 *      • Main Area (12-col split):
 *          - Right (`lg:col-span-8`): Full-height 7-column Calendar Grid inside a glass card
 *          - Left Sidebar (`lg:col-span-4`): `TodayBanner` on top + `DesktopMonthlyStatsCard`
 *            (`آمار ماهانه` with 2×2 large colored stat cards: صبح‌کار، شب‌کار، تعطیل رسمی، استراحت)
 *  - Non-Fullscreen `TableView` (matching Desktop App `153862.jpg`):
 *      • `TodayBanner` at top + `MonthNav` + Filter Row
 *      • Rounded glass table card with sticky header, 4 columns (`روز`, `هفته`, `شیفت`, `مناسبت و یادداشت`),
 *        rounded shift pill with icon + label (`☀️ صبح‌کار ۱`, `🌙 شب‌کار ۱`, `🏠 استراحت ۱`),
 *        uniform row height (`h-[46px]`), Friday & Holiday row tinting, and disabled month-swipe while scrolling.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  JALALI_MONTHS,
  WEEKDAYS,
  jalaaliMonthLength,
  jalaaliWeekday,
  todayJalaali,
  makeDateKey,
  toPersianDigits,
  formatJalali,
  formatWeekday,
} from "@/lib/jalali";
import {
  calculateShift,
  calculateAllShifts,
  getActivePattern,
  getActiveGroups,
  getActiveGroupFilters,
  getGroupLetter,
  getGroupTitle,
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

const KIND_ICON_LG: Record<ShiftKind, React.ReactNode> = {
  DAY: <SunIcon size={18} />,
  EVENING: <SunsetIcon size={18} />,
  NIGHT: <MoonIcon size={18} />,
  REST: <RestIcon size={18} />,
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
 * GroupNumBadge — Displays `${group.faLetter()}${ord}` (e.g. `A۱`, `B۲`) inside `همه` calendar cells.
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

  /* Touch Swipe + Horizontal Wheel Month Navigation — ONLY in Grid mode! */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (viewType !== "grid" || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      touchStateRef.current = { startX: x, startY: y, lastX: x, lastY: y };
    },
    [viewType],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (viewType !== "grid" || !touchStateRef.current || e.touches.length !== 1) return;
      touchStateRef.current.lastX = e.touches[0].clientX;
      touchStateRef.current.lastY = e.touches[0].clientY;
    },
    [viewType],
  );

  const handleTouchFinish = useCallback(
    (e: React.TouchEvent) => {
      const st = touchStateRef.current;
      touchStateRef.current = null;
      if (viewType !== "grid" || !st) return;
      const endX = e.changedTouches?.[0]?.clientX ?? st.lastX;
      const endY = e.changedTouches?.[0]?.clientY ?? st.lastY;
      const dx = endX - st.startX;
      const dy = endY - st.startY;
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        ignoreClickUntilRef.current = Date.now() + 450;
        goMonth(dx > 0 ? 1 : -1);
      }
    },
    [viewType, goMonth],
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
    [viewType, goMonth],
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
      {/* Top section: On Mobile/Tablet (or in Table mode on all screens), TodayBanner sits at top */}
      <div className={viewType === "grid" ? "sk-cal-top-pair flex flex-col gap-1.5 lg:contents" : "sk-cal-top-pair flex flex-col gap-1.5"}>
        <div className={viewType === "grid" ? "lg:hidden shrink-0" : "shrink-0"}>
          <TodayBanner
            todayKey={todayKey}
            filterGroup={effectiveFilterGroup}
            myGroup={myGroup}
            activeGroups={activeGroups}
            dayRecord={dayRecords[todayKey]}
            onOpenDay={openDay}
          />
        </div>

        {/* Month navigation row */}
        <div className="glass rounded-[16px] p-[5px] flex items-center gap-1 shrink-0" data-tour="month-nav">
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

      {/* Filter chips + PNG Export + Fullscreen + Today chip */}
      <div className="flex items-center gap-1.5 overflow-x-auto sk-scroll pb-0.5 shrink-0" data-tour="group-filter">
        {!pat.hasGroups ? (
          <span className="shrink-0 h-9 px-3 rounded-full bg-[var(--sk-surface-strong)] text-[var(--sk-primary)] shadow-[inset_0_0_0_1.5px_var(--sk-primary)] text-[12px] font-bold inline-flex items-center">
            شیفت فردی (بدون گروه)
          </span>
        ) : (
          <div className="inline-flex items-center gap-1.5 glass rounded-full p-1">
            {groupFilters.map((g) => {
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
                  className={`shrink-0 min-w-9 h-7 px-2.5 rounded-full text-[12.5px] font-bold transition-all ${
                    active
                      ? "bg-[var(--sk-surface-strong)] text-[var(--sk-primary)] shadow-[inset_0_0_0_1.5px_var(--sk-primary)]"
                      : isCompared
                        ? "bg-[var(--sk-rest-soft)] text-[var(--sk-rest-ink)] shadow-[inset_0_0_0_1.5px_var(--sk-rest-ink)]"
                        : "text-[var(--sk-text-muted)] hover:text-[var(--sk-primary)]"
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
            })}
          </div>
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
            title="جدول تمام‌صفحه"
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

      {/* Legend (grid + ALL) */}
      {viewType === "grid" && effectiveFilterGroup === "ALL" && (
        <div className="flex items-center gap-3.5 px-1 flex-wrap shrink-0 leading-none" aria-label="راهنمای شیفت‌ها">
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

      {/* Main Body */}
      <div
        ref={bodyRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchFinish}
        onTouchCancel={handleTouchFinish}
        onWheel={handleWheel}
        className={`sk-cal-body flex-1 min-h-0 flex flex-col overflow-hidden pb-[calc(env(safe-area-inset-bottom)+74px)]`}
      >
        <div
          key={`${viewYear}-${viewMonth}-${viewType}`}
          className={`${animClass} flex-1 min-h-0 flex flex-col ${
            viewType === "grid" ? "gap-1.5 lg:grid lg:grid-cols-12 lg:gap-4" : ""
          }`}
        >
          {viewType === "grid" ? (
            <>
              {/* Right Column on Desktop (8 cols): Calendar Grid inside Glass Container */}
              <div className="flex-1 min-h-0 flex flex-col lg:col-span-8 lg:glass lg:rounded-[26px] lg:p-3.5">
                <GridView
                  dayInfo={dayInfo}
                  firstWeekday={firstWeekday}
                  filterGroup={effectiveFilterGroup}
                  myGroup={myGroup}
                  selectedDateKey={selectedDateKey}
                  onOpenDay={openDay}
                />
              </div>

              {/* Mobile Summary Strip (< lg) */}
              <div className="lg:hidden shrink-0">
                <MonthlySummaryStrip
                  dayInfo={dayInfo}
                  effGroup={summaryGroup}
                  myGroup={myGroup}
                  compareGroup={compareGroup}
                />
              </div>

              {/* Left Sidebar on Desktop (>= lg, 4 cols): TodayBanner + 2x2 Monthly Stats Card (matching 153863.jpg!) */}
              <div className="hidden lg:flex lg:col-span-4 flex-col gap-3 min-h-0">
                <TodayBanner
                  todayKey={todayKey}
                  filterGroup={effectiveFilterGroup}
                  myGroup={myGroup}
                  activeGroups={activeGroups}
                  dayRecord={dayRecords[todayKey]}
                  onOpenDay={openDay}
                />
                <DesktopMonthlyStatsCard
                  viewYear={viewYear}
                  viewMonth={viewMonth}
                  dayInfo={dayInfo}
                  effGroup={summaryGroup}
                  myGroup={myGroup}
                  compareGroup={compareGroup}
                />
              </div>
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

      {/* Fullscreen table */}
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
        className="glass rounded-2xl px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer hover:bg-[var(--sk-primary-soft)]/30 transition-colors shrink-0"
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
      className="glass rounded-2xl lg:rounded-[24px] px-3.5 lg:px-4 py-2.5 lg:py-3.5 flex items-center justify-between gap-3 w-full text-start hover:bg-[var(--sk-primary-soft)]/40 transition-colors shrink-0"
      data-tour="today-banner"
      aria-label={`شیفت امروز — ${dateLine}، باز کردن جزئیات`}
    >
      <span className="min-w-0">
        <span className="block text-[11px] lg:text-[11.5px] text-[var(--sk-text-muted)]">{dateLine}</span>
        <span className="block text-[15.5px] lg:text-[17px] font-extrabold mt-0.5 truncate">
          شیفت امروز: <span className="text-gradient">{label}</span>
        </span>
      </span>
      <span className={`shrink-0 size-11 lg:size-12 rounded-[13px] lg:rounded-[15px] grid place-items-center ${KIND_GRAD[effKind]}`}>
        {KIND_ICON_MD[effKind]}
      </span>
    </button>
  );
}

/* ================= Desktop Monthly Stats Card (matching Desktop App 153863.jpg) ================= */
function DesktopMonthlyStatsCard({
  viewYear,
  viewMonth,
  dayInfo,
  effGroup,
  myGroup,
  compareGroup,
}: {
  viewYear: number;
  viewMonth: number;
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

  const groupTitle = getGroupTitle(effGroup, pat);
  const restLabel = compareGroup
    ? `مشترک ${getGroupLetter(effGroup, pat)}∩${getGroupLetter(compareGroup, pat)}`
    : "استراحت";
  const restValue = compareGroup ? counts.sharedRest : counts.rest;

  const tiles: { label: string; count: number; cls: string; icon: React.ReactNode }[] = [
    { label: "صبح‌کار", count: counts.day, cls: "sk-grad-day", icon: KIND_ICON_LG.DAY },
    ...(counts.evening > 0
      ? [
          {
            label: "عصرکار",
            count: counts.evening,
            cls: "sk-grad-evening",
            icon: KIND_ICON_LG.EVENING,
          },
        ]
      : []),
    { label: "شب‌کار", count: counts.night, cls: "sk-grad-night", icon: KIND_ICON_LG.NIGHT },
    {
      label: "تعطیل رسمی",
      count: counts.officialHolidays,
      cls: "sk-grad-holiday",
      icon: <HolidayIcon size={18} />,
    },
    { label: restLabel, count: restValue, cls: "sk-grad-rest", icon: KIND_ICON_LG.REST },
  ];

  return (
    <div
      className="flex-1 min-h-0 glass rounded-[26px] p-4 flex flex-col justify-between"
      data-tour="summary-strip"
    >
      <div className="flex items-start justify-between gap-2 shrink-0">
        <div>
          <h3 className="text-[14.5px] font-black text-[var(--sk-text)]">
            آمار ماهانه ({JALALI_MONTHS[viewMonth - 1]} {toPersianDigits(viewYear)})
          </h3>
          <p className="text-[11px] font-bold text-[var(--sk-text-muted)] mt-0.5">
            مجموع {toPersianDigits(dayInfo.length)} روز · {groupTitle}
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] border border-[var(--sk-primary)]/35 text-[11px] font-black shrink-0">
          {groupTitle}
        </span>
      </div>

      <div
        className={`grid grid-cols-2 gap-2.5 flex-1 min-h-0 mt-3 ${
          tiles.length > 4 ? "grid-rows-3" : "grid-rows-2"
        }`}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`rounded-[18px] p-3.5 border border-current/30 flex flex-col justify-between ${t.cls}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="size-8 rounded-xl bg-black/15 grid place-items-center shrink-0">
                {t.icon}
              </span>
              <span className="text-[18px] xl:text-[20px] font-black leading-none">
                {toPersianDigits(t.count)} روز
              </span>
            </div>
            <div className="text-[12.5px] font-extrabold text-start mt-2 truncate">
              {t.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Monthly Summary Strip (Mobile / Tablet) ================= */
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
      className={`sk-cal-grid-wrap flex-1 min-h-0 flex flex-col lg:max-h-none ${
        rows >= 6
          ? "max-h-[348px] sm:max-h-[396px] md:max-h-[436px]"
          : "max-h-[296px] sm:max-h-[340px] md:max-h-[376px]"
      }`}
    >
      <div className="grid grid-cols-7 mb-1.5 shrink-0" aria-hidden>
        {WEEKDAY_SHORT.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[12px] sm:text-[13px] font-bold leading-4 py-0.5 ${
              i === 6 ? "text-[var(--sk-holiday)]" : "text-[var(--sk-text-faint)]"
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div
        className="flex-1 min-h-0 grid grid-cols-7 gap-1 sm:gap-1.5 lg:gap-2"
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

/* ================= Non-Fullscreen TableView (matching Desktop App 153862.jpg) ================= */
function buildRowSummaryLine(info: DayInfo) {
  const parts: { text: string; cls: string }[] = [];
  if (info.record && (info.record.overtimeHours > 0 || info.record.swapKind)) {
    const sub: string[] = [];
    if (info.record.overtimeHours > 0)
      sub.push(`اضافه‌کاری: ${toPersianDigits(info.record.overtimeHours)} ساعت`);
    if (info.record.swapKind)
      sub.push(`جابه‌جایی: ${SHIFT_KIND_FA[info.record.swapKind]}`);
    parts.push({ text: sub.join(" · "), cls: "font-bold text-[var(--sk-primary)]" });
  }
  if (info.holidayNames.length > 0) {
    parts.push({
      text: info.holidayNames.join("، "),
      cls: "font-bold text-[var(--sk-holiday)]",
    });
  }
  if (info.note) {
    parts.push({ text: info.note, cls: "font-semibold text-[var(--sk-text)]" });
  }
  if (info.colleagueSummary) {
    parts.push({
      text: info.colleagueSummary,
      cls: "font-semibold text-[var(--sk-rest-ink)]",
    });
  }
  if (info.occasions.length > 0) {
    parts.push({
      text: info.occasions.join("، "),
      cls: "text-[var(--sk-text-muted)]",
    });
  }
  return parts;
}

function TableView(props: {
  dayInfo: DayInfo[];
  filterGroup: GroupFilter;
  myGroup: ShiftGroup;
  onOpenDay: (k: string) => void;
}) {
  const { dayInfo, filterGroup, myGroup, onOpenDay } = props;
  const all = filterGroup === "ALL";
  const pat = getActivePattern();

  return (
    <div className="glass rounded-[22px] border border-[var(--sk-border-soft)] flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--sk-border-soft)] flex items-center justify-between shrink-0" data-table-head>
        {all ? (
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-day)]" />
              صبح‌کار
            </span>
            {pat.eveningCount > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--sk-text-muted)]">
                <span className="size-2 rounded-full bg-[var(--sk-evening)]" />
                عصرکار
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-night)]" />
              شب‌کار
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--sk-text-muted)]">
              <span className="size-2 rounded-full bg-[var(--sk-rest)]" />
              استراحت
            </span>
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--sk-text-faint)]">
            <InfoIcon size={13} />
            برای جزئیات، روی هر روز ضربه بزنید
          </span>
        )}
      </div>

      <div
        className="flex-1 min-h-0 overflow-auto sk-scroll overscroll-contain"
        style={{ touchAction: "pan-x pan-y" }}
      >
        <table className="w-full text-[13px] min-w-[520px]">
          <thead className="sticky top-0 z-10 backdrop-blur-md">
            <tr className="text-[11.5px] font-bold text-[var(--sk-text-faint)] border-b border-[var(--sk-border-soft)] sk-thead">
              <th className="py-2.5 font-bold w-14 md:w-16 text-center">روز</th>
              <th className="py-2.5 font-bold w-20 md:w-24 text-center">هفته</th>
              <th className="py-2.5 font-bold w-28 md:w-36 text-center">
                {all ? "شیفت گروه‌ها" : "شیفت"}
              </th>
              <th className="py-2.5 font-bold text-start ps-4 pe-4">مناسبت و یادداشت</th>
            </tr>
          </thead>
          <tbody>
            {dayInfo.map((info) => {
              const holiday = info.holiday;
              const g = (all ? myGroup : filterGroup) as ShiftGroup;
              const code = info.all.find((s) => s.group === g)?.code ?? "M1";
              const swappedKind = g === myGroup ? (info.record?.swapKind ?? null) : null;
              const kind = swappedKind ?? codeToKind(code);
              const badgeText = swappedKind
                ? `${SHIFT_KIND_FA[swappedKind]}*`
                : CODE_NUM_FA[code];
              const parts = buildRowSummaryLine(info);

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
                  className={`h-[46px] cursor-pointer border-b border-[var(--sk-border-soft)] last:border-0 transition-colors hover:bg-[var(--sk-primary-soft)]/45
                    ${
                      info.isToday
                        ? "bg-[var(--sk-primary-soft)]/75"
                        : holiday
                          ? "bg-[var(--sk-holiday-soft)]/55"
                          : info.isFriday
                            ? "bg-[var(--sk-surface-strong)]/60"
                            : ""
                    }`}
                >
                  <td
                    className={`py-2 text-center font-extrabold whitespace-nowrap ${
                      info.isToday
                        ? "text-[var(--sk-primary)]"
                        : holiday
                          ? "text-[var(--sk-holiday)]"
                          : ""
                    }`}
                  >
                    {toPersianDigits(String(info.d).padStart(2, "0"))}
                  </td>
                  <td
                    className={`py-2 text-center text-[12px] font-semibold whitespace-nowrap ${
                      holiday
                        ? "text-[var(--sk-holiday)] font-bold"
                        : info.isFriday
                          ? "text-[var(--sk-text)] font-bold"
                          : "text-[var(--sk-text-muted)]"
                    }`}
                  >
                    {WEEKDAYS[info.weekday]}
                  </td>
                  <td className="py-2 text-center whitespace-nowrap">
                    <span className="inline-flex items-center justify-center gap-1">
                      {all ? (
                        info.all.map((s) => {
                          const gKind =
                            s.group === myGroup && info.record?.swapKind
                              ? info.record.swapKind
                              : null;
                          return (
                            <MiniBadge
                              key={s.group}
                              label={s.label}
                              code={s.code}
                              kindOverride={gKind}
                            />
                          );
                        })
                      ) : (
                        <span
                          className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black leading-none border border-current/30 ${KIND_GRAD[kind]}`}
                        >
                          {KIND_ICON_SM[kind]}
                          <span>{badgeText}</span>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 ps-4 pe-4 text-start text-[12px] max-w-[260px] sm:max-w-[420px] md:max-w-[560px] lg:max-w-[720px] truncate">
                    {parts.length === 0 ? (
                      <span className="text-[var(--sk-text-faint)]">—</span>
                    ) : (
                      parts.map((p, idx) => (
                        <span key={idx} className={p.cls}>
                          {idx > 0 ? "  •  " : ""}
                          {p.text}
                        </span>
                      ))
                    )}
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

/* ================= Fullscreen table ================= */
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
      className="fixed inset-0 z-[90] bg-[var(--sk-bg)] flex flex-col sk-fs-in"
      role="dialog"
      aria-modal="true"
      aria-label="جدول شیفت‌کاری تمام‌صفحه"
    >
      <div className="aurora-bg" aria-hidden />
      <div
        ref={headerRef}
        className="relative z-10 px-4 md:px-6 pt-[max(env(safe-area-inset-top),14px)] pb-2 shrink-0 max-w-6xl w-full mx-auto"
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
          <div className="flex items-center justify-center gap-4 pt-2.5">
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

      <div className="relative z-10 flex-1 min-h-0 flex px-4 md:px-6 pb-[max(env(safe-area-inset-bottom),16px)] max-w-6xl w-full mx-auto">
        <div
          className="glass rounded-[22px] border border-[var(--sk-border-soft)] w-full flex-1 min-h-0 overflow-auto sk-scroll overscroll-contain"
          style={{ touchAction: "pan-x pan-y" }}
        >
          <table className="w-full text-[13px] min-w-[520px]">
            <thead className="sticky top-0 z-10 backdrop-blur-md">
              <tr className="text-[11.5px] font-bold text-[var(--sk-text-faint)] border-b border-[var(--sk-border-soft)] sk-thead">
                <th className="py-2.5 font-bold w-14 md:w-16 text-center">روز</th>
                <th className="py-2.5 font-bold w-20 md:w-24 text-center">هفته</th>
                <th className="py-2.5 font-bold w-28 md:w-36 text-center">
                  {all ? "شیفت گروه‌ها" : "شیفت"}
                </th>
                <th className="py-2.5 font-bold text-start ps-4 pe-4">مناسبت و یادداشت</th>
              </tr>
            </thead>
            <tbody>
              {dayInfo.map((info) => {
                const holiday = info.holiday;
                const g = (all ? myGroup : filterGroup) as ShiftGroup;
                const code = info.all.find((s) => s.group === g)?.code ?? "M1";
                const swappedKind = g === myGroup ? (info.record?.swapKind ?? null) : null;
                const kind = swappedKind ?? codeToKind(code);
                const badgeText = swappedKind
                  ? `${SHIFT_KIND_FA[swappedKind]}*`
                  : CODE_NUM_FA[code];
                const parts = buildRowSummaryLine(info);

                return (
                  <tr
                    key={info.key}
                    ref={info.isToday ? todayRowRef : undefined}
                    onClick={() => onOpenDay(info.key)}
                    className={`h-[46px] cursor-pointer border-b border-[var(--sk-border-soft)] last:border-0 transition-colors hover:bg-[var(--sk-primary-soft)]/45 ${
                      info.isToday
                        ? "bg-[var(--sk-primary-soft)]/75"
                        : holiday
                          ? "bg-[var(--sk-holiday-soft)]/55"
                          : info.isFriday
                            ? "bg-[var(--sk-surface-strong)]/60"
                            : ""
                    }`}
                  >
                    <td
                      className={`py-2 text-center font-extrabold whitespace-nowrap ${
                        info.isToday
                          ? "text-[var(--sk-primary)]"
                          : holiday
                            ? "text-[var(--sk-holiday)]"
                            : ""
                      }`}
                    >
                      {toPersianDigits(String(info.d).padStart(2, "0"))}
                    </td>
                    <td
                      className={`py-2 text-center text-[12px] font-semibold whitespace-nowrap ${
                        holiday
                          ? "text-[var(--sk-holiday)] font-bold"
                          : info.isFriday
                            ? "text-[var(--sk-text)] font-bold"
                            : "text-[var(--sk-text-muted)]"
                      }`}
                    >
                      {WEEKDAYS[info.weekday]}
                    </td>
                    <td className="py-2 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center gap-1">
                        {all ? (
                          info.all.map((s) => {
                            const gKind =
                              s.group === myGroup && info.record?.swapKind
                                ? info.record.swapKind
                                : null;
                            return (
                              <MiniBadge
                                key={s.group}
                                label={s.label}
                                code={s.code}
                                kindOverride={gKind}
                              />
                            );
                          })
                        ) : (
                          <span
                            className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black leading-none border border-current/30 ${KIND_GRAD[kind]}`}
                          >
                            {KIND_ICON_SM[kind]}
                            <span>{badgeText}</span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 ps-4 pe-4 text-start text-[12px] max-w-[260px] sm:max-w-[420px] md:max-w-[560px] lg:max-w-[720px] truncate">
                      {parts.length === 0 ? (
                        <span className="text-[var(--sk-text-faint)]">—</span>
                      ) : (
                        parts.map((p, idx) => (
                          <span key={idx} className={p.cls}>
                            {idx > 0 ? "  •  " : ""}
                            {p.text}
                          </span>
                        ))
                      )}
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
