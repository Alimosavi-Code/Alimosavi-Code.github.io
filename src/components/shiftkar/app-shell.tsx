"use client";
/**
 * App shell — Top-level orchestrator for ShiftKar Web v6.7.2:
 *  - Responsive across small phones, standard phones, tablets (`md:max-w-3xl`),
 *    laptops (`lg:max-w-5xl`), and wide desktops (`xl:max-w-6xl`).
 *  - Exclusive rendering of `<Onboarding />` vs `<main>` so Onboarding never overlaps the calendar.
 *  - Floating Frosted Glass Bottom Navigation Bar (`sk-bottom-nav` with `.sk-nav-pill` active indicator).
 *  - Wires up `InstallSheet`, `DaySheet`, `NotesSheet`, `MonthPicker`, and `Tour`, passing `notesRefresh`
 *    to `CalendarView` so backup restores and note edits immediately update the calendar.
 */
import { useEffect, useRef, useState } from "react";
import { useShiftKar, applyThemeToDom, haptic, type TabId } from "@/lib/store";
import { initInstallPrompt, maybeAutoPromptInstall } from "@/lib/install";
import { ensureCalendarSyncLoaded, syncCalendarNow } from "@/lib/holidays";
import { toPersianDigits } from "@/lib/jalali";
import { APP } from "@/lib/models";
import { getActivePattern } from "@/lib/shift-engine";
import { CalendarView } from "./calendar-view";
import { SystemsView } from "./systems-view";
import { RosterView } from "./roster-view";
import { ManagerView } from "./manager-view";
import { SettingsView } from "./settings-view";
import { DaySheet } from "./day-sheet";
import { NotesSheet } from "./notes-sheet";
import { MonthPicker } from "./month-picker";
import { InstallSheet } from "./install-sheet";
import { Onboarding } from "./onboarding";
import { Tour } from "./tour";
import {
  CalendarIcon,
  SystemsIcon,
  RosterIcon,
  GroupIcon,
  SettingsIcon,
  SunIcon,
  SunsetIcon,
  MoonIcon,
  RestIcon,
  ShiftKarAppEmblem,
} from "./icons";

const TABS: {
  id: TabId;
  fa: string;
  tour?: string;
  icon: (p: { size?: number; className?: string }) => React.ReactNode;
}[] = [
  { id: "calendar", fa: "تقویم", icon: CalendarIcon },
  { id: "systems", fa: "سامانه‌ها", tour: "tab-systems", icon: SystemsIcon },
  { id: "roster", fa: "لوحه", tour: "tab-roster", icon: RosterIcon },
  { id: "manager", fa: "مدیریت شیفت", tour: "tab-manager", icon: GroupIcon },
  { id: "settings", fa: "تنظیمات", tour: "tab-settings", icon: SettingsIcon },
];

export function AppShell() {
  const activeTab = useShiftKar((s) => s.activeTab);
  const theme = useShiftKar((s) => s.theme);
  const themeMode = useShiftKar((s) => s.themeMode);
  const onboardingDone = useShiftKar((s) => s.onboardingDone);
  const tourDone = useShiftKar((s) => s.tourDone);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const isTableFullscreen = useShiftKar((s) => s.isTableFullscreen);
  const bumpCalendarSyncRev = useShiftKar((s) => s.bumpCalendarSyncRev);
  const set = useShiftKar((s) => s.set);

  const [hydrated, setHydrated] = useState(false);
  const [splashPhase, setSplashPhase] = useState<"show" | "leave" | "gone">("show");
  const [daySheetKey, setDaySheetKey] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [notesRefresh, setNotesRefresh] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const installTried = useRef(false);

  /* Hydrate + background sync calendar-sync.json on every run */
  useEffect(() => {
    initInstallPrompt();
    ensureCalendarSyncLoaded();
    setHydrated(true);
    syncCalendarNow(() => bumpCalendarSyncRev()).catch(() => {});

    const t1 = setTimeout(() => setSplashPhase("leave"), 700);
    const t2 = setTimeout(() => setSplashPhase("gone"), 1050);
    if ("serviceWorker" in navigator) {
      const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      navigator.serviceWorker
        .register(`${bp}/sw.js`)
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {});
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [bumpCalendarSyncRev]);

  /* Sync theme + system color-scheme listener */
  useEffect(() => {
    if (!hydrated) return;
    applyThemeToDom(theme, themeMode);
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => applyThemeToDom(theme, "system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [hydrated, theme, themeMode]);

  /* First-run onboarding trigger */
  useEffect(() => {
    if (!hydrated) return;
    if (!onboardingDone) setShowOnboarding(true);
  }, [hydrated, onboardingDone]);

  /* One-time auto install prompt (never while onboarding or tour is active) */
  useEffect(() => {
    if (!hydrated || !onboardingDone || showOnboarding || installTried.current) return;
    installTried.current = true;
    maybeAutoPromptInstall(
      () => setInstallOpen(true),
      () => showTour || !useShiftKar.getState().tourDone,
    );
  }, [hydrated, onboardingDone, showOnboarding, showTour]);

  if (!hydrated) {
    return (
      <div className="sk-splash fixed inset-0 z-[200] flex flex-col items-center justify-center">
        <SplashArt />
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden flex justify-center">
      {splashPhase !== "gone" && (
        <div
          className={`sk-splash fixed inset-0 z-[200] flex flex-col items-center justify-center ${
            splashPhase === "leave" ? "is-leaving" : ""
          }`}
          aria-hidden
        >
          <SplashArt />
        </div>
      )}

      <div className="aurora-bg" aria-hidden />

      {/* Exclusive rendering: when showOnboarding is true, do NOT render main/nav underneath */}
      {showOnboarding ? (
        <Onboarding
          onDone={() => {
            setShowOnboarding(false);
            if (!tourDone) setTimeout(() => setShowTour(true), 350);
          }}
        />
      ) : (
        <>
          <main className="relative z-10 mx-auto h-full w-full max-w-md sm:max-w-3xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl overflow-hidden">
            <div key={activeTab} className="sk-tab-in h-full">
              {activeTab === "calendar" && (
                <CalendarView
                  onOpenDay={(k) => setDaySheetKey(k)}
                  onOpenNotes={() => setNotesOpen(true)}
                  onOpenMonthPicker={() => setPickerOpen(true)}
                  notesRefresh={notesRefresh}
                />
              )}
              {activeTab === "systems" && <SystemsView />}
              {activeTab === "roster" && (
                <RosterView
                  onOpenMonth={(jy, jm) => {
                    set({
                      activeTab: "calendar",
                      viewYear: jy,
                      viewMonth: jm,
                    });
                  }}
                />
              )}
              {activeTab === "manager" && (
                <ManagerView onOpenDay={(k) => setDaySheetKey(k)} />
              )}
              {activeTab === "settings" && (
                <SettingsView
                  onOpenInstall={() => setInstallOpen(true)}
                  onRestartOnboarding={() => setShowOnboarding(true)}
                  onRestartTour={() => {
                    set({ activeTab: "calendar" });
                    setTimeout(() => setShowTour(true), 220);
                  }}
                  onNotesChanged={() => setNotesRefresh((n) => n + 1)}
                />
              )}
            </div>

            {/* Floating Frosted Glass Bottom Navigation Bar (5 Tabs) */}
            {!isTableFullscreen && (
              <nav
                className="fixed bottom-0 inset-x-0 z-40 pb-safe pt-2 px-3 pointer-events-none"
                aria-label="ناوبری اصلی"
              >
                <div
                  data-tour="bottom-nav"
                  className="pointer-events-auto mx-auto max-w-md md:max-w-xl sk-bottom-nav rounded-[26px] grid grid-cols-5 p-1.5 gap-1"
                >
                  {TABS.map((t) => {
                    const active = activeTab === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          haptic(hapticOn);
                          set({ activeTab: t.id });
                        }}
                        data-tour={t.tour}
                        aria-current={active ? "page" : undefined}
                        className={`sk-bottom-nav-btn relative h-14 rounded-[20px] flex flex-col items-center justify-center gap-1 transition-colors duration-150 ${
                          active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-faint)]"
                        }`}
                      >
                        {active && (
                          <span className="absolute inset-0 rounded-[20px] bg-gradient-to-b from-[var(--sk-primary)]/22 to-[var(--sk-primary)]/8 border border-[var(--sk-primary)]/25 shadow-[0_6px_18px_-8px_var(--sk-glow-a),inset_0_1px_0_var(--sk-specular)] sk-nav-pill" />
                        )}
                        <Icon size={20} className="relative" />
                        <span className="relative text-[10px] md:text-[11px] font-bold tracking-tight leading-none">
                          {t.fa}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </nav>
            )}
          </main>

          {/* Sheets & Modals */}
          <DaySheet
            dateKey={daySheetKey}
            onClose={() => setDaySheetKey(null)}
            onNoteChanged={() => setNotesRefresh((n) => n + 1)}
          />
          <NotesSheet
            open={notesOpen}
            onClose={() => setNotesOpen(false)}
            onPickDate={(key) => {
              const [y, m] = key.split("-").map(Number);
              set({
                activeTab: "calendar",
                viewYear: y,
                viewMonth: m,
                selectedDateKey: key,
              });
              setDaySheetKey(key);
            }}
            refreshKey={notesRefresh}
          />
          <MonthPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onOpenDay={(k) => setDaySheetKey(k)}
          />
          <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
          <Tour
            open={showTour}
            onClose={() => {
              setShowTour(false);
              set({ tourDone: true });
            }}
          />
        </>
      )}
    </div>
  );
}

/** Unified Orbital Splash Screen matching Android MainActivity.kt SplashArt */
function SplashArt() {
  return (
    <div className="flex flex-col items-center select-none px-6">
      <div className="relative grid place-items-center mb-5 sk-splash-orb">
        <span
          className="sk-splash-ring absolute size-32 rounded-full border border-[var(--sk-primary)]/35"
          aria-hidden
        />
        <ShiftKarAppEmblem size={108} />
      </div>

      <div className="sk-splash-t1 text-[28px] font-black text-gradient">{APP.name}</div>
      <div className="sk-splash-t2 text-[13px] font-bold text-[var(--sk-text-muted)] mt-1">
        {APP.tagline}
      </div>

      {/* 4 Shift Kind Pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
        <span className="sk-splash-p1 h-7 px-3 rounded-full sk-grad-day text-[10.5px] font-black inline-flex items-center gap-1.5 border border-[var(--sk-day-ink)]/30">
          <SunIcon size={12} />
          صبح‌کار
        </span>
        {(getActivePattern().eveningCount ?? 0) > 0 && (
          <span className="sk-splash-p2 h-7 px-3 rounded-full sk-grad-evening text-[10.5px] font-black inline-flex items-center gap-1.5 border border-[var(--sk-evening-ink)]/30">
            <SunsetIcon size={12} />
            عصرکار
          </span>
        )}
        <span className="sk-splash-p3 h-7 px-3 rounded-full sk-grad-night text-[10.5px] font-black inline-flex items-center gap-1.5 border border-[var(--sk-night-ink)]/30">
          <MoonIcon size={12} />
          شب‌کار
        </span>
        <span className="sk-splash-p4 h-7 px-3 rounded-full sk-grad-rest text-[10.5px] font-black inline-flex items-center gap-1.5 border border-[var(--sk-rest-ink)]/30">
          <RestIcon size={12} />
          استراحت
        </span>
      </div>

      <div className="sk-splash-ver mt-6 px-3.5 py-1 rounded-full glass border border-[var(--sk-primary)]/40 text-[11px] font-extrabold text-[var(--sk-primary)]">
        نسخهٔ {toPersianDigits(APP.version)}
      </div>
    </div>
  );
}
