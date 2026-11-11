"use client";
/**
 * Day Detail Bottom Sheet (`DaySheet`) — 100% parity with Android `DaySheet.kt` (v6.7.1):
 *  - Wrapped in `<Sheet>` so it supports full-screen expansion via handle tap, header button,
 *    upward swipe, scrolling to the bottom, or focusing the note editor!
 *  - Retains `lastKey` during the 260ms exit animation just like `DaySheet.kt`.
 *  - Header with 3-calendar dates (Jalali + Hijri + Gregorian), `امروز` badge, `جابه‌جایی` badge,
 *    active shift badge (`52px`), and PNG image export button (`44px`).
 *  - Collapsible Holiday & Occasions card (`تعطیل رسمی` / `+X مناسبت`).
 *  - All shift groups grid (`شیفت گروه‌ها`) with shift icon on start + `R4 · استراحت چهارم`.
 *  - Colleagues daily status (`وضعیت پرسنل شما در این روز`) when `showEmployeesOnCalendar` is enabled.
 *  - Overtime Stepper (`۰..۲۴ ساعت`) + Shift Swap 5-chip selector (`برنامه | صبح‌کار | عصرکار | شب‌کار | استراحت`).
 *  - Personal note editor (`یادداشت شخصی`) with `۰/۵۰۰` counter.
 *  - Inline Export Card at the bottom of the sheet (auto-scrolls into view & expands sheet).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet } from "./sheet";
import {
  parseDateKey,
  formatJalali,
  formatHijri,
  formatGregorian,
  formatWeekday,
  todayJalaali,
  toPersianDigits,
} from "@/lib/jalali";
import {
  calculateShift,
  calculateAllShifts,
  getActivePattern,
  getGroupTitle,
} from "@/lib/shift-engine";
import { getDayEvents } from "@/lib/holidays";
import {
  CODE_FA,
  SHIFT_KIND_FA,
  type ShiftGroup,
  type ShiftKind,
} from "@/lib/models";
import { useShiftKar, haptic } from "@/lib/store";
import { getNote, saveNote, deleteNote } from "@/lib/notes-store";
import { renderDayCanvas, downloadCanvasAsPng, shareOrDownloadCanvas } from "@/lib/image-exporter";
import {
  CloseIcon,
  SunIcon,
  SunsetIcon,
  MoonIcon,
  RestIcon,
  HolidayIcon,
  GroupIcon,
  NotesIcon,
  TrashIcon,
  CheckIcon,
  CalendarIcon,
  ChevronDown,
  ChevronUpIcon,
  ImageIcon,
  RefreshIcon,
  DownloadIcon,
  ShareIcon,
} from "./icons";

const KIND_GRAD: Record<ShiftKind, string> = {
  DAY: "sk-grad-day",
  EVENING: "sk-grad-evening",
  NIGHT: "sk-grad-night",
  REST: "sk-grad-rest",
};

const KIND_ICON_LG: Record<ShiftKind, React.ReactNode> = {
  DAY: <SunIcon size={22} />,
  EVENING: <SunsetIcon size={22} />,
  NIGHT: <MoonIcon size={22} />,
  REST: <RestIcon size={22} />,
};

const KIND_ICON_MD: Record<ShiftKind, React.ReactNode> = {
  DAY: <SunIcon size={16} />,
  EVENING: <SunsetIcon size={16} />,
  NIGHT: <MoonIcon size={16} />,
  REST: <RestIcon size={16} />,
};

export function DaySheet({
  dateKey,
  onClose,
  onNoteChanged,
}: {
  dateKey: string | null;
  onClose: () => void;
  onNoteChanged: () => void;
}) {
  const [lastKey, setLastKey] = useState<string | null>(dateKey);
  if (dateKey && dateKey !== lastKey) {
    setLastKey(dateKey);
  }
  const bodyRef = useRef<HTMLDivElement | null>(null);

  return (
    <Sheet open={dateKey !== null} onClose={onClose} title="جزئیات روز" bodyRefExternal={bodyRef}>
      {lastKey && (
        <DaySheetBody
          dateKey={lastKey}
          bodyRef={bodyRef}
          onNoteChanged={onNoteChanged}
        />
      )}
    </Sheet>
  );
}

function DaySheetBody({
  dateKey,
  bodyRef,
  onNoteChanged,
}: {
  dateKey: string;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onNoteChanged: () => void;
}) {
  const myGroup = useShiftKar((s) => s.myGroup);
  const showEvents = useShiftKar((s) => s.showEvents);
  const showSecondaryCalendars = useShiftKar((s) => s.showSecondaryCalendars);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const dayRecords = useShiftKar((s) => s.dayRecords);
  const setDayOvertime = useShiftKar((s) => s.setDayOvertime);
  const setDaySwap = useShiftKar((s) => s.setDaySwap);
  const employees = useShiftKar((s) => s.employees);
  const showEmployeesOnCalendar = useShiftKar((s) => s.showEmployeesOnCalendar);
  const calendarSyncRev = useShiftKar((s) => s.calendarSyncRev);

  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [exportDayOpen, setExportDayOpen] = useState(false);
  const [exportDataUrl, setExportDataUrl] = useState<string | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setEventsOpen(false);
    setExportDayOpen(false);
    setSaved(false);
    let cancelled = false;
    getNote(dateKey).then((t) => {
      if (cancelled) return;
      setText(t);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  const parsed = parseDateKey(dateKey);
  const { jy, jm, jd } = parsed;
  const today = todayJalaali();
  const isTodayDate = today.jy === jy && today.jm === jm && today.jd === jd;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = showEvents ? getDayEvents(jy, jm, jd) : [];
  void calendarSyncRev;

  const holidays = events.filter((e) => e.isHoliday);
  const occasions = events.filter((e) => !e.isHoliday);
  const allShifts = calculateAllShifts(dateKey);
  const pat = getActivePattern();

  const effectiveGroup: ShiftGroup = myGroup;
  const myShift = calculateShift(dateKey, effectiveGroup);
  const dayRec = dayRecords[dateKey];
  const overtimeHours = dayRec?.overtimeHours ?? 0;
  const swapKind = dayRec?.swapKind ?? null;
  const effectiveKind: ShiftKind = swapKind ?? myShift.type;

  const onSave = async () => {
    haptic(hapticOn, 12);
    await saveNote(dateKey, text);
    setSaved(true);
    onNoteChanged();
    toast.success(text.trim() ? "یادداشت ذخیره شد" : "یادداشت پاک شد");
  };

  const onDelete = async () => {
    haptic(hapticOn, 12);
    await deleteNote(dateKey);
    setText("");
    setSaved(true);
    onNoteChanged();
    toast.success("یادداشت حذف شد");
  };

  const handleBuildExport = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const canvas = renderDayCanvas(
      dateKey,
      effectiveGroup,
      isDark,
      dayRec,
      text,
      showEmployeesOnCalendar ? employees : [],
    );
    exportCanvasRef.current = canvas;
    setExportDataUrl(canvas ? canvas.toDataURL("image/png") : null);
    setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTo({
          top: bodyRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 60);
  }, [dateKey, effectiveGroup, dayRec, text, showEmployeesOnCalendar, employees, bodyRef]);

  useEffect(() => {
    if (exportDayOpen) {
      handleBuildExport();
    }
  }, [exportDayOpen, handleBuildExport]);

  const isHolidayDay = holidays.length > 0;
  const totalEvents = holidays.length + occasions.length;
  const canExpand = totalEvents >= 2;
  const extraOccasions = isHolidayDay ? occasions : occasions.slice(1);

  return (
    <div className="px-4 pb-8 pt-1 space-y-4">
      {/* ---- Header: 3 calendars + my shift + export button ---- */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--sk-text-muted)]">
            <CalendarIcon size={13} className="text-[var(--sk-primary)]" />
            <span>{formatWeekday(jy, jm, jd)}</span>
            {isTodayDate && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] text-[10px] font-bold">
                امروز
              </span>
            )}
            {swapKind && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${KIND_GRAD[swapKind]}`}
              >
                جابه‌جایی: {SHIFT_KIND_FA[swapKind]}
              </span>
            )}
          </div>
          <div className="text-[22px] font-black mt-0.5 leading-tight">
            {formatJalali(jy, jm, jd)}
          </div>
          {showSecondaryCalendars && (
            <div className="text-[11.5px] text-[var(--sk-text-faint)] mt-1 leading-5">
              {formatHijri(jy, jm, jd)} · {formatGregorian(jy, jm, jd)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              setExportDayOpen((v) => !v);
            }}
            className="size-[44px] rounded-[14px] glass grid place-items-center text-[var(--sk-primary)] active:scale-95 transition-transform"
            title="خروجی تصویر روز"
            aria-label="خروجی تصویر روز"
          >
            <ImageIcon size={19} />
          </button>
          <div
            className={`size-[52px] rounded-2xl grid place-items-center ${KIND_GRAD[effectiveKind]}`}
          >
            {KIND_ICON_LG[effectiveKind]}
          </div>
        </div>
      </div>

      {/* ---- Holiday / Occasions collapsible chip (matching DaySheet.kt lines 173-288) ---- */}
      {totalEvents > 0 && (
        <div>
          <button
            type="button"
            disabled={!canExpand}
            onClick={() => {
              if (canExpand) setEventsOpen((v) => !v);
            }}
            className={`w-full text-start rounded-2xl px-4 py-3 flex items-center gap-2.5 transition-all ${
              isHolidayDay
                ? "bg-[var(--sk-holiday-soft)] border-2 border-[var(--sk-holiday)]/25"
                : "glass"
            } ${canExpand ? "cursor-pointer active:scale-[0.99]" : "cursor-default"}`}
          >
            <span
              className={`size-9 rounded-xl grid place-items-center shrink-0 ${
                isHolidayDay
                  ? "bg-[var(--sk-holiday)] text-white"
                  : "bg-[var(--sk-primary-soft)] text-[var(--sk-primary)]"
              }`}
            >
              <HolidayIcon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={`text-[13px] font-bold leading-5 ${
                  isHolidayDay ? "text-[var(--sk-holiday)]" : "text-[var(--sk-text)]"
                } ${canExpand ? "truncate" : ""}`}
              >
                {isHolidayDay ? holidays[0].title : occasions[0].title}
              </div>
              {(isHolidayDay || extraOccasions.length > 0) && (
                <div className="flex items-center gap-1 mt-0.5 text-[11px]">
                  {isHolidayDay && (
                    <span className="text-[var(--sk-holiday)]">
                      {holidays.length > 1
                        ? `تعطیل رسمی (+${toPersianDigits(holidays.length - 1)} تعطیلی دیگر)`
                        : "تعطیل رسمی"}
                    </span>
                  )}
                  {extraOccasions.length > 0 && (
                    <>
                      {isHolidayDay && (
                        <span className="text-[var(--sk-text-muted)]">·</span>
                      )}
                      <span className="text-[var(--sk-text-muted)]">
                        +{toPersianDigits(extraOccasions.length)} مناسبت
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            {canExpand && (
              <span className="text-[var(--sk-text-faint)] shrink-0">
                {eventsOpen ? <ChevronUpIcon size={15} /> : <ChevronDown size={15} />}
              </span>
            )}
          </button>

          {canExpand && eventsOpen && (
            <div className="mt-1.5 space-y-1.5">
              {holidays.length > 1 && (
                <div className="rounded-2xl bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/25 p-3.5 flex items-center gap-2.5">
                  <span className="size-8 rounded-[10px] bg-[var(--sk-holiday)] text-white grid place-items-center shrink-0">
                    <HolidayIcon size={15} />
                  </span>
                  <span className="text-[12.5px] font-bold text-[var(--sk-holiday)] leading-6">
                    تعطیل رسمی — {holidays.map((h) => h.title).join("، ")}
                  </span>
                </div>
              )}
              {extraOccasions.length > 0 && (
                <div className="glass rounded-2xl p-3.5 flex items-start gap-2.5">
                  <span className="size-8 rounded-[9px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center shrink-0 mt-0.5">
                    <HolidayIcon size={14} />
                  </span>
                  <ul className="space-y-1 text-[12px] text-[var(--sk-text-muted)] leading-6">
                    {extraOccasions.map((o, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="size-1 rounded-full bg-[var(--sk-text-faint)] mt-2.5 shrink-0" />
                        <span>{o.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- All four groups (matching DaySheet.kt lines 290-353: icon box on start, text next to it) ---- */}
      <div>
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--sk-text-muted)] mb-2">
          <GroupIcon size={13} className="text-[var(--sk-primary)]" />
          <span>{pat.hasGroups ? "شیفت گروه‌ها" : "شیفت شما"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {allShifts.map((s) => {
            const isMine = s.group === effectiveGroup;
            const displayKind = isMine && swapKind ? swapKind : s.type;
            return (
              <div
                key={s.group}
                className={`rounded-2xl p-3 flex items-center gap-2 transition-all ${
                  isMine
                    ? "glass border-2 border-[var(--sk-primary)] bg-[var(--sk-primary-soft)]"
                    : "glass"
                }`}
              >
                <span
                  className={`size-9 rounded-xl grid place-items-center shrink-0 ${KIND_GRAD[displayKind]}`}
                >
                  {KIND_ICON_MD[displayKind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[13px] font-bold">
                    <span className="truncate">{getGroupTitle(s.group, pat)}</span>
                    {isMine && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] text-[9.5px] font-black shrink-0">
                        شما
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5 truncate">
                    {isMine && swapKind ? (
                      <span className="font-black text-[var(--sk-primary)]">
                        جابه‌جایی: {SHIFT_KIND_FA[swapKind]}
                      </span>
                    ) : (
                      <>
                        <span className="font-black text-[var(--sk-primary)]">{s.code}</span>
                        <span className="text-[var(--sk-text-muted)]">
                          {" "}
                          · {CODE_FA[s.code]}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Colleagues Status on This Day (matching DaySheet.kt lines 355-417) ---- */}
      {showEmployeesOnCalendar && employees.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--sk-text-muted)] mb-2">
            <GroupIcon size={13} className="text-[var(--sk-primary)]" />
            <span>
              وضعیت پرسنل شما در این روز ({toPersianDigits(employees.length)} نفر)
            </span>
          </div>
          <div className="glass rounded-2xl p-2.5 space-y-1.5">
            {employees.map((emp) => {
              const empShift = calculateShift(dateKey, emp.group);
              const log = emp.dayLogs?.[dateKey];
              const isLeave = log?.status === "LEAVE";
              const effKind: ShiftKind =
                log && log.status !== "AS_SCHEDULED" && log.status !== "LEAVE"
                  ? log.status
                  : empShift.type;
              const badgeLabel = isLeave
                ? "مرخصی"
                : log && log.status !== "AS_SCHEDULED"
                  ? CODE_FA[empShift.code]
                  : CODE_FA[empShift.code];
              const displayLabel = isLeave
                ? "مرخصی"
                : log && log.status !== "AS_SCHEDULED"
                  ? `${SHIFT_KIND_FA[effKind]}`
                  : badgeLabel;

              return (
                <div
                  key={emp.id}
                  className="rounded-[11px] bg-[var(--sk-surface)] px-2.5 py-2 flex items-center justify-between gap-2"
                >
                  <span className="text-[12px] font-bold truncate">
                    {emp.name} ({getGroupTitle(emp.group, pat)})
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-[8px] text-[11px] font-black shrink-0 ${
                      isLeave
                        ? "bg-[var(--sk-holiday-soft)] text-[var(--sk-holiday)]"
                        : KIND_GRAD[effKind]
                    }`}
                  >
                    {displayLabel}
                    {log?.overtimeHours
                      ? ` · +${toPersianDigits(log.overtimeHours)}س`
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Overtime & Shift Swap Tracker (matching DaySheet.kt lines 421-546) ---- */}
      <div>
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--sk-text-muted)] mb-2">
          <RefreshIcon size={13} className="text-[var(--sk-primary)]" />
          <span>ثبت اضافه‌کاری و جابه‌جایی شیفت</span>
        </div>
        <div className="glass rounded-2xl p-3 space-y-2.5">
          {/* Overtime row */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[12.5px] font-bold">ساعت اضافه‌کاری</div>
              <div
                className={`text-[10.5px] ${
                  overtimeHours > 0
                    ? "text-[var(--sk-primary)]"
                    : "text-[var(--sk-text-faint)]"
                }`}
              >
                {overtimeHours > 0 ? "ثبت‌شده برای این روز" : "بدون اضافه‌کاری"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={overtimeHours <= 0}
                onClick={() => {
                  haptic(hapticOn);
                  setDayOvertime(dateKey, Math.max(0, overtimeHours - 1));
                }}
                className="size-8 rounded-[10px] bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] grid place-items-center text-[17px] font-black disabled:opacity-40"
                aria-label="کاهش ساعت اضافه‌کاری"
              >
                −
              </button>
              <div
                className={`min-w-[74px] h-8 px-2.5 rounded-[10px] border grid place-items-center text-[12.5px] font-black ${
                  overtimeHours > 0
                    ? "bg-[var(--sk-primary-soft)] border-[var(--sk-primary)] text-[var(--sk-primary)]"
                    : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text-muted)]"
                }`}
              >
                {toPersianDigits(overtimeHours)} ساعت
              </div>
              <button
                type="button"
                disabled={overtimeHours >= 24}
                onClick={() => {
                  haptic(hapticOn);
                  setDayOvertime(dateKey, Math.min(24, overtimeHours + 1));
                }}
                className="size-8 rounded-[10px] bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] grid place-items-center text-[17px] font-black text-[var(--sk-primary)] disabled:opacity-40"
                aria-label="افزایش ساعت اضافه‌کاری"
              >
                +
              </button>
            </div>
          </div>

          <div className="h-[0.5px] bg-[var(--sk-border-soft)]" />

          {/* Shift Swap selector row */}
          <div className="text-[11.5px] font-bold text-[var(--sk-text-muted)]">
            جابه‌جایی نوبت (وضعیت واقعی شما در این روز):
          </div>
          <div
            className={`grid gap-1.5 ${
              (pat.eveningCount ?? 0) > 0 || swapKind === "EVENING" ? "grid-cols-5" : "grid-cols-4"
            }`}
          >
            {(
              [
                { id: null, fa: "برنامه", activeCls: "bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] border-[var(--sk-primary)]" },
                { id: "DAY", fa: "صبح‌کار", activeCls: "sk-grad-day border-[var(--sk-day-ink)]" },
                ...((pat.eveningCount ?? 0) > 0 || swapKind === "EVENING"
                  ? [{ id: "EVENING" as const, fa: "عصرکار", activeCls: "sk-grad-evening border-[var(--sk-evening-ink)]" }]
                  : []),
                { id: "NIGHT", fa: "شب‌کار", activeCls: "sk-grad-night border-[var(--sk-night-ink)]" },
                { id: "REST", fa: "استراحت", activeCls: "sk-grad-rest border-[var(--sk-rest-ink)]" },
              ] as const
            ).map((opt) => {
              const active = swapKind === opt.id;
              return (
                <button
                  key={opt.id ?? "DEFAULT"}
                  type="button"
                  onClick={() => {
                    haptic(hapticOn, 10);
                    setDaySwap(dateKey, opt.id);
                  }}
                  className={`h-[34px] rounded-[11px] text-[10.5px] font-bold border transition-all ${
                    active
                      ? `${opt.activeCls} border-[1.5px]`
                      : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text-muted)]"
                  }`}
                >
                  {opt.fa}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- Personal Note Editor (clean frosted glass style) ---- */}
      <div>
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--sk-text-muted)] mb-2">
          <NotesIcon size={13} className="text-[var(--sk-primary)]" />
          <span>یادداشت شخصی</span>
        </div>
        <div className="glass rounded-2xl p-3 space-y-2 border border-[var(--sk-border)] focus-within:border-[var(--sk-primary)] transition-colors">
          <textarea
            value={text}
            onChange={(e) => {
              if (e.target.value.length <= 500) {
                setText(e.target.value);
                setSaved(false);
              }
            }}
            rows={3}
            placeholder="چیزی برای این روز بنویسید… (خالی = حذف)"
            className="w-full min-h-[72px] bg-transparent text-[14px] leading-6 focus:outline-none resize-none placeholder:text-[var(--sk-text-faint)] select-text"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[var(--sk-text-faint)]">
              {toPersianDigits(text.length)}/{toPersianDigits(500)}
            </span>
            <div className="flex items-center gap-2">
              {text.length > 0 && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="size-9 rounded-xl grid place-items-center text-[var(--sk-holiday)] active:scale-95"
                  aria-label="حذف یادداشت"
                >
                  <TrashIcon size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={onSave}
                className="px-4 py-2 rounded-xl bg-[var(--sk-primary)] text-white text-[13px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
              >
                {saved && <CheckIcon size={14} />}
                <span>{saved ? "ذخیره شد" : "ذخیره"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Inline Export Card (matching DaySheet.kt InlineExportCard lines 594-624) ---- */}
      {exportDayOpen && (
        <div className="glass rounded-[20px] p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="size-9 rounded-xl bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center shrink-0">
                <ImageIcon size={18} />
              </span>
              <span className="text-[14.5px] font-extrabold truncate">
                تصویر {formatJalali(jy, jm, jd)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExportDayOpen(false)}
              className="sk-sheet-btn"
              aria-label="بستن"
            >
              <CloseIcon size={17} />
            </button>
          </div>

          <div className="w-full min-h-[160px] max-h-[300px] rounded-[14px] bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] p-2 flex items-center justify-center overflow-hidden">
            {exportDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={exportDataUrl}
                alt={`تصویر ${formatJalali(jy, jm, jd)}`}
                className="max-h-[280px] w-auto object-contain rounded-[10px]"
              />
            ) : (
              <span className="text-[12.5px] font-bold text-[var(--sk-text-muted)]">
                در حال آماده‌سازی تصویر…
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!exportCanvasRef.current) return;
                haptic(hapticOn, 12);
                const fn = `shiftkar-day-${dateKey}-${effectiveGroup}.png`;
                await shareOrDownloadCanvas(
                  exportCanvasRef.current,
                  fn,
                  `تصویر ${formatJalali(jy, jm, jd)}`,
                );
              }}
              className="h-[46px] rounded-[14px] bg-[var(--sk-primary)] text-white text-[13px] font-black flex items-center justify-center gap-1.5"
            >
              <ShareIcon size={16} />
              <span>اشتراک‌گذاری</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!exportCanvasRef.current) return;
                haptic(hapticOn, 12);
                const fn = `shiftkar-day-${dateKey}-${effectiveGroup}.png`;
                downloadCanvasAsPng(exportCanvasRef.current, fn);
                toast.success("تصویر ذخیره شد");
              }}
              className="h-[46px] rounded-[14px] glass text-[var(--sk-primary)] text-[13px] font-black flex items-center justify-center gap-1.5"
              style={{
                border: "1.5px solid color-mix(in srgb, var(--sk-primary) 55%, transparent)",
              }}
            >
              <DownloadIcon size={16} />
              <span>ذخیرهٔ تصویر</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
