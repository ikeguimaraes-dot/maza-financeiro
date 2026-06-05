import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // assetPrefix only needed when running behind the kph-os shell proxy.
  assetPrefix: process.env.VERCEL ? "/financeiro" : undefined,
  // Prevent Next.js from bundling these Node-native packages — they must run
  // in the Node.js runtime, not be statically analyzed / edge-bundled.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
