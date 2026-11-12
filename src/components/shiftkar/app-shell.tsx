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
import { useToday } from "@/lib/use-today";
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
  InfoIcon,
  CheckIcon,
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
  const viewYear = useShiftKar((s) => s.viewYear);
  const rosterYear = useShiftKar((s) => s.rosterYear);
  const isTableFullscreen = useShiftKar((s) => s.isTableFullscreen);
  const bumpCalendarSyncRev = useShiftKar((s) => s.bumpCalendarSyncRev);
  const set = useShiftKar((s) => s.set);
  const today = useToday();

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

  /* Global Desktop Keyboard Shortcuts (Tabs 1..5, Notes N) & Shift+Scroll Horizontal Helper */
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || Math.abs(e.deltaY) === 0 || Math.abs(e.deltaX) > 0) return;
      let el = e.target as HTMLElement | null;
      while (el && el !== document.body) {
        if (el.scrollWidth > el.clientWidth + 2) {
          const style = window.getComputedStyle(el);
          if (style.overflowX === "auto" || style.overflowX === "scroll") {
            e.preventDefault();
            el.scrollLeft -= e.deltaY;
            return;
          }
        }
        el = el.parentElement;
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!hydrated || showOnboarding) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt?.isContentEditable) {
        return;
      }
      if (document.body.classList.contains("sk-sheet-open")) return;

      if (e.key === "1") {
        set({ activeTab: "calendar" });
      } else if (e.key === "2") {
        set({ activeTab: "systems" });
      } else if (e.key === "3") {
        set({ activeTab: "roster" });
      } else if (e.key === "4") {
        set({ activeTab: "manager" });
      } else if (e.key === "5") {
        set({ activeTab: "settings" });
      } else if ((e.key === "n" || e.key === "N" || e.key === "د") && activeTab === "calendar") {
        e.preventDefault();
        setNotesOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hydrated, showOnboarding, activeTab, set]);

  /* First-run onboarding trigger */
  useEffect(() => {
    if (!hydrated) return;
    if (!onboardingDone) setShowOnboarding(true);
  }, [hydrated, onboardingDone]);

  /* One-time 10-second non-dismissible Future-Year Lunar & Holiday Disclaimer Popup */
  const [futureDisclaimerYear, setFutureDisclaimerYear] = useState<number | null>(null);
  const [futureDisclaimerSec, setFutureDisclaimerSec] = useState(10);

  useEffect(() => {
    if (!hydrated || showOnboarding) return;
    const baseCurrentYear = Math.max(today.jy, 1405);
    const targetFutureYear =
      activeTab === "roster" && rosterYear > baseCurrentYear
        ? rosterYear
        : viewYear > baseCurrentYear
          ? viewYear
          : null;
    if (!targetFutureYear) return;

    const STORAGE_KEY = "shiftkar_future_year_lunar_disclaimer_v1";
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore storage errors */
    }
    setFutureDisclaimerSec(10);
    setFutureDisclaimerYear(targetFutureYear);
  }, [hydrated, showOnboarding, activeTab, viewYear, rosterYear, today.jy]);

  useEffect(() => {
    if (futureDisclaimerYear === null) return;
    if (futureDisclaimerSec <= 0) return;
    const timer = setInterval(() => {
      setFutureDisclaimerSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [futureDisclaimerYear, futureDisclaimerSec]);

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

          {/* 10-Second Non-Dismissible Future-Year Lunar Disclaimer Modal (Shown Once Ever) */}
          {futureDisclaimerYear !== null && (
            <div
              className="fixed inset-0 z-[190] flex items-center justify-center p-4"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="future-lunar-disclaimer-title"
            >
              <div className="sk-scrim-in absolute inset-0 sk-scrim" />
              <div className="sk-pop-in relative z-10 w-full max-w-[440px] glass-strong rounded-3xl p-5 space-y-3.5 border-[1.5px] border-[var(--sk-primary)]/55 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)] overflow-hidden">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="size-10 rounded-2xl sk-grad-day border border-[var(--sk-day-ink)]/40 grid place-items-center shrink-0">
                      <InfoIcon size={20} />
                    </span>
                    <div className="min-w-0">
                      <h3
                        id="future-lunar-disclaimer-title"
                        className="text-[14.5px] sm:text-[15.5px] font-black leading-snug"
                      >
                        تذکر مهم تقویم سال {toPersianDigits(futureDisclaimerYear)}
                      </h3>
                      <p className="text-[11px] font-bold text-[var(--sk-primary)] mt-0.5">
                        اختلاف تقویم قمری و شمسی در سال‌های آینده
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-black shrink-0 ${
                      futureDisclaimerSec > 0 ? "sk-grad-day" : "sk-pill-glass-on"
                    }`}
                  >
                    {futureDisclaimerSec > 0
                      ? `${toPersianDigits(futureDisclaimerSec)} ثانیه`
                      : "قابل بستن"}
                  </span>
                </div>

                <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] p-3.5 space-y-2.5 text-[12px] leading-6 text-[var(--sk-text)]">
                  <p>
                    <strong className="text-[var(--sk-primary)]">چرا تاریخ قمری ممکن است تغییر کند؟</strong>{" "}
                    تقویم شمسی بر پایهٔ گردش زمین به دور خورشید کاملاً ثابت است، اما ماه‌های قمری بر اساس{" "}
                    <strong>رؤیت هلال ماه (۲۹ یا ۳۰ روزه بودن)</strong> تعیین می‌شوند و هر سال حدود ۱۱ روز نسبت به تقویم شمسی جابه‌جا می‌گردند؛ بنابراین تاریخ دقیق روزها و تعطیلات قمریِ سال{" "}
                    {toPersianDigits(futureDisclaimerYear)} تا زمان استهلال و انتشار تقویم رسمی کشور قطعی نیست و ممکن است یک روز اختلاف داشته باشد.
                  </p>
                  <p className="text-[11.5px] text-[var(--sk-text-muted)]">
                    • <strong>نوبت‌کاری و شیفت‌های شما</strong> بر پایهٔ تقویم شمسی است و برای تمام سال‌های آینده{" "}
                    <strong className="text-[var(--sk-text)]">۱۰۰٪ دقیق و بدون تغییر</strong> می‌باشد.
                  </p>
                  <p className="rounded-xl bg-[var(--sk-holiday-soft)] border border-[var(--sk-holiday)]/35 px-3 py-2 text-[11.5px] font-bold text-[var(--sk-holiday)] leading-5">
                    لطفاً برای تاریخ‌ها و تعطیلات قمری سال‌های آینده منتظر به‌روزرسانی تقویم برنامه بمانید و به آن‌ها به‌طور قطعی اعتماد نکنید؛ مسئولیت برنامه‌ریزی بر اساس تاریخ‌های قمریِ سال‌های آتی بر عهدهٔ شخص کاربر است.
                  </p>
                </div>

                {/* 10-second visual progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--sk-surface-strong)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--sk-primary)] transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${((10 - futureDisclaimerSec) / 10) * 100}%` }}
                  />
                </div>

                <button
                  type="button"
                  disabled={futureDisclaimerSec > 0}
                  onClick={() => {
                    if (futureDisclaimerSec > 0) return;
                    haptic(hapticOn);
                    setFutureDisclaimerYear(null);
                  }}
                  className={`w-full py-3 rounded-2xl text-[13px] font-black flex items-center justify-center gap-2 transition-all ${
                    futureDisclaimerSec > 0
                      ? "bg-[var(--sk-surface-strong)] border border-[var(--sk-border)] text-[var(--sk-text-muted)] opacity-75 cursor-not-allowed"
                      : "sk-btn-glass-primary active:scale-[0.98]"
                  }`}
                >
                  {futureDisclaimerSec > 0 ? (
                    <span>
                      لطفاً تذکر بالا را مطالعه فرمایید ({toPersianDigits(futureDisclaimerSec)} ثانیه)
                    </span>
                  ) : (
                    <>
                      <CheckIcon size={16} />
                      <span>متوجه شدم و مسئولیت آن را می‌پذیرم</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Unified Orbital Splash Screen matching Android MainActivity.kt SplashArt */
function SplashArt() {
  /* Pattern-dependent splash content (the عصرکار pill) must wait for mount:
   * the prerendered HTML is built with the DEFAULT pattern while the client
   * rehydrates the active pattern synchronously before first render — reading
   * it here directly caused React hydration error #418 on reload. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const showEveningPill = mounted && (getActivePattern().eveningCount ?? 0) > 0;

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
        {showEveningPill && (
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
