"use client";
/**
 * Spotlight Guided Tour (`Tour`) — Desktop & Mobile aware:
 *  - Selects the VISIBLE `[data-tour="..."]` element (`rect.width > 0 && rect.height > 0`)
 *    so responsive layouts (e.g. Desktop Sidebar vs Mobile Banner/Strip) always highlight
 *    the active visible element!
 *  - Positions the tooltip card above, below, or beside the spotlight so it never overlaps
 *    the highlighted element on either desktop or mobile.
 */
import { useEffect, useState } from "react";
import { toPersianDigits } from "@/lib/jalali";
import { useShiftKar, haptic } from "@/lib/store";

interface Step {
  target: string;
  title: string;
  body: string;
  placement: "below" | "above";
}

const STEPS: Step[] = [
  {
    target: "today-banner",
    title: "وضعیت شیفت امروز شما",
    body: "در این کارت، نوبت امروز شما (صبح‌کار، عصرکار، شب‌کار یا استراحت) به‌همراه شمارهٔ روز نوبت، ساعت اضافه‌کاری یا جابه‌جایی ثبت‌شده نمایش داده می‌شود. با کلیک روی آن، جزئیات کامل امروز باز می‌شود.",
    placement: "below",
  },
  {
    target: "month-nav",
    title: "جابه‌جایی ماه، یادداشت‌ها و نمای جدولی",
    body: "با فلش‌ها بین ماه‌ها جابه‌جا شوید، روی نام ماه کلیک کنید تا سریع به هر سال و ماهی بروید، از آیکون یادداشت‌ها همهٔ یادداشت‌ها را مرور کنید یا بین نمای شبکه‌ای و جدولی سوئیچ نمایید.",
    placement: "below",
  },
  {
    target: "group-filter",
    title: "فیلتر گروه، مقایسهٔ دو شیفت و خروجی عکس",
    body: "بین گروه‌ها یا حالت «همه» جابه‌جا شوید. نکتهٔ کاربردی: با نگه‌داشتن یا کلیک راست روی یک گروه دیگر، روزهای استراحت مشترک دو شیفت در تقویم هایلایت می‌شود! دکمهٔ تصویر هم خروجی PNG ماه را می‌سازد.",
    placement: "below",
  },
  {
    target: "today-cell",
    title: "نشانگر روزِ شیفت، اضافه‌کاری و جابه‌جایی",
    body: "در هر خانهٔ تقویم، آیکون شیفت به‌همراه شمارهٔ روز آن نوبت (مثلاً خورشید ۱ یا ماه ۲) دیده می‌شود. با کلیک روی هر روز می‌توانید یادداشت، ساعت اضافه‌کاری و جابه‌جایی شیفت ثبت کنید و وضعیت همکاران را ببینید.",
    placement: "above",
  },
  {
    target: "summary-strip",
    title: "خلاصهٔ آماری ماه در یک نگاه",
    body: "در این بخش، تعداد کل روزهای صبح‌کار، عصرکار، شب‌کار، تعطیلات رسمی و استراحتِ شما در آن ماه به‌صورت زنده شمارش و نمایش داده می‌شود.",
    placement: "above",
  },
  {
    target: "bottom-nav",
    title: "لوحه کلاسیک، مدیریت شیفت و پرسنل",
    body: "از نوار پایین به «لوحه» (شامل لوحه کلاسیک سالانه با خروجی تصویر)، تب «مدیریت شیفت» (۴۵ الگوی آماده، ساخت شیفت سفارشی و مدیریت همکاران)، «سامانه‌ها» و «تنظیمات» دسترسی دارید.",
    placement: "above",
  },
];

function findVisibleTargetRect(target: string): DOMRect | null {
  const nodes = document.querySelectorAll(`[data-tour="${target}"]`);
  for (let i = 0; i < nodes.length; i++) {
    const r = nodes[i].getBoundingClientRect();
    if (r.width > 4 && r.height > 4) {
      return r;
    }
  }
  return null;
}

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [vh, setVh] = useState(typeof window !== "undefined" ? window.innerHeight : 768);

  const step = STEPS[idx] ?? STEPS[0];

  useEffect(() => {
    if (!open) {
      setIdx(0);
      return;
    }
    const update = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      setRect(findVisibleTargetRect(step.target));
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, idx, step.target]);

  if (!open) return null;

  const pad = 6;
  const spotStyle: React.CSSProperties = rect
    ? {
        top: Math.max(4, rect.top - pad),
        left: Math.max(4, rect.left - pad),
        width: Math.min(vw - 8, rect.width + pad * 2),
        height: Math.min(vh - 8, rect.height + pad * 2),
      }
    : { top: "50%", left: "50%", width: 0, height: 0 };

  const cardW = Math.min(410, vw - 32);
  const tooltipEstH = 225;
  const gap = 18;
  const safeTop = 24;
  const safeBottom = Math.max(safeTop, vh - tooltipEstH - 24);

  let cardTop = Math.max(safeTop, (vh - tooltipEstH) / 2);
  let cardLeft = Math.max(16, (vw - cardW) / 2);

  if (rect) {
    const roomBelow = vh - (rect.bottom + pad) - gap - 20;
    const roomAbove = rect.top - pad - gap - safeTop;
    const roomRight = vw - (rect.right + pad) - gap - 20;
    const roomLeft = rect.left - pad - gap - 20;

    if (step.placement === "below" && roomBelow >= tooltipEstH) {
      cardTop = rect.bottom + pad + gap;
      cardLeft = Math.min(vw - cardW - 16, Math.max(16, rect.left + rect.width / 2 - cardW / 2));
    } else if (step.placement === "above" && roomAbove >= tooltipEstH) {
      cardTop = rect.top - pad - gap - tooltipEstH;
      cardLeft = Math.min(vw - cardW - 16, Math.max(16, rect.left + rect.width / 2 - cardW / 2));
    } else if (vw >= 900 && roomRight >= cardW) {
      /* Place to the right of a tall desktop sidebar card (e.g. summary-strip) */
      cardLeft = rect.right + pad + gap;
      cardTop = Math.min(safeBottom, Math.max(safeTop, rect.top + rect.height / 2 - tooltipEstH / 2));
    } else if (vw >= 900 && roomLeft >= cardW) {
      /* Place to the left of a tall desktop card */
      cardLeft = rect.left - pad - gap - cardW;
      cardTop = Math.min(safeBottom, Math.max(safeTop, rect.top + rect.height / 2 - tooltipEstH / 2));
    } else if (roomBelow >= roomAbove) {
      cardTop = Math.min(safeBottom, Math.max(safeTop, rect.bottom + pad + gap));
    } else {
      cardTop = Math.min(safeBottom, Math.max(safeTop, rect.top - pad - gap - tooltipEstH));
    }
  }

  const next = () => {
    haptic(hapticOn, 10);
    if (idx < STEPS.length - 1) setIdx((n) => n + 1);
    else onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[95] select-none"
      role="dialog"
      aria-modal="true"
      aria-label="تور راهنمای برنامه"
      onClick={next}
    >
      {/* Spotlight cutout with glowing primary border */}
      <div
        className="fixed rounded-[22px] pointer-events-none transition-all duration-300 ease-out"
        style={{
          ...spotStyle,
          border: "3px solid var(--sk-primary)",
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.74), 0 0 28px 2px var(--sk-glow-a)",
        }}
      />

      {/* Tooltip Card */}
      <div
        key={idx}
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardW,
          backgroundColor: "var(--sk-sheet-solid)",
          border: "1.5px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
        className="sk-pop-in fixed rounded-3xl p-5 shadow-2xl pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="px-3 py-1 rounded-full bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] text-[11.5px] font-black">
            گام {toPersianDigits(idx + 1)} از {toPersianDigits(STEPS.length)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[12px] font-bold text-[var(--sk-text-faint)] hover:text-[var(--sk-text)]"
          >
            پایان آموزش
          </button>
        </div>

        <h4 className="text-[15.5px] font-black text-[var(--sk-text)] mt-1">{step.title}</h4>
        <p className="text-[12.5px] text-[var(--sk-text-muted)] leading-[22px] mt-1.5">
          {step.body}
        </p>

        <button
          type="button"
          onClick={next}
          className="mt-3.5 w-full h-11 rounded-2xl bg-[var(--sk-primary)] text-white text-[14px] font-bold flex items-center justify-center active:scale-[0.98] transition-transform"
        >
          {idx >= STEPS.length - 1 ? "فهمیدم، شروع کنیم" : "بعدی"}
        </button>
      </div>
    </div>
  );
}
