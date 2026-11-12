"use client";
/**
 * Month/Year + Exact Day Picker (`MonthPicker`) — 100% parity with Android `MonthPickerSheet.kt`:
 *  - Wrapped in `<Sheet>` (`انتخاب تاریخ و پرش سریع`) with full drag/scroll/tap fullscreen support.
 *  - Year stepper (`1300..1500`)
 *  - 4×3 Month grid (`JALALI_MONTHS`)
 *  - Exact Day Selector (`انتخاب روز برای بررسی سریع: < روز ۱۶ >`) with live shift preview
 *    and two action buttons (`نمایش این ماه` and `جزئیات این روز`).
 */
import { useEffect, useState } from "react";
import { Sheet } from "./sheet";
import {
  JALALI_MONTHS,
  jalaaliMonthLength,
  makeDateKey,
  formatJalali,
  formatWeekday,
  toPersianDigits,
  todayJalaali,
} from "@/lib/jalali";
import { calculateShift, getActivePattern, getGroupTitle } from "@/lib/shift-engine";
import { CODE_FA, SHIFT_KIND_FA, type ShiftKind } from "@/lib/models";
import { useShiftKar, haptic } from "@/lib/store";
import { ChevronRight, ChevronLeft } from "./icons";

const MIN_YEAR = 1300;
const MAX_YEAR = 1500;

const KIND_GRAD: Record<ShiftKind, string> = {
  DAY: "sk-grad-day",
  EVENING: "sk-grad-evening",
  NIGHT: "sk-grad-night",
  REST: "sk-grad-rest",
};

export function MonthPicker({
  open,
  onClose,
  onOpenDay,
}: {
  open: boolean;
  onClose: () => void;
  onOpenDay?: (dateKey: string) => void;
}) {
  const viewYear = useShiftKar((s) => s.viewYear);
  const viewMonth = useShiftKar((s) => s.viewMonth);
  const myGroup = useShiftKar((s) => s.myGroup);
  const dayRecords = useShiftKar((s) => s.dayRecords);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const set = useShiftKar((s) => s.set);
  const today = todayJalaali();

  const [year, setYear] = useState(viewYear);
  const [month, setMonth] = useState(viewMonth);
  const [day, setDay] = useState(today.jd);

  useEffect(() => {
    if (open) {
      setYear(viewYear);
      setMonth(viewMonth);
      const maxD = jalaaliMonthLength(viewYear, viewMonth);
      setDay(Math.max(1, Math.min(maxD, today.jd)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the sheet (re)opens
  }, [open]);

  /* NOTE: `safeDay` below clamps the picked day to the selected month's length
   * during render, so no extra effect is needed when browsing months. */

  const maxDaysInMonth = jalaaliMonthLength(year, month);
  const safeDay = Math.max(1, Math.min(maxDaysInMonth, day));
  const previewKey = makeDateKey(year, month, safeDay);
  const pat = getActivePattern();
  const previewShift = calculateShift(previewKey, myGroup);
  const swappedKind = dayRecords[previewKey]?.swapKind ?? null;
  const previewKind: ShiftKind = swappedKind ?? previewShift.type;
  const previewWeekday = formatWeekday(year, month, safeDay);

  const shiftYear = (delta: 1 | -1) => {
    haptic(hapticOn);
    setYear((y) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y + delta)));
  };

  const pickMonth = (m: number) => {
    haptic(hapticOn);
    /* Only update the LOCAL selection — the global calendar view is committed
     * by the explicit action buttons («نمایش این ماه» / «جزئیات این روز»), so
     * browsing months inside the sheet and closing it never jumps the
     * underlying calendar or silently resets the picked day. */
    setMonth(m);
  };

  return (
    <Sheet open={open} onClose={onClose} title="انتخاب تاریخ و پرش سریع">
      <div className="px-4 pb-6 pt-2 space-y-3.5">
        {/* ---- 1. Year Stepper ---- */}
        <div className="flex items-center justify-center gap-2 py-1">
          <button
            type="button"
            onClick={() => shiftYear(-1)}
            className="sk-sheet-btn !size-10"
            aria-label="سال قبل"
            disabled={year <= MIN_YEAR}
          >
            <ChevronRight size={17} />
          </button>
          <span className="min-w-24 text-center text-[19px] font-black tabular-nums">
            {toPersianDigits(year)}
          </span>
          <button
            type="button"
            onClick={() => shiftYear(1)}
            className="sk-sheet-btn !size-10"
            aria-label="سال بعد"
            disabled={year >= MAX_YEAR}
          >
            <ChevronLeft size={17} />
          </button>
        </div>

        {/* ---- 2. Month Grid (4×3) ---- */}
        <div className="grid grid-cols-3 gap-2" role="grid" aria-label="ماه‌های سال">
          {JALALI_MONTHS.map((m, i) => {
            const idx = i + 1;
            const active = idx === month;
            const isNow = today.jy === year && today.jm === idx;
            return (
              <button
                key={m}
                type="button"
                onClick={() => pickMonth(idx)}
                className={`relative h-[42px] rounded-[15px] text-[13.5px] font-bold transition-all ${
                  active
                    ? "glass border-[1.5px] border-[var(--sk-primary)] text-[var(--sk-primary)] bg-[var(--sk-primary-soft)]"
                    : "glass text-[var(--sk-text)]"
                }`}
                role="gridcell"
              >
                {m}
                {isNow && !active && (
                  <span className="absolute top-1.5 end-1.5 size-1.5 rounded-full bg-[var(--sk-primary)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* ---- 3. Exact Day Selector + Live Shift Preview (matching MonthPickerSheet.kt lines 155-282) ---- */}
        <div className="glass rounded-[18px] p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-[var(--sk-text-muted)]">
              انتخاب روز برای بررسی سریع:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeDay <= 1}
                onClick={() => {
                  haptic(hapticOn);
                  setDay(Math.max(1, safeDay - 1));
                }}
                className="size-[30px] rounded-[9px] bg-[var(--sk-surface-strong)] grid place-items-center disabled:opacity-40"
                aria-label="روز قبل"
              >
                <ChevronRight size={14} />
              </button>
              <span className="min-w-[58px] text-center text-[13px] font-black text-[var(--sk-primary)]">
                روز {toPersianDigits(safeDay)}
              </span>
              <button
                type="button"
                disabled={safeDay >= maxDaysInMonth}
                onClick={() => {
                  haptic(hapticOn);
                  setDay(Math.min(maxDaysInMonth, safeDay + 1));
                }}
                className="size-[30px] rounded-[9px] bg-[var(--sk-surface-strong)] grid place-items-center disabled:opacity-40"
                aria-label="روز بعد"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          <div
            className={`rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[12px] ${KIND_GRAD[previewKind]}`}
          >
            <span className="font-bold text-[var(--sk-text)]">
              {previewWeekday} {formatJalali(year, month, safeDay)}
            </span>
            <span className="font-black">
              {getGroupTitle(myGroup, pat)}:{" "}
              {swappedKind
                ? `جابه‌جایی: ${SHIFT_KIND_FA[swappedKind]}`
                : CODE_FA[previewShift.code]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                haptic(hapticOn);
                set({ viewYear: year, viewMonth: month });
                onClose();
              }}
              className="py-2.5 rounded-xl bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[12px] font-bold text-[var(--sk-text)] active:scale-[0.98] transition-transform"
            >
              نمایش این ماه
            </button>
            <button
              type="button"
              onClick={() => {
                haptic(hapticOn);
                set({ viewYear: year, viewMonth: month, selectedDateKey: previewKey });
                onClose();
                onOpenDay?.(previewKey);
              }}
              className="py-2.5 rounded-xl sk-btn-glass-primary text-[12px] font-extrabold active:scale-[0.98]"
            >
              جزئیات این روز
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export const MonthYearPicker = MonthPicker;
