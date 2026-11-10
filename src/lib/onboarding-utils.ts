/** Helpers for the onboarding slide (7-day shift preview). */
export { makeDateKey, todayJalaali, toPersianDigits } from "./jalali";
import { todayJalaali, toGregorian, toJalaali } from "./jalali";

/** Jalali date `n` days from today. */
export function addDaysJalali(n: number) {
  const t = todayJalaali();
  const g = toGregorian(t.jy, t.jm, t.jd);
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
  d.setUTCDate(d.getUTCDate() + n);
  return toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
