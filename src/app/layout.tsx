import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

const fraunces = localFont({
  src: [{ path: "./fonts/Fraunces.ttf", style: "normal", weight: "100 900" }, { path: "./fonts/Fraunces-Italic.ttf", style: "italic", weight: "100 900" }],
  variable: "--font-fraunces", display: "swap",
});
const instrumentSans = localFont({ src: "./fonts/InstrumentSans.ttf", weight: "400 700", variable: "--font-instrument-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Maza Financeiro",
  description: "Módulo financeiro do grupo Maza.",
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
      className={`${fraunces.variable} ${instrumentSans.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
