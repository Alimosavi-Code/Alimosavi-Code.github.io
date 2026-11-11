"use client";
/**
 * `useToday` — today's Jalali date that never goes stale.
 *
 * Previously every consumer used `useMemo(() => todayJalaali(), [])`, which
 * froze "today" at mount time: an app left open (or a PWA resumed from the
 * app switcher) kept highlighting YESTERDAY as today until a manual refresh.
 *
 * This hook refreshes the value:
 *  1. right after local midnight (timeout scheduled to the next 00:00), and
 *  2. whenever the tab becomes visible again (browsers throttle background
 *     timers, so `visibilitychange` is the reliable catch-up path).
 *
 * The state is only replaced when the date actually changes (no extra renders).
 */
import { useEffect, useState } from "react";
import { todayJalaali } from "./jalali";

export type TodayJalaali = ReturnType<typeof todayJalaali>;

function computeToday(): TodayJalaali {
  try {
    return todayJalaali();
  } catch {
    return { jy: 1405, jm: 1, jd: 1 };
  }
}

function sameDay(a: TodayJalaali, b: TodayJalaali): boolean {
  return a.jy === b.jy && a.jm === b.jm && a.jd === b.jd;
}

export function useToday(): TodayJalaali {
  const [today, setToday] = useState<TodayJalaali>(computeToday);

  useEffect(() => {
    let timer: number | undefined;

    const refresh = () => {
      setToday((prev) => {
        const next = computeToday();
        return sameDay(prev, next) ? prev : next;
      });
    };

    /* Schedule a refresh right after the next local midnight. */
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const ms = Math.max(1000, nextMidnight.getTime() - now.getTime());
      timer = window.setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, ms);
    };

    /* Background tabs freeze timers — catch up when the user returns. */
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    scheduleMidnight();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return today;
}
