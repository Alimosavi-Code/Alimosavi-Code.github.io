# شیفت‌کار وب 🗓️

اپلیکیشن مدیریت شیوه‌های کاری (شیفت‌ها) با تقویم جلالی — به‌صورت PWA، فارسی و کاملاً راست‌به‌چپ.

نصبش کن روی گوشی، آفلاین کار کن، شیفت‌هات همیشه دم دستت باشد.

## امکانات

- 📅 **تقویم جلالی** با نمایش ماهانه و ناوبری روان بین ماه‌ها و سال‌ها
- 🔄 **پشتیبانی از چند سیستم شیفت** (چند شیفت هم‌زمان با الگوهای چرخشی)
- 📝 **یادداشت روزانه و ماهانه** برای هر تاریخ
- 🌓 **حالت تاریک و روشن** با پشتیبانی از حالت سیستمی + سازگاری با افزونه‌های Dark Reader و مرورگرهای سامسونگ/شیائومی
- 📲 **PWA کامل**: قابل نصب روی اندروید/iOS، اجرای آفلاین با Service Worker
- 🎯 **آنبوردینگ و تور راهنما** برای شروع سریع

## اجرای محلی

```bash
bun install        # یا npm install
npm run dev
```

سپس `http://localhost:3000` را باز کنید.

## انتشار روی GitHub Pages

این پروژه آمادهٔ انتشار استاتیک روی GitHub Pages است — workflow خودکار در `.github/workflows/deploy-pages.yml` قرار دارد و روی هر push به `main` بیلد و منتشر می‌کند.

راهنمای کامل فارسی: [GITHUB-PAGES.fa.md](./GITHUB-PAGES.fa.md)

```bash
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
# سپس: Settings → Pages → Source: GitHub Actions
```

آدرس نهایی: `https://<USERNAME>.github.io/<REPO>/`

## نکات فنی

- **Next.js 16 + React 19 + Tailwind v4** — بیلد پیش‌فرض `standalone` برای سرور؛ بیلد استاتیک فقط با `NEXT_EXPORT=1` (اسکریپت `npm run build:gh`)
- **ذخیره‌سازی**: تنظیمات و شیفت‌ها در `localStorage` دستگاه؛ یادداشت‌ها روی سرور با API ذخیره می‌شوند و در حالت استاتیک (Pages) خودکار به `localStorage` برمی‌گردند (`src/lib/notes-store.ts`)
- **آفلاین**: Service Worker با precache و fallback آفلاین؛ مسیر (basePath) به‌صورت خودکار از scope محاسبه می‌شود
- **مانیفست**: آدرس‌های مانیفست مطلق‌اند و workflow هنگام انتشار، دامنه را به دامنهٔ Pages بازنویسی می‌کند
