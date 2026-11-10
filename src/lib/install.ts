"use client";
/**
 * PWA install engine — faithful port of the original install-prompt.js.
 *
 *  - Chrome/Edge/Android/desktop: captures `beforeinstallprompt` and shows
 *    the native install UI when asked. Chrome only fires the event AFTER
 *    its service worker is ACTIVE, so on a cold visit we register the SW
 *    and wait briefly for the event instead of claiming "unsupported".
 *  - iOS Safari: no install event — "Add to Home Screen" instructions.
 *  - Firefox: no `beforeinstallprompt` — short manual guide instead.
 *  - Any other browser: generic "use your browser menu" guide.
 *  - Already installed (standalone) or after `appinstalled`: reported as
 *    installed; a previously-installed PWA later running in a normal tab
 *    means it was deleted — the install UI is offered again.
 */

const FLAG_KEY = "shiftkar.install.v1";
const WAIT_FOR_PROMPT_MS = 6000;

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");

/* ---- per-browser detection (for the manual guides + sheet copy) ---- */

/** Firefox never fires `beforeinstallprompt`. */
export function isFirefox() {
  return /Firefox\//.test(ua());
}

/** Xiaomi Mi Browser (Chromium-based, but often WITHOUT the native prompt). */
export function isMiBrowser() {
  return /MiuiBrowser|Mi\s?Browser/i.test(ua());
}

export function isSamsung() {
  return /SamsungBrowser\//.test(ua());
}

export function isOpera() {
  return /OPR\/|Opera/.test(ua());
}

export function isEdge() {
  return /Edg\//.test(ua());
}

export function isVivaldi() {
  return /Vivaldi/i.test(ua());
}

/** Chromium browsers (Chrome/Edge/Brave/Vivaldi/Opera/Samsung/Mi…) support
 *  the native prompt in principle; a few builds (Mi, old Opera) never fire it
 *  — the sheet falls back to a browser-specific manual guide instead. */
export function isChromium() {
  return !isIOSDevice() && !isFirefox() && /Chrome|Chromium|Edg\//.test(ua());
}

let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
let installedFlag = false;
let notifyInstallReady: (() => void) | null = null;
const installReadyPromise = new Promise<boolean>((resolve) => {
  notifyInstallReady = () => resolve(true);
});

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
      window.matchMedia("(display-mode: standalone)").matches) ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice() {
  const ua = navigator.userAgent || "";
  const iPadOS13 = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS13;
}

function emitState() {
  window.dispatchEvent(new CustomEvent("shiftkar:install-state"));
}

/* ---------------- boot ---------------- */

export function initInstallPrompt() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    emitState();
    notifyInstallReady?.();
    window.dispatchEvent(new CustomEvent("shiftkar:install-ready"));
  });

  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferredPrompt = null;
    saveFlag({ installed: true, lastStandalone: Date.now() });
    emitState();
  });

  if (loadFlag().installed) installedFlag = true;

  /* One-time migration: the improved install engine (per-browser guides +
   * install-ready listener) deserves ONE more auto-prompt for users whose
   * earlier `autoShown` was burned on the broken sheet. Reset it exactly once. */
  const flag0 = loadFlag();
  if (flag0.autoShown === true && flag0.installed !== true && (flag0 as { autoShownV2?: boolean }).autoShownV2 !== true) {
    saveFlag({ autoShown: false, autoShownV2: true });
  }

  /* PWA deletion detection (original behavior) */
  if (isStandalone()) {
    installedFlag = true;
    saveFlag({ lastStandalone: Date.now() });
  } else {
    const flag = loadFlag();
    const lastStandalone = flag.lastStandalone || 0;
    if (flag.installed === true && lastStandalone > 0 && Date.now() - lastStandalone > 60_000) {
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

/** Make sure the SW is active BEFORE waiting for the event (Chrome only
 *  offers installability once a service worker controls the page). */
async function ensureServiceWorkerReady() {
  if (!("serviceWorker" in navigator)) return;
  try {
    if (!navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) await navigator.serviceWorker.register(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js`);
    }
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    /* fall through to the manual guide */
  }
}

export async function promptInstall(): Promise<"installed" | "dismissed" | "instructions" | "unavailable"> {
  const st = getInstallState();
  if (st.installed) return "installed";

  if (!deferredPrompt && isChromium()) {
    window.dispatchEvent(new CustomEvent("shiftkar:install-waiting"));
    await ensureServiceWorkerReady();
    const arrived = await Promise.race([
      installReadyPromise,
      new Promise<boolean>((r) => setTimeout(() => r(false), WAIT_FOR_PROMPT_MS)),
    ]);
    window.dispatchEvent(new CustomEvent("shiftkar:install-wait-done"));
    if (!arrived || !deferredPrompt) return "instructions";
  }

  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        installedFlag = true;
        saveFlag({ installed: true });
        emitState();
        return "installed";
      }
      return "dismissed";
    } catch {
      return "unavailable";
    }
  }
  return "instructions";
}

/** One-time automatic prompt: opens the install sheet as soon as Chromium
 *  hands us the native prompt (even if that arrives LATE), with a short
 *  timeout fallback — never while the tour runs, never twice. */
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
    window.removeEventListener("shiftkar:install-ready", onReady);
  };
  const onReady = () => setTimeout(open, 600);

  /* Chromium fires `beforeinstallprompt` whenever it decides the page is
   * installable — sometimes seconds after load. Listen for it instead of
   * relying only on a fixed timer, so the sheet appears WITH the native
   * prompt ready (Chrome/Edge/Brave/Vivaldi/Opera/Samsung…). */
  window.addEventListener("shiftkar:install-ready", onReady);
  /* fallback for engines that never fire it (Mi Browser, iOS, Firefox) */
  setTimeout(open, 5000);
}

export const initInstallCapture = initInstallPrompt;
