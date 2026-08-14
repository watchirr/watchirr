import type { Metadata } from "next";
import { Instrument_Serif, Outfit } from "next/font/google";
import type { ReactNode } from "react";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US" className={`${serif.variable} ${sans.variable}`}>
      <body className={sans.className}>{children}</body>
    </html>
  );
}
