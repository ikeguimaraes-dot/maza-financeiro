import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // assetPrefix makes the browser fetch _next/static chunks via the shell's
  // /financeiro/_next/* rewrite instead of hitting the shell's own /_next/*.
  assetPrefix: process.env.VERCEL ? "/financeiro" : undefined,
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
