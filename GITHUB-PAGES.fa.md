# انتشار شیفت‌کار وب روی GitHub Pages

## خلاصه

بله — نسخهٔ وب کاملاً روی GitHub Pages بالا می‌آید. دو شرط دارد که هر دو آماده شده‌اند:

1. **بیلد استاتیک**: GitHub Pages فقط فایل استاتیک سرو می‌کند (سرور Node ندارد). با `NEXT_EXPORT=1` خروجی استاتیک می‌گیریم.
2. **یادداشت‌ها**: روی space-z یادداشت‌ها با API + دیتابیس ذخیره می‌شوند؛ روی GitHub Pages سرور و دیتابیس وجود ندارد، پس اپ به‌صورت خودکار به `localStorage` گوشی برمی‌گردد (هم‌سطح بقیهٔ داده‌های اپ). هیچ چیزی گم نمی‌شود؛ فقط ذخیرهٔ یادداشت‌ها روی همان دستگاه می‌ماند.

---

## شرایط

| شرط | توضیح |
|---|---|
| ریپوی عمومی (Public) | Pages در ریپوی خصوصی فقط با حساب Pro کار می‌کند |
| فعال‌سازی Pages | Settings → Pages → **Build and deployment → Source: GitHub Actions** (فقط یک بار) |
| bun | workflow خودش bun را نصب می‌کند (`bun.lock` موجود است) |
| HTTPS | `github.io` خودش HTTPS دارد → PWA همان‌جا هم قابل نصب است |

## مراحل

```bash
# ۱) پروژه را به ریپوی گیت‌هاب خودتان پوش کنید
git init
git add -A
git commit -m "ShiftKar Web"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main

# ۲) در گیت‌هاب: Settings → Pages → Source را روی «GitHub Actions» بگذارید
# ۳) تمام! پوش بعدی، workflow خودش بیلد و انتشار می‌دهد
```

آدرس نهایی: `https://<USERNAME>.github.io/<REPO>/`
(اگر اسم ریپو را `<USERNAME>.github.io` بگذارید، مستقیم روی `https://<USERNAME>.github.io/` منتشر می‌شود — workflow خودش تشخیص می‌دهد و basePath را خالی می‌گذارد.)

## workflow چه کارهایی می‌کند؟

`.github/workflows/deploy-pages.yml` روی هر push به `main` (یا دستی از تب Actions) اجرا می‌شود:

1. `bun install` با lockfile قفل‌شده
2. تشخیص خودکار basePath (`/repo` یا ریشه)
3. حذف `src/app/api` از بیلد استاتیک (سرور روی Pages وجود ندارد؛ اپ fallback دارد)
4. بازنویسی آدرس‌های مانیفست از `https://shiftkar.ir` به دامنهٔ Pages (تا اعتبارسنجی Chrome همان‌جا هم پاس شود)
5. `NEXT_EXPORT=1 next build` → پوشهٔ `out/` + فایل `.nojekyll` (لازم است وگرنه گیت‌هاب پوشهٔ `_next` را نادیده می‌گیرد)
6. انتشار با artifacts رسمی Pages

## تست محلی (اختیاری)

```bash
# شبیه‌سازی بیلد GitHub Pages با basePath فرضی
NEXT_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/my-repo bun run build:gh
npx serve out        # یا هر سرور استاتیک
```

بیلد استاتیک در `.next-gh` انجام می‌شود و کاری با بیلد اصلی (`.next`) ندارد.

## نکات مهم

- **دو استقرار = دو PWA جدا**: هویت PWA به دامنه وابسته است؛ اگر هر دو را نصب کنید، دو آیکون جدا خواهند داشت.
- **داده‌ها بین دو دامنه جابه‌جا نمی‌شوند**: تنظیمات/یادداشت‌های ذخیره‌شده در `localStorage` (و دیتابیس یادداشت‌های space-z) به github.io منتقل نمی‌شوند؛ هر نصب از صفر شروع می‌کند.
- **آفلاین**: service worker روی هر دو دامنه فعال است (scope خودکار از مسیر استقرار محاسبه می‌شود).
- **بیلد پیش‌فرض دست‌نخورده است**: `npm run build` / `npm start` مخصوص space-z همان قبلی است؛ حالت export فقط با `NEXT_EXPORT=1` فعال می‌شود.
