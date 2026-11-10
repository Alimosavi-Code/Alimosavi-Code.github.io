"use client";
/**
 * PWA install engine + External Browser URL helper:
 *  - Tracks `installing` (WebAPK building/downloading in background after prompt acceptance)
 *    separately from `installed` (confirmed via `appinstalled` event, `getInstalledRelatedApps()`,
 *    or `display-mode: standalone`).
 *  - Provides `toExternalHref(url)` so external links in `سامانه‌ها` and `دانلود مستقیم از گیت‌هاب`
 *    open in the external browser outside the standalone Android WebAPK (without `package=com.android.chrome`
 *    which would trap the navigation inside Chrome's in-app Custom Tab per crbug/424029).
 */

const FLAG_KEY = "shiftkar.install.v2";
const WAIT_FOR_PROMPT_MS = 6000;

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");

export function isFirefox() {
  return /Firefox\//.test(ua());
}

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

export function isChromium() {
  return !isIOSDevice() && !isFirefox() && /Chrome|Chromium|Edg\//.test(ua());
}

let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
let installedFlag = false;
let installingFlag = false;
let installPollTimer: ReturnType<typeof setInterval> | null = null;
let installFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let notifyInstallReady: (() => void) | null = null;
const installReadyPromise = new Promise<boolean>((resolve) => {
  notifyInstallReady = () => resolve(true);
});

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
        window.matchMedia("(display-mode: fullscreen)").matches)) ||
    (typeof window !== "undefined" && (window.navigator as unknown as { standalone?: boolean }).standalone === true)
  );
}

function isIOSDevice() {
  const u = ua();
  const iPadOS13 = /Macintosh/.test(u) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(u) || iPadOS13;
}

function emitState() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("shiftkar:install-state"));
  }
}

async function checkRelatedAppsInstalled(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !("getInstalledRelatedApps" in navigator)) {
    return null;
  }
  try {
    const fn = (navigator as unknown as { getInstalledRelatedApps: () => Promise<unknown[]> }).getInstalledRelatedApps;
    const apps = await fn.call(navigator);
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return null;
  }
}

function clearInstallTimers() {
  if (installPollTimer) {
    clearInterval(installPollTimer);
    installPollTimer = null;
  }
  if (installFallbackTimer) {
    clearTimeout(installFallbackTimer);
    installFallbackTimer = null;
  }
}

function finalizeInstalled() {
  clearInstallTimers();
  const wasInstalling = installingFlag;
  installingFlag = false;
  installedFlag = true;
  deferredPrompt = null;
  saveFlag({ installed: true, lastStandalone: Date.now() });
  emitState();
  if (wasInstalling && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("shiftkar:install-completed"));
  }
}

export function initInstallPrompt() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    if (!isStandalone() && !installingFlag) {
      installedFlag = false;
      saveFlag({ installed: false });
    }
    emitState();
    notifyInstallReady?.();
    window.dispatchEvent(new CustomEvent("shiftkar:install-ready"));
  });

  window.addEventListener("appinstalled", () => {
    finalizeInstalled();
  });

  if (isStandalone()) {
    installedFlag = true;
    installingFlag = false;
    saveFlag({ installed: true, lastStandalone: Date.now() });
    emitState();
    return;
  }

  checkRelatedAppsInstalled().then((relInstalled) => {
    if (relInstalled === true) {
      installedFlag = true;
      saveFlag({ installed: true });
      emitState();
    } else if (relInstalled === false) {
      installedFlag = false;
      saveFlag({ installed: false });
      emitState();
    } else {
      const flag = loadFlag();
      if (flag.installed) {
        const lastStandalone = flag.lastStandalone || 0;
        if (lastStandalone > 0 && Date.now() - lastStandalone > 60_000) {
          saveFlag({ installed: false, lastStandalone: 0, autoShown: false });
          installedFlag = false;
        } else {
          installedFlag = true;
        }
        emitState();
      }
    }
  });
}

export function getInstallState() {
  return {
    installed: isStandalone() || installedFlag,
    installing: installingFlag,
    canPrompt: !!deferredPrompt,
    isIOS: isIOSDevice(),
    isFirefox: isFirefox(),
  };
}

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
    /* ignore */
  }
}

export async function promptInstall(): Promise<"installed" | "installing" | "dismissed" | "instructions" | "unavailable"> {
  const st = getInstallState();
  if (st.installed) return "installed";
  if (st.installing) return "installing";

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
        installingFlag = true;
        emitState();

        clearInstallTimers();
        installPollTimer = setInterval(async () => {
          if (isStandalone()) {
            finalizeInstalled();
            return;
          }
          const rel = await checkRelatedAppsInstalled();
          if (rel === true) {
            finalizeInstalled();
          }
        }, 1200);

        installFallbackTimer = setTimeout(() => {
          if (installingFlag) {
            finalizeInstalled();
          }
        }, 14000);

        return "installing";
      }
      return "dismissed";
    } catch {
      return "unavailable";
    }
  }
  return "instructions";
}

export function maybeAutoPromptInstall(openInstallSheet: () => void, isTourActive: () => boolean) {
  if (getInstallState().installed || getInstallState().installing) return;
  if (loadFlag().autoShown) return;

  let opened = false;
  const open = () => {
    if (opened) return;
    if (getInstallState().installed || getInstallState().installing) return;
    if (isTourActive()) return;
    opened = true;
    saveFlag({ autoShown: true });
    openInstallSheet();
    window.removeEventListener("shiftkar:install-ready", onReady);
  };
  const onReady = () => setTimeout(open, 600);

  window.addEventListener("shiftkar:install-ready", onReady);
  setTimeout(open, 5000);
}

/**
 * Converts an `http(s)://` URL to an Android `intent://` URI when running inside an installed
 * Android standalone PWA (WebAPK).
 * IMPORTANT: Never include `package=com.android.chrome` or `window.location.href = ...`:
 *  - In Chromium's `ExternalNavigationHandler.java` (crbug/424029), setting `package=com.android.chrome`
 *    forces the link to stay inside the WebAPK's in-app Custom Tab (with the X close button).
 *  - Omitting `package=` and keeping `target="_blank" rel="noopener noreferrer external"` on the `<a>` tag
 *    causes Android to dispatch `android.intent.action.VIEW` outside the WebAPK to the external browser or native app.
 */
export function toExternalHref(url: string): string {
  if (typeof window === "undefined") return url;
  const isAndroid = /Android/i.test(navigator.userAgent || "");
  if (isStandalone() && isAndroid && /^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const scheme = parsed.protocol.replace(/:$/, "");
      return `intent://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
    } catch {
      return url;
    }
  }
  return url;
}

export const initInstallCapture = initInstallPrompt;
