"use client";
/**
 * Systems view (`SystemsView`) — 100% parity with Android `SystemsScreen.kt` (v6.7.2)
 * + Responsive multi-column grid across phones (`grid-cols-2`), tablets (`sm:grid-cols-3`),
 *   and desktops (`lg:grid-cols-4`).
 */
import {
  ClinicIcon,
  CardIcon,
  SmartphoneIcon,
  ShieldIcon,
  FileIcon,
  BriefcaseIcon,
  ClipboardIcon,
  PlaneIcon,
  FoodIcon,
  ChartIcon,
  GlobeIcon,
  DownloadIcon,
  ExternalIcon,
  type P,
} from "./icons";

interface System {
  icon: (p: P) => React.ReactNode;
  fa: string;
  desc: string;
  href: string;
}

const SYSTEMS: System[] = [
  { icon: ClinicIcon, fa: "درمانگاه نفت", desc: "سامانه نوبت‌دهی درمانگاه", href: "https://nobat.piho.ir/" },
  { icon: CardIcon, fa: "پتروکارت", desc: "لیست طرف‌های قرارداد", href: "https://www.posc.ir/fa/petrocard" },
  { icon: SmartphoneIcon, fa: "پترو اپ", desc: "خدمات همراه پتروکارت", href: "https://petrocard.sabinarya.com/app" },
  { icon: ShieldIcon, fa: "بیمه البرز", desc: "خدمات آنلاین بیمه", href: "https://myalborz.yarhis.ir/simple" },
  { icon: FileIcon, fa: "خلاصه پرونده", desc: "مشاهده خلاصه پرونده", href: "https://portal.nioc.ir" },
  { icon: BriefcaseIcon, fa: "پرتال شرکت", desc: "پرتال پتروشیمی بندر امام", href: "https://bipc.ir/fa/" },
  { icon: ClipboardIcon, fa: "درخواست پرواز", desc: "سامانه درخواست پرواز", href: "https://travelrequest.bipc.ir/Guest/LoginPage.aspx" },
  { icon: PlaneIcon, fa: "برنامه پروازها", desc: "مشاهده برنامه پروازها", href: "https://www.posc.ir/fa/publicservices/mosaferat" },
  { icon: FoodIcon, fa: "رزرو غذا", desc: "سامانه رزرو غذا", href: "https://pooneh.bipc.ir/" },
  { icon: ChartIcon, fa: "سهام", desc: "سامانه سهام", href: "https://sahamfasl.bipc.ir/" },
  { icon: GlobeIcon, fa: "شیفت‌کار تحت وب", desc: "نسخه تحت وب نرم‌افزار", href: "https://shiftkar.ir" },
  { icon: DownloadIcon, fa: "شیفت‌کار موبایل", desc: "دانلود نسخه موبایل", href: "https://shiftkar.ir/download" },
];

export function SystemsView() {
  return (
    <div className="h-full overflow-y-auto sk-scroll overscroll-contain px-4 md:px-6 pt-3.5 pb-[calc(env(safe-area-inset-bottom)+104px)]">
      <div className="mb-4">
        <h1 className="text-[22px] md:text-[24px] font-black">سامانه‌ها</h1>
        <p className="text-[13px] text-[var(--sk-text-muted)] mt-1">
          دسترسی سریع به پرتال‌ها و سامانه‌های پرکاربرد کاری
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        {SYSTEMS.map((s, i) => (
          <a
            key={s.fa}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="sk-rise glass rounded-3xl p-4 flex flex-col gap-3 hover:border-[var(--sk-primary)] active:scale-[0.98] transition-all"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <div className="flex items-start justify-between">
              <span className="size-11 rounded-[14px] grid place-items-center bg-[var(--sk-primary-soft)] text-[var(--sk-primary)] shadow-[inset_0_1px_0_var(--sk-specular)]">
                <s.icon size={21} />
              </span>
              <ExternalIcon size={15} className="text-[var(--sk-text-faint)]" />
            </div>
            <div>
              <div className="text-[14px] font-bold">{s.fa}</div>
              <div className="text-[11.5px] text-[var(--sk-text-muted)] mt-0.5 leading-5">
                {s.desc}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
