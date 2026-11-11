"use client";
/**
 * Onboarding — 6 steps aligned with Android `OnboardingScreen.kt` (v6.7.1):
 *  - Step 1: تقویم هوشمند شیفت
 *  - Step 2: شیفت شما کدام است؟
 *  - Step 3: شخصی‌سازی نمایش (default: سیستم + تقویم)
 *  - Step 4: رنگ دلخواه را انتخاب کنید (default: آبی)
 *  - Step 5: نصب برنامه (PWA install CTA)
 *  - Step 6: همه‌چیز آماده است! — Interactive expandable cards for «شیفت شما», «حالت نمایش», and «رنگ برنامه»
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useShiftKar, applyThemeToDom, haptic, type ViewType } from "@/lib/store";
import { APP, THEMES, type Group, type ThemeId, type ThemeMode, type ShiftKind } from "@/lib/models";
import {
  calculateShift,
  getActiveGroups,
  getActivePattern,
  getGroupLetter,
  getGroupTitle,
} from "@/lib/shift-engine";
import { makeDateKey, todayJalaali, toPersianDigits } from "@/lib/onboarding-utils";
import { promptInstall, getInstallState, getBrowserInstallGuide } from "@/lib/install";
import { BrowserInstallGuideBox } from "./install-sheet";
import {
  SunIcon,
  SunsetIcon,
  MoonIcon,
  RestIcon,
  GroupIcon,
  PaletteIcon,
  DownloadIcon,
  MonitorIcon,
  TableIcon,
  GridIcon,
  CheckIcon,
  ChevronLeft,
  ChevronDown,
  ChevronUpIcon,
  SparkIcon,
  ShiftKarAppEmblem,
} from "./icons";

const KIND_CHIP: Record<ShiftKind, { bg: string; icon: React.ReactNode; fa: string }> = {
  DAY: { bg: "sk-grad-day", icon: <SunIcon size={15} />, fa: "صبح‌کار" },
  EVENING: { bg: "sk-grad-evening", icon: <SunsetIcon size={15} />, fa: "عصرکار" },
  NIGHT: { bg: "sk-grad-night", icon: <MoonIcon size={15} />, fa: "شب‌کار" },
  REST: { bg: "sk-grad-rest", icon: <RestIcon size={15} />, fa: "استراحت" },
};

function subscribeInstall(cb: () => void) {
  const events = ["shiftkar-neo:install-state", "shiftkar-neo:install-ready", "appinstalled"] as const;
  for (const e of events) window.addEventListener(e, cb);
  return () => {
    for (const e of events) window.removeEventListener(e, cb);
  };
}
const readInstalled = () => getInstallState().installed;
const readCanPrompt = () => getInstallState().canPrompt;
const readServerFalse = () => false;

function InstallCta({ compact }: { compact?: boolean }) {
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const installed = useSyncExternalStore(subscribeInstall, readInstalled, readServerFalse);
  const canPrompt = useSyncExternalStore(subscribeInstall, readCanPrompt, readServerFalse);
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setBusy(false), 6000);
    return () => window.clearTimeout(id);
  }, [busy]);

  if (installed) {
    return (
      <div
        className={`rounded-2xl bg-[var(--sk-rest-soft)] border border-[var(--sk-rest)] flex items-center justify-center gap-2 text-[var(--sk-rest-ink)] font-bold ${
          compact ? "h-11 text-[12.5px] px-4" : "h-13 text-[14px]"
        }`}
      >
        <CheckIcon size={compact ? 15 : 17} />
        برنامه روی دستگاه شما نصب است
      </div>
    );
  }

  const guide = mounted ? getBrowserInstallGuide() : null;
  const shouldShowGuideCard =
    !compact || showGuide || (mounted && (!guide?.supportsNativePrompt || !canPrompt));

  const run = async () => {
    haptic(hapticOn);
    setBusy(true);
    try {
      const res = await promptInstall();
      if (res !== "installed") {
        setShowGuide(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={`w-full rounded-2xl bg-[var(--sk-primary)] text-white font-black flex items-center justify-center gap-2 shadow-[0_14px_34px_-10px_var(--sk-glow-a)] active:scale-[0.98] transition-transform disabled:opacity-60 ${
          compact ? "h-11 text-[13px] px-4" : "h-13 text-[15px]"
        }`}
      >
        <DownloadIcon size={compact ? 16 : 17} />
        {busy
          ? "در حال آماده‌سازی…"
          : canPrompt
            ? "نصب مستقیم برنامه"
            : guide && !guide.supportsNativePrompt
              ? `راهنمای نصب در ${guide.browserName}`
              : "نصب برنامه روی دستگاه"}
      </button>
      {/* Auto-show the manual install steps for browsers without a native
           prompt (iOS Safari / Firefox) instead of waiting for a failed tap. */}
      {shouldShowGuideCard && (
        <BrowserInstallGuideBox busy={busy} forceShowSteps={showGuide || !canPrompt} />
      )}
    </div>
  );
}

const TOTAL = 6;

/* Short titles for the desktop side-panel stepper (lg+). */
const STEP_TITLES = [
  "تقویم هوشمند شیفت",
  "شیفت شما کدام است؟",
  "شخصی‌سازی نمایش",
  "رنگ دلخواه را انتخاب کنید",
  "نصب برنامه",
  "همه‌چیز آماده است!",
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { set, hapticOn } = useShiftKar();
  const [step, setStep] = useState(0);

  const [group, setGroup] = useState<Group>(() => useShiftKar.getState().myGroup || "A");
  const [theme, setTheme] = useState<ThemeId>(() => useShiftKar.getState().theme || "blue");
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    () => useShiftKar.getState().themeMode || "system",
  );
  const [viewType, setViewType] = useState<ViewType>(
    () => useShiftKar.getState().viewType || "grid",
  );

  /* Expandable cards state on final step (matching OnboardingScreen.kt lines 422-424) */
  const [expandGroup, setExpandGroup] = useState(false);
  const [expandDisplay, setExpandDisplay] = useState(false);
  const [expandTheme, setExpandTheme] = useState(false);

  const pat = getActivePattern();
  const groups = getActiveGroups(pat).slice(0, 4);

  const applyModeLive = (mode: ThemeMode) => {
    setThemeMode(mode);
    set({ themeMode: mode });
    applyThemeToDom(theme, mode);
  };

  const applyThemeLive = (t: ThemeId) => {
    setTheme(t);
    set({ theme: t });
    applyThemeToDom(t, themeMode);
  };

  const applyViewLive = (vt: ViewType) => {
    setViewType(vt);
    set({ viewType: vt });
  };

  const applyGroupLive = (g: Group) => {
    setGroup(g);
    set({ myGroup: g, filterGroup: g, rosterGroup: g });
  };

  const go = (nextStep: number) => {
    const clamped = Math.max(0, Math.min(TOTAL - 1, nextStep));
    if (clamped === step) return;
    haptic(hapticOn, clamped > step ? 10 : 6);
    setStep(clamped);
  };

  const finish = () => {
    haptic(hapticOn, 20);
    set({
      onboardingDone: true,
      myGroup: group,
      filterGroup: group,
      rosterGroup: group,
      theme,
      themeMode,
      viewType,
    });
    applyThemeToDom(theme, themeMode);
    onDone();
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchLastX = useRef<number | null>(null);
  const touchLastY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchLastX.current = e.touches[0].clientX;
    touchLastY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchLastX.current = e.touches[0].clientX;
    touchLastY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? touchLastX.current ?? touchStartX.current;
    const endY = e.changedTouches?.[0]?.clientY ?? touchLastY.current ?? touchStartY.current;
    const dx = endX - touchStartX.current;
    const dy = endY - touchStartY.current;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx > 0 && step < TOTAL - 1) go(step + 1);
      else if (dx < 0 && step > 0) go(step - 1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    touchLastX.current = null;
    touchLastY.current = null;
  };

  const currentThemeMeta = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const themeModeFa =
    themeMode === "system" ? "سیستم" : themeMode === "dark" ? "تیره" : "روشن";

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--sk-bg)] flex flex-col overflow-hidden select-none">
      <div className="aurora-bg" aria-hidden />

      <div
        className="relative z-10 flex-1 flex flex-col max-w-md md:max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto w-full min-h-0 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch lg:gap-10 xl:gap-12 lg:px-6"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Desktop side panel (lg+): brand + step stepper — fills the wide
            screen beside the slide card instead of dead empty margins. */}
        <aside className="hidden lg:flex flex-col justify-center gap-5 min-h-0 py-6">
          <div className="flex items-center gap-3.5">
            <ShiftKarAppEmblem size={56} />
            <div className="min-w-0">
              <div className="text-[22px] font-black leading-tight text-gradient">{APP.name}</div>
              <div className="text-[11.5px] font-bold text-[var(--sk-text-muted)] mt-0.5 truncate">
                {APP.tagline}
              </div>
            </div>
          </div>

          <div className="h-px bg-[var(--sk-border-soft)]" aria-hidden />

          <ol className="flex flex-col gap-1.5" aria-label="مراحل راه‌اندازی">
            {STEP_TITLES.map((t, i) => {
              const done = i < step;
              const current = i === step;
              return (
                <li
                  key={t}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                    current ? "bg-[var(--sk-primary-soft)]" : ""
                  }`}
                  style={{
                    border: current
                      ? "1px solid color-mix(in srgb, var(--sk-primary) 40%, transparent)"
                      : "1px solid transparent",
                  }}
                >
                  <span
                    className={`size-6 rounded-full grid place-items-center text-[11px] font-black shrink-0 ${
                      current
                        ? "bg-[var(--sk-primary)] text-white"
                        : done
                          ? "bg-[var(--sk-surface-strong)] text-[var(--sk-primary)]"
                          : "bg-[var(--sk-surface-strong)] text-[var(--sk-text-faint)]"
                    }`}
                  >
                    {done ? <CheckIcon size={12} /> : toPersianDigits(i + 1)}
                  </span>
                  <span
                    className={`text-[12.5px] truncate ${
                      current
                        ? "font-black text-[var(--sk-primary)]"
                        : done
                          ? "font-bold text-[var(--sk-text-muted)]"
                          : "font-bold text-[var(--sk-text-faint)]"
                    }`}
                  >
                    {t}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="text-[11px] leading-5 text-[var(--sk-text-faint)] px-1">
            بین مراحل با دکمه‌های «قبلی / بعدی» جابه‌جا شوید؛ همهٔ انتخاب‌ها بعداً هم از تب «تنظیمات» قابل تغییر است.
          </p>
        </aside>

        {/* Main column: slide card + navigation */}
        <div className="flex flex-col h-full min-h-0 w-full">
        {/* Step counter — TOP (mobile / tablet) */}
        <div className="flex items-center justify-center pt-8 shrink-0 lg:hidden">
          <span className="text-[12px] font-bold bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] px-3.5 py-1.5 rounded-full">
            گام {toPersianDigits(step + 1)} از {toPersianDigits(TOTAL)}
          </span>
        </div>

        {/* Slide content — the child's `my-auto` centers it when short and
            keeps the whole slide scrollable when tall (justify-center on a
            scroll container used to clip the install guide at both ends). */}
        <div className="flex-1 flex flex-col px-7 py-4 overflow-y-auto sk-scroll min-h-0 lg:px-0 lg:py-8">
          <div key={step} className="sk-onb-in my-auto onb-card-lg">
            {step === 0 && (
              <div>
                <div className="flex justify-center mb-6 lg:hidden">
                  <ShiftKarAppEmblem size={92} />
                </div>
                <h2 className="text-[26px] font-black text-center leading-snug">
                  تقویم هوشمند شیفت
                </h2>
                <p className="text-[14px] text-[var(--sk-text-muted)] text-center mt-3 leading-7">
                  شیفت‌کار بر اساس تاریخ پایه و گروه شما، شیفت صبح‌کار، عصرکار، شب‌کار و استراحت
                  را برای هر روز به‌صورت خودکار محاسبه می‌کند — بدون نیاز به محاسبه دستی.
                </p>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="mx-auto mb-5 size-16 rounded-[22px] bg-[var(--sk-primary-soft)] grid place-items-center text-[var(--sk-primary)]">
                  <GroupIcon size={30} />
                </div>
                <h2 className="text-[24px] font-black text-center">شیفت شما کدام است؟</h2>
                <p className="text-[14px] text-[var(--sk-text-muted)] text-center mt-2 mb-5">
                  تقویم بر اساس گروه شما شخصی‌سازی می‌شود
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {groups.map((g) => {
                    const active = group === g;
                    const t = todayJalaali();
                    const preview = calculateShift(makeDateKey(t.jy, t.jm, t.jd), g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          haptic(hapticOn, 12);
                          applyGroupLive(g);
                        }}
                        className={`rounded-2xl py-3 flex flex-col items-center gap-1 transition-all ${
                          active
                            ? "bg-[var(--sk-primary)] text-white shadow-[0_10px_26px_-10px_var(--sk-glow-a)]"
                            : "glass"
                        }`}
                        aria-pressed={active}
                      >
                        <span className="text-[16px] font-black">{getGroupLetter(g, pat)}</span>
                        <span
                          className={`mt-0.5 px-1.5 py-0.5 rounded-[6px] inline-flex items-center justify-center ${
                            active ? "bg-white/20 text-white" : KIND_CHIP[preview.type].bg
                          }`}
                        >
                          {KIND_CHIP[preview.type].icon}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 grid grid-cols-3 gap-2">
                  {(["DAY", "NIGHT", "REST"] as const).map((k) => {
                    const chip = KIND_CHIP[k];
                    return (
                      <div
                        key={k}
                        className={`rounded-2xl py-2.5 flex flex-col items-center gap-1 ${chip.bg}`}
                      >
                        {chip.icon}
                        <span className="text-[11px] font-bold">{chip.fa}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-[11px] text-[var(--sk-text-faint)] mt-3 leading-5">
                  همین نشان‌ها را در کل تقویم می‌بینید: خورشید یعنی صبح‌کار، ماه یعنی شب‌کار و نشان استراحت یعنی روز آزاد شما.
                </p>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="mx-auto mb-5 size-16 rounded-[22px] bg-[var(--sk-primary-soft)] grid place-items-center text-[var(--sk-primary)]">
                  <MonitorIcon size={30} />
                </div>
                <h2 className="text-[22px] font-black text-center">شخصی‌سازی نمایش</h2>
                <p className="text-[13px] text-[var(--sk-text-muted)] text-center mt-2 mb-5">
                  این تنظیمات بعداً در «تنظیمات» هم در دسترس است
                </p>

                <div className="text-[12.5px] font-bold mb-2">حالت نمایش</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "system", fa: "سیستم", icon: <MonitorIcon size={19} /> },
                      { id: "dark", fa: "تیره", icon: <MoonIcon size={19} /> },
                      { id: "light", fa: "روشن", icon: <SunIcon size={19} /> },
                    ] as const
                  ).map((m) => {
                    const active = themeMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          haptic(hapticOn, 12);
                          applyModeLive(m.id);
                        }}
                        className={`relative rounded-2xl py-2.5 flex flex-col items-center gap-1.5 sk-outline ${
                          active ? "is-active" : ""
                        }`}
                      >
                        <span
                          className={
                            active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                          }
                        >
                          {m.icon}
                        </span>
                        <span
                          className={`text-[10.5px] font-bold ${
                            active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                          }`}
                        >
                          {m.fa}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="text-[12.5px] font-bold mt-5 mb-2">حالت نمایش جدول</div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "table", fa: "جدولی", icon: <TableIcon size={19} /> },
                      { id: "grid", fa: "تقویم", icon: <GridIcon size={22} /> },
                    ] as const
                  ).map((v) => {
                    const active = viewType === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          haptic(hapticOn, 12);
                          applyViewLive(v.id);
                        }}
                        className={`relative rounded-2xl py-2.5 flex flex-col items-center justify-center gap-1.5 sk-outline ${
                          active ? "is-active" : ""
                        }`}
                      >
                        <span
                          className={`h-[23px] flex items-center justify-center ${
                            active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                          }`}
                        >
                          {v.icon}
                        </span>
                        <span
                          className={`text-[11.5px] font-bold ${
                            active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                          }`}
                        >
                          {v.fa}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col items-center">
                <div className="mx-auto mb-5 size-16 rounded-[22px] bg-[var(--sk-primary-soft)] grid place-items-center text-[var(--sk-primary)]">
                  <PaletteIcon size={30} />
                </div>
                <h2 className="text-[24px] font-black text-center">رنگ دلخواه را انتخاب کنید</h2>
                <p className="text-[14px] text-[var(--sk-text-muted)] text-center mt-2 mb-5">
                  بعداً از تنظیمات هم قابل تغییر است — همراه با حالت تیره
                </p>
                <div className="w-full grid grid-cols-6 gap-2.5 items-center">
                  {THEMES.map((t) => {
                    const active = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          haptic(hapticOn, 12);
                          applyThemeLive(t.id);
                        }}
                        className={`aspect-square rounded-2xl grid place-items-center transition-all ${
                          active ? "scale-110 opacity-100" : "scale-92 opacity-75"
                        }`}
                        style={{
                          background: `linear-gradient(135deg, ${t.hex}, ${t.hex}a6)`,
                          border: active
                            ? "3px solid #ffffff"
                            : "1px solid var(--sk-border-soft)",
                        }}
                        aria-label={t.fa}
                      >
                        {active && (
                          <span className="size-6 rounded-full bg-black/30 grid place-items-center text-white">
                            <CheckIcon size={14} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div
                  className="mt-4 px-4 py-1.5 rounded-full bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] text-[12.5px] font-extrabold"
                  style={{
                    border: "1px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
                  }}
                >
                  رنگ انتخابی: {currentThemeMeta.fa}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="mx-auto size-20 rounded-[28px] bg-gradient-to-br from-[var(--sk-primary)] to-[var(--sk-primary-strong)] grid place-items-center text-white shadow-[0_20px_50px_-14px_var(--sk-glow-a)] mb-6">
                  <DownloadIcon size={38} />
                </div>
                <h2 className="text-[26px] font-black text-center leading-snug">نصب برنامه</h2>
                <p className="text-[14px] text-[var(--sk-text-muted)] text-center mt-3 leading-7">
                  شیفت‌کار را مانند یک برنامهٔ واقعی روی دستگاه خود نصب کنید؛ سریع‌تر باز می‌شود و حتی بدون اینترنت هم کار می‌کند.
                </p>
                <div className="mt-6">
                  <InstallCta />
                </div>
              </div>
            )}

            {step === 5 && (
              <div>
                <div className="mx-auto size-20 rounded-[28px] bg-gradient-to-br from-[var(--sk-primary)] to-[var(--sk-primary-strong)] grid place-items-center text-white shadow-[0_16px_40px_-14px_var(--sk-glow-a)] mb-5">
                  <SparkIcon size={32} />
                </div>
                <h2 className="text-[24px] font-black text-center">همه‌چیز آماده است!</h2>
                <p className="text-[12px] text-[var(--sk-text-muted)] text-center mt-1.5 mb-4">
                  برای تغییر سریع هر مورد، روی آن ضربه بزنید
                </p>

                <div className="space-y-2">
                  {/* 1. Interactive شیفت شما card */}
                  <div className="glass rounded-2xl px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        haptic(hapticOn, 10);
                        setExpandGroup((v) => !v);
                      }}
                      className="w-full flex items-center justify-between text-[12.5px]"
                    >
                      <span className="text-[var(--sk-text-muted)]">شیفت شما</span>
                      <span className="flex items-center gap-1.5 font-black text-[13px] text-[var(--sk-primary)]">
                        {getGroupTitle(group, pat)}
                        <span className="text-[var(--sk-text-faint)]">
                          {expandGroup ? <ChevronUpIcon size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </span>
                    </button>
                    {expandGroup && (
                      <div className="grid grid-cols-4 gap-1.5 pt-2.5">
                        {groups.map((g) => {
                          const active = group === g;
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => {
                                haptic(hapticOn, 12);
                                applyGroupLive(g);
                              }}
                              className={`py-2 rounded-xl text-[11.5px] font-bold border transition-all ${
                                active
                                  ? "bg-[var(--sk-primary)] border-[var(--sk-primary)] text-white"
                                  : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text)]"
                              }`}
                            >
                              {getGroupTitle(g, pat)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 2. Interactive حالت نمایش و جدول card */}
                  <div className="glass rounded-2xl px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        haptic(hapticOn, 10);
                        setExpandDisplay((v) => !v);
                      }}
                      className="w-full flex items-center justify-between text-[12.5px]"
                    >
                      <span className="text-[var(--sk-text-muted)]">حالت نمایش</span>
                      <span className="flex items-center gap-1.5 font-black text-[13px] text-[var(--sk-primary)]">
                        {themeModeFa} • {viewType === "grid" ? "تقویم" : "جدولی"}
                        <span className="text-[var(--sk-text-faint)]">
                          {expandDisplay ? <ChevronUpIcon size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </span>
                    </button>
                    {expandDisplay && (
                      <div className="pt-2.5 space-y-2">
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: "system", label: "سیستم" },
                              { id: "dark", label: "تیره" },
                              { id: "light", label: "روشن" },
                            ] as const
                          ).map((m) => {
                            const active = themeMode === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  haptic(hapticOn, 12);
                                  applyModeLive(m.id);
                                }}
                                className={`py-2 rounded-xl text-[11.5px] font-bold border transition-all ${
                                  active
                                    ? "bg-[var(--sk-primary)] border-[var(--sk-primary)] text-white"
                                    : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text)]"
                                }`}
                              >
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(
                            [
                              { id: "grid", label: "نمای تقویم" },
                              { id: "table", label: "نمای جدولی" },
                            ] as const
                          ).map((vt) => {
                            const active = viewType === vt.id;
                            return (
                              <button
                                key={vt.id}
                                type="button"
                                onClick={() => {
                                  haptic(hapticOn, 12);
                                  applyViewLive(vt.id);
                                }}
                                className={`py-2 rounded-xl text-[11.5px] font-bold border transition-all ${
                                  active
                                    ? "bg-[var(--sk-primary)] border-[var(--sk-primary)] text-white"
                                    : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text)]"
                                }`}
                              >
                                {vt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Interactive رنگ برنامه card */}
                  <div className="glass rounded-2xl px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        haptic(hapticOn, 10);
                        setExpandTheme((v) => !v);
                      }}
                      className="w-full flex items-center justify-between text-[12.5px]"
                    >
                      <span className="text-[var(--sk-text-muted)]">رنگ برنامه</span>
                      <span className="flex items-center gap-1.5 font-black text-[13px] text-[var(--sk-primary)]">
                        <span
                          className="size-3.5 rounded-full inline-block"
                          style={{ background: currentThemeMeta.hex }}
                        />
                        {currentThemeMeta.fa}
                        <span className="text-[var(--sk-text-faint)]">
                          {expandTheme ? <ChevronUpIcon size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </span>
                    </button>
                    {expandTheme && (
                      <div className="grid grid-cols-6 gap-2 pt-2.5 items-center">
                        {THEMES.map((t) => {
                          const active = theme === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                haptic(hapticOn, 12);
                                applyThemeLive(t.id);
                              }}
                              className="aspect-square rounded-xl grid place-items-center transition-all"
                              style={{
                                background: t.hex,
                                border: active
                                  ? "2.5px solid #ffffff"
                                  : "1px solid var(--sk-border-soft)",
                              }}
                              aria-label={t.fa}
                            >
                              {active && <CheckIcon size={13} className="text-white" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <InstallCta compact />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="px-7 flex items-center gap-3 shrink-0 lg:px-0 lg:pb-7">
          {step > 0 && (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="h-13 py-3.5 px-5 rounded-2xl glass text-[14px] font-bold"
            >
              قبلی
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (step < TOTAL - 1) go(step + 1);
              else finish();
            }}
            className="flex-1 h-13 py-3.5 rounded-2xl bg-[var(--sk-primary)] text-white text-[15px] font-black flex items-center justify-center gap-2 shadow-[0_14px_34px_-10px_var(--sk-glow-a)] active:scale-[0.97] transition-transform"
          >
            {step < TOTAL - 1 ? "بعدی" : "شروع کنید"}
            <ChevronLeft size={17} />
          </button>
        </div>

        {/* Progress dots — BOTTOM (mobile / tablet; desktop uses the stepper) */}
        <div
          className="flex items-center justify-center gap-2 pt-5 pb-7 shrink-0 lg:hidden"
          role="tablist"
          aria-label="مراحل راهنما"
        >
          {Array.from({ length: TOTAL }, (_, i) => i).map((i) => {
            const active = i === step;
            const passed = i < step;
            return (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`مرحله ${toPersianDigits(i + 1)}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active ? "w-7" : "w-2.5"
                }`}
                style={{
                  backgroundColor: active
                    ? "var(--sk-primary)"
                    : passed
                      ? "color-mix(in srgb, var(--sk-primary) 45%, transparent)"
                      : "var(--sk-border)",
                  boxShadow: active ? "0 2px 8px -2px var(--sk-glow-a)" : "none",
                }}
              />
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}
