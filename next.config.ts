import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // basePath mounts all routes under /financeiro so the kph-os shell rewrite
  // to kph-os-financeiro.vercel.app/financeiro/:path* resolves correctly.
  basePath: "/financeiro",
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
