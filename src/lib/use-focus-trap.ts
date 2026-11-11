"use client";
/**
 * `useFocusTrap` — keeps Tab / Shift+Tab focus inside a dialog while it is open.
 *
 * The app's sheets and dialogs already expose `role="dialog"` + `aria-modal`,
 * but the focus still escaped to the page behind them when pressing Tab.
 * While `active` is true this hook:
 *   - cycles Tab/Shift+Tab within the focusable children of `ref`,
 *   - moves initial focus into the container (it needs `tabIndex={-1}`),
 *   - restores focus to the previously focused element when released.
 */
import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
]
  .map((s) => `${s}:not([inert])`)
  .join(",");

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const prevFocus = document.activeElement as HTMLElement | null;

    const getFocusable = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0,
      );

    /* Move focus into the dialog (after mount / paint) so Tab starts inside. */
    const focusTimer = window.setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        root.focus({ preventScroll: true });
      }
    }, 40);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (cur === first || !cur || !root.contains(cur)) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (cur === last || !cur || !root.contains(cur)) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      root.removeEventListener("keydown", onKeyDown);
      prevFocus?.focus?.();
    };
  }, [ref, active]);
}
