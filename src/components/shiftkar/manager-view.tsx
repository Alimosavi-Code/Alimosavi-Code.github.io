"use client";
/**
 * Shift & Personnel Manager (`ManagerView`) — 5th Main Tab (`مدیریت شیفت و پرسنل`).
 * 100% parity with Android `ShiftManagerScreen.kt` (v6.7.1):
 *  - Sub-tab 1: `الگو و ساخت شیفت`
 *      • Active Pattern Status Banner with `ویرایش الگوی فعال` + `بازگردانی به پیش‌فرض`
 *      • Collapsible Custom Shift Builder with editable Group Cells (`A..H` + quick presets + `+ افزودن گروه`),
 *        4 full-width horizontal `CycleCountRow` steppers, interactive cycle preview strip, and today alignment stepper
 *      • User Custom Patterns + All 45 Built-in Presets (`PRESET_PATTERNS`) with proportional 4-phase color bars
 *        and confirmation dialogs (`ConfirmDeleteDialog`)
 *  - Sub-tab 2: `پرسنل`
 *      • Date inspector + Unified Team Coverage & Leave Conflict Analyzer (`خلاصه وضعیت پرسنل در این روز`)
 *      • `نمایش شیفت افراد روی تقویم` toggle (active by default) + `X روز آزاد مشترک در <ماه>` emerald card
 *      • Add / Edit Employee modal (with pattern selector) + Confirm Delete modal
 *      • Employee cards with `برنامه | مرخصی | صبح‌کار | عصرکار | شب‌کار | استراحت` chips + 7-day comparison strip
 *  - Sub-tab 3: `گزارش کارکرد`
 *      • Monthly / Annual toggle + Period stepper + `تصویر گزارش` PNG export
 *      • 2×2 Payslip Metrics grid + 4-Shift vertical gradient cards + Detailed Overtime/Swap log + Team summary
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  JALALI_MONTHS,
  jalaaliMonthLength,
  jalaaliWeekday,
  makeDateKey,
  parseDateKey,
  toPersianDigits,
  formatJalali,
  formatWeekday,
} from "@/lib/jalali";
import { useToday } from "@/lib/use-today";
import {
  PRESET_PATTERNS,
  getActivePattern,
  getActiveGroups,
  getGroupLetter,
  getGroupTitle,
  isBuiltInPreset,
  isPresetModified,
  getDefaultPreset,
  resolvePattern,
  calculateShift,
  getShiftCode,
  getShiftCodeForPattern,
  jalaliToJdn,
  type ShiftPatternSpec,
  type ShiftPhase,
} from "@/lib/shift-engine";
import { isHoliday } from "@/lib/holidays";
import {
  ALL_SHIFT_GROUPS,
  CODE_FA,
  CODE_NUM_FA,
  SHIFT_KIND_FA,
  codeToKind,
  forKindAndOrdinal,
  type ShiftCode,
  type ShiftGroup,
  type ShiftKind,
} from "@/lib/models";
import {
  useShiftKar,
  haptic,
  type EmployeeProfile,
  type EmployeeDayStatus,
} from "@/lib/store";
import { listNotes } from "@/lib/notes-store";
import { renderWorkReportCanvas, type WorkReportSnapshot } from "@/lib/image-exporter";
import { ExportImageDialog } from "./export-dialog";
import { Sheet } from "./sheet";
import {
  CheckIcon,
  TrashIcon,
  EditIcon,
  RefreshIcon,
  GroupIcon,
  PaletteIcon,
  SparkIcon,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUpIcon,
  SunIcon,
  SunsetIcon,
  MoonIcon,
  RestIcon,
  HolidayIcon,
  ImageIcon,
  CloseIcon,
} from "./icons";

type SubTab = "patterns" | "personnel" | "report";

const KIND_GRAD: Record<ShiftKind, string> = {
  DAY: "sk-grad-day",
  EVENING: "sk-grad-evening",
  NIGHT: "sk-grad-night",
  REST: "sk-grad-rest",
};

const KIND_ICON_SM: Record<ShiftKind, React.ReactNode> = {
  DAY: <SunIcon size={15} />,
  EVENING: <SunsetIcon size={15} />,
  NIGHT: <MoonIcon size={15} />,
  REST: <RestIcon size={15} />,
};

function addDaysJalali(jy: number, jm: number, jd: number, delta: number) {
  let y = jy;
  let m = jm;
  let d = jd + delta;
  while (d > jalaaliMonthLength(y, m)) {
    d -= jalaaliMonthLength(y, m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  while (d < 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    d += jalaaliMonthLength(y, m);
  }
  return { jy: y, jm: m, jd: d };
}

export function ManagerView({ onOpenDay }: { onOpenDay: (dateKey: string) => void }) {
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const employees = useShiftKar((s) => s.employees);
  const [subTab, setSubTab] = useState<SubTab>("patterns");

  return (
    <div className="h-full overflow-y-auto sk-scroll overscroll-contain px-4 md:px-6 pt-3.5 pb-[calc(env(safe-area-inset-bottom)+108px)] space-y-3">
      {/* Header (matching ShiftManagerScreen.kt lines 66-85) */}
      <header className="text-center">
        <h1 className="text-[20px] font-black">مدیریت شیفت و پرسنل</h1>
        <p className="text-[11.5px] text-[var(--sk-text-muted)] mt-0.5">
          طراحی و انتخاب الگوی نوبت‌کاری و مدیریت برنامهٔ همکاران
        </p>
      </header>

      {/* 3 Sub-Tabs */}
      <div className="sk-seg grid-cols-3">
        {(
          [
            { id: "patterns", fa: "الگو و ساخت شیفت" },
            { id: "personnel", fa: `پرسنل (${toPersianDigits(employees.length)})` },
            { id: "report", fa: "گزارش کارکرد" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              haptic(hapticOn);
              setSubTab(t.id);
            }}
            className={`sk-seg-item !text-[12px] ${subTab === t.id ? "is-active" : ""}`}
          >
            {t.fa}
          </button>
        ))}
      </div>

      {subTab === "patterns" && <PatternsSubTab />}
      {subTab === "personnel" && <PersonnelSubTab onOpenDay={onOpenDay} />}
      {subTab === "report" && <ReportSubTab onOpenDay={onOpenDay} />}
    </div>
  );
}

/* =========================================================================
   Sub-Tab 1: الگو و ساخت شیفت (100% Parity with ShiftPatternsSection in ShiftManagerScreen.kt)
   ========================================================================= */
function PatternsSubTab() {
  const activePatternId = useShiftKar((s) => s.activePatternId);
  const customPatterns = useShiftKar((s) => s.customPatterns);
  const myGroup = useShiftKar((s) => s.myGroup);
  const selectPattern = useShiftKar((s) => s.selectPattern);
  const saveCustomPattern = useShiftKar((s) => s.saveCustomPattern);
  const deleteCustomPattern = useShiftKar((s) => s.deleteCustomPattern);
  const restoreAllPresetsToDefault = useShiftKar((s) => s.restoreAllPresetsToDefault);
  const hapticOn = useShiftKar((s) => s.hapticOn);

  const today = useToday();
  const todayKey = useMemo(() => makeDateKey(today.jy, today.jm, today.jd), [today]);

  const activePattern = useMemo(
    () => resolvePattern(activePatternId, customPatterns),
    [activePatternId, customPatterns],
  );
  const todayCode = useMemo(
    () => getShiftCodeForPattern(todayKey, myGroup, activePattern),
    [todayKey, myGroup, activePattern],
  );
  const todayKind = codeToKind(todayCode);
  const isActivePresetModified = useMemo(
    () => isPresetModified(activePattern.id, customPatterns),
    [activePattern.id, customPatterns],
  );

  /* Confirmation dialog states */
  const [patternPendingDelete, setPatternPendingDelete] = useState<ShiftPatternSpec | null>(null);
  const [presetPendingRestore, setPresetPendingRestore] = useState<ShiftPatternSpec | null>(null);
  const [restoreAllConfirmOpen, setRestoreAllConfirmOpen] = useState(false);

  /* Builder & Preset-Editor states (matching ShiftManagerScreen.kt lines 133-155) */
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingPatternId, setEditingPatternId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("شیفت سفارشی من");
  const [dayCount, setDayCount] = useState(2);
  const [eveningCount, setEveningCount] = useState(2);
  const [nightCount, setNightCount] = useState(2);
  const [restCount, setRestCount] = useState(2);
  const [todayCycleStep, setTodayCycleStep] = useState(0);
  const [noGroupMode, setNoGroupMode] = useState(false);
  const [groupCells, setGroupCells] = useState<string[]>(["A", "B", "C", "D"]);

  const buildCycleListForCounts = (d: number, e: number, n: number, r: number): ShiftCode[] => {
    const list: ShiftCode[] = [];
    for (let i = 1; i <= d; i++) list.push(forKindAndOrdinal("DAY", i));
    for (let i = 1; i <= e; i++) list.push(forKindAndOrdinal("EVENING", i));
    for (let i = 1; i <= n; i++) list.push(forKindAndOrdinal("NIGHT", i));
    for (let i = 1; i <= r; i++) list.push(forKindAndOrdinal("REST", i));
    if (list.length === 0) list.push("R1");
    return list;
  };

  const previewCycle = useMemo(
    () => buildCycleListForCounts(dayCount, eveningCount, nightCount, restCount),
    [dayCount, eveningCount, nightCount, restCount],
  );
  const safeStep = Math.max(0, Math.min(previewCycle.length - 1, todayCycleStep));
  const stepCode = previewCycle[safeStep] ?? "R1";

  const loadPatternIntoBuilder = (pat: ShiftPatternSpec) => {
    setEditingPatternId(pat.id);
    setCustomName(pat.name);
    const d = Math.max(0, Math.min(24, pat.dayCount));
    const e = Math.max(0, Math.min(24, pat.eveningCount ?? 0));
    const n = Math.max(0, Math.min(24, pat.nightCount));
    const r = Math.max(1, Math.min(24, pat.restCount));
    setDayCount(d);
    setEveningCount(e);
    setNightCount(n);
    setRestCount(r);
    setNoGroupMode(!pat.hasGroups);
    if (!pat.hasGroups) {
      setGroupCells(["A", "B", "C", "D"]);
    } else {
      const cnt = Math.max(1, Math.min(8, pat.groupCount || 4));
      setGroupCells(
        ALL_SHIFT_GROUPS.slice(0, cnt).map((g) => pat.groupLabels?.[g]?.trim() || g),
      );
    }
    const cyc = buildCycleListForCounts(d, e, n, r);
    const curCode = getShiftCodeForPattern(todayKey, myGroup, pat);
    const idx = cyc.indexOf(curCode);
    setTodayCycleStep(idx >= 0 ? idx : 0);
    setBuilderOpen(true);
  };

  const handleSaveBuilder = () => {
    haptic(hapticOn, 18);
    const total = Math.max(1, previewCycle.length);
    const cleanedCells = groupCells.map((c) => c.trim()).filter((c) => c.length > 0);
    const hasGroupsFlag = !noGroupMode && cleanedCells.length > 0;
    const grpCount = !hasGroupsFlag
      ? 1
      : Math.max(1, Math.min(ALL_SHIFT_GROUPS.length, cleanedCells.length));
    const stepGap = Math.max(1, Math.floor(total / grpCount));

    const offsets: Partial<Record<ShiftGroup, number>> = {};
    const resolvedLabels: Partial<Record<ShiftGroup, string>> = {};
    ALL_SHIFT_GROUPS.forEach((g, idx) => {
      offsets[g] = !hasGroupsFlag ? 0 : (stepGap * idx) % total;
      resolvedLabels[g] = cleanedCells[idx] ?? g;
    });

    const myOff = offsets[myGroup] ?? 0;
    const todayJdn = jalaliToJdn(today.jy, today.jm, today.jd);
    const anchorJdn = todayJdn + myOff - safeStep;
    const wasEditing = editingPatternId !== null;
    const id = editingPatternId ?? `custom_${Date.now()}`;
    const title = customName.trim() || "شیفت سفارشی";
    const activeNames = cleanedCells.slice(0, grpCount).join("/");

    const parts: string[] = [];
    if (dayCount > 0) parts.push(`${toPersianDigits(dayCount)} روز صبح‌کار`);
    if (eveningCount > 0) parts.push(`${toPersianDigits(eveningCount)} روز عصرکار`);
    if (nightCount > 0) parts.push(`${toPersianDigits(nightCount)} روز شب‌کار`);
    parts.push(`${toPersianDigits(restCount)} روز استراحت`);
    const groupSuffix = !hasGroupsFlag
      ? " (بدون گروه / فردی)"
      : ` (${toPersianDigits(grpCount)} گروه: ${activeNames})`;

    const phases: ShiftPhase[] = [];
    if (dayCount > 0) phases.push({ kind: "DAY", count: dayCount });
    if (eveningCount > 0) phases.push({ kind: "EVENING", count: eveningCount });
    if (nightCount > 0) phases.push({ kind: "NIGHT", count: nightCount });
    if (restCount > 0) phases.push({ kind: "REST", count: restCount });

    const spec: ShiftPatternSpec = {
      id,
      name: title,
      subtitle: `${parts.join(" · ")}${groupSuffix}`,
      dayCount,
      eveningCount,
      nightCount,
      restCount,
      anchorJdn,
      groupOffsets: offsets,
      isWeeklyAdmin: false,
      isCustom: true,
      hasGroups: hasGroupsFlag,
      groupCount: grpCount,
      groupLabels: resolvedLabels,
      phases,
    };

    saveCustomPattern(spec);
    setEditingPatternId(null);
    setBuilderOpen(false);
    toast.success(
      wasEditing
        ? `تغییرات الگوی «${title}» ذخیره و در برنامه اعمال شد`
        : `الگوی «${title}» ساخته و در کل برنامه فعال شد`,
    );
  };

  const pureCustomPatterns = useMemo(
    () => customPatterns.filter((p) => !isBuiltInPreset(p.id)),
    [customPatterns],
  );
  const anyBuiltInModified = useMemo(
    () => customPatterns.some((p) => isBuiltInPreset(p.id)),
    [customPatterns],
  );

  return (
    <div className="space-y-3.5">
      {/* 1. Active Pattern Status Banner (matching ShiftManagerScreen.kt lines 161-312) */}
      <div
        className="glass rounded-[22px] p-3.5 space-y-2 border-[1.5px] border-[var(--sk-primary)]"
        style={{ backgroundColor: "var(--sk-primary-soft)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="size-9 rounded-xl bg-[var(--sk-primary-soft)] border border-[var(--sk-primary)]/55 text-[var(--sk-primary)] shadow-[0_6px_16px_-8px_var(--sk-glow-a),inset_0_1px_0_var(--sk-specular)] grid place-items-center shrink-0">
            <SparkIcon size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-bold text-[var(--sk-primary)] truncate">
                سیستم نوبت‌کاری فعال در کل برنامه
              </span>
              {isActivePresetModified && (
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--sk-surface-strong)] text-[9px] font-black text-[var(--sk-primary)] shrink-0">
                  ویرایش‌شده
                </span>
              )}
            </div>
            <div className="text-[14.5px] font-black truncate">{activePattern.name}</div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[var(--sk-surface-strong)] border border-[var(--sk-border)] text-[11px] font-black text-[var(--sk-primary)] shrink-0">
            {getGroupTitle(myGroup, activePattern)}
          </span>
        </div>

        <p className="text-[11px] text-[var(--sk-text-muted)] leading-5">
          {activePattern.subtitle}
        </p>

        <div
          className={`rounded-xl px-3 py-2 flex items-center justify-between ${KIND_GRAD[todayKind]}`}
        >
          <span className="text-[11.5px] font-bold text-[var(--sk-text)]">
            وضعیت امروز شما با این الگو:
          </span>
          <span className="flex items-center gap-1.5 text-[12.5px] font-black">
            {KIND_ICON_SM[todayKind]}
            <span>{CODE_FA[todayCode]}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              loadPatternIntoBuilder(activePattern);
            }}
            className="flex-1 py-2 px-2.5 rounded-xl bg-[var(--sk-surface-strong)] text-[11.5px] font-extrabold text-[var(--sk-primary)] flex items-center justify-center gap-1.5"
            style={{
              border: "1px solid color-mix(in srgb, var(--sk-primary) 55%, transparent)",
            }}
          >
            <EditIcon size={14} />
            <span>ویرایش الگوی فعال</span>
          </button>
          {isActivePresetModified && (
            <button
              type="button"
              onClick={() => {
                haptic(hapticOn);
                setPresetPendingRestore(activePattern);
              }}
              className="flex-1 py-2 px-2.5 rounded-xl bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/50 text-[11.5px] font-extrabold text-[var(--sk-holiday)] flex items-center justify-center gap-1.5"
            >
              <RefreshIcon size={14} />
              <span>بازگردانی به پیش‌فرض</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Custom Shift Builder Trigger Card (opens Popup Sheet) */}
      <button
        type="button"
        onClick={() => {
          haptic(hapticOn);
          setEditingPatternId(null);
          setCustomName("شیفت سفارشی من");
          setDayCount(2);
          setEveningCount(0);
          setNightCount(2);
          setRestCount(4);
          setNoGroupMode(false);
          setGroupCells(["A", "B", "C", "D"]);
          setTodayCycleStep(0);
          setBuilderOpen(true);
        }}
        className="w-full glass rounded-[22px] p-3.5 flex items-center gap-2.5 text-start border border-[var(--sk-border)] hover:border-[var(--sk-primary)]/60 active:scale-[0.99] transition-all"
      >
        <span className="size-9 rounded-[11px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center shrink-0">
          <PaletteIcon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-extrabold text-[var(--sk-primary)] truncate">
            + ساخت سیستم شیفت سفارشی جدید
          </div>
          <div className="text-[11px] text-[var(--sk-text-muted)] truncate">
            طراحی چرخه با صبح‌کار، عصرکار، شب‌کار، استراحت و گروه‌های دلخواه
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-[var(--sk-primary-soft)] text-[11px] font-black text-[var(--sk-primary)] shrink-0">
          طراحی الگو
        </span>
      </button>

      {/* Pattern Editor / Custom Builder Popup Modal Sheet */}
      <Sheet
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title={
          editingPatternId
            ? `ویرایش الگوی «${customName}»`
            : "ساخت سیستم شیفت سفارشی"
        }
      >
        <div className="px-4 pb-8 pt-2 space-y-3">

            {editingPatternId && (
              <div
                className="rounded-xl bg-[var(--sk-primary-soft)] px-2.5 py-2 flex items-center justify-between gap-2"
                style={{
                  border: "1px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
                }}
              >
                <span className="text-[11px] font-black text-[var(--sk-primary)]">
                  {isBuiltInPreset(editingPatternId)
                    ? "در حال ویرایش الگوی آماده"
                    : "در حال ویرایش الگوی سفارشی"}
                </span>
                <div className="flex items-center gap-1.5">
                  {isPresetModified(editingPatternId, customPatterns) && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic(hapticOn);
                        const target = resolvePattern(editingPatternId, customPatterns);
                        setPresetPendingRestore(target);
                      }}
                      className="px-2 py-1 rounded-lg bg-[var(--sk-holiday-soft)] text-[10px] font-bold text-[var(--sk-holiday)]"
                    >
                      بازگردانی پیش‌فرض
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      haptic(hapticOn);
                      setEditingPatternId(null);
                      setCustomName("شیفت سفارشی من");
                    }}
                    className="px-2 py-1 rounded-lg bg-[var(--sk-surface-strong)] text-[10px] font-bold text-[var(--sk-text-muted)]"
                  >
                    ساخت الگوی جدید
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11.5px] font-bold text-[var(--sk-text-muted)] mb-1">
                {editingPatternId ? "نام الگو:" : "نام الگوی سفارشی:"}
              </label>
              <input
                value={customName}
                onChange={(e) => {
                  if (e.target.value.length <= 40) setCustomName(e.target.value);
                }}
                className="w-full px-3 py-2.5 rounded-[14px] bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[13.5px] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--sk-primary)] select-text"
              />
            </div>

            {/* Dynamic Shift Groups section (matching ShiftManagerScreen.kt lines 441-617) */}
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-[var(--sk-text-muted)]">
                گروه‌های شیفت (حذف، ویرایش یا افزودن):
              </span>
              <span className="text-[11px] font-black text-[var(--sk-primary)]">
                {noGroupMode
                  ? "شیفت فردی (بدون گروه)"
                  : `${toPersianDigits(groupCells.length)} گروه فعال`}
              </span>
            </div>

            {/* Quick Presets Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {(
                [
                  { lbl: "چهار گروه (A..D)", isNoGrp: false, list: ["A", "B", "C", "D"] },
                  { lbl: "سه گروه (A..C)", isNoGrp: false, list: ["A", "B", "C"] },
                  { lbl: "دو گروه (A, B)", isNoGrp: false, list: ["A", "B"] },
                  { lbl: "گروه‌های E..H", isNoGrp: false, list: ["E", "F", "G", "H"] },
                  { lbl: "الف تا د", isNoGrp: false, list: ["الف", "ب", "ج", "د"] },
                  { lbl: "بدون گروه (فردی)", isNoGrp: true, list: [] },
                ] as const
              ).map((preset) => {
                const active =
                  (noGroupMode && preset.isNoGrp) ||
                  (!noGroupMode &&
                    !preset.isNoGrp &&
                    groupCells.length === preset.list.length &&
                    groupCells.every((v, i) => v === preset.list[i]));
                return (
                  <button
                    key={preset.lbl}
                    type="button"
                    onClick={() => {
                      haptic(hapticOn);
                      if (preset.isNoGrp) {
                        setNoGroupMode(true);
                      } else {
                        setNoGroupMode(false);
                        setGroupCells([...preset.list]);
                      }
                    }}
                    className={`h-8 px-2 rounded-[10px] text-[10.5px] font-bold border transition-all flex items-center justify-center text-center truncate ${
                      active
                        ? "bg-[var(--sk-primary-soft)] border-[1.4px] border-[var(--sk-primary)] text-[var(--sk-primary)]"
                        : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text-muted)]"
                    }`}
                  >
                    {preset.lbl}
                  </button>
                );
              })}
            </div>

            {/* Editable Group Cells Grid (4 columns, matching ShiftManagerScreen.kt lines 494-615) */}
            {!noGroupMode && (
              <div className="rounded-[14px] bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] p-2.5">
                <div className="grid grid-cols-4 gap-1.5">
                  {groupCells.map((curVal, cellIdx) => (
                    <div
                      key={cellIdx}
                      className="rounded-xl bg-[var(--sk-surface-strong)] p-1.5 flex flex-col items-center"
                      style={{
                        border:
                          "1px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
                      }}
                    >
                      <div className="w-full flex items-center justify-between">
                        <span className="text-[9px] font-bold text-[var(--sk-text-muted)]">
                          گروه {toPersianDigits(cellIdx + 1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            haptic(hapticOn);
                            if (groupCells.length <= 1) {
                              setNoGroupMode(true);
                            } else {
                              setGroupCells((prev) => prev.filter((_, i) => i !== cellIdx));
                            }
                          }}
                          className="size-[18px] rounded-full bg-[var(--sk-holiday-soft)] text-[var(--sk-holiday)] grid place-items-center"
                          aria-label="حذف گروه"
                        >
                          <CloseIcon size={10} />
                        </button>
                      </div>
                      <input
                        value={curVal}
                        onChange={(e) => {
                          if (e.target.value.length <= 6) {
                            const val = e.target.value;
                            setGroupCells((prev) =>
                              prev.map((item, idx) => (idx === cellIdx ? val : item)),
                            );
                          }
                        }}
                        className="w-full text-center text-[13px] font-black text-[var(--sk-primary)] bg-transparent py-1 focus:outline-none select-text"
                      />
                    </div>
                  ))}
                  {groupCells.length < 8 && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic(hapticOn);
                        const pool = ["A", "B", "C", "D", "E", "F", "G", "H"];
                        const nextLetter =
                          pool.find((l) => !groupCells.includes(l)) ??
                          String(groupCells.length + 1);
                        setGroupCells((prev) => [...prev, nextLetter]);
                      }}
                      className="min-h-[56px] rounded-xl bg-[var(--sk-primary-soft)] border-[1.2px] border-[var(--sk-primary)] text-[var(--sk-primary)] flex flex-col items-center justify-center"
                    >
                      <span className="text-[16px] font-black leading-none">+</span>
                      <span className="text-[9px] font-extrabold mt-0.5">افزودن گروه</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 4 Full-Width Horizontal CycleCountRow Steppers (matching ShiftManagerScreen.kt lines 619-656) */}
            <CycleCountRow
              icon={<SunIcon size={15} />}
              label="تعداد روز صبح‌کار"
              count={dayCount}
              minVal={0}
              maxVal={24}
              gradCls="sk-grad-day"
              onChange={(v) => {
                haptic(hapticOn);
                setDayCount(v);
              }}
            />
            <CycleCountRow
              icon={<SunsetIcon size={15} />}
              label="تعداد روز عصرکار"
              count={eveningCount}
              minVal={0}
              maxVal={24}
              gradCls="sk-grad-evening"
              onChange={(v) => {
                haptic(hapticOn);
                setEveningCount(v);
              }}
            />
            <CycleCountRow
              icon={<MoonIcon size={15} />}
              label="تعداد روز شب‌کار"
              count={nightCount}
              minVal={0}
              maxVal={24}
              gradCls="sk-grad-night"
              onChange={(v) => {
                haptic(hapticOn);
                setNightCount(v);
              }}
            />
            <CycleCountRow
              icon={<RestIcon size={15} />}
              label="تعداد روز استراحت"
              count={restCount}
              minVal={1}
              maxVal={24}
              gradCls="sk-grad-rest"
              onChange={(v) => {
                haptic(hapticOn);
                setRestCount(v);
              }}
            />

            {/* Interactive Cycle Preview Strip */}
            <div className="text-[11px] font-bold text-[var(--sk-text-muted)]">
              پیش‌نمایش چرخه ({toPersianDigits(previewCycle.length)} روزه — برای انتخاب روزِ امروز لمس کنید):
            </div>
            <div className="flex items-center gap-1 overflow-x-auto sk-scroll pb-0.5">
              {previewCycle.map((c, idx) => {
                const k = codeToKind(c);
                const isPickedToday = idx === safeStep;
                return (
                  <button
                    key={`${c}-${idx}`}
                    type="button"
                    onClick={() => {
                      haptic(hapticOn);
                      setTodayCycleStep(idx);
                    }}
                    className={`shrink-0 h-[30px] px-2 rounded-[8px] text-[10px] font-black transition-all ${KIND_GRAD[k]} ${
                      isPickedToday
                        ? "ring-2 ring-[var(--sk-primary)]"
                        : "border border-current/35"
                    }`}
                  >
                    {CODE_NUM_FA[c]}
                  </button>
                );
              })}
            </div>

            {/* Today Alignment Stepper Box */}
            <div className="rounded-[14px] bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] p-2.5 space-y-1.5">
              <div className="text-[11px] font-bold text-[var(--sk-text-muted)]">
                تنظیم با تاریخ امروز ({formatJalali(today.jy, today.jm, today.jd)} —{" "}
                {getGroupTitle(myGroup, activePattern)}):
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptic(hapticOn);
                    setTodayCycleStep(
                      (safeStep - 1 + previewCycle.length) % previewCycle.length,
                    );
                  }}
                  className="size-8 rounded-[9px] bg-[var(--sk-surface-strong)] grid place-items-center"
                >
                  <ChevronRight size={15} />
                </button>
                <span className="text-[12px] font-black text-[var(--sk-primary)] text-center">
                  امروز: {CODE_FA[stepCode]} (روز {toPersianDigits(safeStep + 1)} از{" "}
                  {toPersianDigits(previewCycle.length)})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    haptic(hapticOn);
                    setTodayCycleStep((safeStep + 1) % previewCycle.length);
                  }}
                  className="size-8 rounded-[9px] bg-[var(--sk-surface-strong)] grid place-items-center"
                >
                  <ChevronLeft size={15} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBuilderOpen(false)}
                className="flex-1 py-3 rounded-[14px] bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[12.5px] font-bold text-[var(--sk-text-muted)]"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveBuilder}
                className="flex-[2] py-3 rounded-[14px] bg-[var(--sk-primary)] text-white text-[13px] font-black flex items-center justify-center gap-2 shadow-[0_10px_24px_-8px_var(--sk-glow-a)] active:scale-[0.98] transition-transform"
              >
                <CheckIcon size={16} />
                <span>
                  {editingPatternId
                    ? "ذخیرهٔ تغییرات الگو"
                    : "ذخیره و فعال‌سازی الگو"}
                </span>
              </button>
            </div>
        </div>
      </Sheet>

      {/* 3. User's Saved Custom Patterns */}
      {pureCustomPatterns.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[13px] font-extrabold text-[var(--sk-primary)]">
            الگوهای سفارشی ساخته‌شده توسط شما
          </h4>
          {pureCustomPatterns.map((pat) => (
            <PatternCard
              key={pat.id}
              pat={pat}
              isActive={activePatternId === pat.id}
              isModifiedBuiltIn={false}
              onActivate={() => {
                haptic(hapticOn);
                selectPattern(pat.id);
                toast.success(`الگوی «${pat.name}» فعال شد`);
              }}
              onEdit={() => {
                haptic(hapticOn);
                loadPatternIntoBuilder(pat);
              }}
              onRestoreDefault={null}
              onDelete={() => {
                haptic(hapticOn);
                setPatternPendingDelete(pat);
              }}
            />
          ))}
        </div>
      )}

      {/* 4. Built-in Presets (45 Patterns) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[12.5px] font-extrabold text-[var(--sk-primary)]">
            فهرست کامل الگوهای آماده ({toPersianDigits(PRESET_PATTERNS.length)} الگوی استاندارد)
          </h4>
          {anyBuiltInModified && (
            <button
              type="button"
              onClick={() => {
                haptic(hapticOn);
                setRestoreAllConfirmOpen(true);
              }}
              className="px-2.5 py-1 rounded-full bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/45 text-[10px] font-black text-[var(--sk-holiday)] flex items-center gap-1 shrink-0"
            >
              <RefreshIcon size={12} />
              <span>بازگردانی همه به پیش‌فرض</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {PRESET_PATTERNS.map((defaultPat) => {
            const resolvedPat = resolvePattern(defaultPat.id, customPatterns);
            const isMod = isPresetModified(defaultPat.id, customPatterns);
            return (
              <PatternCard
                key={defaultPat.id}
                pat={resolvedPat}
                isActive={activePatternId === defaultPat.id}
                isModifiedBuiltIn={isMod}
                onActivate={() => {
                  haptic(hapticOn);
                  selectPattern(defaultPat.id);
                  toast.success(`الگوی «${resolvedPat.name}» در برنامه فعال شد`);
                }}
                onEdit={() => {
                  haptic(hapticOn);
                  loadPatternIntoBuilder(resolvedPat);
                }}
                onRestoreDefault={
                  isMod
                    ? () => {
                        haptic(hapticOn);
                        setPresetPendingRestore(resolvedPat);
                      }
                    : null
                }
                onDelete={null}
              />
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialogs */}
      {patternPendingDelete && (
        <ConfirmDeleteDialog
          title="حذف الگوی سفارشی"
          message={`آیا از حذف الگوی «${patternPendingDelete.name}» اطمینان دارید؟`}
          confirmLabel="حذف الگو"
          onConfirm={() => {
            haptic(hapticOn, 16);
            if (editingPatternId === patternPendingDelete.id) setEditingPatternId(null);
            deleteCustomPattern(patternPendingDelete.id);
            toast.success(`الگوی «${patternPendingDelete.name}» حذف شد`);
            setPatternPendingDelete(null);
          }}
          onDismiss={() => setPatternPendingDelete(null)}
        />
      )}

      {presetPendingRestore && (
        <ConfirmDeleteDialog
          title="بازگردانی به حالت پیش‌فرض"
          message={`آیا می‌خواهید الگوی «${
            getDefaultPreset(presetPendingRestore.id)?.name ?? presetPendingRestore.name
          }» به تنظیمات اولیه و پیش‌فرض کارخانه برگردد؟`}
          confirmLabel="بازگردانی پیش‌فرض"
          onConfirm={() => {
            haptic(hapticOn, 16);
            if (editingPatternId === presetPendingRestore.id) {
              setEditingPatternId(null);
              setBuilderOpen(false);
            }
            deleteCustomPattern(presetPendingRestore.id);
            toast.success(
              `الگوی «${
                getDefaultPreset(presetPendingRestore.id)?.name ?? presetPendingRestore.name
              }» به حالت پیش‌فرض بازگردانی شد`,
            );
            setPresetPendingRestore(null);
          }}
          onDismiss={() => setPresetPendingRestore(null)}
        />
      )}

      {restoreAllConfirmOpen && (
        <ConfirmDeleteDialog
          title="بازگردانی همهٔ الگوهای آماده"
          message="آیا می‌خواهید تمام تغییرات اعمال‌شده روی الگوهای آماده به حالت پیش‌فرض اولیه برگردد؟ (الگوهای سفارشیِ جدید شما حذف نمی‌شوند)"
          confirmLabel="بازگردانی همه"
          onConfirm={() => {
            haptic(hapticOn, 16);
            if (editingPatternId && isBuiltInPreset(editingPatternId)) {
              setEditingPatternId(null);
              setBuilderOpen(false);
            }
            restoreAllPresetsToDefault();
            setRestoreAllConfirmOpen(false);
            toast.success("همهٔ الگوهای آماده به حالت پیش‌فرض بازگردانی شدند");
          }}
          onDismiss={() => setRestoreAllConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function CycleCountRow({
  icon,
  label,
  count,
  minVal,
  maxVal,
  gradCls,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  minVal: number;
  maxVal: number;
  gradCls: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="rounded-[14px] bg-[var(--sk-surface)] px-2.5 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`size-7 rounded-[8px] grid place-items-center shrink-0 ${gradCls}`}>
          {icon}
        </span>
        <span className="text-[12px] font-bold truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled={count <= minVal}
          onClick={() => onChange(Math.max(minVal, count - 1))}
          className="size-7 rounded-[8px] bg-[var(--sk-surface-strong)] grid place-items-center text-[15px] font-black disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[48px] text-center text-[12.5px] font-black">
          {toPersianDigits(count)} روز
        </span>
        <button
          type="button"
          disabled={count >= maxVal}
          onClick={() => onChange(Math.min(maxVal, count + 1))}
          className="size-7 rounded-[8px] bg-[var(--sk-surface-strong)] grid place-items-center text-[15px] font-black text-[var(--sk-primary)] disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function PatternCard({
  pat,
  isActive,
  isModifiedBuiltIn,
  onActivate,
  onEdit,
  onRestoreDefault,
  onDelete,
}: {
  pat: ShiftPatternSpec;
  isActive: boolean;
  isModifiedBuiltIn: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onRestoreDefault: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  const effectivePhases: ShiftPhase[] = useMemo(() => {
    if (pat.phases && pat.phases.length > 0) return pat.phases;
    const list: ShiftPhase[] = [];
    if (pat.dayCount > 0) list.push({ kind: "DAY", count: pat.dayCount });
    if ((pat.eveningCount ?? 0) > 0)
      list.push({ kind: "EVENING", count: pat.eveningCount ?? 0 });
    if (pat.nightCount > 0) list.push({ kind: "NIGHT", count: pat.nightCount });
    if (pat.restCount > 0) list.push({ kind: "REST", count: pat.restCount });
    return list;
  }, [pat]);

  return (
    <div
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={`glass rounded-[18px] p-3 space-y-2 cursor-pointer transition-all ${
        isActive
          ? "border-[1.8px] border-[var(--sk-primary)] bg-[var(--sk-primary-soft)]"
          : "border border-[var(--sk-border-soft)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 pe-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[13.5px] font-extrabold truncate ${
                isActive ? "text-[var(--sk-primary)]" : "text-[var(--sk-text)]"
              }`}
            >
              {pat.name}
            </span>
            {isModifiedBuiltIn && (
              <span className="px-1.5 py-0.5 rounded-full bg-[var(--sk-primary-soft)] text-[9px] font-black text-[var(--sk-primary)] shrink-0">
                ویرایش‌شده
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--sk-text-muted)] mt-0.5 truncate">
            {pat.subtitle}
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onEdit}
            className="size-8 rounded-[10px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center"
            style={{
              border: "1px solid color-mix(in srgb, var(--sk-primary) 35%, transparent)",
            }}
            title="ویرایش الگو"
            aria-label="ویرایش الگو"
          >
            <EditIcon size={14} />
          </button>
          {onRestoreDefault && (
            <button
              type="button"
              onClick={onRestoreDefault}
              className="size-8 rounded-[10px] bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/35 text-[var(--sk-holiday)] grid place-items-center"
              title="بازگردانی به پیش‌فرض"
              aria-label="بازگردانی به پیش‌فرض"
            >
              <RefreshIcon size={14} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="size-8 rounded-[10px] bg-[var(--sk-holiday-soft)] text-[var(--sk-holiday)] grid place-items-center"
              title="حذف الگو"
              aria-label="حذف الگو"
            >
              <TrashIcon size={15} />
            </button>
          )}
          <span
            onClick={onActivate}
            className={`px-3 py-1.5 rounded-full text-[11px] font-black border ${
              isActive
                ? "bg-[var(--sk-primary-soft)] border-[1.4px] border-[var(--sk-primary)] text-[var(--sk-primary)] shadow-[0_6px_16px_-8px_var(--sk-glow-a),inset_0_1px_0_var(--sk-specular)]"
                : "bg-[var(--sk-surface-strong)] border-[var(--sk-border-soft)] text-[var(--sk-primary)]"
            }`}
          >
            {isActive ? "فعال" : "اعمال الگو"}
          </span>
        </div>
      </div>

      {/* Mini visual color bar of the cycle phases (matching ShiftManagerScreen.kt lines 868-881) */}
      <div className="flex h-2 w-full rounded-full overflow-hidden gap-[2px]">
        {effectivePhases.map((ph, idx) => {
          const bg =
            ph.kind === "DAY"
              ? "var(--sk-day)"
              : ph.kind === "EVENING"
                ? "var(--sk-evening)"
                : ph.kind === "NIGHT"
                  ? "var(--sk-night)"
                  : "var(--sk-rest)";
          return (
            <span
              key={idx}
              className="h-full first:rounded-s-full last:rounded-e-full"
              style={{
                flexGrow: Math.max(0.5, ph.count),
                backgroundColor: bg,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   Sub-Tab 2: پرسنل (100% Parity with EmployeesManagerSection in ShiftManagerScreen.kt)
   ========================================================================= */
function PersonnelSubTab({ onOpenDay }: { onOpenDay: (dateKey: string) => void }) {
  const myGroup = useShiftKar((s) => s.myGroup);
  const viewYear = useShiftKar((s) => s.viewYear);
  const viewMonth = useShiftKar((s) => s.viewMonth);
  const employees = useShiftKar((s) => s.employees);
  const dayRecords = useShiftKar((s) => s.dayRecords);
  const activePatternId = useShiftKar((s) => s.activePatternId);
  const customPatterns = useShiftKar((s) => s.customPatterns);
  const showEmployeesOnCalendar = useShiftKar((s) => s.showEmployeesOnCalendar);
  const addOrUpdateEmployee = useShiftKar((s) => s.addOrUpdateEmployee);
  const removeEmployee = useShiftKar((s) => s.removeEmployee);
  const setEmployeeDayLog = useShiftKar((s) => s.setEmployeeDayLog);
  const set = useShiftKar((s) => s.set);
  const hapticOn = useShiftKar((s) => s.hapticOn);

  const today = useToday();
  const [dayOffset, setDayOffset] = useState(0);

  const targetDate = useMemo(
    () => addDaysJalali(today.jy, today.jm, today.jd, dayOffset),
    [today, dayOffset],
  );
  const targetKey = useMemo(
    () => makeDateKey(targetDate.jy, targetDate.jm, targetDate.jd),
    [targetDate],
  );
  const targetWeekday = useMemo(
    () => formatWeekday(targetDate.jy, targetDate.jm, targetDate.jd),
    [targetDate],
  );

  const pat = useMemo(() => getActivePattern(), [activePatternId, customPatterns]);
  const activeGroups = useMemo(() => getActiveGroups(pat), [pat]);
  const myScheduledCode = getShiftCode(targetKey, myGroup);
  const myEffectiveKind: ShiftKind =
    dayRecords[targetKey]?.swapKind ?? codeToKind(myScheduledCode);

  /* Popup modals state */
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null);
  const [employeePendingDelete, setEmployeePendingDelete] =
    useState<EmployeeProfile | null>(null);

  /* Shared free days in current calendar month between user and colleagues */
  const sharedFreeDaysInMonth = useMemo(() => {
    if (employees.length === 0) return 0;
    const len = jalaaliMonthLength(viewYear, viewMonth);
    let count = 0;
    for (let d = 1; d <= len; d++) {
      const dk = makeDateKey(viewYear, viewMonth, d);
      const myK = dayRecords[dk]?.swapKind ?? calculateShift(dk, myGroup).type;
      if (myK !== "REST") continue;
      const anyFree = employees.some((emp) => {
        const log = emp.dayLogs?.[dk];
        if (log?.status === "LEAVE" || log?.status === "REST") return true;
        if (log && log.status !== "AS_SCHEDULED") return false;
        const empPat =
          emp.patternId === "ACTIVE" || !emp.patternId
            ? pat
            : resolvePattern(emp.patternId, customPatterns);
        return codeToKind(getShiftCodeForPattern(dk, emp.group, empPat)) === "REST";
      });
      if (anyFree) count += 1;
    }
    return count;
  }, [employees, viewYear, viewMonth, myGroup, dayRecords, pat, customPatterns]);

  /* Evaluated team status for the selected date (matching ShiftManagerScreen.kt lines 962-991) */
  const evaluated = useMemo(() => {
    return employees.map((emp) => {
      const empPat =
        emp.patternId === "ACTIVE" || !emp.patternId
          ? resolvePattern(activePatternId, customPatterns)
          : resolvePattern(emp.patternId, customPatterns);
      const code = getShiftCodeForPattern(targetKey, emp.group, empPat);
      const schedKind = codeToKind(code);
      const log = emp.dayLogs?.[targetKey] ?? {
        status: "AS_SCHEDULED" as EmployeeDayStatus,
        overtimeHours: 0,
      };
      const effKind: ShiftKind | null =
        log.status === "AS_SCHEDULED"
          ? schedKind
          : log.status === "LEAVE"
            ? null
            : log.status;
      return { emp, empPat, scheduledCode: code, scheduledKind: schedKind, effectiveKind: effKind, log };
    });
  }, [employees, targetKey, activePatternId, customPatterns]);

  const onDayShift = evaluated.filter((x) => x.effectiveKind === "DAY");
  const onEveningShift = evaluated.filter((x) => x.effectiveKind === "EVENING");
  const onNightShift = evaluated.filter((x) => x.effectiveKind === "NIGHT");
  const onRestAvailable = evaluated.filter((x) => x.effectiveKind === "REST");
  const onLeave = evaluated.filter((x) => x.log.status === "LEAVE");
  const uncoveredLeaves = onLeave.filter((x) => x.scheduledKind !== "REST");

  return (
    <div className="space-y-3">
      {/* 1. Date Inspector Stepper (matching ShiftManagerScreen.kt lines 906-955) */}
      <div className="glass rounded-2xl p-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            haptic(hapticOn);
            setDayOffset((d) => d - 1);
          }}
          className="sk-sheet-btn !size-10"
          aria-label="روز قبل"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (dayOffset !== 0) {
              haptic(hapticOn);
              setDayOffset(0);
            } else {
              onOpenDay(targetKey);
            }
          }}
          className="flex-1 flex flex-col items-center min-w-0"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[13.5px] font-black">
              {targetWeekday} {formatJalali(targetDate.jy, targetDate.jm, targetDate.jd)}
            </span>
            {dayOffset === 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] text-[9.5px] font-black">
                امروز
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold text-[var(--sk-primary)] mt-0.5">
            شیفت شما ({getGroupTitle(myGroup, pat)}): {SHIFT_KIND_FA[myEffectiveKind]}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            haptic(hapticOn);
            setDayOffset((d) => d + 1);
          }}
          className="sk-sheet-btn !size-10"
          aria-label="روز بعد"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* 2. Unified Team Overview & Conflict/Coverage Analyzer (matching ShiftManagerScreen.kt lines 960-1064) */}
      {employees.length > 0 && (
        <div className="glass rounded-[20px] p-3 space-y-2">
          <div className="text-[13px] font-extrabold text-[var(--sk-primary)]">
            خلاصه وضعیت پرسنل در این روز
          </div>

          <TeamBucketRow
            icon={<SunIcon size={15} />}
            title={`صبح‌کار (${toPersianDigits(onDayShift.length)} نفر)`}
            names={
              onDayShift
                .map((x) => `${x.emp.name} (${getGroupLetter(x.emp.group, x.empPat)})`)
                .join("، ") || "—"
            }
            gradCls="sk-grad-day"
          />
          {(onEveningShift.length > 0 ||
            evaluated.some(
              (x) => x.scheduledKind === "EVENING" || (x.empPat.eveningCount ?? 0) > 0,
            )) && (
            <TeamBucketRow
              icon={<SunsetIcon size={15} />}
              title={`عصرکار (${toPersianDigits(onEveningShift.length)} نفر)`}
              names={
                onEveningShift
                  .map((x) => `${x.emp.name} (${getGroupLetter(x.emp.group, x.empPat)})`)
                  .join("، ") || "—"
              }
              gradCls="sk-grad-evening"
            />
          )}
          <TeamBucketRow
            icon={<MoonIcon size={15} />}
            title={`شب‌کار (${toPersianDigits(onNightShift.length)} نفر)`}
            names={
              onNightShift
                .map((x) => `${x.emp.name} (${getGroupLetter(x.emp.group, x.empPat)})`)
                .join("، ") || "—"
            }
            gradCls="sk-grad-night"
          />
          <TeamBucketRow
            icon={<RestIcon size={15} />}
            title={`استراحت / آماده جایگزینی (${toPersianDigits(onRestAvailable.length)} نفر)`}
            names={
              onRestAvailable
                .map((x) => `${x.emp.name} (${getGroupLetter(x.emp.group, x.empPat)})`)
                .join("، ") || "—"
            }
            gradCls="sk-grad-rest"
          />
          {onLeave.length > 0 && (
            <TeamBucketRow
              icon={<HolidayIcon size={15} />}
              title={`مرخصی / غایب (${toPersianDigits(onLeave.length)} نفر)`}
              names={onLeave
                .map((x) => `${x.emp.name} (${SHIFT_KIND_FA[x.scheduledKind]})`)
                .join("، ")}
              gradCls="sk-grad-holiday"
            />
          )}

          {uncoveredLeaves.length > 0 && (
            <div className="rounded-[14px] bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/45 p-2.5 space-y-1">
              <div className="text-[11.5px] font-black text-[var(--sk-holiday)]">
                هشدار تداخل / نیاز به جایگزین:
              </div>
              <div className="text-[11px] leading-5 text-[var(--sk-text)]">
                {uncoveredLeaves
                  .map((x) => `${x.emp.name} (نوبت ${SHIFT_KIND_FA[x.scheduledKind]})`)
                  .join(" و ")}{" "}
                در مرخصی است. نفرات در استراحت جهت جایگزینی:{" "}
                {onRestAvailable
                  .map(
                    (x) =>
                      `${x.emp.name} (شیفت ${getGroupLetter(x.emp.group, x.empPat)})`,
                  )
                  .join("، ") || "هیچ‌کدام از پرسنل ثبت‌شده در استراحت نیستند"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Calendar Display Toggle + Shared Free Days Card (Fix #1) */}
      <div className="glass rounded-[20px] p-3 space-y-2.5">
        <div className="rounded-2xl sk-tile px-3.5 py-2.5 flex items-center justify-between gap-3">
          <span className="text-[12.5px] font-bold">نمایش شیفت افراد روی تقویم</span>
          <button
            type="button"
            role="switch"
            aria-checked={showEmployeesOnCalendar}
            onClick={() => {
              haptic(hapticOn);
              set({ showEmployeesOnCalendar: !showEmployeesOnCalendar });
            }}
            className={`w-12 h-7 rounded-full p-0.5 transition-colors flex items-center ${
              /* RTL: justify-start = right edge, justify-end = left edge.
               * Persian platform convention: OFF knob at start (right), ON slides to end (left). */
              showEmployeesOnCalendar
                ? "bg-[var(--sk-primary)] justify-end"
                : "bg-[var(--sk-border-strong)] justify-start"
            }`}
          >
            <span className="size-6 rounded-full bg-white shadow" />
          </button>
        </div>

        {employees.length > 0 && (
          <div className="rounded-2xl sk-grad-rest px-3.5 py-2.5 flex items-center justify-center gap-2 text-[12.5px] font-extrabold">
            <RestIcon size={16} />
            <span>
              {toPersianDigits(sharedFreeDaysInMonth)} روز آزاد مشترک در{" "}
              {JALALI_MONTHS[viewMonth - 1]}
            </span>
          </div>
        )}
      </div>

      {/* 4. Add Employee Button (matching ShiftManagerScreen.kt lines 1068-1088) */}
      <button
        type="button"
        onClick={() => {
          haptic(hapticOn);
          setEditingEmployee(null);
          setEmployeeModalOpen(true);
        }}
        className="w-full glass rounded-[18px] border-[1.2px] border-[var(--sk-primary)] bg-[var(--sk-primary-soft)] px-3.5 py-3 flex items-center justify-center gap-2 text-[13.5px] font-black text-[var(--sk-primary)] active:scale-[0.99] transition-transform"
      >
        <GroupIcon size={17} />
        <span>+ افزودن همکار / پرسنل جدید</span>
      </button>

      {/* 5. Individual Employee Cards */}
      {employees.length === 0 ? (
        <div className="glass rounded-[20px] py-8 px-4 flex flex-col items-center text-center">
          <GroupIcon size={28} className="text-[var(--sk-primary)]" />
          <div className="text-[14px] font-bold mt-2">هنوز همکاری اضافه نشده است</div>
          <p className="text-[11.5px] leading-5 text-[var(--sk-text-muted)] mt-1">
            روی دکمهٔ «+ افزودن همکار / پرسنل جدید» بزنید تا همکاران خود را اضافه کنید و شیفت، مرخصی و اضافه‌کاری آن‌ها را با شیفت خودتان مقایسه نمایید.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {evaluated.map(({ emp, empPat, scheduledCode, scheduledKind, effectiveKind, log }) => {
            const curStatus = log.status;
            const curOt = log.overtimeHours;

            const statusLabel =
              effectiveKind === null
                ? `مرخصی (برنامه: ${SHIFT_KIND_FA[scheduledKind]})`
                : curStatus === "AS_SCHEDULED"
                  ? CODE_FA[scheduledCode]
                  : `جابه‌جایی: ${SHIFT_KIND_FA[effectiveKind]}`;

            const relationText =
              effectiveKind === null
                ? "در مرخصی"
                : effectiveKind === myEffectiveKind && effectiveKind === "REST"
                  ? "استراحت مشترک با شما"
                  : effectiveKind === myEffectiveKind
                    ? `هم‌شیفت با شما (${SHIFT_KIND_FA[myEffectiveKind]})`
                    : `شیفت شما: ${SHIFT_KIND_FA[myEffectiveKind]}`;

            /* 7-Day Comparison Strip (Selected Date .. +6 Days, matching ShiftManagerScreen.kt lines 1435-1486) */
            const sevenDays = Array.from({ length: 7 }, (_, i) => {
              const dJ = addDaysJalali(targetDate.jy, targetDate.jm, targetDate.jd, i);
              const dK = makeDateKey(dJ.jy, dJ.jm, dJ.jd);
              const dLog = emp.dayLogs?.[dK];
              const dSched = getShiftCodeForPattern(dK, emp.group, empPat);
              const dKind: ShiftKind | null =
                !dLog || dLog.status === "AS_SCHEDULED"
                  ? codeToKind(dSched)
                  : dLog.status === "LEAVE"
                    ? null
                    : dLog.status;
              const myK =
                dayRecords[dK]?.swapKind ?? codeToKind(getShiftCode(dK, myGroup));
              const sameAsMe = dKind !== null && dKind === myK;
              const shortFa =
                dKind === null
                  ? "م"
                  : dKind === "DAY"
                    ? "ص"
                    : dKind === "EVENING"
                      ? "ع"
                      : dKind === "NIGHT"
                        ? "ش"
                        : "ا";
              return { dJ, dK, dKind, sameAsMe, shortFa };
            });

            return (
              <div key={emp.id} className="glass rounded-[20px] p-3 space-y-2.5">
                {/* Header */}
                <div className="flex items-center gap-2.5">
                  <span className="size-10 rounded-full bg-[var(--sk-primary-soft)] border-[1.5px] border-[var(--sk-primary)] text-[var(--sk-primary)] grid place-items-center text-[14.5px] font-black shrink-0">
                    {getGroupLetter(emp.group, empPat)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14.5px] font-black truncate">{emp.name}</span>
                      {emp.role && (
                        <span className="text-[11.5px] text-[var(--sk-text-muted)] truncate">
                          · {emp.role}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[11px] font-bold truncate ${
                        effectiveKind === myEffectiveKind
                          ? "text-[var(--sk-primary)]"
                          : "text-[var(--sk-text-muted)]"
                      }`}
                    >
                      {getGroupTitle(emp.group, empPat)} · {relationText}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        haptic(hapticOn);
                        setEditingEmployee(emp);
                        setEmployeeModalOpen(true);
                      }}
                      className="size-[34px] rounded-[10px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center"
                      style={{
                        border:
                          "1px solid color-mix(in srgb, var(--sk-primary) 40%, transparent)",
                      }}
                      aria-label="ویرایش همکار"
                    >
                      <EditIcon size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptic(hapticOn);
                        setEmployeePendingDelete(emp);
                      }}
                      className="size-[34px] rounded-[10px] bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/40 text-[var(--sk-holiday)] grid place-items-center"
                      aria-label="حذف همکار"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </div>

                {/* Selected Date Status Pill + Overtime Stepper */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-1.5 rounded-[10px] text-[11.5px] font-black inline-flex items-center gap-1.5 ${
                      effectiveKind === null
                        ? "bg-[var(--sk-holiday-soft)] text-[var(--sk-holiday)]"
                        : KIND_GRAD[effectiveKind]
                    }`}
                  >
                    {effectiveKind === null ? (
                      <HolidayIcon size={14} />
                    ) : (
                      KIND_ICON_SM[effectiveKind]
                    )}
                    <span>{statusLabel}</span>
                  </span>

                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[var(--sk-text-muted)]">اضافه‌کاری:</span>
                    <button
                      type="button"
                      disabled={curOt <= 0}
                      onClick={() => {
                        haptic(hapticOn);
                        setEmployeeDayLog(
                          emp.id,
                          targetKey,
                          curStatus,
                          Math.max(0, curOt - 1),
                        );
                      }}
                      className="size-[26px] rounded-[8px] bg-[var(--sk-surface-strong)] grid place-items-center text-[14px] font-black disabled:opacity-40"
                    >
                      −
                    </button>
                    <span
                      className={`min-w-[28px] text-center text-[11.5px] font-black ${
                        curOt > 0 ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                      }`}
                    >
                      {toPersianDigits(curOt)}س
                    </span>
                    <button
                      type="button"
                      disabled={curOt >= 24}
                      onClick={() => {
                        haptic(hapticOn);
                        setEmployeeDayLog(
                          emp.id,
                          targetKey,
                          curStatus,
                          Math.min(24, curOt + 1),
                        );
                      }}
                      className="size-[26px] rounded-[8px] bg-[var(--sk-surface-strong)] grid place-items-center text-[14px] font-black text-[var(--sk-primary)] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Quick Daily Exception Chips with FULL shift names */}
                <div
                  className={`grid gap-1 ${
                    (empPat.eveningCount ?? 0) > 0 || curStatus === "EVENING"
                      ? "grid-cols-6"
                      : "grid-cols-5"
                  }`}
                >
                  {(
                    [
                      { id: "AS_SCHEDULED" as const, fa: "برنامه" },
                      { id: "LEAVE" as const, fa: "مرخصی" },
                      { id: "DAY" as const, fa: "صبح‌کار" },
                      ...((empPat.eveningCount ?? 0) > 0 || curStatus === "EVENING"
                        ? [{ id: "EVENING" as const, fa: "عصرکار" }]
                        : []),
                      { id: "NIGHT" as const, fa: "شب‌کار" },
                      { id: "REST" as const, fa: "استراحت" },
                    ]
                  ).map((st) => {
                    const active = curStatus === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          haptic(hapticOn, 8);
                          setEmployeeDayLog(emp.id, targetKey, st.id, curOt);
                        }}
                        className={`h-7 rounded-[8px] text-[9.5px] font-bold border transition-all truncate ${
                          active
                            ? "bg-[var(--sk-primary-soft)] border-[var(--sk-primary)] text-[var(--sk-primary)]"
                            : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text-muted)]"
                        }`}
                      >
                        {st.fa}
                      </button>
                    );
                  })}
                </div>

                {/* 7-Day Comparison Strip */}
                <div className="grid grid-cols-7 gap-1">
                  {sevenDays.map((sd) => (
                    <div
                      key={sd.dK}
                      className={`py-1 rounded-[8px] flex flex-col items-center ${
                        sd.dKind === null ? "sk-grad-holiday" : KIND_GRAD[sd.dKind]
                      } ${
                        sd.sameAsMe
                          ? "border-[1.4px] border-[var(--sk-primary)]"
                          : "border border-current/30"
                      }`}
                    >
                      <span className="text-[9.5px] font-bold text-[var(--sk-text)]">
                        {toPersianDigits(sd.dJ.jd)}
                      </span>
                      <span className="text-[10px] font-black">{sd.shortFa}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Employee Dialog */}
      {employeeModalOpen && (
        <EmployeeEditDialog
          initial={editingEmployee}
          activeGroups={activeGroups}
          onSave={(profile) => {
            haptic(hapticOn, 16);
            addOrUpdateEmployee(profile);
            setEmployeeModalOpen(false);
            setEditingEmployee(null);
            toast.success(`مشخصات «${profile.name}» ذخیره شد`);
          }}
          onDismiss={() => {
            setEmployeeModalOpen(false);
            setEditingEmployee(null);
          }}
        />
      )}

      {/* Confirm Delete Employee Dialog */}
      {employeePendingDelete && (
        <ConfirmDeleteDialog
          title="حذف همکار از فهرست پرسنل"
          message={`آیا از حذف «${employeePendingDelete.name}» و سوابق مرخصی/اضافه‌کاری او اطمینان دارید؟`}
          confirmLabel="حذف همکار"
          onConfirm={() => {
            haptic(hapticOn, 16);
            removeEmployee(employeePendingDelete.id);
            toast.success(`«${employeePendingDelete.name}» از فهرست حذف شد`);
            setEmployeePendingDelete(null);
          }}
          onDismiss={() => setEmployeePendingDelete(null)}
        />
      )}
    </div>
  );
}

function TeamBucketRow({
  icon,
  title,
  names,
  gradCls,
}: {
  icon: React.ReactNode;
  title: string;
  names: string;
  gradCls: string;
}) {
  return (
    <div className={`rounded-xl px-2.5 py-2 flex items-center gap-2 ${gradCls}`}>
      <span className="shrink-0">{icon}</span>
      <span className="text-[11.5px] font-black shrink-0">{title}:</span>
      <span className="text-[11.5px] font-bold text-[var(--sk-text)] truncate flex-1">
        {names}
      </span>
    </div>
  );
}

function EmployeeEditDialog({
  initial,
  activeGroups,
  onSave,
  onDismiss,
}: {
  initial: EmployeeProfile | null;
  activeGroups: ShiftGroup[];
  onSave: (profile: EmployeeProfile) => void;
  onDismiss: () => void;
}) {
  const customPatterns = useShiftKar((s) => s.customPatterns);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const pat = getActivePattern();

  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [group, setGroup] = useState<ShiftGroup>(
    /* Prefer the "other" group for a NEW colleague (usually not your own group),
     * but fall back to the first existing group — never a group the pattern lacks. */
    initial?.group ?? activeGroups[1] ?? activeGroups[0] ?? "A",
  );
  const [patternId, setPatternId] = useState(initial?.patternId ?? "ACTIVE");
  const [patternQuery, setPatternQuery] = useState("");

  const allPatterns = useMemo(() => {
    const pureCustom = customPatterns.filter((p) => !isBuiltInPreset(p.id));
    return [
      {
        id: "ACTIVE",
        name: "هماهنگ با الگوی برنامه",
        subtitle: `الگوی فعلی: ${pat.name}`,
      },
      ...pureCustom.map((p) => ({ id: p.id, name: p.name, subtitle: p.subtitle })),
      ...PRESET_PATTERNS.map((p) => {
        const resolved = resolvePattern(p.id, customPatterns);
        return { id: resolved.id, name: resolved.name, subtitle: resolved.subtitle };
      }),
    ];
  }, [customPatterns, pat.name]);

  const filteredPatterns = useMemo(() => {
    const q = patternQuery.trim().toLowerCase();
    if (!q) return allPatterns;
    return allPatterns.filter(
      (p) =>
        p.id === patternId ||
        p.name.toLowerCase().includes(q) ||
        (p.subtitle && p.subtitle.toLowerCase().includes(q)),
    );
  }, [allPatterns, patternQuery, patternId]);

  const selectedPatObj = useMemo(() => {
    if (patternId === "ACTIVE" || !patternId) return pat;
    return resolvePattern(patternId, customPatterns);
  }, [patternId, pat, customPatterns]);

  const dialogGroups = useMemo(
    () => (selectedPatObj.hasGroups ? getActiveGroups(selectedPatObj) : activeGroups),
    [selectedPatObj, activeGroups],
  );

  /* Keep the selected group valid against the chosen pattern's group list
   * (derived during render — no effect needed). If the saved/stale `group` is
   * not offered by the selected pattern, fall back to its first group so we
   * never save a "phantom" group that silently follows another group's schedule. */
  const effGroup = dialogGroups.includes(group) ? group : (dialogGroups[0] ?? "A");

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div onClick={onDismiss} className="sk-scrim-in absolute inset-0 sk-scrim" />
      <div className="sk-pop-in relative z-10 w-full max-w-[430px] md:max-w-[600px] lg:max-w-[680px] max-h-[90dvh] flex flex-col glass-strong rounded-3xl p-4 md:p-6 space-y-3.5 overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="size-9 rounded-xl bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center">
              {initial ? <EditIcon size={18} /> : <GroupIcon size={18} />}
            </span>
            <div>
              <h3 className="text-[15.5px] md:text-[17px] font-black">
                {initial ? "ویرایش مشخصات همکار" : "افزودن همکار جدید"}
              </h3>
              <p className="text-[11px] text-[var(--sk-text-muted)]">
                مشخصات، گروه شیفت و الگوی نوبت‌کاری همکار را انتخاب کنید
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="size-8 rounded-full bg-[var(--sk-surface-strong)] grid place-items-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto sk-scroll space-y-3.5 pe-0.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11.5px] font-bold text-[var(--sk-text-muted)]">
                نام و نام خانوادگی:
              </label>
              <input
                value={name}
                onChange={(e) => {
                  if (e.target.value.length <= 35) setName(e.target.value);
                }}
                placeholder="مثلاً علی رضایی"
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[13.5px] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--sk-primary)] select-text"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11.5px] font-bold text-[var(--sk-text-muted)]">
                سمت یا واحد (اختیاری):
              </label>
              <input
                value={role}
                onChange={(e) => {
                  if (e.target.value.length <= 25) setRole(e.target.value);
                }}
                placeholder="مثلاً اپراتور برد"
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[var(--sk-primary)] select-text"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11.5px] font-bold text-[var(--sk-text-muted)]">
              گروه شیفت همکار:
            </label>
            <div className="sk-seg">
              {dialogGroups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    haptic(hapticOn);
                    setGroup(g);
                  }}
                  className={`sk-seg-item !text-[12px] ${effGroup === g ? "is-active" : ""}`}
                >
                  {getGroupTitle(g, selectedPatObj)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-[11.5px] font-bold text-[var(--sk-text-muted)]">
                الگوی نوبت‌کاری همکار ({toPersianDigits(allPatterns.length)} الگو):
              </label>
              <input
                value={patternQuery}
                onChange={(e) => setPatternQuery(e.target.value)}
                placeholder="جستجوی نام الگو (مثلاً ۲-۲-۴ یا سه‌نوبتی)…"
                className="w-full sm:w-[250px] px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[11.5px] focus:outline-none focus:border-[var(--sk-primary)] select-text"
              />
            </div>

            <div className="max-h-[210px] md:max-h-[250px] overflow-y-auto sk-scroll rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filteredPatterns.map((p) => {
                const active = patternId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      haptic(hapticOn);
                      setPatternId(p.id);
                    }}
                    className={`rounded-xl px-3 py-2 text-start border transition-all flex items-center justify-between gap-2 ${
                      active
                        ? "bg-[var(--sk-primary-soft)] border-[1.5px] border-[var(--sk-primary)] text-[var(--sk-primary)]"
                        : "bg-[var(--sk-surface-strong)]/65 border-[var(--sk-border-soft)] hover:border-[var(--sk-primary)]/50 text-[var(--sk-text)]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-extrabold truncate">{p.name}</div>
                      {p.subtitle && (
                        <div className="text-[10px] text-[var(--sk-text-muted)] truncate mt-0.5">
                          {p.subtitle}
                        </div>
                      )}
                    </div>
                    {active && (
                      <span className="size-5 rounded-full bg-[var(--sk-primary)] text-white grid place-items-center shrink-0">
                        <CheckIcon size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-1 shrink-0">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 py-3 rounded-[14px] bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[13px] font-bold text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => {
              const cleanName = name.trim();
              if (!cleanName) {
                toast.error("لطفاً نام همکار را وارد کنید");
                return;
              }
              onSave({
                id: initial?.id ?? `emp_${Date.now()}`,
                name: cleanName,
                role: role.trim(),
                group: effGroup,
                patternId,
                dayLogs: initial?.dayLogs ?? {},
              });
            }}
            className="flex-[1.5] py-3 rounded-[14px] bg-[var(--sk-primary)] text-white text-[13.5px] font-black shadow-[0_10px_24px_-8px_var(--sk-glow-a)]"
          >
            {initial ? "ذخیرهٔ تغییرات" : "افزودن همکار"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConfirmDeleteDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onDismiss,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
    >
      <div onClick={onDismiss} className="sk-scrim-in absolute inset-0 sk-scrim" />
      <div className="sk-pop-in relative z-10 w-full max-w-[380px] glass-strong rounded-3xl p-4 space-y-3 border-[1.5px] border-[var(--sk-holiday)]/45">
        <div className="flex items-center gap-2.5">
          <span className="size-[38px] rounded-xl bg-[var(--sk-holiday-soft)] text-[var(--sk-holiday)] grid place-items-center shrink-0">
            <TrashIcon size={18} />
          </span>
          <h3 className="text-[15px] font-black">{title}</h3>
        </div>
        <p className="text-[12.5px] leading-6 text-[var(--sk-text-muted)]">{message}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="py-2.5 rounded-[14px] bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] text-[13px] font-bold"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="py-2.5 rounded-[14px] bg-[var(--sk-holiday)] text-white text-[13px] font-black"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* =========================================================================
   Sub-Tab 3: گزارش کارکرد (100% Parity with WorkReportSection in ShiftManagerScreen.kt)
   ========================================================================= */
function ReportSubTab({ onOpenDay }: { onOpenDay: (dateKey: string) => void }) {
  const viewYear = useShiftKar((s) => s.viewYear);
  const viewMonth = useShiftKar((s) => s.viewMonth);
  const myGroup = useShiftKar((s) => s.myGroup);
  const dayRecords = useShiftKar((s) => s.dayRecords);
  const employees = useShiftKar((s) => s.employees);
  const activePatternId = useShiftKar((s) => s.activePatternId);
  const customPatterns = useShiftKar((s) => s.customPatterns);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const calendarSyncRev = useShiftKar((s) => s.calendarSyncRev);

  const today = useToday();
  const [yearlyScope, setYearlyScope] = useState(false);
  const [reportYear, setReportYear] = useState(viewYear);
  const [reportMonth, setReportMonth] = useState(viewMonth);
  const [exportOpen, setExportOpen] = useState(false);
  const [notesMap, setNotesMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    listNotes().then((rows) => {
      const m = new Map<string, string>();
      for (const r of rows) m.set(r.dateKey, r.text);
      setNotesMap(m);
    });
  }, []);

  const activePattern = useMemo(
    () => resolvePattern(activePatternId, customPatterns),
    [activePatternId, customPatterns],
  );
  void calendarSyncRev;

  const reportData = useMemo(() => {
    let totalDays = 0;
    let dayCnt = 0;
    let eveCnt = 0;
    let nightCnt = 0;
    let restCnt = 0;
    let totalOt = 0;
    let otDays = 0;
    let swapCnt = 0;
    let holWorkDays = 0;
    let friWorkDays = 0;

    const logs: {
      dateKey: string;
      dateLabel: string;
      detailText: string;
      badgeText: string;
      kind: ShiftKind;
    }[] = [];

    const months = yearlyScope
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : [reportMonth];

    for (const m of months) {
      const len = jalaaliMonthLength(reportYear, m);
      for (let d = 1; d <= len; d++) {
        totalDays++;
        const key = makeDateKey(reportYear, m, d);
        const schedCode = getShiftCodeForPattern(key, myGroup, activePattern);
        const schedKind = codeToKind(schedCode);
        const rec = dayRecords[key];
        const effKind: ShiftKind = rec?.swapKind ?? schedKind;

        if (effKind === "DAY") dayCnt++;
        else if (effKind === "EVENING") eveCnt++;
        else if (effKind === "NIGHT") nightCnt++;
        else restCnt++;

        const isHol = isHoliday(reportYear, m, d);
        const isFri = jalaaliWeekday(reportYear, m, d) === 6;
        if (effKind !== "REST") {
          if (isHol) holWorkDays++;
          if (isFri) friWorkDays++;
        }

        const ot = rec?.overtimeHours ?? 0;
        const sw = rec?.swapKind ?? null;
        if (ot > 0) {
          totalOt += ot;
          otDays++;
        }
        if (sw) swapCnt++;

        const noteTxt = notesMap.get(key)?.trim() ?? "";
        if (ot > 0 || sw) {
          const wd = formatWeekday(reportYear, m, d);
          const dateLbl = `${wd} ${toPersianDigits(d)} ${JALALI_MONTHS[m - 1]}`;
          const detailParts: string[] = [];
          if (sw) {
            detailParts.push(`برنامه: ${SHIFT_KIND_FA[schedKind]} ← ${SHIFT_KIND_FA[sw]}`);
          } else {
            detailParts.push(`نوبت: ${CODE_FA[schedCode]}`);
          }
          if (noteTxt) {
            detailParts.push(noteTxt.length > 24 ? `${noteTxt.slice(0, 24)}…` : noteTxt);
          }

          const badgeParts: string[] = [];
          if (ot > 0) badgeParts.push(`+${toPersianDigits(ot)} ساعت`);
          if (sw) badgeParts.push(SHIFT_KIND_FA[sw]);

          logs.push({
            dateKey: key,
            dateLabel: dateLbl,
            detailText: detailParts.join(" · "),
            badgeText: badgeParts.join(" | "),
            kind: effKind,
          });
        }
      }
    }

    const periodTitle = yearlyScope
      ? `کل سال ${toPersianDigits(reportYear)}`
      : `${JALALI_MONTHS[reportMonth - 1]} ${toPersianDigits(reportYear)}`;

    const activeWorkTotal = dayCnt + eveCnt + nightCnt;
    const hoursPerShift = (activePattern.eveningCount ?? 0) > 0 ? 8 : 12;
    const estimatedTotalHours = activeWorkTotal * hoursPerShift + totalOt;

    return {
      periodTitle,
      groupTitle: getGroupTitle(myGroup, activePattern),
      patternName: activePattern.name,
      totalDays,
      dayShiftDays: dayCnt,
      eveningShiftDays: eveCnt,
      nightShiftDays: nightCnt,
      restDays: restCnt,
      activeWorkTotal,
      totalOvertimeHours: totalOt,
      overtimeDaysCount: otDays,
      swapCount: swapCnt,
      holidayWorkDays: holWorkDays,
      fridayWorkDays: friWorkDays,
      estimatedTotalHours,
      logEntries: logs,
    };
  }, [
    yearlyScope,
    reportYear,
    reportMonth,
    myGroup,
    activePattern,
    dayRecords,
    notesMap,
  ]);

  const handleRenderReportPng = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const snap: WorkReportSnapshot = {
      periodTitle: reportData.periodTitle,
      groupTitle: reportData.groupTitle,
      patternName: reportData.patternName,
      totalWorkDays: reportData.activeWorkTotal,
      dayShiftDays: reportData.dayShiftDays,
      eveningShiftDays: reportData.eveningShiftDays,
      nightShiftDays: reportData.nightShiftDays,
      restDays: reportData.restDays,
      holidayWorkDays: reportData.holidayWorkDays,
      fridayWorkDays: reportData.fridayWorkDays,
      overtimeHours: reportData.totalOvertimeHours,
      swappedDaysCount: reportData.swapCount,
      estimatedTotalHours: reportData.estimatedTotalHours,
      dark: isDark,
    };
    return renderWorkReportCanvas(snap);
  }, [reportData]);

  const prefixFilter = yearlyScope
    ? `${reportYear}-`
    : `${reportYear}-${String(reportMonth).padStart(2, "0")}-`;

  return (
    <div className="space-y-3">
      {/* 1. Scope & Period Header Card (matching ShiftManagerScreen.kt lines 1618-1715) */}
      <div className="glass rounded-[22px] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[14.5px] font-black">
              گزارش کارکرد، اضافه‌کاری و شیفت‌ها
            </h3>
            <p className="text-[11px] text-[var(--sk-text-muted)] mt-0.5 leading-5">
              محاسبهٔ دقیق ساعت اضافه‌کاری، تعطیل‌کاری و نوبت‌ها برای بررسی فیش حقوقی
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              setExportOpen(true);
            }}
            className="h-[34px] px-2.5 rounded-[11px] glass bg-[var(--sk-primary-soft)] text-[11px] font-bold text-[var(--sk-primary)] flex items-center gap-1.5 shrink-0"
            style={{
              border: "1px solid color-mix(in srgb, var(--sk-primary) 50%, transparent)",
            }}
          >
            <ImageIcon size={14} />
            <span>تصویر گزارش</span>
          </button>
        </div>

        <div className="sk-seg grid-cols-2">
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              setYearlyScope(false);
            }}
            className={`sk-seg-item !text-[12px] ${!yearlyScope ? "is-active" : ""}`}
          >
            گزارش ماهانه
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              setYearlyScope(true);
            }}
            className={`sk-seg-item !text-[12px] ${yearlyScope ? "is-active" : ""}`}
          >
            گزارش کل سال
          </button>
        </div>

        {/* Month / Year Stepper */}
        <div className="rounded-[14px] bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] p-1.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              if (yearlyScope) {
                setReportYear((y) => Math.max(1300, y - 1));
              } else if (reportMonth === 1) {
                setReportMonth(12);
                setReportYear((y) => Math.max(1300, y - 1));
              } else {
                setReportMonth((m) => m - 1);
              }
            }}
            className="sk-sheet-btn !size-[34px]"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              setReportYear(today.jy);
              setReportMonth(today.jm);
            }}
            className="flex-1 flex flex-col items-center"
          >
            <span className="text-[14px] font-black text-[var(--sk-primary)]">
              {reportData.periodTitle}
            </span>
            <span className="text-[10.5px] font-bold text-[var(--sk-text-muted)]">
              {reportData.groupTitle} · مجموع {toPersianDigits(reportData.totalDays)} روز
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              if (yearlyScope) {
                setReportYear((y) => Math.min(1500, y + 1));
              } else if (reportMonth === 12) {
                setReportMonth(1);
                setReportYear((y) => Math.min(1500, y + 1));
              } else {
                setReportMonth((m) => m + 1);
              }
            }}
            className="sk-sheet-btn !size-[34px]"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* 2. Key Payslip Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="glass rounded-[18px] p-3 border-[1.5px] border-[var(--sk-primary)] bg-[var(--sk-primary-soft)] space-y-1">
          <div className="text-[11px] font-bold text-[var(--sk-text-muted)] truncate">
            مجموع اضافه‌کاری
          </div>
          <div className="text-[18px] font-black text-[var(--sk-primary)]">
            {toPersianDigits(reportData.totalOvertimeHours)} ساعت
          </div>
          <div className="text-[10px] text-[var(--sk-text-faint)] truncate">
            ثبت‌شده در {toPersianDigits(reportData.overtimeDaysCount)} روز
          </div>
        </div>

        <div className="glass rounded-[18px] p-3 border border-[var(--sk-border-soft)] space-y-1">
          <div className="text-[11px] font-bold text-[var(--sk-text-muted)] truncate">
            کل روزهای کاری
          </div>
          <div className="text-[18px] font-black text-[var(--sk-day-ink)]">
            {toPersianDigits(reportData.activeWorkTotal)} روز
          </div>
          <div className="text-[10px] text-[var(--sk-text-faint)] truncate">
            از {toPersianDigits(reportData.totalDays)} روز دوره
          </div>
        </div>

        <div className="glass rounded-[18px] p-3 border border-[var(--sk-border-soft)] space-y-1">
          <div className="text-[11px] font-bold text-[var(--sk-text-muted)] truncate">
            شیفت در تعطیلات رسمی
          </div>
          <div className="text-[18px] font-black text-[var(--sk-holiday)]">
            {toPersianDigits(reportData.holidayWorkDays)} روز
          </div>
          <div className="text-[10px] text-[var(--sk-text-faint)] truncate">
            نوبت کاری در تعطیلی رسمی
          </div>
        </div>

        <div className="glass rounded-[18px] p-3 border border-[var(--sk-border-soft)] space-y-1">
          <div className="text-[11px] font-bold text-[var(--sk-text-muted)] truncate">
            جمعه کاری و جابه‌جایی
          </div>
          <div className="text-[18px] font-black text-[var(--sk-rest-ink)]">
            {toPersianDigits(reportData.fridayWorkDays)} جمعه
          </div>
          <div className="text-[10px] text-[var(--sk-text-faint)] truncate">
            {toPersianDigits(reportData.swapCount)} مورد جابه‌جایی نوبت
          </div>
        </div>
      </div>

      {/* 3. 4-Shift Breakdown Card (matching ShiftManagerScreen.kt lines 1766-1806) */}
      <div className="glass rounded-[20px] p-3.5 space-y-2.5">
        <div className="text-[13px] font-extrabold text-[var(--sk-primary)]">
          تفکیک نوبت‌های کاری در {reportData.periodTitle}
        </div>
        <div className="flex items-center gap-1.5">
          {(
            [
              { kind: "DAY" as const, label: "صبح‌کار", cnt: reportData.dayShiftDays },
              ...(reportData.eveningShiftDays > 0 || (activePattern.eveningCount ?? 0) > 0
                ? [
                    {
                      kind: "EVENING" as const,
                      label: "عصرکار",
                      cnt: reportData.eveningShiftDays,
                    },
                  ]
                : []),
              { kind: "NIGHT" as const, label: "شب‌کار", cnt: reportData.nightShiftDays },
              { kind: "REST" as const, label: "استراحت", cnt: reportData.restDays },
            ]
          ).map((item) => (
            <div
              key={item.kind}
              className={`flex-1 rounded-[14px] border border-current/35 py-2.5 px-1 flex flex-col items-center gap-1 ${KIND_GRAD[item.kind]}`}
            >
              {KIND_ICON_SM[item.kind]}
              <span className="text-[10.5px] font-bold">{item.label}</span>
              <span className="text-[13px] font-black">
                {toPersianDigits(item.cnt)} روز
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Detailed Log of Overtime & Swaps (matching ShiftManagerScreen.kt lines 1809-1878) */}
      <div className="glass rounded-[20px] p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-extrabold text-[var(--sk-primary)]">
            ریز سوابق اضافه‌کاری و جابه‌جایی نوبت
          </span>
          <span className="text-[11px] font-black text-[var(--sk-text-muted)]">
            {toPersianDigits(reportData.logEntries.length)} مورد
          </span>
        </div>

        {reportData.logEntries.length === 0 ? (
          <p className="text-[11.5px] leading-5 text-[var(--sk-text-faint)]">
            در این دوره هیچ اضافه‌کاری یا جابه‌جایی نوبتی ثبت نشده است. برای ثبت، در صفحهٔ تقویم روی روز مورد نظر ضربه بزنید.
          </p>
        ) : (
          <div className="space-y-1.5">
            {reportData.logEntries.map((entry) => (
              <button
                key={entry.dateKey}
                type="button"
                onClick={() => onOpenDay(entry.dateKey)}
                className="w-full rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] px-2.5 py-2 flex items-center justify-between gap-2 text-start"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-black">{entry.dateLabel}</div>
                  <div className="text-[10.5px] text-[var(--sk-text-muted)] truncate">
                    {entry.detailText}
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded-[9px] border border-current/40 text-[10.5px] font-black shrink-0 ${KIND_GRAD[entry.kind]}`}
                >
                  {entry.badgeText}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 5. Team / Colleagues Summary in this Period (matching ShiftManagerScreen.kt lines 1881-1922) */}
      {employees.length > 0 && (
        <div className="glass rounded-[20px] p-3.5 space-y-2">
          <div className="text-[13px] font-extrabold text-[var(--sk-primary)]">
            خلاصهٔ کارکرد و مرخصی پرسنل در {reportData.periodTitle}
          </div>
          {employees.map((emp) => {
            const periodLogs = Object.entries(emp.dayLogs ?? {})
              .filter(([dk]) => dk.startsWith(prefixFilter))
              .map(([, l]) => l);
            const empOt = periodLogs.reduce((acc, l) => acc + (l.overtimeHours || 0), 0);
            const empLeaves = periodLogs.filter((l) => l.status === "LEAVE").length;
            const empSwaps = periodLogs.filter(
              (l) => l.status !== "AS_SCHEDULED" && l.status !== "LEAVE",
            ).length;
            /* Resolve the group title against the employee's OWN pattern (not the
             * active one) so custom group labels / group counts stay correct. */
            const empTitlePat =
              emp.patternId && emp.patternId !== "ACTIVE"
                ? resolvePattern(emp.patternId, customPatterns)
                : activePattern;
            return (
              <div
                key={emp.id}
                className="rounded-xl bg-[var(--sk-surface)] px-2.5 py-2 flex items-center justify-between gap-2"
              >
                <span className="text-[12px] font-bold truncate">
                  {emp.name} ({getGroupTitle(emp.group, empTitlePat)})
                </span>
                <span className="text-[10.5px] font-extrabold text-[var(--sk-primary)] shrink-0">
                  اضافه‌کاری: {toPersianDigits(empOt)}س · مرخصی: {toPersianDigits(empLeaves)} · جابه‌جایی: {toPersianDigits(empSwaps)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <ExportImageDialog
        open={exportOpen}
        title={`تصویر گزارش کارکرد (${reportData.periodTitle})`}
        filename={`shiftkar-report-${reportYear}-${yearlyScope ? "ALL" : String(reportMonth).padStart(2, "0")}.png`}
        renderCanvas={handleRenderReportPng}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
