"use client";
/**
 * Spotlight Guided Tour (`Tour`) — 100% parity with Android `TourOverlay.kt` (v6.7.1):
 *  1. `today-banner`  — وضعیت شیفت امروز شما
 *  2. `month-nav`     — جابه‌جایی ماه، یادداشت‌ها و نمای جدولی
 *  3. `group-filter`  — فیلتر گروه، مقایسهٔ دو شیفت و خروجی عکس
 *  4. `today-cell`    — نشانگر روزِ شیفت، اضافه‌کاری و جابه‌جایی
 *  5. `summary-strip` — خلاصهٔ آماری ماه در یک نگاه
 *  6. `bottom-nav`    — لوحه کلاسیک، مدیریت شیفت و پرسنل
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
    body: "در این کارت، نوبت امروز شما (صبح‌کار، عصرکار، شب‌کار یا استراحت) به‌همراه شمارهٔ روز نوبت، ساعت اضافه‌کاری یا جابه‌جایی ثبت‌شده نمایش داده می‌شود. با لمس آن، جزئیات کامل امروز باز می‌شود.",
    placement: "below",
  },
  {
    target: "month-nav",
    title: "جابه‌جایی ماه، یادداشت‌ها و نمای جدولی",
    body: "با فلش‌ها یا کشیدن انگشت بین ماه‌ها جابه‌جا شوید، روی نام ماه بزنید تا سریع به هر سال و ماهی بروید، از آیکون یادداشت‌ها همهٔ یادداشت‌ها را مرور کنید یا بین نمای شبکه‌ای و جدولی تمام‌صفحه سوئیچ نمایید.",
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
    body: "در هر خانهٔ تقویم، آیکون شیفت به‌همراه شمارهٔ روز آن نوبت (مثلاً خورشید ۱ یا ماه ۲) دیده می‌شود. با لمس هر روز می‌توانید یادداشت، ساعت اضافه‌کاری و جابه‌جایی شیفت ثبت کنید و وضعیت همکاران را ببینید.",
    placement: "above",
  },
  {
    target: "summary-strip",
    title: "خلاصهٔ آماری ماه در یک نگاه",
    body: "در پایین تقویم، تعداد کل روزهای صبح‌کار، عصرکار، شب‌کار، تعطیلات رسمی و استراحتِ شما در آن ماه به‌صورت زنده شمارش و نمایش داده می‌شود.",
    placement: "above",
  },
  {
    target: "bottom-nav",
    title: "لوحه کلاسیک، مدیریت شیفت و پرسنل",
    body: "از نوار پایین به «لوحه» (شامل لوحه کلاسیک سالانه با خروجی تصویر)، تب «مدیریت شیفت» (۴۵ الگوی آماده، ساخت شیفت سفارشی با قابلیت افزودن/حذف گروه‌ها، و مدیریت همکاران) و «تنظیمات» دسترسی دارید.",
    placement: "above",
  },
];

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = STEPS[idx] ?? STEPS[0];

  useEffect(() => {
    if (!open) {
      setIdx(0);
      return;
    }
    const update = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, idx, step.target]);

  if (!open) return null;

  const pad = 8;
  const spotStyle: React.CSSProperties = rect
    ? {
        top: Math.max(4, rect.top - pad),
        left: Math.max(4, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : { top: "50%", left: "50%", width: 0, height: 0 };

  const tooltipEstH = 225;
  const gap = 16;
  const safeTop = 48;
  const safeBottom = Math.max(safeTop, window.innerHeight - tooltipEstH - 24);

  let cardTop = Math.max(safeTop, (window.innerHeight - tooltipEstH) / 2);
  if (rect) {
    const roomBelow = window.innerHeight - rect.bottom - gap - 24;
    const roomAbove = rect.top - gap - safeTop;
    if (step.placement === "below" && roomBelow >= tooltipEstH) {
      cardTop = rect.bottom + gap;
    } else if (step.placement === "above" && roomAbove >= tooltipEstH) {
      cardTop = rect.top - gap - tooltipEstH;
    } else if (roomBelow >= roomAbove) {
      cardTop = Math.min(safeBottom, Math.max(safeTop, rect.bottom + gap));
    } else {
      cardTop = Math.min(safeBottom, Math.max(safeTop, rect.top - gap - tooltipEstH));
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
      {/* Spotlight cutout with glowing primary border (matching TourOverlay.kt lines 102-130) */}
      <div
        className="fixed rounded-[20px] pointer-events-none transition-all duration-300 ease-out"
        style={{
          ...spotStyle,
          border: "3.5px solid var(--sk-primary)",
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.76)",
        }}
      />

      {/* Tooltip Card (matching TourOverlay.kt lines 149-208) */}
      <div
        key={idx}
        style={{
          top: cardTop,
          backgroundColor: "var(--sk-sheet-solid)",
          border: "1.5px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
        className="sk-pop-in fixed inset-x-4 max-w-[420px] mx-auto rounded-3xl p-5 shadow-2xl pointer-events-auto"
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
