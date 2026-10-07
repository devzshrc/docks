import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@docks/api"],
};

if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();

export default nextConfig;
