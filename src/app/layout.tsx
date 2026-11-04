import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthenticatedBottomNav } from "@/components/authenticated-bottom-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlatFlow — Shared expenses, in balance",
  description: "Manage flat meal wallets and shared household expenses with a clear, private ledger.",
  applicationName: "FlatFlow",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/flatflow-icon.svg", apple: "/flatflow-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AuthenticatedBottomNav />
      </body>
    </html>
  );
}
