import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // assetPrefix makes the browser fetch _next/static chunks via the shell's
  // /financeiro/_next/* rewrite instead of hitting the shell's own /_next/*.
  assetPrefix: "/financeiro",
  // No deploy, páginas e APIs são consumidas pela rota canônica do shell.
  // Em desenvolvimento, string vazia preserva as chamadas locais em /api.
  env: {
    NEXT_PUBLIC_FINANCEIRO_URL:
      process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "/financeiro",
  },
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
