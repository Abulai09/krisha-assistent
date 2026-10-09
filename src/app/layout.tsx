import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { DataRealmBanner } from "@/components/data-realm-banner";
import { SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Almaty Deal Finder", template: "%s — Almaty Deal Finder" },
  description: "Поиск потенциально недооценённых квартир в Алматы по сопоставимым объявлениям.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <SiteHeader />
          <Suspense fallback={null}>
            <DataRealmBanner />
          </Suspense>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">{children}</main>
          <footer className="border-t">
            <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground">
              Оценки основаны на ценах предложения и носят информационный характер. Это не инвестиционная рекомендация и
              не гарантия выгодной сделки.
            </div>
          </footer>
        </TooltipProvider>
      </body>
    </html>
  );
}
