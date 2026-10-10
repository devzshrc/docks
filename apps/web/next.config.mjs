import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@docks/api"],
  // Required for the PostHog reverse proxy below to match trailing-slash calls.
  skipTrailingSlashRedirect: true,
  // Proxy PostHog ingest through our own origin so ad blockers don't eat events.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};

if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();

export default nextConfig;
