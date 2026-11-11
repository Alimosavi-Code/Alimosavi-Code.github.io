"use client";
/**
 * Notes & Work Log Sheet (`NotesSheet`) — 100% parity with Android `NotesSheet.kt`:
 *  - Wrapped in `<Sheet>` so it supports full-screen expansion via handle tap, header button,
 *    upward swipe, scrolling to the bottom, or focusing the search input!
 *  - Combines personal notes, overtime hours, and shift swaps (`dayRecords`).
 *  - Smart Persian search (matches month names like «آبان», weekdays, Persian/ASCII digits, or note text).
 *  - Quick filters: `همه` | `<ماه> <سال>` | `اضافه‌کاری / جابه‌جایی`.
 *  - Total overtime summary pill when `totalOvertime > 0`.
 */
import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./sheet";
import { listNotes, type NoteRow } from "@/lib/notes-store";
import {
  JALALI_MONTHS,
  parseDateKey,
  formatJalali,
  formatWeekday,
  toPersianDigits,
} from "@/lib/jalali";
import { SHIFT_KIND_FA, type ShiftKind } from "@/lib/models";
import { useShiftKar, haptic } from "@/lib/store";
import { SearchIcon, NotesIcon, CalendarIcon, ChevronLeft } from "./icons";

type FilterMode = "all" | "month" | "records";

function normalizeDigits(input: string): string {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  let out = "";
  for (const ch of input) {
    const pIdx = persian.indexOf(ch);
    const aIdx = arabic.indexOf(ch);
    if (pIdx >= 0) out += String(pIdx);
    else if (aIdx >= 0) out += String(aIdx);
    else out += ch;
  }
  return out;
}

export function NotesSheet({
  open,
  onClose,
  onPickDate,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  onPickDate: (dateKey: string) => void;
  refreshKey: number;
}) {
  const viewYear = useShiftKar((s) => s.viewYear);
  const viewMonth = useShiftKar((s) => s.viewMonth);
  const dayRecords = useShiftKar((s) => s.dayRecords);
  const hapticOn = useShiftKar((s) => s.hapticOn);

  const [scope, setScope] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<NoteRow[]>([]);

  useEffect(() => {
    if (!open) return;
    /* Guard against out-of-order resolutions when the sheet is rapidly
     * re-opened or `refreshKey` bumps while a previous fetch is in flight. */
    let cancelled = false;
    listNotes().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, refreshKey]);

  const combinedItems = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        jy: number;
        jm: number;
        jd: number;
        text: string;
        overtimeHours: number;
        swapKind: ShiftKind | null;
        label: string;
        searchable: string;
      }
    >();

    const allKeys = new Set<string>([
      ...rows.map((r) => r.dateKey),
      ...Object.keys(dayRecords),
    ]);

    for (const dk of allKeys) {
      const noteRow = rows.find((r) => r.dateKey === dk);
      const noteText = noteRow?.text?.trim() ?? "";
      const rec = dayRecords[dk];
      const ot = rec?.overtimeHours ?? 0;
      const sw = rec?.swapKind ?? null;
      if (!noteText && ot <= 0 && !sw) continue;

      const { jy, jm, jd } = parseDateKey(dk);
      const wd = formatWeekday(jy, jm, jd);
      const jalaliStr = formatJalali(jy, jm, jd);
      const label = `${wd} · ${jalaliStr}`;
      const recTags = `${ot > 0 ? `اضافه‌کاری ${ot} ساعت` : ""} ${
        sw ? `جابه‌جایی ${SHIFT_KIND_FA[sw]}` : ""
      }`;
      const searchable = normalizeDigits(`${dk} ${label} ${noteText} ${recTags}`).toLowerCase();

      map.set(dk, {
        dateKey: dk,
        jy,
        jm,
        jd,
        text: noteText,
        overtimeHours: ot,
        swapKind: sw,
        label,
        searchable,
      });
    }

    const normQ = normalizeDigits(query.trim()).toLowerCase();

    return Array.from(map.values())
      .filter((item) => {
        if (scope === "month" && (item.jy !== viewYear || item.jm !== viewMonth)) {
          return false;
        }
        if (scope === "records" && item.overtimeHours <= 0 && !item.swapKind) {
          return false;
        }
        if (normQ && !item.searchable.includes(normQ)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [rows, dayRecords, scope, viewYear, viewMonth, query]);

  const totalOvertime = useMemo(
    () => combinedItems.reduce((acc, it) => acc + (it.overtimeHours || 0), 0),
    [combinedItems],
  );

  return (
    <Sheet open={open} onClose={onClose} title="یادداشت‌ها و سوابق شیفت">
      <div className="px-4 pb-6 pt-2 space-y-3">
        {/* Search field (matching NotesSheet.kt lines 124-156) */}
        <div className="glass rounded-2xl px-3.5 py-2.5 flex items-center gap-2">
          <SearchIcon size={16} className="text-[var(--sk-text-faint)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو با متن، نام ماه (مثلاً آبان)، روز هفته یا تاریخ…"
            className="w-full bg-transparent text-[13px] focus:outline-none placeholder:text-[var(--sk-text-faint)] select-text"
          />
        </div>

        {/* Filter chips (matching NotesSheet.kt lines 161-198) */}
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: "all", fa: "همه" },
              {
                id: "month",
                fa: `${JALALI_MONTHS[viewMonth - 1]} ${toPersianDigits(viewYear)}`,
              },
              { id: "records", fa: "اضافه‌کاری / جابه‌جایی" },
            ] as const
          ).map((f) => {
            const active = scope === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  haptic(hapticOn);
                  setScope(f.id);
                }}
                className={`h-[34px] rounded-xl text-[10.5px] font-bold border transition-all truncate px-1 ${
                  active
                    ? "bg-[var(--sk-primary-soft)] border-[1.5px] border-[var(--sk-primary)] text-[var(--sk-primary)]"
                    : "bg-[var(--sk-surface)] border-[var(--sk-border-soft)] text-[var(--sk-text-muted)]"
                }`}
              >
                {f.fa}
              </button>
            );
          })}
        </div>

        {/* Total Overtime Summary Banner (matching NotesSheet.kt lines 200-226) */}
        {totalOvertime > 0 && (
          <div className="rounded-xl bg-[var(--sk-primary-soft)] px-3 py-2 flex items-center justify-between text-[11.5px]">
            <span className="font-bold text-[var(--sk-text)]">
              مجموع اضافه‌کاری موارد نمایش‌داده‌شده:
            </span>
            <span className="text-[12.5px] font-black text-[var(--sk-primary)]">
              {toPersianDigits(totalOvertime)} ساعت
            </span>
          </div>
        )}

        {/* List */}
        {combinedItems.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center">
            <div className="size-14 rounded-2xl glass grid place-items-center text-[var(--sk-primary)]">
              <NotesIcon size={24} />
            </div>
            <div className="text-[14px] font-bold mt-3">موردی یافت نشد</div>
            <div className="text-[12px] text-[var(--sk-text-muted)] mt-1 leading-5">
              از تقویم روی هر روز بزنید تا یادداشت، اضافه‌کاری یا جابه‌جایی ثبت کنید
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {combinedItems.map((row) => (
              <button
                key={row.dateKey}
                type="button"
                onClick={() => {
                  onClose();
                  onPickDate(row.dateKey);
                }}
                className="w-full text-start glass rounded-2xl ps-4 pe-2.5 py-3 flex items-center gap-2 border border-[var(--sk-border)] hover:border-[var(--sk-primary)]/60 transition-colors active:scale-[0.99]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CalendarIcon size={11} className="text-[var(--sk-primary)] shrink-0" />
                    <span className="text-[12px] font-bold text-[var(--sk-primary)]">
                      {row.label}
                    </span>
                    {row.overtimeHours > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] text-[10px] font-black">
                        +{toPersianDigits(row.overtimeHours)} ساعت
                      </span>
                    )}
                    {row.swapKind && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--sk-surface-strong)] text-[var(--sk-text)] text-[10px] font-bold">
                        جابه‌جایی: {SHIFT_KIND_FA[row.swapKind]}
                      </span>
                    )}
                  </div>
                  {row.text && (
                    <p className="text-[13.5px] leading-6 text-[var(--sk-text)] mt-1 line-clamp-2">
                      {row.text}
                    </p>
                  )}
                </div>
                <ChevronLeft size={15} className="text-[var(--sk-text-faint)] shrink-0" />
              </button>
            ))}
          </div>
        )}

        {combinedItems.length > 0 && (
          <div className="text-center text-[11px] text-[var(--sk-text-faint)] pt-1">
            {toPersianDigits(combinedItems.length)} مورد
          </div>
        )}
      </div>
    </Sheet>
  );
}
