import type { Metadata } from "next";
import { Instrument_Serif, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "./toast-host";
import { currentLocale } from "@/lib/http";
import { messages } from "@/lib/locale";
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
  const t = messages[locale];
  return (
    <html lang={locale} className={`${serif.variable} ${sans.variable}`}>
      <body className={sans.className}>
        <ToastProvider regionLabel={t.toastRegion} dismissLabel={t.toastDismiss}>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
