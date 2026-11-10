"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Sheet } from "./sheet";
import {
  getInstallState,
  promptInstall,
  isFirefox,
  isMiBrowser,
  isSamsung,
  isOpera,
  isEdge,
} from "@/lib/install";
import { useShiftKar, haptic } from "@/lib/store";
import { DownloadIcon, RefreshIcon, CheckIcon } from "./icons";

function subscribeInstallState(cb: () => void) {
  const events = [
    "shiftkar:install-state",
    "shiftkar:install-ready",
    "shiftkar:install-completed",
    "appinstalled",
  ] as const;
  for (const e of events) window.addEventListener(e, cb);
  return () => {
    for (const e of events) window.removeEventListener(e, cb);
  };
}
const readInstalled = () => getInstallState().installed;
const readInstalling = () => getInstallState().installing;
const readCanPrompt = () => getInstallState().canPrompt;
const readServerFalse = () => false;

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="install-steps list-decimal ps-5 space-y-1.5 text-[12.5px] leading-6 text-[var(--sk-text-muted)]">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

function browserGuide(): { label: string; items: string[] } {
  const android = /Android/.test(navigator.userAgent || "");

  if (isMiBrowser()) {
    return {
      label: "می‌بروزر",
      items: [
        "روی دکمهٔ منو (☰ یا ⋮ در نوار پایین مرورگر) بزنید.",
        "گزینهٔ «افزودن به صفحهٔ اصلی» (Add to Home screen) را انتخاب کنید.",
        "با تأیید، آیکون شیفت‌کار روی صفحهٔ اصلی قرار می‌گیرد.",
      ],
    };
  }
  if (isSamsung()) {
    return {
      label: "اینترنت سامسونگ",
      items: [
        "روی منوی ☰ در نوار پایین بزنید.",
        "گزینهٔ «افزودن به صفحهٔ اصلی» یا «نصب برنامه» را انتخاب کنید.",
        "با تأیید، برنامه مثل یک اپلیکیشن واقعی نصب می‌شود.",
      ],
    };
  }
  if (isOpera()) {
    return {
      label: "اپرا",
      items: [
        "روی منوی مرورگر (O یا ⋮) بزنید.",
        "گزینهٔ «افزودن به صفحهٔ اصلی» (Add to Home screen) را انتخاب کنید.",
        "با تأیید، آیکون برنامه روی صفحهٔ اصلی قرار می‌گیرد.",
      ],
    };
  }
  if (isEdge()) {
    return {
      label: "اج",
      items: android
        ? [
            "روی منوی ⋯ در نوار پایین بزنید.",
            "گزینهٔ «افزودن به تلفن» یا «نصب برنامه» را انتخاب کنید.",
            "با تأیید، شیفت‌کار مثل یک اپلیکیشن واقعی نصب می‌شود.",
          ]
        : [
            "روی منوی ⋯ در گوشهٔ مرورگر بزنید.",
            "به بخش «Apps» و سپس «Install this site as an app» بروید.",
            "با تأیید، برنامه به‌صورت پنجرهٔ مستقل اجرا می‌شود.",
          ],
    };
  }
  if (isFirefox()) {
    return {
      label: "فایرفاکس",
      items: android
        ? [
            "روی دکمهٔ ⋮ (سه‌نقطه) در نوار پایین فایرفاکس بزنید.",
            "گزینهٔ «افزودن به صفحهٔ اصلی» (Add to Home screen) را انتخاب کنید.",
            "روی «افزودن» بزنید؛ آیکون برنامه روی صفحهٔ اصلی قرار می‌گیرد.",
          ]
        : [
            "می‌توانید تب را به نوار ابزار سنجاق کنید: روی ⋮ بروید و «Pin to Taskbar» را انتخاب کنید.",
            "برای باز شدن سریع، تب را بوک‌مارک کنید.",
          ],
    };
  }
  return {
    label: "کروم و مرورگرهای مشابه",
    items: [
      "منوی مرورگر را باز کنید (⋮ در بالای مرورگر).",
      "گزینهٔ «نصب برنامه» (Install app) را بزنید.",
      "با تأیید، شیفت‌کار مثل یک اپلیکیشن واقعی نصب می‌شود.",
    ],
  };
}

function Guide({ busy }: { busy: boolean }) {
  const canInstall = useSyncExternalStore(subscribeInstallState, readCanPrompt, readServerFalse);

  if (getInstallState().isIOS) {
    return (
      <div className="rounded-2xl glass px-4 py-3">
        <p className="text-[12.5px] leading-6 text-[var(--sk-text-muted)] mb-2">
          در سافاری، دکمهٔ اشتراک‌گذاری را بزنید و «Add to Home Screen» را انتخاب کنید تا شیفت‌کار مثل یک اپ واقعی نصب شود.
        </p>
        <Steps
          items={[
            "دکمهٔ اشتراک‌گذاری را در نوار پایین سافاری لمس کنید.",
            "گزینهٔ «Add to Home Screen» را انتخاب کنید.",
            "روی «Add» بزنید؛ آیکون برنامه روی صفحهٔ اصلی قرار می‌گیرد.",
          ]}
        />
      </div>
    );
  }

  if (!canInstall) {
    const g = browserGuide();
    return (
      <div className="rounded-2xl glass px-4 py-3">
        <p className="text-[12.5px] leading-6 text-[var(--sk-text-muted)] mb-2">
          {busy
            ? "در حال آماده‌سازی نصب… اگر دکمهٔ نصب مرورگر باز نشد، این مسیر قطعی است:"
            : `نصب خودکار همین حالا در دسترس نیست؛ در ${g.label} مستقیم از منوی مرورگر نصب کنید:`}
        </p>
        <Steps items={g.items} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl glass px-4 py-3 text-[12.5px] leading-6 text-[var(--sk-text-muted)]">
      دکمهٔ نصب مرورگر شما آماده است؛ روی «نصب برنامه» بزنید و پنجرهٔ تأیید مرورگر را قبول کنید.
      <div className="mt-2">
        <Steps items={browserGuide().items} />
      </div>
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
  const installing = useSyncExternalStore(subscribeInstallState, readInstalling, readServerFalse);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onDone = () => {
      toast.success("نصب وب‌اپلیکیشن شیفت‌کار کامل شد و به صفحهٔ اصلی اضافه گردید 🎉");
    };
    window.addEventListener("shiftkar:install-completed", onDone);
    return () => window.removeEventListener("shiftkar:install-completed", onDone);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => window.dispatchEvent(new CustomEvent("shiftkar:install-state")), 120);
    return () => window.clearTimeout(id);
  }, [open]);

  const run = async () => {
    haptic(hapticOn);
    setBusy(true);
    try {
      const res = await promptInstall();
      if (res === "installed") {
        toast.success("شیفت‌کار روی دستگاه شما نصب است 🎉");
      } else if (res === "installing") {
        toast("در حال ساخت و نصب وب‌اپلیکیشن در پس‌زمینه…");
      } else if (res === "dismissed") {
        toast("برای نصب، از منوی مرورگر «نصب برنامه» را انتخاب کنید");
      } else if (res === "unavailable") {
        toast("دوباره تلاش کنید؛ نصب برنامه فعلاً ممکن نشد");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="نصب برنامه">
      <div className="px-4 pb-8 pt-3">
        {installed ? (
          <div className="rounded-2xl bg-[var(--sk-rest-soft)] border-2 border-[var(--sk-rest)]/30 px-4 py-4 flex items-center gap-2.5 text-[13.5px] font-bold text-[var(--sk-rest-ink)]">
            <CheckIcon size={18} />
            شیفت‌کار روی دستگاه شما نصب شده است.
          </div>
        ) : installing ? (
          <div className="rounded-2xl bg-[var(--sk-primary-soft)] border-2 border-[var(--sk-primary)]/40 px-4 py-4 flex items-center gap-3 text-[13px] font-bold text-[var(--sk-primary)]">
            <RefreshIcon size={18} className="animate-spin shrink-0" />
            <div>
              <div>در حال نصب و افزودن به صفحهٔ اصلی…</div>
              <div className="text-[11px] font-normal text-[var(--sk-text-muted)] mt-0.5">
                سیستم در حال ساخت وب‌اپلیکیشن است؛ لطفاً چند ثانیه صبر کنید.
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[13px] leading-6 text-[var(--sk-text-muted)] mb-3">
              شیفت‌کار را به صفحهٔ اصلی دستگاه خود اضافه کنید تا مثل یک اپلیکیشن واقعی، سریع‌تر باز شود و حتی بدون اینترنت هم کار کند.
            </p>
            <button
              onClick={run}
              disabled={busy}
              className="w-full h-12 rounded-2xl bg-[var(--sk-primary)] text-white text-[14px] font-black flex items-center justify-center gap-2 shadow-[0_10px_26px_-10px_var(--sk-glow-a)] transition-all active:scale-[0.98] disabled:opacity-60"
            >
              <DownloadIcon size={17} />
              {busy ? "در حال آماده‌سازی…" : "نصب برنامه"}
            </button>
            <div className="mt-3">
              <Guide busy={busy} />
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
