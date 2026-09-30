import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

const geist = localFont({ src: "./fonts/Geist.woff2", weight: "100 900", variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "Maza Financeiro",
  description: "Módulo financeiro do grupo Maza.",
  icons: {
    icon: [{ url: "/financeiro/brand/phi-icon.png", type: "image/png", sizes: "64x64" }],
    shortcut: "/financeiro/brand/phi-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geist.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
