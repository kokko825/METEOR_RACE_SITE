import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "METEOR RACE — Blast Your Way to the Core",
  description: "メテオの爆風を操り、中央コアを目指す2人用戦略ボードゲーム。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
