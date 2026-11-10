import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

/* GitHub Pages project sites serve the app under /<repo>/ (set by the deploy
 * workflow); the published space and user-site repos use "". */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "شیفت‌کار وب | ShiftKar",
  description:
    "تقویم هوشمند شیفت کاری — محاسبه خودکار شیفت‌های صبح‌کار، عصرکار، شب‌کار و استراحت، همراه با تقویم شمسی و قمری، تعطیلات رسمی و یادداشت‌های شخصی",
  applicationName: "شیفت‌کار وب",
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    title: "شیفت‌کار وب",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: `${BASE_PATH}/favicon.ico?v=676`, sizes: "any" },
      { url: `${BASE_PATH}/assets/icon-192.png?v=676`, sizes: "192x192", type: "image/png" },
      { url: `${BASE_PATH}/assets/icon-512.png?v=676`, sizes: "512x512", type: "image/png" },
    ],
    shortcut: `${BASE_PATH}/favicon.ico?v=676`,
    apple: `${BASE_PATH}/assets/apple-touch-icon.png?v=676`,
  },
  other: {
    "color-scheme": "dark light",
    "darkreader-lock": "true",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090f1d" },
    { media: "(prefers-color-scheme: light)", color: "#f2f5fc" },
  ],
};

const FONT_FACE_CSS = `
@font-face {
  font-family: "IRANSansX";
  src: url("${BASE_PATH}/fonts/IRANSansX-Regular.woff2") format("woff2"), url("/fonts/IRANSansX-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "IRANSansX";
  src: url("${BASE_PATH}/fonts/IRANSansX-Medium.woff2") format("woff2"), url("/fonts/IRANSansX-Medium.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "IRANSansX";
  src: url("${BASE_PATH}/fonts/IRANSansX-DemiBold.woff2") format("woff2"), url("/fonts/IRANSansX-DemiBold.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "IRANSansX";
  src: url("${BASE_PATH}/fonts/IRANSansX-Bold.woff2") format("woff2"), url("/fonts/IRANSansX-Bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "IRANSansX";
  src: url("${BASE_PATH}/fonts/IRANSansX-ExtraBold.woff2") format("woff2"), url("/fonts/IRANSansX-ExtraBold.woff2") format("woff2");
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "IRANSansX";
  src: url("${BASE_PATH}/fonts/IRANSansX-Black.woff2") format("woff2"), url("/fonts/IRANSansX-Black.woff2") format("woff2");
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}
`;

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var raw = localStorage.getItem("shiftkar-prefs-v3");
    var theme = "blue";
    var mode = "system";
    if (raw) {
      var parsed = JSON.parse(raw);
      var st = parsed && parsed.state ? parsed.state : parsed;
      if (st && st.theme) theme = st.theme;
      if (st && st.themeMode) mode = st.themeMode;
    }
    var root = document.documentElement;
    root.setAttribute("data-theme", theme);
    var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = mode === "dark" || (mode === "system" && sysDark);
    root.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" data-theme="blue" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href={`${BASE_PATH}/fonts/IRANSansX-Regular.woff2`}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={`${BASE_PATH}/fonts/IRANSansX-Bold.woff2`}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={`${BASE_PATH}/fonts/IRANSansX-Black.woff2`}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <style dangerouslySetInnerHTML={{ __html: FONT_FACE_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased h-dvh overflow-hidden font-sans">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
