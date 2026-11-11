"use client";
/**
 * Install sheet — Unified PWA installation sheet with automatic browser/OS detection
 * and step-by-step instructions for Chrome, Edge, Firefox, Vivaldi, Opera, Brave, Safari, etc.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Sheet } from "./sheet";
import { getInstallState, promptInstall, getBrowserInstallGuide } from "@/lib/install";
import { useShiftKar, haptic } from "@/lib/store";
import { DownloadIcon, CheckIcon } from "./icons";

function subscribeInstallState(cb: () => void) {
  const events = ["shiftkar-neo:install-state", "shiftkar-neo:install-ready", "appinstalled"] as const;
  for (const e of events) window.addEventListener(e, cb);
  return () => {
    for (const e of events) window.removeEventListener(e, cb);
  };
}
const readInstalled = () => getInstallState().installed;
const readCanPrompt = () => getInstallState().canPrompt;
const readServerFalse = () => false;

export function BrowserInstallGuideBox({
  busy,
  forceShowSteps,
}: {
  busy?: boolean;
  forceShowSteps?: boolean;
}) {
  const canInstall = useSyncExternalStore(subscribeInstallState, readCanPrompt, readServerFalse);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  const guide = getBrowserInstallGuide();

  return (
    <div className="rounded-2xl glass px-4 py-3.5 text-start border border-[var(--sk-border-soft)] space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[12px] font-black text-[var(--sk-primary)]">
          راهنمای نصب در {guide.browserName} ({guide.osName})
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            canInstall
              ? "bg-[var(--sk-rest-soft)] text-[var(--sk-rest-ink)]"
              : "bg-[var(--sk-primary-soft)] text-[var(--sk-primary)]"
          }`}
        >
          {canInstall
            ? "نصب مستقیم آماده است"
            : guide.supportsNativePrompt
              ? "نصب از نوار آدرس / منوی مرورگر"
              : "نصب دستی از منوی مرورگر"}
        </span>
      </div>

      <p className="text-[12px] leading-6 text-[var(--sk-text-muted)]">
        {busy
          ? "در حال بررسی قابلیت نصب خودکار مرورگر… اگر پنجرهٔ نصب باز نشد، از مراحل زیر استفاده کنید:"
          : canInstall && !forceShowSteps
            ? "دکمهٔ نصب خودکار مرورگر شما آماده است؛ روی «نصب برنامه» بزنید یا از مسیر زیر در مرورگر استفاده کنید:"
            : !guide.supportsNativePrompt
              ? `مرورگر ${guide.browserName} در ${guide.osName} پنجرهٔ نصب خودکار ندارد؛ برای نصب برنامه این مراحل را انجام دهید:`
              : `برای نصب در ${guide.browserName} (${guide.osName})، مراحل زیر را دنبال کنید:`}
      </p>

      <ol className="install-steps list-decimal ps-5 space-y-1.5 text-[12px] leading-6 text-[var(--sk-text)] font-medium">
        {guide.items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      {guide.note && (
        <div className="pt-1 text-[11px] font-bold text-[var(--sk-primary)] border-t border-[var(--sk-border-soft)]">
          {guide.note}
        </div>
      )}
    </div>
  );
}

export function InstallSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const installed = useSyncExternalStore(subscribeInstallState, readInstalled, readServerFalse);
  const [busy, setBusy] = useState(false);
  const [showManualHint, setShowManualHint] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => window.dispatchEvent(new CustomEvent("shiftkar-neo:install-state")), 120);
    return () => window.clearTimeout(id);
  }, [open]);

  const run = async () => {
    haptic(hapticOn);
    setBusy(true);
    try {
      const res = await promptInstall();
      if (res === "installed") {
        toast.success("شیفت‌کار با موفقیت نصب شد 🎉");
      } else if (res === "dismissed") {
        setShowManualHint(true);
        toast("می‌توانید از مراحل راهنمای زیر در مرورگر خود نیز برنامه را نصب کنید");
      } else {
        setShowManualHint(true);
        toast("لطفاً طبق راهنمای مرورگر نمایش‌داده‌شده در پایین دکمه عمل کنید");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="نصب وب‌اپلیکیشن شیفت‌کار">
      <div className="px-4 pb-8 pt-3 space-y-3">
        {installed ? (
          <div className="rounded-2xl bg-[var(--sk-rest-soft)] border-2 border-[var(--sk-rest)]/30 px-4 py-4 flex items-center gap-2.5 text-[13.5px] font-bold text-[var(--sk-rest-ink)]">
            <CheckIcon size={18} />
            شیفت‌کار روی دستگاه شما نصب است.
          </div>
        ) : (
          <>
            <p className="text-[13px] leading-6 text-[var(--sk-text-muted)]">
              شیفت‌کار را به دستگاه خود اضافه کنید تا مثل یک اپلیکیشن بومی، در پنجرهٔ مستقل باز شود و بدون اینترنت هم کار کند.
            </p>
            <button
              onClick={run}
              disabled={busy}
              className="w-full h-12 rounded-2xl bg-[var(--sk-primary)] text-white text-[14px] font-black flex items-center justify-center gap-2 shadow-[0_10px_26px_-10px_var(--sk-glow-a)] transition-all active:scale-[0.98] disabled:opacity-60"
            >
              <DownloadIcon size={17} />
              {busy ? "در حال آماده‌سازی…" : "نصب برنامه"}
            </button>
            <BrowserInstallGuideBox busy={busy} forceShowSteps={showManualHint} />
          </>
        )}
      </div>
    </Sheet>
  );
}
