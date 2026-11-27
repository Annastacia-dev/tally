import type { NextConfig } from "next";

// Serve under a sub-path, e.g. "/tally" for www.annastacia.dev/tally. The
// site at the root rewrites /tally/* to this app (Next.js multi-zones).
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

// Server actions check the Origin header. Behind another site's rewrite the
// browser's origin is that site, so allow the public URL's host.
const publicHost = (() => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  // pdfkit reads its font files from disk at runtime, so keep it out of the bundle.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb", ...(publicHost ? { allowedOrigins: [publicHost] } : {}) },
  },
  // From the Next.js PWA guide: basic hardening, and a service worker that
  // is never cached so updates reach users straight away.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
