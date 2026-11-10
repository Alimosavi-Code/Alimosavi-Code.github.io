/**
 * Persistent preferences & Shift Manager state — ShiftKar v6.7.1.
 * Parity with Android `SettingsRepository.kt` & `AppViewModel.kt`:
 *  - Default theme is `"blue"` («آبی») and default themeMode is `"system"` («هماهنگ با سیستم»)
 *  - 5 tabs: calendar | systems | roster | manager | settings
 *  - Personal shift group, view type, theme, themeMode
 *  - DayWorkRecord (overtimeHours 0..24 + swapKind DAY/EVENING/NIGHT/REST)
 *  - Active pattern ID + custom/edited ShiftPatternSpec list (45 presets + custom builder)
 *  - Employees/Colleagues (`EmployeeProfile` + `EmployeeDayLog` + `EmployeeDayStatus`)
 *  - `showEmployeesOnCalendar` toggle (default `true`)
 *  - Shift & Note Reminder settings (`shiftReminderOn`, `dayReminderHour`, `nightReminderHour`, `noteReminderOn`)
 *  - `calendarSyncRev` counter to trigger re-renders when `calendar-sync.json` updates
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { todayJalaali } from "./jalali";
import type { Group, GroupFilter, ShiftKind, ThemeId, ThemeMode } from "./models";
import {
  DEFAULT_PATTERN_ID,
  resolvePattern,
  setActivePattern,
  getActiveGroups,
  isBuiltInPreset,
  type ShiftPatternSpec,
} from "./shift-engine";

export type ViewType = "grid" | "table";
export type TabId = "calendar" | "systems" | "roster" | "manager" | "settings";

export interface DayWorkRecord {
  overtimeHours: number;
  swapKind: ShiftKind | null;
}

export type EmployeeDayStatus = "AS_SCHEDULED" | "LEAVE" | "DAY" | "EVENING" | "NIGHT" | "REST";

export interface EmployeeDayLog {
  status: EmployeeDayStatus;
  overtimeHours: number;
}

export interface EmployeeProfile {
  id: string;
  name: string;
  role: string;
  group: Group;
  patternId: string;
  dayLogs: Record<string, EmployeeDayLog>;
}

interface ShiftKarState {
  /* Persisted preferences */
  myGroup: Group;
  viewType: ViewType;
  theme: ThemeId;
  themeMode: ThemeMode;
  onboardingDone: boolean;
  tourDone: boolean;
  showEvents: boolean;
  hapticOn: boolean;
  showEmployeesOnCalendar: boolean;
  shiftReminderOn: boolean;
  dayReminderHour: number;
  nightReminderHour: number;
  noteReminderOn: boolean;

  /* Persisted Shift Manager & Day Records */
  dayRecords: Record<string, DayWorkRecord>;
  activePatternId: string;
  customPatterns: ShiftPatternSpec[];
  employees: EmployeeProfile[];

  /* Ephemeral navigation */
  activeTab: TabId;
  viewYear: number;
  viewMonth: number;
  rosterYear: number;
  rosterGroup: GroupFilter;
  filterGroup: GroupFilter;
  selectedDateKey: string | null;
  calendarSyncRev: number;
  isTableFullscreen: boolean;

  /* Actions */
  set: (patch: Partial<ShiftKarState>) => void;
  setDayOvertime: (dateKey: string, hours: number) => void;
  setDaySwap: (dateKey: string, swapKind: ShiftKind | null) => void;
  selectPattern: (patternId: string) => void;
  saveCustomPattern: (spec: ShiftPatternSpec) => void;
  deleteCustomPattern: (patternId: string) => void;
  restoreAllPresetsToDefault: () => void;
  addOrUpdateEmployee: (profile: EmployeeProfile) => void;
  removeEmployee: (id: string) => void;
  setEmployeeDayLog: (empId: string, dateKey: string, status: EmployeeDayStatus, overtimeHours: number) => void;
  bumpCalendarSyncRev: () => void;
}

const initToday = () => {
  try {
    return todayJalaali();
  } catch {
    return { jy: 1405, jm: 1, jd: 1 };
  }
};

function syncEngineWithState(activePatternId: string, customPatterns: ShiftPatternSpec[]) {
  const pat = resolvePattern(activePatternId, customPatterns);
  setActivePattern(pat);
  return pat;
}

export const useShiftKar = create<ShiftKarState>()(
  persist(
    (set, get) => {
      const t = initToday();
      return {
        myGroup: "A",
        viewType: "grid",
        theme: "blue",
        themeMode: "system",
        onboardingDone: false,
        tourDone: false,
        showEvents: true,
        hapticOn: true,
        showEmployeesOnCalendar: true,
        shiftReminderOn: false,
        dayReminderHour: 21,
        nightReminderHour: 15,
        noteReminderOn: false,

        dayRecords: {},
        activePatternId: DEFAULT_PATTERN_ID,
        customPatterns: [],
        employees: [],

        activeTab: "calendar",
        viewYear: t.jy,
        viewMonth: t.jm,
        rosterYear: t.jy,
        rosterGroup: "A",
        filterGroup: "A",
        selectedDateKey: null,
        calendarSyncRev: 0,
        isTableFullscreen: false,

        set: (patch) => set(patch),

        setDayOvertime: (dateKey, hours) => {
          const clamped = Math.max(0, Math.min(24, Math.trunc(hours)));
          const next = { ...get().dayRecords };
          const cur = next[dateKey] ?? { overtimeHours: 0, swapKind: null };
          const updated: DayWorkRecord = { ...cur, overtimeHours: clamped };
          if (updated.overtimeHours === 0 && updated.swapKind === null) {
            delete next[dateKey];
          } else {
            next[dateKey] = updated;
          }
          set({ dayRecords: next });
        },

        setDaySwap: (dateKey, swapKind) => {
          const next = { ...get().dayRecords };
          const cur = next[dateKey] ?? { overtimeHours: 0, swapKind: null };
          const updated: DayWorkRecord = { ...cur, swapKind };
          if (updated.overtimeHours === 0 && updated.swapKind === null) {
            delete next[dateKey];
          } else {
            next[dateKey] = updated;
          }
          set({ dayRecords: next });
        },

        selectPattern: (patternId) => {
          const pat = syncEngineWithState(patternId, get().customPatterns);
          const validGroups = getActiveGroups(pat);
          const curMy = get().myGroup;
          const nextMy = validGroups.includes(curMy) ? curMy : (validGroups[0] ?? "A");
          const curFilter = get().filterGroup;
          const nextFilter: GroupFilter =
            curFilter === "ALL"
              ? pat.hasGroups && validGroups.length > 1
                ? "ALL"
                : nextMy
              : validGroups.includes(curFilter as Group)
                ? curFilter
                : nextMy;
          set({
            activePatternId: pat.id,
            myGroup: nextMy,
            filterGroup: nextFilter,
            rosterGroup: nextMy,
          });
        },

        saveCustomPattern: (spec) => {
          const filtered = get().customPatterns.filter((p) => p.id !== spec.id);
          const nextCustom = [...filtered, spec];
          const pat = syncEngineWithState(spec.id, nextCustom);
          const validGroups = getActiveGroups(pat);
          const curMy = get().myGroup;
          const nextMy = validGroups.includes(curMy) ? curMy : (validGroups[0] ?? "A");
          set({
            customPatterns: nextCustom,
            activePatternId: spec.id,
            myGroup: nextMy,
            filterGroup: nextMy,
            rosterGroup: nextMy,
          });
        },

        deleteCustomPattern: (patternId) => {
          const nextCustom = get().customPatterns.filter((p) => p.id !== patternId);
          const curActive = get().activePatternId;
          const nextActive =
            curActive === patternId
              ? resolvePattern(patternId, []).id
              : curActive;
          const pat = syncEngineWithState(nextActive, nextCustom);
          const validGroups = getActiveGroups(pat);
          const curMy = get().myGroup;
          const nextMy = validGroups.includes(curMy) ? curMy : (validGroups[0] ?? "A");
          set({
            customPatterns: nextCustom,
            activePatternId: nextActive,
            myGroup: nextMy,
            filterGroup: nextMy,
          });
        },

        restoreAllPresetsToDefault: () => {
          const nextCustom = get().customPatterns.filter((p) => !isBuiltInPreset(p.id));
          const curActive = get().activePatternId;
          const pat = syncEngineWithState(curActive, nextCustom);
          const validGroups = getActiveGroups(pat);
          const curMy = get().myGroup;
          const nextMy = validGroups.includes(curMy) ? curMy : (validGroups[0] ?? "A");
          set({
            customPatterns: nextCustom,
            activePatternId: pat.id,
            myGroup: nextMy,
            filterGroup: nextMy,
          });
        },

        addOrUpdateEmployee: (profile) => {
          const list = [...get().employees];
          const idx = list.findIndex((e) => e.id === profile.id);
          if (idx >= 0) list[idx] = profile;
          else list.push(profile);
          set({ employees: list });
        },

        removeEmployee: (id) => {
          set({ employees: get().employees.filter((e) => e.id !== id) });
        },

        setEmployeeDayLog: (empId, dateKey, status, overtimeHours) => {
          const clampedOt = Math.max(0, Math.min(24, Math.trunc(overtimeHours)));
          const list = get().employees.map((emp) => {
            if (emp.id !== empId) return emp;
            const logs = { ...emp.dayLogs };
            if (status === "AS_SCHEDULED" && clampedOt === 0) {
              delete logs[dateKey];
            } else {
              logs[dateKey] = { status, overtimeHours: clampedOt };
            }
            return { ...emp, dayLogs: logs };
          });
          set({ employees: list });
        },

        bumpCalendarSyncRev: () => set((s) => ({ calendarSyncRev: s.calendarSyncRev + 1 })),
      };
    },
    {
      name: "shiftkar-neo-prefs-v3",
      partialize: (s) => ({
        myGroup: s.myGroup,
        viewType: s.viewType,
        theme: s.theme,
        themeMode: s.themeMode,
        onboardingDone: s.onboardingDone,
        tourDone: s.tourDone,
        showEvents: s.showEvents,
        hapticOn: s.hapticOn,
        showEmployeesOnCalendar: s.showEmployeesOnCalendar,
        shiftReminderOn: s.shiftReminderOn,
        dayReminderHour: s.dayReminderHour,
        nightReminderHour: s.nightReminderHour,
        noteReminderOn: s.noteReminderOn,
        dayRecords: s.dayRecords,
        activePatternId: s.activePatternId,
        customPatterns: s.customPatterns,
        employees: s.employees,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const pat = syncEngineWithState(state.activePatternId, state.customPatterns);
        const validGroups = getActiveGroups(pat);
        const g = validGroups.includes(state.myGroup) ? state.myGroup : (validGroups[0] ?? "A");
        state.set({ myGroup: g, filterGroup: g, rosterGroup: g });
      },
    },
  ),
);

/** Apply theme & dark/light class to <html>; safe to call in browser. */
export function applyThemeToDom(theme: ThemeId, mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const isDark = mode === "dark" || (mode === "system" && sysDark);
  root.classList.toggle("dark", isDark);
}

/** Tactile feedback helper — no-op when disabled or unsupported. */
export function haptic(enabled = true, ms: number | number[] = 8) {
  if (!enabled || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
