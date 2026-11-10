import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `npm run build:static` -> plain HTML in ./out (drag onto any static host, e.g. Netlify Drop). Normal builds are unaffected.
  ...(process.env.STATIC_EXPORT ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
  // Pin the project root so a stray package-lock.json in a parent folder (e.g. C:\Users\<you>) is ignored.
  turbopack: { root: here },
  // Dev only: allow opening the dev server from other devices on the local network (tablets, phones) without blocking hot reload.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`), "*.local", ...(process.env.ALLOWED_DEV_ORIGINS ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((x) => x.trim()).filter(Boolean) : [])],
};
export default nextConfig;
