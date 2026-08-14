import type { Metadata } from "next";
import { Instrument_Serif, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import { currentLocale } from "@/lib/http";
import "./globals.css";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Watchirr",
  description: "Household Watchlist",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  return (
    <html lang={locale} className={`${serif.variable} ${sans.variable}`}>
      <body className={sans.className}>{children}</body>
    </html>
  );
}
