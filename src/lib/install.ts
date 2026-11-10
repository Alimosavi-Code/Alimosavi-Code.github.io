"use client";
/**
 * PWA install engine + External Browser launcher:
 *  - Tracks `installing` (WebAPK building/downloading in background after prompt acceptance)
 *    separately from `installed` (confirmed via `appinstalled` event, `getInstalledRelatedApps()`,
 *    or `display-mode: standalone`).
 *  - Provides `openExternalBrowser(url, e)` so links in `سامانه‌ها` and `دانلود مستقیم از گیت‌هاب`
 *    open in a real external browser tab outside the standalone PWA window.
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
    /* If browser fires beforeinstallprompt while not in standalone, the app is NOT currently installed! */
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

  /* Verify real installation status via getInstalledRelatedApps() if available */
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
        /* User accepted the prompt; now Chrome/Google Play is building & installing the WebAPK!
         * Wait for the real `appinstalled` event or `getInstalledRelatedApps()` confirmation. */
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

        /* Safety fallback after 14s for desktop/browsers that don't support getInstalledRelatedApps */
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
 * Opens an external URL or `/download` in a real external browser tab outside the standalone PWA.
 * On Android when running inside an installed WebAPK (`isStandalone()`), uses an explicit Chrome/Browser
 * `intent://` URI with fallback so Android launches a real browser tab instead of trapping the user
 * inside the PWA window or an in-app Custom Tab.
 */
export function openExternalBrowser(url: string, e?: React.MouseEvent) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (typeof window === "undefined") return;

  const isAndroid = /Android/i.test(navigator.userAgent || "");
  if (isStandalone() && isAndroid && /^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const scheme = parsed.protocol.replace(":", "");
      const hostAndPath = parsed.host + parsed.pathname + parsed.search + parsed.hash;
      const fallback = encodeURIComponent(url);
      /* If user is on Samsung Internet, don't force com.android.chrome package */
      const pkgPart = isSamsung()
        ? "package=com.sec.android.app.sbrowser;"
        : isFirefox()
          ? "package=org.mozilla.firefox;"
          : "package=com.android.chrome;";
      const intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;${pkgPart}S.browser_fallback_url=${fallback};end`;
      window.location.href = intentUrl;
      return;
    } catch {
      /* fallback below */
    }
  }

  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    window.location.assign(url);
  }
}

export const initInstallCapture = initInstallPrompt;
