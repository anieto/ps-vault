import createNextIntlPlugin from "next-intl/plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' required for Next.js hydration scripts and the inline theme toggle.
      // 'wasm-unsafe-eval' required for libsodium and argon2-browser WASM modules.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      // API calls go through the /api/ rewrite — same origin only.
      "connect-src 'self'",
      "font-src 'self'",
      // Prevent plugin-based (Flash, etc.) code execution.
      "object-src 'none'",
      // Prevent <base> tag injection which can redirect relative URLs.
      "base-uri 'self'",
      // Prevent this app from being embedded in a frame (clickjacking).
      "frame-ancestors 'none'",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://api:8080"}/api/:path*`,
      },
    ];
  },
  webpack(config) {
    // libsodium-wrappers ESM build references a WASM side-file webpack can't resolve.
    // Use an absolute path to the CJS build — this bypasses the package exports field.
    config.resolve.alias = {
      ...config.resolve.alias,
      "libsodium-wrappers": path.resolve(
        __dirname,
        "node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js"
      ),
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
