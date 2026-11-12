"use client";
/**
 * Glassy Image Export Preview Dialog (`ExportImageDialog`) — 100% parity with
 * Android `ExportImageDialog.kt` (v6.7.1):
 *  - Opaque `.glass-strong` surface with top aurora sheen so zero background bleeds through.
 *  - Header with 38px `ImageIcon` badge + title + `CloseIcon` button.
 *  - Optional `headerExtra` switcher (`قالب تقویم | قالب جدولی` or `لوحه کلاسیک | لوحه رسمی | ماتریس ۴ شیفت`).
 *  - Action buttons matching `ExportActionButtons` in `ExportImageDialog.kt`:
 *      1. Primary solid button: `اشتراک‌گذاری`
 *      2. Outlined glass primary button: `ذخیرهٔ تصویر`
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isTopModal, popModalStack, pushModalStack } from "@/lib/modal-stack";
import { toast } from "sonner";
import { downloadCanvasAsPng, shareOrDownloadCanvas } from "@/lib/image-exporter";
import { useShiftKar, haptic } from "@/lib/store";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { CloseIcon, DownloadIcon, ShareIcon, ImageIcon } from "./icons";

export function ExportImageDialog({
  open,
  title,
  filename,
  headerExtra,
  renderCanvas,
  onClose,
}: {
  open: boolean;
  title: string;
  filename: string;
  headerExtra?: React.ReactNode;
  renderCanvas: () => HTMLCanvasElement | null;
  onClose: () => void;
}) {
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  /* Keep Tab focus inside the open export dialog. */
  useFocusTrap(cardRef, open);

  useEffect(() => {
    if (!open) {
      setDataUrl(null);
      canvasRef.current = null;
      return;
    }
    const id = window.setTimeout(() => {
      const c = renderCanvas();
      canvasRef.current = c;
      if (c) {
        try {
          setDataUrl(c.toDataURL("image/png"));
        } catch {
          setDataUrl(null);
        }
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [open, renderCanvas]);

  useEffect(() => {
    if (!open) return;
    /* Only react to Esc when this dialog is the topmost modal layer
     * (it can be opened on top of a Sheet — Esc must not close both). */
    const modalId = pushModalStack();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopModal(modalId)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      popModalStack(modalId);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleDownload = () => {
    if (!canvasRef.current) return;
    haptic(hapticOn, 12);
    downloadCanvasAsPng(canvasRef.current, filename);
    toast.success("تصویر با موفقیت ذخیره شد");
    onClose();
  };

  const handleShare = async () => {
    if (!canvasRef.current || busy) return;
    haptic(hapticOn, 12);
    setBusy(true);
    try {
      const res = await shareOrDownloadCanvas(canvasRef.current, filename, title);
      if (res === "shared") toast.success("تصویر اشتراک‌گذاری شد");
      else toast.success("تصویر ذخیره شد");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div onClick={onClose} className="sk-scrim-in absolute inset-0 sk-scrim" />

      <div
        ref={cardRef}
        tabIndex={-1}
        className="sk-pop-in relative z-10 w-full max-w-[440px] max-h-[90dvh] glass-strong rounded-[26px] p-4 flex flex-col gap-3 overflow-y-auto sk-scroll outline-none"
      >
        {/* Header (matching ExportImageDialog.kt lines 147-170) */}
        <div className="flex items-center gap-2.5">
          <span className="size-[38px] rounded-[13px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center shrink-0">
            <ImageIcon size={19} />
          </span>
          <h3 className="flex-1 min-w-0 text-[15.5px] font-extrabold truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="sk-sheet-btn"
            aria-label="بستن"
          >
            <CloseIcon size={17} />
          </button>
        </div>

        {/* Optional Mode Switcher (headerExtra) */}
        {headerExtra && <div>{headerExtra}</div>}

        {/* Image Preview Container */}
        <div className="w-full min-h-[180px] max-h-[380px] rounded-[18px] glass p-2 flex items-center justify-center overflow-hidden">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt={title}
              className="max-h-[360px] w-auto object-contain rounded-xl shadow-md"
            />
          ) : (
            <div className="py-16 text-[13px] font-bold text-[var(--sk-text-muted)]">
              در حال آماده‌سازی تصویر شیشه‌ای…
            </div>
          )}
        </div>

        {/* Action Buttons (matching ExportActionButtons in ExportImageDialog.kt lines 336-404) */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleShare}
            disabled={!dataUrl || busy}
            className="h-[46px] rounded-[14px] sk-btn-glass-primary text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            <ShareIcon size={16} />
            <span>اشتراک‌گذاری</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!dataUrl}
            className="h-[46px] rounded-[14px] glass text-[var(--sk-primary)] text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{
              border: "1.5px solid color-mix(in srgb, var(--sk-primary) 55%, transparent)",
            }}
          >
            <DownloadIcon size={16} />
            <span>ذخیرهٔ تصویر</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
