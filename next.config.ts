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
  // PDF.js resolves its worker relative to its installed package. Keeping these
  // dependencies external prevents Turbopack from rewriting that path into a
  // non-existent .next/server/chunks/pdf.worker.mjs in development.
  serverExternalPackages: ["@anthropic-ai/sdk", "@napi-rs/canvas", "pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
