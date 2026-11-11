"use client";
/**
 * Sheet — 100% parity with Android `SkSheet.kt` + guarded fullscreen close behavior:
 *
 *  - PEEK (minimized, ≤86dvh): rounded-top 26px sheet with drag handle, header,
 *    and scrollable body.
 *  - FULLSCREEN (100dvh): expands smoothly to full screen (`height: 100dvh`,
 *    `border-radius: 0`, safe-area top padding) by:
 *      1. Tapping the drag handle (`sk-sheet-handle`) or the header expand button
 *      2. Swiping UP on the handle/header (`dy < -22`)
 *      3. Scrolling the sheet body to its end (`onScroll`)
 *      4. Focusing any input/textarea inside the sheet
 *  - Guarded Close / Collapse:
 *      • Scrolling or dragging inside `.sk-sheet-body` NEVER collapses or closes the modal!
 *      • Pulling down ONLY collapses/dismisses when the touch starts on the top bar
 *        (`[data-sheet-chrome]` — the drag handle or header bar), or when the user taps
 *        the close (`✕`) / collapse (`⌄`) button.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { isTopModal, popModalStack, pushModalStack } from "@/lib/modal-stack";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./icons";

let scrollLocks = 0;
function lockBodyScroll() {
  scrollLocks += 1;
  document.body.classList.add("sk-sheet-open");
}
function unlockBodyScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.classList.remove("sk-sheet-open");
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  expandable = true,
  bodyRefExternal,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  expandable?: boolean;
  bodyRefExternal?: React.RefObject<HTMLDivElement | null>;
}) {
  const [alive, setAlive] = useState(open);

  if (open && !alive) setAlive(true);

  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setAlive(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  if (!alive) return null;
  return (
    <SheetView
      open={open}
      onClose={onClose}
      title={title}
      expandable={expandable}
      bodyRefExternal={bodyRefExternal}
    >
      {children}
    </SheetView>
  );
}

function SheetView({
  open,
  onClose,
  title,
  children,
  expandable,
  bodyRefExternal,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  expandable: boolean;
  bodyRefExternal?: React.RefObject<HTMLDivElement | null>;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const internalBodyRef = useRef<HTMLDivElement>(null);
  const bodyRef = bodyRefExternal ?? internalBodyRef;
  /* This sheet's slot in the global modal stack — used so a single Esc press
   * only closes the TOPMOST layer (e.g. ExportImageDialog over this sheet). */
  const modalIdRef = useRef<symbol | null>(null);

  const startY = useRef<number | null>(null);
  const startedOnChrome = useRef(false);
  const dragging = useRef(false);
  const dragMode = useRef<"dismiss" | "collapse" | "expand" | null>(null);
  /* Timestamp of the last collapse-to-peek: collapsing changes the body height
   * and fires a scroll event — if the body was sitting at its very end, that
   * scroll burst would instantly re-expand to fullscreen again (making Esc /
   * the collapse button look like they do nothing). onBodyScroll ignores the
   * burst for a short window after collapsing. */
  const lastCollapseAt = useRef(0);

  const closing = !open;

  /* Keep Tab focus inside the open sheet (aria-modal parity for keyboards). */
  useFocusTrap(sheetRef, open);

  useEffect(() => {
    if (open) setFullscreen(false);
  }, [open]);

  /* Register in the global modal stack once per open (NOT on every fullscreen
   * toggle) so stacking order stays stable while a dialog is open on top. */
  useEffect(() => {
    if (!open) return;
    const id = pushModalStack();
    modalIdRef.current = id;
    return () => {
      popModalStack(id);
      modalIdRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopModal(modalIdRef.current)) {
        if (fullscreen) setFullscreen(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, fullscreen, onClose]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  const setFs = useCallback(
    (on: boolean) => {
      if (!expandable) return;
      if (!on) lastCollapseAt.current = Date.now();
      setFullscreen(on);
    },
    [expandable],
  );

  /* Scroll to the very end of the body → expand to fullscreen */
  const onBodyScroll = useCallback(() => {
    const b = bodyRef.current;
    if (!b || fullscreen || !expandable) return;
    if (Date.now() - lastCollapseAt.current < 450) return; /* post-collapse scroll burst */
    if (b.scrollHeight > b.clientHeight + 4 && b.scrollTop + b.clientHeight >= b.scrollHeight - 8) {
      setFs(true);
    }
  }, [bodyRef, fullscreen, expandable, setFs]);

  /* Focusing an input/textarea automatically expands to fullscreen */
  const onFocusCapture = useCallback(
    (e: React.FocusEvent) => {
      if (!expandable || fullscreen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") {
        setFs(true);
      }
    },
    [expandable, fullscreen, setFs],
  );

  /* ---- swipe gestures ONLY when dragging from the top bar (`[data-sheet-chrome]`) ---- */
  const onTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    // Do not intercept taps on header action buttons
    if (target?.closest("button.sk-sheet-btn")) {
      startY.current = null;
      startedOnChrome.current = false;
      return;
    }
    const onChrome = !!target?.closest("[data-sheet-chrome]");
    startedOnChrome.current = onChrome;
    startY.current = e.touches[0].clientY;
    dragging.current = false;
    dragMode.current = null;
    if (onChrome && sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    const b = bodyRef.current;

    if (!dragging.current) {
      if (dy > 12) {
        /* Downward pull ONLY allowed when started on top bar (`[data-sheet-chrome]`)! */
        if (startedOnChrome.current) {
          dragging.current = true;
          dragMode.current = fullscreen ? "collapse" : "dismiss";
        }
      } else if (dy < -18 && expandable && !fullscreen) {
        /* Upward pull expands to fullscreen when on top bar or when body is at scroll end */
        const notScrollable = !b || b.scrollHeight <= b.clientHeight + 6;
        const atEnd = b ? b.scrollTop + b.clientHeight >= b.scrollHeight - 8 : true;
        if (startedOnChrome.current || notScrollable || atEnd) {
          dragging.current = true;
          dragMode.current = "expand";
          if (sheetRef.current) sheetRef.current.style.transition = "none";
        }
      }
    }

    if (!dragging.current || !sheetRef.current) return;
    if (dragMode.current === "dismiss" || dragMode.current === "collapse") {
      const d = Math.max(0, dy);
      sheetRef.current.style.transform = `translateY(${Math.min(d, 260)}px)`;
    } else if (dragMode.current === "expand") {
      const d = Math.min(0, dy);
      sheetRef.current.style.transform = `translateY(${Math.max(d, -56)}px)`;
    }
  };

  const onTouchEnd = () => {
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "";
      const t = el.style.transform;
      el.style.transform = "";
      const dy = t ? parseFloat(t.replace("translateY(", "")) || 0 : 0;
      if (dragMode.current === "expand") {
        if (dy < -22) setFs(true);
      } else if (dragMode.current === "collapse") {
        if (dy > 85) setFs(false);
      } else if (dragMode.current === "dismiss") {
        if (dy > 85) onClose();
      }
    }
    startY.current = null;
    startedOnChrome.current = false;
    dragging.current = false;
    dragMode.current = null;
  };

  return createPortal(
    <div
      className={`sk-sheet-overlay ${closing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !fullscreen) onClose();
      }}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`sk-sheet ${fullscreen ? "is-fullscreen" : ""} ${closing ? "is-closing" : ""} outline-none`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onFocusCapture={onFocusCapture}
      >
        <div
          data-sheet-chrome
          className="pt-2.5 pb-1 flex flex-col items-center cursor-grab active:cursor-grabbing select-none shrink-0 touch-none"
          onClick={() => setFs(!fullscreen)}
        >
          <button
            type="button"
            className="sk-sheet-handle !m-0"
            aria-label={fullscreen ? "کوچک کردن پنجره" : "تمام‌صفحه کردن پنجره"}
          />
        </div>
        <header data-sheet-chrome className="sk-sheet-header select-none touch-none">
          <h2
            className="sk-sheet-title cursor-pointer"
            onClick={() => {
              if (expandable) setFs(!fullscreen);
            }}
          >
            {title}
          </h2>
          {expandable && (
            <button
              type="button"
              className="sk-sheet-btn"
              onClick={() => setFs(!fullscreen)}
              aria-label={fullscreen ? "کوچک کردن پنجره" : "نمایش تمام‌صفحه"}
              title={fullscreen ? "کوچک کردن پنجره" : "نمایش تمام‌صفحه"}
            >
              {fullscreen ? <ChevronDownIcon size={17} /> : <ChevronUpIcon size={17} />}
            </button>
          )}
          <button type="button" className="sk-sheet-btn" onClick={onClose} aria-label="بستن">
            <CloseIcon size={17} />
          </button>
        </header>
        <div ref={bodyRef} className="sk-sheet-body sk-scroll" onScroll={onBodyScroll}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
