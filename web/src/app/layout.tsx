import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ラクリス",
  description: "lead-harvest console — B2B リード収集を UI から回す",
  // 実在企業の連絡先を含むため検索エンジンに載せない（C: URL=鍵）
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#c4532f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
