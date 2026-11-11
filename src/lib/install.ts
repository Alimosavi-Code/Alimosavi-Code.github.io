"use client";
/**
 * PWA install engine — Cross-platform & multi-browser support (Android, iOS, Windows, macOS, Linux):
 *  - Preserves transient user gesture when `deferredPrompt` is already captured so Desktop Edge/Chrome
 *    on Linux, Windows, and macOS always open the native install dialog immediately on click.
 *  - Automatically resets stale `installedFlag` when `beforeinstallprompt` fires in a normal browser tab.
 *  - Provides `getBrowserInstallGuide()` with tailored step-by-step instructions per browser & OS
 *    (Chrome, Edge, Firefox, Vivaldi, Opera, Brave, Safari iOS/macOS, Samsung Internet, Mi Browser)
 *    for both `InstallSheet` and `Onboarding`.
 */

const FLAG_KEY = "shiftkar-neo.install.v690";
const WAIT_FOR_PROMPT_MS = 4500;

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");

/* ---- OS & Browser detection ---- */

export function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const u = ua();
  const iPadOS13 = /Macintosh/.test(u) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(u) || iPadOS13;
}

export function isAndroid() {
  return /Android/i.test(ua());
}

export function isLinux() {
  return /Linux/i.test(ua()) && !isAndroid();
}

export function isWindows() {
  return /Windows/i.test(ua());
}

export function isMacOS() {
  return /Macintosh|Mac OS X/i.test(ua()) && !isIOSDevice();
}

export function isFirefox() {
  return /Firefox\/|FxiOS\//i.test(ua());
}

export function isMiBrowser() {
  return /MiuiBrowser|Mi\s?Browser/i.test(ua());
}

export function isSamsung() {
  return /SamsungBrowser\//i.test(ua());
}

export function isOpera() {
  return /OPR\/|Opera|OPT\//i.test(ua());
}

export function isVivaldi() {
  return /Vivaldi/i.test(ua());
}

export function isEdge() {
  return /Edg\/|EdgA\/|EdgiOS\//i.test(ua());
}

export function isBrave() {
  if (typeof navigator === "undefined") return false;
  return (
    /Brave/i.test(ua()) ||
    typeof (navigator as unknown as { brave?: unknown }).brave !== "undefined"
  );
}

export function isSafari() {
  const u = ua();
  return (
    /Safari\//i.test(u) &&
    !/Chrome\/|Chromium\/|CriOS\/|FxiOS\/|Edg\/|EdgA\/|EdgiOS\/|OPR\/|SamsungBrowser\/|Vivaldi/i.test(
      u,
    )
  );
}

export function isChromium() {
  return !isIOSDevice() && !isFirefox() && /Chrome|Chromium|Edg\/|EdgA\/|OPR\/|Vivaldi|SamsungBrowser/i.test(ua());
}

export interface BrowserInstallGuide {
  browserName: string;
  osName: string;
  supportsNativePrompt: boolean;
  items: string[];
  note?: string;
}

export function getBrowserInstallGuide(): BrowserInstallGuide {
  const android = isAndroid();
  const ios = isIOSDevice();
  const linux = isLinux();
  const mac = isMacOS();
  const osName = ios
    ? "آیفون / آیپد (iOS)"
    : android
      ? "اندروید"
      : linux
        ? "لینوکس"
        : mac
          ? "مک (macOS)"
          : "ویندوز";

  if (ios) {
    if (!isSafari()) {
      return {
        browserName: isFirefox() ? "فایرفاکس iOS" : isEdge() ? "اج iOS" : "مرورگر iOS",
        osName,
        supportsNativePrompt: false,
        items: [
          "در iOS، روی دکمهٔ اشتراک‌گذاری (Share) در نوار آدرس یا پایین مرورگر بزنید.",
          "گزینهٔ «Add to Home Screen» (افزودن به صفحهٔ اصلی) را انتخاب کنید.",
          "در صورت نبودن این گزینه، همین آدرس را در مرورگر Safari باز کرده و از Share ← Add to Home Screen نصب کنید.",
        ],
      };
    }
    return {
      browserName: "سافاری (Safari)",
      osName,
      supportsNativePrompt: false,
      items: [
        "دکمهٔ اشتراک‌گذاری (Share) را در نوار پایین سافاری لمس کنید.",
        "در منوی بازشده، گزینهٔ «Add to Home Screen» را انتخاب کنید.",
        "روی «Add» در گوشهٔ بالا بزنید تا آیکون شیفت‌کار به صفحهٔ اصلی اضافه شود.",
      ],
    };
  }

  if (isMiBrowser()) {
    return {
      browserName: "می‌بروزر شیائومی",
      osName,
      supportsNativePrompt: false,
      items: [
        "روی دکمهٔ منو (☰ یا ⋮ در نوار پایین مرورگر) بزنید.",
        "گزینهٔ «افزودن به صفحهٔ اصلی» (Add to Home screen) را انتخاب کنید.",
        "با تأیید، آیکون شیفت‌کار روی صفحهٔ اصلی قرار می‌گیرد.",
      ],
    };
  }

  if (isSamsung()) {
    return {
      browserName: "اینترنت سامسونگ",
      osName,
      supportsNativePrompt: true,
      items: [
        "روی آیکون دانلود (⬇) در نوار آدرس یا منوی ☰ در نوار پایین بزنید.",
        "گزینهٔ «افزودن صفحه به» (Add page to) و سپس «صفحهٔ اصلی» (Home screen) را انتخاب کنید.",
        "با تأیید، برنامه مثل یک اپلیکیشن مستقل نصب می‌شود.",
      ],
    };
  }

  if (isFirefox()) {
    return {
      browserName: "فایرفاکس (Firefox)",
      osName,
      supportsNativePrompt: false,
      items: android
        ? [
            "روی دکمهٔ منوی سه‌نقطه (⋮) در نوار فایرفاکس بزنید.",
            "گزینهٔ «نصب» (Install) یا «افزودن به صفحهٔ اصلی» (Add to Home screen) را انتخاب کنید.",
            "با تأیید، آیکون شیفت‌کار روی صفحهٔ اصلی گوشی نصب می‌شود.",
          ]
        : [
            "فایرفاکس دسکتاپ به‌طور پیش‌فرض نصب مستقیم وب‌اپلیکیشن ندارد؛ می‌توانید روی تبِ صفحه کلیک راست کرده و «Pin Tab» (سنجاق کردن تب) را بزنید.",
            "برای اجرای وب‌اپلیکیشن در پنجرهٔ مستقل دسکتاپ، می‌توانید از کروم، اج، بریو یا ویوالدی استفاده کنید و یا افزونهٔ «PWAsForFirefox» را نصب نمایید.",
          ],
      note: !android
        ? "پیشنهاد: نسخهٔ بومی دسکتاپ شیفت‌کار (ویندوز، مک و لینوکس) نیز در صفحهٔ دانلود در دسترس است."
        : undefined,
    };
  }

  if (isVivaldi()) {
    return {
      browserName: "ویوالدی (Vivaldi)",
      osName,
      supportsNativePrompt: true,
      items: android
        ? [
            "روی منوی ویوالدی (لوگوی V در نوار مرورگر) بزنید.",
            "گزینهٔ «Install app» (نصب برنامه) یا «Add to Home screen» را انتخاب کنید.",
            "با تأیید، برنامه روی صفحهٔ اصلی نصب می‌شود.",
          ]
        : [
            "روی تبِ بالای صفحه کلیک راست کنید و گزینهٔ «Install شیفت‌کار وب...» را بزنید (یا روی آیکون نصب در سمت راست نوار آدرس کلیک کنید).",
            "در پنجرهٔ بازشده روی «Install» کلیک کنید تا برنامه در پنجرهٔ مستقل دسکتاپ نصب شود.",
          ],
    };
  }

  if (isOpera()) {
    return {
      browserName: "اپرا (Opera)",
      osName,
      supportsNativePrompt: true,
      items: android
        ? [
            "روی منوی مرورگر (⋮ یا O در گوشهٔ مرورگر) بزنید.",
            "گزینهٔ «افزودن به صفحهٔ اصلی» (Add to Home screen) را انتخاب کنید.",
            "با تأیید، آیکون برنامه روی صفحهٔ اصلی قرار می‌گیرد.",
          ]
        : [
            "روی آیکون نصب (مکعب/مانیتور کوچک در سمت راست نوار آدرس) کلیک کنید.",
            "در پنجرهٔ تأیید روی «Install» کلیک کنید تا برنامه به‌صورت مستقل نصب شود.",
          ],
    };
  }

  if (isEdge()) {
    return {
      browserName: "مایکروسافت اج (Edge)",
      osName,
      supportsNativePrompt: true,
      items: android
        ? [
            "روی منوی سه‌نقطه (⋯) در نوار پایین مرورگر بزنید.",
            "گزینهٔ «افزودن به تلفن» (Add to phone) یا «نصب برنامه» را انتخاب کنید.",
            "با تأیید، شیفت‌کار مثل یک اپلیکیشن واقعی نصب می‌شود.",
          ]
        : [
            "روی آیکون «App available» (مانیتور کوچک همراه با نشان + در سمت راست نوار آدرس) کلیک کنید.",
            "یا از منوی سه‌نقطه (⋯) در گوشهٔ بالا به بخش «Apps» و سپس «Install this site as an app» بروید.",
            "روی «Install» کلیک کنید تا برنامه به‌صورت مستقل نصب شود.",
          ],
      note: linux
        ? "نکتهٔ لینوکس: اگر قبلاً آن را نصب کرده‌اید، در نوار آدرس edge://apps را بررسی کنید."
        : undefined,
    };
  }

  if (isBrave()) {
    return {
      browserName: "بریو (Brave)",
      osName,
      supportsNativePrompt: true,
      items: android
        ? [
            "منوی سه‌نقطه (⋮) را باز کنید و «Install app» (نصب برنامه) را انتخاب کنید.",
            "با تأیید، برنامه روی صفحهٔ اصلی نصب می‌شود.",
          ]
        : [
            "روی آیکون نصب در سمت راست نوار آدرس کلیک کنید، یا از منوی ☰ به «Save and share» ← «Install شیفت‌کار وب...» بروید.",
            "با تأیید، برنامه به‌صورت مستقل روی سیستم نصب می‌شود.",
          ],
    };
  }

  if (isSafari() && mac) {
    return {
      browserName: "سافاری مک (Safari)",
      osName,
      supportsNativePrompt: false,
      items: [
        "از نوار منوی بالای سافاری روی «File» کلیک کنید و گزینهٔ «Add to Dock...» را بزنید (یا از دکمهٔ Share گزینهٔ Add to Dock را انتخاب کنید).",
        "روی «Add» کلیک کنید تا شیفت‌کار به‌عنوان برنامهٔ مستقل به Dock مک اضافه شود.",
      ],
    };
  }

  /* Default: Chrome / Chromium */
  return {
    browserName: "گوگل کروم (Chrome)",
    osName,
    supportsNativePrompt: true,
    items: android
      ? [
          "منوی سه‌نقطه (⋮) در بالای کروم را باز کنید.",
          "گزینهٔ «نصب برنامه» (Install app) یا «افزودن به صفحهٔ اصلی» را بزنید.",
          "با تأیید، شیفت‌کار مثل یک اپلیکیشن واقعی نصب می‌شود.",
        ]
      : [
          "روی آیکون نصب برنامه (مانیتور کوچک همراه با فلش در سمت راست نوار آدرس) کلیک کنید.",
          "یا از منوی سه‌نقطه (⋮) در بالای مرورگر به بخش «Cast, save, and share» ← «Install page as app...» بروید.",
          "روی «Install» کلیک کنید تا برنامه در پنجرهٔ مستقل دسکتاپ اجرا شود.",
        ],
  };
}

let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
let installedFlag = false;
let notifyInstallReady: (() => void) | null = null;
const installReadyPromise = new Promise<boolean>((resolve) => {
  notifyInstallReady = () => resolve(true);
});

/** Consume the captured `beforeinstallprompt` event (if any) and show the
 *  native install dialog. Returns the user's outcome, "instructions" when the
 *  dialog could not be opened, or null when no prompt is available. Shared by
 *  both the immediate and the waited-for paths. */
async function consumeDeferredPrompt(): Promise<"installed" | "dismissed" | "instructions" | null> {
  /* Read through a local alias so TS keeps the nullable widened type. */
  const promptEvent: typeof deferredPrompt = deferredPrompt;
  if (!promptEvent) return null;
  deferredPrompt = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice && choice.outcome === "accepted") {
      installedFlag = true;
      saveFlag({ installed: true, lastStandalone: Date.now() });
      emitState();
      return "installed";
    }
    return "dismissed";
  } catch {
    return "instructions";
  }
}

/* ---------------- helpers ---------------- */

function loadFlag(): { installed?: boolean; lastStandalone?: number; autoShown?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(FLAG_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveFlag(patch: Record<string, unknown>) {
  try {
    localStorage.setItem(FLAG_KEY, JSON.stringify({ ...loadFlag(), ...patch }));
  } catch {
    /* storage unavailable */
  }
}

export function isStandalone() {
  return (
    (typeof window !== "undefined" &&
      window.matchMedia &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        window.matchMedia("(display-mode: window-controls-overlay)").matches)) ||
    (typeof window !== "undefined" &&
      (window.navigator as unknown as { standalone?: boolean }).standalone === true)
  );
}

function emitState() {
  window.dispatchEvent(new CustomEvent("shiftkar-neo:install-state"));
}

/* ---------------- boot ---------------- */

export function initInstallPrompt() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    if (!isStandalone()) {
      installedFlag = false;
      saveFlag({ installed: false });
    }
    emitState();
    notifyInstallReady?.();
    window.dispatchEvent(new CustomEvent("shiftkar-neo:install-ready"));
  });

  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferredPrompt = null;
    saveFlag({ installed: true, lastStandalone: Date.now() });
    emitState();
  });

  if (loadFlag().installed) installedFlag = true;

  /* PWA deletion detection */
  if (isStandalone()) {
    installedFlag = true;
    saveFlag({ lastStandalone: Date.now() });
  } else {
    const flag = loadFlag();
    const lastStandalone = flag.lastStandalone || 0;
    if (flag.installed === true && (lastStandalone === 0 || Date.now() - lastStandalone > 60_000)) {
      saveFlag({ installed: false, lastStandalone: 0, autoShown: false });
      installedFlag = false;
      emitState();
    }
  }
}

export function getInstallState() {
  return {
    installed: isStandalone() || installedFlag,
    canPrompt: !!deferredPrompt,
    isIOS: isIOSDevice(),
    isFirefox: isFirefox(),
  };
}

/* ---------------- the install flow ---------------- */

async function ensureServiceWorkerReady() {
  if (!("serviceWorker" in navigator)) return;
  try {
    if (!navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) await navigator.serviceWorker.register(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js`);
    }
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(r, 3500)),
    ]);
  } catch {
    /* fall through to the manual guide */
  }
}

export async function promptInstall(): Promise<"installed" | "dismissed" | "instructions" | "unavailable"> {
  const st = getInstallState();
  if (st.installed) return "installed";

  /* Preserve transient user activation on Desktop Edge/Chrome when deferredPrompt is already ready! */
  const immediate = await consumeDeferredPrompt();
  if (immediate) return immediate;

  if (isChromium()) {
    window.dispatchEvent(new CustomEvent("shiftkar-neo:install-waiting"));
    await ensureServiceWorkerReady();
    const arrived = await Promise.race([
      installReadyPromise,
      new Promise<boolean>((r) => setTimeout(() => r(false), WAIT_FOR_PROMPT_MS)),
    ]);
    window.dispatchEvent(new CustomEvent("shiftkar-neo:install-wait-done"));
    if (arrived) {
      const waited = await consumeDeferredPrompt();
      if (waited) return waited;
    }
  }

  return "instructions";
}

export function maybeAutoPromptInstall(openInstallSheet: () => void, isTourActive: () => boolean) {
  if (getInstallState().installed) return;
  if (loadFlag().autoShown) return;

  let opened = false;
  const open = () => {
    if (opened) return;
    if (getInstallState().installed) return;
    if (isTourActive()) return;
    opened = true;
    saveFlag({ autoShown: true });
    openInstallSheet();
    window.removeEventListener("shiftkar-neo:install-ready", onReady);
  };
  const onReady = () => setTimeout(open, 600);

  window.addEventListener("shiftkar-neo:install-ready", onReady);
  setTimeout(open, 5000);
}

export const initInstallCapture = initInstallPrompt;
