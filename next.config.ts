import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport
    ? { trailingSlash: true, images: { unoptimized: true } }
    : {
        async rewrites() {
          return [
            { source: "/download", destination: "/download/index.html" },
            { source: "/download/", destination: "/download/index.html" },
          ];
        },
      }),
  typescript: {
    /* tsc --noEmit is clean now — let the build fail fast on type regressions
     * (this is how bugs like the empty CONTACTS card slipped through before). */
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  devIndicators: false,
};

export default nextConfig;
