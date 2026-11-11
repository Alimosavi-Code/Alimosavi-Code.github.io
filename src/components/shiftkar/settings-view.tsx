"use client";
/**
 * Settings view (`SettingsView`) — Symmetrical, height-matched 2-column Desktop Grid + Mobile Stack:
 *  - Row 1: `شیفت شما` + `حالت نمایش`
 *  - Row 2: `رنگ اصلی` + `نمای تقویم`
 *  - Row 3: `به‌روزرسانی و نصب برنامه` + `یادآور هوشمند شیفت و یادداشت‌ها`
 *  - Row 4: `درباره ما` + `راه‌های ارتباط با ما` (2-column internal contact grid on desktop/tablet;
 *    the last contact row stretches full-width so no half-empty cell is left on desktop)
 *  - Row 5 (`lg:col-span-2`): `راهنما` (Full-width card with 2-column internal FAQ grid on desktop;
 *    every FAQ row keeps its separator in 2-column mode EXCEPT the last row of each column)
 *  - Row 6 (last): `پشتیبان‌گیری و بازیابی` + `راهنمای شروع` (start guide is the final section)
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  THEMES,
  THEME_MODES,
  APP,
  type Group,
  type ThemeId,
  type ThemeMode,
} from "@/lib/models";
import {
  getActivePattern,
  getActiveGroups,
  getGroupLetter,
  getGroupTitle,
} from "@/lib/shift-engine";
import { getCalendarSyncStatus, syncCalendarNow } from "@/lib/holidays";
import { useShiftKar, applyThemeToDom, haptic, type ViewType } from "@/lib/store";
import {
  listNotes,
  exportFullBackupJson,
  importFullBackupJson,
} from "@/lib/notes-store";
import { toPersianDigits, todayJalaali } from "@/lib/jalali";
import { getInstallState } from "@/lib/install";
import {
  GroupIcon,
  PaletteIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  GridIcon,
  DownloadIcon,
  RefreshIcon,
  InfoIcon,
  HelpIcon,
  PhoneIcon,
  WhatsappIcon,
  TelegramIcon,
  EitaaIcon,
  ChevronDown,
  CheckIcon,
  CalendarIcon,
  ExternalIcon,
  NotesIcon,
  SparkIcon,
  ShiftKarAppEmblem,
} from "./icons";

const CONTACTS = [
  {
    id: "whatsapp-pv",
    fa: "پیام خصوصی واتساپ",
    sub: "ارتباط مستقیم با سازنده در واتساپ",
    badgeBg: "rgba(37, 211, 102, 0.16)",
    badgeBorder: "rgba(37, 211, 102, 0.36)",
    badgeInk: "#25D366",
    icon: <WhatsappIcon size={20} />,
    href: "https://wa.me/989163548578",
  },
  {
    id: "phone",
    fa: "تماس تلفنی",
    sub: "برقراری تماس مستقیم تلفنی",
    badgeBg: "var(--sk-primary-soft)",
    badgeBorder: "color-mix(in srgb, var(--sk-primary) 40%, transparent)",
    badgeInk: "var(--sk-primary)",
    icon: <PhoneIcon size={20} />,
    href: "tel:09163548578",
  },
  {
    id: "whatsapp-group",
    fa: "گروه واتساپ",
    sub: "عضویت در گروه همکاران شیفت‌کار",
    badgeBg: "rgba(16, 185, 129, 0.16)",
    badgeBorder: "rgba(16, 185, 129, 0.36)",
    badgeInk: "#10B981",
    icon: <WhatsappIcon size={20} />,
    href: "https://chat.whatsapp.com/5HolMMoVnojCdh8GjhSZo2",
  },
  {
    id: "telegram",
    fa: "تلگرام",
    sub: "ارتباط از طریق تلگرام",
    badgeBg: "rgba(56, 189, 248, 0.16)",
    badgeBorder: "rgba(56, 189, 248, 0.36)",
    badgeInk: "#38BDF8",
    icon: <TelegramIcon size={20} />,
    href: "https://t.me/h_mosavi_s",
  },
  {
    id: "eitaa",
    fa: "گروه ایتا",
    sub: "عضویت در گروه اطلاع‌رسانی و پشتیبانی ایتا",
    badgeBg: "rgba(249, 115, 22, 0.16)",
    badgeBorder: "rgba(249, 115, 22, 0.36)",
    badgeInk: "#FB923C",
    icon: <EitaaIcon size={20} />,
    href: "https://eitaa.com/joinchat/929104214C56d88e3e24",
  },
];

const HELP_ITEMS: { title: string; body: string }[] = [
  {
    title: "محاسبه هوشمند شیفت و تقویم سه‌گانه",
    body: "تقویم شیفت‌کار بر پایهٔ تاریخ هجری شمسی (به‌همراه نمایش هم‌زمان تاریخ قمری و میلادی در جزئیات هر روز) کار می‌کند. الگوی پیش‌فرض برنامه «پتروشیمی بندر امام (۲-۲-۴)» است: ۲ روز صبح‌کار، ۲ روز شب‌کار و ۴ روز استراحت با تاریخ پایهٔ ۱۴۰۵/۰۵/۰۴. شاخص هر روز با فرمول دقیق ریاضی محاسبه می‌شود تا تمام سال‌های گذشته و آینده (۱۳۰۰ تا ۱۵۰۰) بدون کوچک‌ترین خطا نمایش داده شوند.",
  },
  {
    title: "انواع نوبت‌کاری و نشانگر روزِ شیفت در تقویم",
    body: "چهار نوع وضعیت شیفت با رنگ‌بندی و گرادیان کاملاً متمایز پشتیبانی می‌شود:\n• صبح‌کار — گرادیان طلایی روشن با آیکون خورشید\n• عصرکار — گرادیان غروب مرجانی/ارغوانی با آیکون غروب آفتاب\n• شب‌کار — گرادیان نیلی/بنفش با آیکون ماه\n• استراحت — گرادیان زمردی با آیکون استراحت\nدر هر خانهٔ تقویم، آیکون شیفت به‌همراه شمارهٔ روز آن نوبت (مثلاً خورشید ۱، خورشید ۲ یا ماه ۱) نمایش داده می‌شود تا دقیقاً بدانید روز چندم شیفت یا استراحت هستید.",
  },
  {
    title: "مدیریت شیفت، ۴۵ الگوی آماده و ساخت شیفت سفارشی",
    body: "از تب «مدیریت شیفت» در نوار پایین می‌توانید:\n• از میان ۴۵ الگوی استاندارد آماده (شامل ۲-۲-۴، سه‌نوبتی ۸ ساعته، ۴-۴-۴، ۳-۳-۳، بیمارستانی، نگهبانی، اقماری ۱۴-۱۴، ۲۲-۸ و اداری) الگوی دلخواه را فعال کنید.\n• با «ساخت سیستم شیفت سفارشی» چرخهٔ دلخواه خود (صبح‌کار، عصرکار، شب‌کار و استراحت) را بسازید و ساختار گروه‌ها را روی «چهار گروه (A تا D)»، «بدون گروه (شیفت فردی)» یا تا ۸ گروه (A تا H) تنظیم نمایید.",
  },
  {
    title: "مدیریت پرسنل، همکاران و مقایسهٔ شیفت‌ها",
    body: "در بخش «پرسنل و همکاران» تب مدیریت شیفت می‌توانید همکاران یا نیروهای واحد خود را با نام، سمت و الگوی شیفت اختصاصی اضافه یا ویرایش کنید. برنامه در هر روز نشان می‌دهد چه کسانی صبح‌کار، عصرکار، شب‌کار، در استراحت یا مرخصی هستند و در صورت مرخصی همکار، نفرات در استراحت را برای جایگزینی پیشنهاد می‌دهد. همچنین در صفحهٔ تقویم با نگه‌داشتن روی دکمهٔ یک گروه دیگر، روزهای استراحت مشترک شما و آن گروه هایلایت می‌شود.",
  },
  {
    title: "ثبت اضافه‌کاری و جابه‌جایی نوبت (Shift Swap)",
    body: "با لمس هر روز در تقویم، می‌توانید ساعت اضافه‌کاری (۱ تا ۲۴ ساعت) و جابه‌جایی نوبت (تغییر وضعیت آن روز به صبح‌کار، عصرکار، شب‌کار یا استراحت) را ثبت کنید. تغییرات بلافاصله در تقویم شبکه‌ای، نمای جدولی، نوار خلاصهٔ ماه و گزارش کارکرد اعمال می‌شوند.",
  },
  {
    title: "لوحه سالانه، چارت کلاسیک ۱۴۰۵ و خروجی تصویر",
    body: "در تب «لوحه» می‌توانید برنامهٔ کل سال را در یک نگاه ببینید و با دکمهٔ «تصویر» خروجی PNG باکیفیت بگیرید:\n• حالت تک‌گروهی: تقویم ۱۲ ماههٔ رنگی برای گروه انتخابی شما.\n• چارت کلاسیک ۱۴۰۵: طراحی دقیقاً مطابق چارت چاپی سالانهٔ نوبت‌کاری (۶ ماه نیمهٔ اول در سمت چپ، ستون‌های رنگی A/B/C/D در وسط با کدهای M1/N1/R1، و ۶ ماه نیمهٔ دوم + فروردین سال بعد در سمت راست، با رنگ قرمز برای تعطیلات رسمی و زرد برای جمعه‌ها).\n• لوحه رسمی و ماتریس ۴ شیفت: نمایش تفکیکی نوبت‌ها برای هر ۳۱ روز ماه.",
  },
  {
    title: "گزارش کارکرد و فیش شیفت",
    body: "در تب «مدیریت شیفت ← گزارش کارکرد» خلاصهٔ ماهانه یا سالانهٔ کل روزهای کاری، ساعت اضافه‌کاری، تعطیل‌کاری رسمی و جمعه‌کاری محاسبه شده و قابل ذخیره و اشتراک‌گذاری به‌صورت تصویر PNG است.",
  },
  {
    title: "یادآور هوشمند شیفت و یادداشت‌ها",
    body: "از بخش «یادآور هوشمند» در تنظیمات می‌توانید اعلان پیش از شروع نوبت صبح‌کار (در شبِ قبل) و نوبت شب‌کار (در عصرِ همان روز) را با اسلایدر روی ساعت دلخواه تنظیم کنید و یادآور ساعت ۰۸:۰۰ صبح برای روزهای دارای یادداشت را فعال نمایید.",
  },
  {
    title: "پشتیبان‌گیری یکپارچه و کامل (.json)",
    body: "فایل پشتیبان شیفت‌کار علاوه بر تمام یادداشت‌های شخصی، شامل سوابق اضافه‌کاری و جابه‌جایی شیفت، الگوهای سفارشی ساخته‌شده و فهرست همکاران/پرسنل است و بین نسخهٔ وب (PWA) و نسخهٔ اندروید کاملاً سازگار است.",
  },
  {
    title: "تم‌ها و تعطیلات رسمی",
    body: "شش تم رنگی اختصاصی (آبی، زمردی، بنفش، نارنجی، رز و فیروزه‌ای) به همراه حالت‌های روشن، تیره و هماهنگ با سیستم در دسترس است. در تقویم، جدول و لوحه، تنها «تعطیلات رسمی» با رنگ قرمز نمایش داده می‌شوند تا جمعه‌های عادی با تعطیلات رسمی اشتباه نشوند.",
  },
  {
    title: "هماهنگ‌سازی زندهٔ تقویم و مناسبت‌ها",
    body: "برنامه دارای سامانهٔ هوشمند هماهنگ‌سازی از راه دور تقویم و مناسبت‌ها (calendar-sync.json) است تا در صورت اعلام تغییرات تقویم یا انتشار تقویم سال‌های آینده، تاریخ اعیاد و تعطیلات رسمی بدون نیاز به نصب مجدد به‌روز شوند.",
  },
  {
    title: "میانبرهای صفحه‌کلید دسکتاپ و اسکرول افقی (Shift + Scroll)",
    body: "در نسخهٔ دسکتاپ و وب می‌توانید بدون نیاز به ماوس، با کلیدهای میانبر در برنامه جابه‌جا شوید:\n• فلش راست و چپ (ArrowRight / ArrowLeft): رفتن به ماه قبل و ماه بعد در تقویم و جدول (یا سال قبل و بعد در تب لوحه).\n• فلش بالا و پایین (ArrowUp / ArrowDown) و PageUp / PageDown: اسکرول عمودی سریع در نمای جدولی و لوحه.\n• نگه‌داشتن کلید Shift + چرخ اسکرول ماوس (Shift + Scroll): اسکرول افقی نرم در جدول‌ها، لوحهٔ سالانه و نوارهای افقی در دسکتاپ.\n• کلید V: تغییر سریع بین نمای تقویم (شبکه‌ای) و نمای جدولی.\n• کلید F: باز و بسته کردن حالت تمام‌صفحه در نمای جدولی.\n• کلید T: پرش سریع به تاریخ امروز.\n• کلید N: باز کردن پنجرهٔ همهٔ یادداشت‌ها.\n• کلیدهای ۱ تا ۵: جابه‌جایی سریع بین ۵ تب اصلی برنامه (تقویم، سامانه‌ها، لوحه، مدیریت شیفت و تنظیمات).\n• کلید Esc: بستن پنجره‌های باز یا خروج از حالت تمام‌صفحه.",
  },
];

function GridPreview() {
  const rows = [
    ["REST", "REST", "DAY", "DAY", "NIGHT", "NIGHT", "REST"],
    ["REST", "DAY", "DAY", "NIGHT", "NIGHT", "REST", "REST"],
    ["DAY", "DAY", "NIGHT", "NIGHT", "REST", "REST", "HOL"],
    ["NIGHT", "NIGHT", "REST", "REST", "REST", "DAY", "DAY"],
  ];
  const cls = (c: string) =>
    c === "DAY"
      ? "bg-[var(--sk-day)]/70"
      : c === "NIGHT"
        ? "bg-[var(--sk-night)]/70"
        : c === "HOL"
          ? "bg-[var(--sk-holiday)]/70"
          : "bg-[var(--sk-rest)]/45";
  return (
    <span className="vp-preview !w-full !max-w-[140px]" aria-hidden>
      <span className="vp-head" />
      {rows.map((r, i) => (
        <span key={i} className="flex gap-[2.5px]">
          {r.map((c, j) => (
            <span key={j} className={`h-2.5 flex-1 rounded-[2.5px] ${cls(c)}`} />
          ))}
        </span>
      ))}
    </span>
  );
}

function TablePreview() {
  const rows = [
    ["bg-[var(--sk-rest)]/45", "bg-[var(--sk-holiday)]/60"],
    ["bg-[var(--sk-night)]/70", ""],
    ["bg-[var(--sk-day)]/70", "bg-[var(--sk-holiday)]/60"],
    ["bg-[var(--sk-day)]/70", ""],
  ];
  return (
    <span className="vp-preview !w-full !max-w-[140px]" aria-hidden>
      <span className="vp-head" />
      {rows.map((r, i) => (
        <span key={i} className="flex items-center gap-[3.5px]">
          <span className="w-2.5 h-2.5 rounded-[2.5px] bg-[var(--sk-text-faint)]/40" />
          <span className="flex-1 h-2 rounded-full bg-[var(--sk-text-faint)]/35" />
          <span className={`w-2.5 h-2.5 rounded-full ${r[0]}`} />
          <span className={`flex-1 h-2 rounded-full ${r[1] || "bg-[var(--sk-text-faint)]/25"}`} />
        </span>
      ))}
    </span>
  );
}

export function SettingsView({
  onOpenInstall,
  onRestartOnboarding,
  onRestartTour,
  onNotesChanged,
}: {
  onOpenInstall: () => void;
  onRestartOnboarding: () => void;
  onRestartTour: () => void;
  onNotesChanged: () => void;
}) {
  const myGroup = useShiftKar((s) => s.myGroup);
  const theme = useShiftKar((s) => s.theme);
  const themeMode = useShiftKar((s) => s.themeMode);
  const viewType = useShiftKar((s) => s.viewType);
  const showSecondaryCalendars = useShiftKar((s) => s.showSecondaryCalendars);
  const hapticOn = useShiftKar((s) => s.hapticOn);
  const dayRecords = useShiftKar((s) => s.dayRecords);
  const employees = useShiftKar((s) => s.employees);
  const activePatternId = useShiftKar((s) => s.activePatternId);
  const customPatterns = useShiftKar((s) => s.customPatterns);
  const shiftReminderOn = useShiftKar((s) => s.shiftReminderOn);
  const dayReminderHour = useShiftKar((s) => s.dayReminderHour);
  const nightReminderHour = useShiftKar((s) => s.nightReminderHour);
  const noteReminderOn = useShiftKar((s) => s.noteReminderOn);
  const calendarSyncRev = useShiftKar((s) => s.calendarSyncRev);
  const bumpCalendarSyncRev = useShiftKar((s) => s.bumpCalendarSyncRev);
  const set = useShiftKar((s) => s.set);

  const fileRef = useRef<HTMLInputElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [notesCount, setNotesCount] = useState(0);
  const [syncingCal, setSyncingCal] = useState(false);
  const [installed, setInstalled] = useState(false);

  const pat = getActivePattern();
  const activeGroups = getActiveGroups(pat);
  void activePatternId;
  void customPatterns;
  void calendarSyncRev;

  const calStatus = getCalendarSyncStatus();

  useEffect(() => {
    listNotes().then((rows) => setNotesCount(rows.length));
  }, []);

  useEffect(() => {
    const sync = () => setInstalled(getInstallState().installed);
    sync();
    window.addEventListener("shiftkar-neo:install-state", sync);
    window.addEventListener("appinstalled", sync);
    return () => {
      window.removeEventListener("shiftkar-neo:install-state", sync);
      window.removeEventListener("appinstalled", sync);
    };
  }, []);

  /* Backup badge: count every saved day record (overtime and/or swap), but the
   * label below says «ثبت اضافه‌کاری/جابه‌جایی» so swap-only records are not
   * mislabeled as «اضافه‌کاری». */
  const recordsCount = Object.values(dayRecords).filter(
    (r) => (r.overtimeHours ?? 0) > 0 || r.swapKind !== null,
  ).length;

  const pickGroup = (g: Group) => {
    haptic(hapticOn, 12);
    set({ myGroup: g, filterGroup: g, rosterGroup: g });
    toast(`شیفت شما: ${getGroupTitle(g, pat)}`);
  };

  const pickTheme = (t: ThemeId) => {
    haptic(hapticOn, 10);
    set({ theme: t });
    applyThemeToDom(t, themeMode);
  };

  const pickMode = (m: ThemeMode) => {
    haptic(hapticOn, 10);
    set({ themeMode: m });
    applyThemeToDom(theme, m);
  };

  const pickView = (v: ViewType) => {
    haptic(hapticOn, 10);
    set({ viewType: v });
  };

  const requestBrowserNotifPerm = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
  };

  const handleSyncCalendar = async () => {
    if (syncingCal) return;
    haptic(hapticOn, 12);
    setSyncingCal(true);
    try {
      const res = await syncCalendarNow(() => bumpCalendarSyncRev());
      if (res.ok) {
        if (res.outcome === "UP_TO_DATE") {
          toast.success(
            "تقویم و مناسبت‌ها هم‌اکنون در آخرین نسخه است (به‌روز است)",
          );
        } else {
          toast.success(
            `تقویم و مناسبت‌ها به نسخهٔ ${toPersianDigits(res.syncVersion)} به‌روزرسانی شد`,
          );
        }
      } else {
        toast.error("خطا در دریافت فایل تقویم — از جدول آفلاین برنامه استفاده می‌شود");
      }
    } finally {
      setSyncingCal(false);
    }
  };

  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const doExport = async () => {
    haptic(hapticOn);
    try {
      const json = await exportFullBackupJson();
      const { jy, jm, jd } = todayJalaali();
      const fname = `shiftkar-notes-${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}.json`;
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("فایل پشتیبان یادداشت‌ها ذخیره شد");
    } catch {
      toast.error("خطا در ذخیرهٔ فایل پشتیبان");
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const res = await importFullBackupJson(text);
      const updatedNotes = await listNotes();
      setNotesCount(updatedNotes.length);
      onNotesChanged();
      const total =
        res.notesCount + res.recordsCount + res.employeesCount + res.patternsCount;
      if (total > 0) {
        toast.success(
          `${toPersianDigits(total)} مورد (یادداشت، اضافه‌کاری، الگو و پرسنل) بازیابی شد`,
        );
      } else {
        toast.success("فایل پشتیبان با موفقیت اعمال شد");
      }
    } catch (err) {
      console.error("Backup restore error:", err);
      toast.error("فایل پشتیبان معتبر نیست");
    }
  };

  const doCopyBackup = async () => {
    haptic(hapticOn);
    try {
      const json = await exportFullBackupJson();
      await navigator.clipboard.writeText(json);
      toast.success("متن پشتیبان یکپارچه در حافظه کپی شد");
    } catch {
      toast.error("خطا در کپی متن پشتیبان");
    }
  };

  const doRestoreFromText = async () => {
    haptic(hapticOn);
    if (!pasteText.trim()) {
      toast.error("لطفاً متن فایل پشتیبان (.json) را وارد کنید");
      return;
    }
    try {
      const res = await importFullBackupJson(pasteText);
      const updatedNotes = await listNotes();
      setNotesCount(updatedNotes.length);
      onNotesChanged();
      setPasteText("");
      setPasteMode(false);
      const total =
        res.notesCount + res.recordsCount + res.employeesCount + res.patternsCount;
      toast.success(
        `${toPersianDigits(total)} مورد (یادداشت، اضافه‌کاری، الگو و پرسنل) بازیابی شد`,
      );
    } catch (err) {
      console.error("Text backup restore error:", err);
      toast.error("متن پشتیبان معتبر نیست");
    }
  };

  return (
    <div className="h-full overflow-y-auto sk-scroll overscroll-contain px-4 md:px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+116px)]">
      <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch gap-3.5 md:gap-4">
      {/* Header */}
      <header className="text-center pt-1 pb-1 lg:col-span-2">
        <h1 className="text-[22px] md:text-[24px] font-black">تنظیمات</h1>
        <p className="text-[12px] text-[var(--sk-text-muted)] mt-1">شخصی‌سازی کامل برنامه، پشتیبان‌گیری و راهنما</p>
      </header>

      {/* ============ Row 1 Right: 1. شیفت شما ============ */}
      <Section
        icon={<GroupIcon size={16} />}
        title="شیفت شما"
        desc="گروه کاری خود را انتخاب کنید؛ تقویم و لوحه بر همین اساس رنگ می‌شود."
      >
        <div className="flex flex-col justify-between gap-2.5 flex-1">
          <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[var(--sk-text-muted)] truncate">
              الگوی فعال: {pat.name}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--sk-primary-soft)] text-[10.5px] font-black text-[var(--sk-primary)] shrink-0">
              {getGroupTitle(myGroup, pat)}
            </span>
          </div>
          {pat.hasGroups ? (
            <div className="sk-seg" role="group" aria-label="شیفت شما">
              {activeGroups.map((g) => {
                const active = myGroup === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => pickGroup(g)}
                    className={`sk-seg-item ${active ? "is-active" : ""}`}
                    aria-pressed={active}
                  >
                    {getGroupLetter(g, pat)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl sk-tile px-3.5 py-2.5 text-[12.5px] font-bold text-[var(--sk-text-muted)]">
              الگوی فعلی در حالت «شیفت فردی (بدون گروه)» قرار دارد.
            </div>
          )}
        </div>
      </Section>

      {/* ============ Row 1 Left: 2. حالت نمایش ============ */}
      <Section
        icon={<PaletteIcon size={16} />}
        title="حالت نمایش"
        desc="روشن، تیره یا پیروی از تم سیستم؛ تغییر به‌صورت زنده اعمال می‌شود."
      >
        <div className="grid grid-cols-3 gap-2 flex-1 items-stretch" role="group" aria-label="حالت نمایش">
          {THEME_MODES.map((m) => {
            const active = themeMode === m.id;
            const Icon =
              m.id === "light" ? SunIcon : m.id === "dark" ? MoonIcon : MonitorIcon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                className={`relative rounded-2xl py-3.5 px-1 flex flex-col items-center justify-center gap-2 sk-outline ${
                  active ? "is-active" : ""
                }`}
                aria-pressed={active}
              >
                <span
                  className={
                    active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                  }
                >
                  <Icon size={21} />
                </span>
                <span
                  className={`text-[11px] font-bold leading-4 text-center ${
                    active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                  }`}
                >
                  {m.fa}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ============ Row 2 Right: 3. رنگ اصلی ============ */}
      <Section
        icon={<PaletteIcon size={16} />}
        title="رنگ اصلی"
        desc="رنگ اصلی برنامه را انتخاب کنید."
      >
        <div className="grid grid-cols-3 gap-2 flex-1 items-stretch" role="group" aria-label="انتخاب تم">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTheme(t.id)}
                className={`rounded-2xl py-3 flex flex-col items-center justify-center gap-2 sk-outline ${
                  active ? "is-active" : ""
                }`}
                aria-pressed={active}
                aria-label={`تم ${t.fa}`}
              >
                <span className="sk-swatch" style={{ background: t.hex }} />
                <span
                  className={`text-[11.5px] font-bold ${
                    active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                  }`}
                >
                  {t.fa}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ============ Row 2 Left: 4. نمای تقویم ============ */}
      <Section
        icon={<GridIcon size={16} />}
        title="نمای تقویم و تاریخ‌های فرعی"
        desc="حالت نمایش تقویم (شبکه‌ای یا جدولی) و نمایش تاریخ قمری و میلادی را تنظیم کنید."
      >
        <div className="flex flex-col justify-between gap-2.5 flex-1">
          <div className="grid grid-cols-2 gap-2.5 flex-1 items-stretch" role="radiogroup" aria-label="نمای تقویم">
            {(
              [
                { id: "grid" as const, fa: "تقویم (شبکه‌ای)", preview: <GridPreview /> },
                { id: "table" as const, fa: "جدولی (فهرست ماه)", preview: <TablePreview /> },
              ]
            ).map((v) => {
              const active = viewType === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => pickView(v.id)}
                  className={`relative rounded-2xl p-3 flex flex-col items-center justify-center gap-2.5 sk-outline ${
                    active ? "is-active" : ""
                  }`}
                  role="radio"
                  aria-checked={active}
                >
                  {v.preview}
                  <span
                    className={`text-[12px] font-bold ${
                      active ? "text-[var(--sk-primary)]" : "text-[var(--sk-text-muted)]"
                    }`}
                  >
                    {v.fa}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              const next = !showSecondaryCalendars;
              set({ showSecondaryCalendars: next });
              toast(
                next
                  ? "نمایش تاریخ قمری و میلادی در برنامه فعال شد"
                  : "تاریخ قمری و میلادی مخفی شد (محاسبه در موتور برنامه فعال است)",
              );
            }}
            className={`w-full rounded-2xl bg-[var(--sk-surface)] px-3.5 py-2.5 flex items-center justify-between gap-3 text-start border transition-all ${
              showSecondaryCalendars
                ? "border-[var(--sk-primary)]"
                : "border-[var(--sk-border-soft)]"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold">نمایش تاریخ قمری و میلادی</div>
              <div className="text-[10.5px] text-[var(--sk-text-muted)] truncate">
                نمایش در نمای جدولی، پنجرهٔ جزئیات روز و خروجی تصویر روز
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-black shrink-0 ${
                showSecondaryCalendars
                  ? "bg-[var(--sk-primary)] text-white"
                  : "bg-[var(--sk-surface-strong)] text-[var(--sk-text-muted)]"
              }`}
            >
              {showSecondaryCalendars ? "روشن" : "خاموش"}
            </span>
          </button>
        </div>
      </Section>

      {/* ============ Row 3 Right: 5. به‌روزرسانی و نصب برنامه ============ */}
      <Section
        icon={<DownloadIcon size={16} />}
        title="به‌روزرسانی و نصب برنامه"
        desc="نصب وب‌اپلیکیشن روی دستگاه، هماهنگ‌سازی آنلاین تقویم و مناسبت‌ها و دریافت مستقیم نسخه‌های نصبی."
      >
        <div className="flex flex-col gap-2.5 flex-1">
          {/* نسخهٔ نصب‌شده */}
          <div className="flex-1 rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] px-3.5 py-2.5 flex items-center gap-3">
            <ShiftKarAppEmblem size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-[var(--sk-text-muted)]">نسخهٔ فعلی برنامه</div>
              <div className="text-[13.5px] font-bold">
                {APP.name} {toPersianDigits(APP.version)}
              </div>
            </div>
          </div>

          {/* دکمهٔ نصب وب‌اپلیکیشن */}
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              onOpenInstall();
            }}
            className={`w-full flex-1 py-3 rounded-2xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              installed
                ? "bg-[var(--sk-rest-soft)] text-[var(--sk-rest-ink)] border border-[var(--sk-rest)]/30"
                : "bg-[var(--sk-primary)] text-white shadow-[0_10px_26px_-10px_var(--sk-glow-a)]"
            }`}
          >
            {installed ? <CheckIcon size={16} /> : <DownloadIcon size={16} />}
            <span>
              {installed ? "وب‌اپلیکیشن نصب شده است" : "نصب وب‌اپلیکیشن روی دستگاه"}
            </span>
          </button>

          {/* بروزرسانی تقویم و مناسبت‌ها */}
          <button
            type="button"
            onClick={handleSyncCalendar}
            disabled={syncingCal}
            className="w-full flex-1 rounded-2xl bg-[var(--sk-surface)] px-3.5 py-2.5 flex items-center gap-2.5 text-start active:scale-[0.99] disabled:opacity-60"
            style={{
              border: "1px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
            }}
          >
            <span className="size-[34px] rounded-[11px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center shrink-0">
              <CalendarIcon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold">
                {syncingCal
                  ? "در حال بررسی اصلاحیهٔ تقویم و مناسبت‌ها…"
                  : "به‌روزرسانی تقویم و مناسبت‌ها"}
              </div>
              <div className="text-[10.5px] text-[var(--sk-text-muted)] mt-0.5 truncate">
                نسخهٔ داده تقویم: {toPersianDigits(calStatus.syncVersion)} • آخرین به‌روزرسانی:{" "}
                {calStatus.updatedAt}
              </div>
            </div>
            <RefreshIcon
              size={15}
              className={`text-[var(--sk-primary)] shrink-0 ${syncingCal ? "animate-spin" : ""}`}
            />
          </button>

          {/* دانلود مستقیم از گیت‌هاب */}
          <a
            href="https://github.com/Alimosavi-Code/Shiftkar/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex-1 rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] px-3.5 py-2.5 flex items-center gap-2.5 text-start active:scale-[0.99]"
          >
            <span className="size-[34px] rounded-[11px] bg-[var(--sk-surface-strong)] text-[var(--sk-primary)] grid place-items-center shrink-0">
              <DownloadIcon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold">دانلود مستقیم از گیت‌هاب</div>
              <div className="text-[10.5px] text-[var(--sk-text-muted)] mt-0.5 truncate">
                دریافت آخرین فایل نصبی اندروید و دسکتاپ از مخزن رسمی
              </div>
            </div>
            <ExternalIcon size={15} className="text-[var(--sk-text-faint)] shrink-0" />
          </a>
        </div>
      </Section>

      {/* ============ Row 4 Right: 7. یادآور هوشمند شیفت و یادداشت‌ها ============ */}
      <Section
        icon={<CalendarIcon size={16} />}
        title="یادآور هوشمند شیفت و یادداشت‌ها"
        desc="اعلان خودکار پیش از شروع نوبت صبح‌کار و شب‌کار و یادآوری روزهایی که یادداشت شخصی دارند."
      >
        <div className="flex flex-col gap-2.5 flex-1">
          {/* Shift Reminder Toggle Row */}
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              const next = !shiftReminderOn;
              if (next) requestBrowserNotifPerm();
              set({ shiftReminderOn: next });
            }}
            className={`w-full flex-1 rounded-2xl bg-[var(--sk-surface)] px-3.5 py-3 flex items-center justify-between gap-3 text-start border transition-all ${
              shiftReminderOn
                ? "border-[var(--sk-primary)]"
                : "border-[var(--sk-border-soft)]"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold">یادآور شروع شیفت کاری</div>
              <div className="text-[11px] text-[var(--sk-text-muted)]">
                اعلان پیش از شروع نوبت صبح‌کار و شب‌کار
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-black shrink-0 ${
                shiftReminderOn
                  ? "bg-[var(--sk-primary)] text-white"
                  : "bg-[var(--sk-surface-strong)] text-[var(--sk-text-muted)]"
              }`}
            >
              {shiftReminderOn ? "روشن" : "خاموش"}
            </span>
          </button>

          {shiftReminderOn && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div
                className="rounded-2xl p-3 space-y-2"
                style={{
                  backgroundColor: "var(--sk-day-soft)",
                  border: "1px solid color-mix(in srgb, var(--sk-day-ink) 40%, transparent)",
                }}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="size-[28px] rounded-[8px] bg-[var(--sk-surface-strong)] text-[var(--sk-day-ink)] grid place-items-center shrink-0">
                      <SunIcon size={15} />
                    </span>
                    <div className="text-[11.5px] font-extrabold text-[var(--sk-day-ink)] truncate">
                      نوبت صبح‌کار
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-[8px] bg-[var(--sk-surface-strong)] text-[11px] font-black text-[var(--sk-day-ink)] shrink-0">
                    {toPersianDigits(dayReminderHour)}:۰۰
                  </span>
                </div>
                <input
                  type="range"
                  min={17}
                  max={23}
                  step={1}
                  value={dayReminderHour}
                  onChange={(e) => {
                    haptic(hapticOn);
                    set({ dayReminderHour: Number(e.target.value) });
                  }}
                  className="w-full accent-[var(--sk-day-ink)] cursor-pointer"
                />
              </div>

              <div
                className="rounded-2xl p-3 space-y-2"
                style={{
                  backgroundColor: "var(--sk-night-soft)",
                  border: "1px solid color-mix(in srgb, var(--sk-night-ink) 40%, transparent)",
                }}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="size-[28px] rounded-[8px] bg-[var(--sk-surface-strong)] text-[var(--sk-night-ink)] grid place-items-center shrink-0">
                      <MoonIcon size={15} />
                    </span>
                    <div className="text-[11.5px] font-extrabold text-[var(--sk-night-ink)] truncate">
                      نوبت شب‌کار
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-[8px] bg-[var(--sk-surface-strong)] text-[11px] font-black text-[var(--sk-night-ink)] shrink-0">
                    {toPersianDigits(nightReminderHour)}:۰۰
                  </span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={19}
                  step={1}
                  value={nightReminderHour}
                  onChange={(e) => {
                    haptic(hapticOn);
                    set({ nightReminderHour: Number(e.target.value) });
                  }}
                  className="w-full accent-[var(--sk-night-ink)] cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Note Reminder Toggle Row */}
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              const next = !noteReminderOn;
              if (next) requestBrowserNotifPerm();
              set({ noteReminderOn: next });
            }}
            className={`w-full flex-1 rounded-2xl bg-[var(--sk-surface)] px-3.5 py-3 flex items-center justify-between gap-3 text-start border transition-all ${
              noteReminderOn
                ? "border-[var(--sk-primary)]"
                : "border-[var(--sk-border-soft)]"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold">یادآور روزهای دارای یادداشت</div>
              <div className="text-[11px] text-[var(--sk-text-muted)]">
                ارسال اعلان ساعت ۰۸:۰۰ صبح در روزهایی که یادداشت دارند
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-black shrink-0 ${
                noteReminderOn
                  ? "bg-[var(--sk-primary)] text-white"
                  : "bg-[var(--sk-surface-strong)] text-[var(--sk-text-muted)]"
              }`}
            >
              {noteReminderOn ? "روشن" : "خاموش"}
            </span>
          </button>
        </div>
      </Section>

      {/* ============ Row 5 Right: 9. درباره ما ============ */}
      <Section icon={<InfoIcon size={16} />} title="درباره ما">
        <div className="flex flex-col justify-between flex-1 gap-3">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <ShiftKarAppEmblem size={56} />
              <div className="min-w-0">
                <div className="text-[15px] font-black">{APP.name}</div>
                <div className="text-[11.5px] text-[var(--sk-text-muted)]">
                  {APP.nameEn} — نسخهٔ {toPersianDigits(APP.version)}
                </div>
                <div className="text-[11px] text-[var(--sk-text-faint)]">{APP.tagline}</div>
              </div>
            </div>
            <div className="text-[12px] leading-6 text-[var(--sk-text-muted)] flex flex-col gap-2">
              <p>
                این نرم‌افزار برای سهولت در برنامه‌ریزی وقت کارکنان شیفت ۱۲ ساعته شاغل در شرکت پتروشیمی بندر امام خمینی (ره) می‌باشد.
              </p>
              <p>
                با تشکر و سپاس از تمامی همکاران و دوستانی که با پیشنهادات مفید خود ما را در پیشرفت برنامه یاری نموده‌اند.
              </p>
              <p>
                لطفاً انتقادات و پیشنهادات خود را از قسمت «راه‌های ارتباط با ما» در میان بگذارید.
              </p>
            </div>
          </div>
          <div className="pt-3 border-t border-[var(--sk-border-soft)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--sk-text-faint)]">تهیه شده توسط</span>
            <span className="text-[12px] font-bold">سید حسین موسوی سعیدی — واحد SBR</span>
          </div>
        </div>
      </Section>

      {/* ============ Row 5 Left: 10. راه‌های ارتباط با ما ============ */}
      <Section
        icon={<EitaaIcon size={16} />}
        title="راه‌های ارتباط با ما"
        desc="لطفاً انتقادات و پیشنهادات خود را از طریق کانال‌های ارتباطی زیر با ما در میان بگذارید."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 items-stretch" role="list">
          {CONTACTS.map((c, idx) => (
            <a
              key={c.id}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
              aria-label={c.fa}
              className={`group rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] hover:border-[var(--sk-primary)] px-3 py-2.5 flex items-center gap-2.5 transition-all active:scale-[0.99] ${
                idx === CONTACTS.length - 1 && CONTACTS.length % 2 === 1 ? "sm:col-span-2" : ""
              }`}
            >
              <span
                className="size-[38px] rounded-[12px] grid place-items-center shrink-0 transition-transform group-hover:scale-105"
                style={{
                  background: c.badgeBg,
                  border: `1px solid ${c.badgeBorder}`,
                  color: c.badgeInk,
                }}
              >
                {c.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-[var(--sk-text)] group-hover:text-[var(--sk-primary)] transition-colors truncate">
                  {c.fa}
                </div>
                <div className="text-[10.5px] text-[var(--sk-text-muted)] mt-0.5 truncate">
                  {c.sub}
                </div>
              </div>
              <span className="size-7 rounded-lg bg-[var(--sk-surface-strong)] border border-[var(--sk-border-soft)] grid place-items-center text-[var(--sk-text-faint)] group-hover:text-[var(--sk-primary)] transition-colors shrink-0">
                <ExternalIcon size={13} />
              </span>
            </a>
          ))}
        </div>
      </Section>

      {/* ============ Row 6 (Full Width on Desktop): 11. راهنما ============ */}
      <Section
        icon={<HelpIcon size={16} />}
        title="راهنمای جامع امکانات"
        desc="پاسخ به پرسش‌های متداول و توضیح کامل قابلیت‌های تقویم، مدیریت شیفت، لوحه و پشتیبان‌گیری."
        className="lg:col-span-2 !h-auto"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-6 divide-y lg:divide-y-0 divide-[var(--sk-border-soft)]">
          {HELP_ITEMS.map((h, idx) => {
            const open = openFaq === idx;
            /* Last TWO items = the bottom row of the 2-column desktop grid (one at the
             * bottom of each column) — they get no bottom separator, exactly like the
             * single-column mobile list where divide-y never underlines the last item. */
            const lastRow = idx >= HELP_ITEMS.length - 2;
            return (
              <div
                key={h.title}
                className={lastRow ? "lg:border-b-0" : "lg:border-b lg:border-[var(--sk-border-soft)]"}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : idx)}
                  aria-expanded={open}
                  className={`w-full py-3 text-[13px] font-bold text-start flex items-center justify-between gap-2 transition-colors ${
                    open ? "text-[var(--sk-primary)]" : "hover:text-[var(--sk-primary)]"
                  }`}
                >
                  <span>{h.title}</span>
                  <ChevronDown
                    size={15}
                    className={`text-[var(--sk-text-faint)] transition-transform shrink-0 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {open && (
                  <p className="pb-3 text-[12px] leading-6 text-[var(--sk-text-muted)] whitespace-pre-line">
                    {h.body}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ============ Row 6 Right (پیش از آخر): پشتیبان‌گیری و بازیابی یادداشت‌ها ============ */}
      <Section
        icon={<NotesIcon size={16} />}
        title="پشتیبان‌گیری و بازیابی یادداشت‌ها"
        desc="از یادداشت‌های شخصی، اضافه‌کاری‌ها، الگوهای سفارشی و فهرست همکاران فایل پشتیبان بسازید (کاملاً سازگار با اندروید و دسکتاپ)."
      >
        <div className="flex flex-col gap-2.5 flex-1">
          <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] px-3 py-3 space-y-2">
            <div className="text-[11.5px] font-bold text-[var(--sk-text-muted)]">
              اطلاعات آمادهٔ پشتیبان‌گیری در این دستگاه:
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  `${toPersianDigits(notesCount)} یادداشت`,
                  `${toPersianDigits(recordsCount)} ثبت اضافه‌کاری/جابه‌جایی`,
                  `${toPersianDigits(employees.length)} همکار`,
                ] as const
              ).map((badgeText) => (
                <div
                  key={badgeText}
                  className="rounded-xl bg-[var(--sk-primary-soft)] py-2 px-1.5 text-center text-[11px] font-black text-[var(--sk-primary)] truncate"
                  style={{
                    border: "1px solid color-mix(in srgb, var(--sk-primary) 35%, transparent)",
                  }}
                >
                  {badgeText}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={doExport}
              className="py-3 rounded-2xl bg-[var(--sk-primary)] text-white text-[12.5px] font-bold flex items-center justify-center gap-1.5 shadow-[0_10px_24px_-8px_var(--sk-glow-a)] active:scale-[0.98] transition-transform"
            >
              <DownloadIcon size={16} />
              <span>ذخیرهٔ پشتیبان</span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="py-3 rounded-2xl bg-[var(--sk-surface)] text-[var(--sk-primary)] text-[12.5px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              style={{
                border: "1px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
              }}
            >
              <RefreshIcon size={16} />
              <span>بازیابی از فایل</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="*/*,.json,application/json,text/plain"
              onChange={onFile}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={doCopyBackup}
              className="py-2.5 px-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] text-[11.5px] font-bold text-[var(--sk-text-muted)] hover:text-[var(--sk-primary)] transition-colors"
            >
              کپی متن پشتیبان
            </button>
            <button
              type="button"
              onClick={() => setPasteMode((v) => !v)}
              className="py-2.5 px-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border-soft)] text-[11.5px] font-bold text-[var(--sk-text-muted)] hover:text-[var(--sk-primary)] transition-colors"
            >
              {pasteMode ? "بستن کادر متن" : "بازیابی با الصاق متن"}
            </button>
          </div>

          {pasteMode && (
            <div className="space-y-2 pt-1">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={4}
                dir="ltr"
                placeholder={"{\n  \"app\": \"ShiftKar\",\n  \"notes\": [...]\n}"}
                className="w-full rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 text-[11.5px] font-mono focus:outline-none focus:border-[var(--sk-primary)]"
              />
              <button
                type="button"
                onClick={doRestoreFromText}
                className="w-full py-2.5 rounded-xl bg-[var(--sk-primary)] text-white text-[12px] font-bold"
              >
                اعمال و بازیابی متن پشتیبان
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* ============ Row 6 Left (آخرین بخش): راهنمای شروع ============ */}
      <Section
        icon={<RefreshIcon size={16} />}
        title="راهنمای شروع"
        desc="تور راهنمای برنامه را دوباره ببینید یا تنظیمات اولیهٔ نرم‌افزار را از نو شروع کنید."
      >
        {/* Two action rows (same visual language as the sync/GitHub rows above),
            vertically centered in the leftover height — no more stretched
            full-width pill buttons with a huge dead gap between them. */}
        <div className="flex flex-col justify-center gap-3 flex-1">
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              toast("تور راهنما در صفحهٔ تقویم اجرا می‌شود");
              onRestartTour();
            }}
            className="w-full rounded-2xl bg-[var(--sk-surface)] px-3.5 py-3 flex items-center gap-3 text-start active:scale-[0.99] transition-transform"
            style={{
              border: "1px solid color-mix(in srgb, var(--sk-primary) 45%, transparent)",
            }}
          >
            <span className="size-10 rounded-[12px] bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] grid place-items-center shrink-0">
              <InfoIcon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold">اجرای دوبارهٔ تور راهنمای برنامه</span>
              <span className="block text-[11px] text-[var(--sk-text-muted)] mt-0.5">
                مرور تعاملی امکانات اصلی روی صفحهٔ تقویم
              </span>
            </span>
            <ChevronDown
              size={16}
              className="text-[var(--sk-text-faint)] shrink-0 -rotate-90"
            />
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(hapticOn);
              toast("راهنمای خوش‌آمدگویی نمایش داده می‌شود؛ تنظیمات شما حفظ می‌شود");
              onRestartOnboarding();
            }}
            className="w-full rounded-2xl bg-[var(--sk-surface)] px-3.5 py-3 flex items-center gap-3 text-start active:scale-[0.99] transition-transform"
            style={{
              border: "1px solid color-mix(in srgb, var(--sk-holiday) 38%, transparent)",
            }}
          >
            <span className="size-10 rounded-[12px] bg-[var(--sk-holiday-soft)] text-[var(--sk-holiday)] grid place-items-center shrink-0">
              <SparkIcon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-[var(--sk-holiday)]">
                راه‌اندازی مجدد تنظیمات اولیهٔ نرم‌افزار
              </span>
              <span className="block text-[11px] text-[var(--sk-text-muted)] mt-0.5">
                اجرای دوبارهٔ راهنمای ۶ مرحله‌ای خوش‌آمدگویی؛ داده‌ها حفظ می‌شوند
              </span>
            </span>
            <ChevronDown
              size={16}
              className="text-[var(--sk-text-faint)] shrink-0 -rotate-90"
            />
          </button>
        </div>
      </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  desc,
  className = "",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`glass rounded-3xl p-4 md:p-5 flex flex-col ${className}`}>
      <h2 className="flex items-center gap-2 text-[14.5px] font-extrabold text-[var(--sk-primary)] shrink-0">
        {icon}
        {title}
      </h2>
      {desc && (
        <p className="text-[11.5px] text-[var(--sk-text-muted)] mt-1 mb-3 leading-5 shrink-0">{desc}</p>
      )}
      <div className={`flex-1 flex flex-col ${desc ? "" : "mt-3"}`}>{children}</div>
    </section>
  );
}
