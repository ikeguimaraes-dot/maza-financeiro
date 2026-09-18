import type { NextConfig } from "next";

// A deployment with empty Auth settings builds successfully but rejects every
// session. Fail before publishing instead of turning a configuration error into 401s.
if (process.env.VERCEL_ENV === "production") {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Configuração de produção ausente: ${missing.join(", ")}`);
}

const nextConfig: NextConfig = {
  // assetPrefix makes the browser fetch _next/static chunks via the shell's
  // /financeiro/_next/* rewrite instead of hitting the shell's own /_next/*.
  assetPrefix: "/financeiro",
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
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
