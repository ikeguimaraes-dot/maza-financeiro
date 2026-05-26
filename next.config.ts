import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // assetPrefix only needed when running behind the kph-os shell proxy.
  assetPrefix: process.env.VERCEL ? "/financeiro" : undefined,
};

export default nextConfig;
