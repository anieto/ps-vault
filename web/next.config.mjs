import createNextIntlPlugin from "next-intl/plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
