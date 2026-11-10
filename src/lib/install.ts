"use client";
/**
 * PWA install engine + Multi-Stage External Link Launcher with Guaranteed Fallback:
 *  1. Tracks `installing` vs `installed` (`appinstalled` / `getInstalledRelatedApps()`).
 *  2. Opens external links with a cascading fallback chain:
 *     - Default user browser (`target="_blank"` / generic `VIEW` intent with `S.browser_fallback_url`)
 *     - Platform browser fallback (Chrome on Android, Edge on Windows, Firefox on Linux, Safari on macOS)
 *     - Guaranteed internal link fallback (`window.open` / `window.location.assign`) so a link NEVER fails to open.
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
 * Opens an external URL with a cascading fallback chain:
 *  1. Normal browser tab (`!isStandalone()`): lets native `<a href="https://..." target="_blank">` open in a new tab.
 *  2. Standalone PWA (`isStandalone()`):
 *     - Tries to open in the user's default external browser first.
 *     - On Android standalone PWA: fires an `intent://` URI (without `target="_blank"`, which Chrome blocks for `intent://`)
 *       including `S.browser_fallback_url=${encodeURIComponent(url)}` so if no default external app handles it,
 *       Chrome/Android automatically falls back to loading the URL.
 *     - If the page is still visible after 550ms (meaning the intent was ignored or blocked), falls back to
 *       `window.open(url, "_blank", "noopener,noreferrer")` and finally `window.location.assign(url)`.
 */
export function openExternalLink(url: string, e?: React.MouseEvent<HTMLAnchorElement>) {
  if (typeof window === "undefined") return;

  /* Always let non-http schemes (like tel:) work natively */
  if (!/^https?:\/\//i.test(url)) return;

  /* When running in a regular browser tab (not installed standalone PWA), let `<a target="_blank">` work natively! */
  if (!isStandalone()) {
    return;
  }

  const u = ua();
  const isAndroid = /Android/i.test(u);

  if (isAndroid) {
    if (e) {
      e.preventDefault();
    }
    try {
      const parsed = new URL(url, window.location.origin);
      const scheme = parsed.protocol.replace(/:$/, "");
      const fallback = encodeURIComponent(parsed.href);
      /* Stage 1: Default browser / external app intent with built-in browser_fallback_url */
      const intentUri = `intent://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallback};end`;

      let pageLeft = false;
      const onVis = () => {
        if (document.visibilityState === "hidden") pageLeft = true;
      };
      document.addEventListener("visibilitychange", onVis, { once: true });

      window.location.assign(intentUri);

      /* Stage 2 & 3 Fallback: If intent did not transition away within 600ms, open directly */
      setTimeout(() => {
        document.removeEventListener("visibilitychange", onVis);
        if (!pageLeft && document.visibilityState === "visible") {
          const w = window.open(parsed.href, "_blank", "noopener,noreferrer");
          if (!w) {
            window.location.assign(parsed.href);
          }
        }
      }, 600);
      return;
    } catch {
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) window.location.assign(url);
      return;
    }
  }

  /* Desktop / iOS standalone PWA:
   * For same-origin links (like https://shiftkar.ir/download), force a new window/tab or direct navigation.
   * For cross-origin links, native `<a target="_blank" rel="noopener noreferrer">` automatically opens the OS default browser. */
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      if (e) e.preventDefault();
      const w = window.open(parsed.href, "_blank", "noopener,noreferrer");
      if (!w) window.location.assign(parsed.href);
    }
  } catch {
    /* let native <a target="_blank"> handle it */
  }
}

export const initInstallCapture = initInstallPrompt;
