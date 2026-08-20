import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "./site-url";

/**
 * The katakana reading leads the description on purpose: it is the term a
 * Japanese player is most likely to type, and the page's own visible copy is
 * almost entirely Latin, so the title and description are where that spelling
 * has to appear for Google to connect the query to this site.
 */
const DESCRIPTION =
  "「メテオレース」はメテオの爆風で相手を吹き飛ばし、中央のCOREを目指す2〜4人用のオンライン戦略ボードゲーム。7種類のアイテムを駆使したCPU対戦・オンライン対戦・ランク戦が、インストール不要・登録不要・無料でブラウザからすぐ遊べます。";

const TITLE = "METEOR RACE（メテオレース） — 無料ブラウザ戦略ボードゲーム";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | METEOR RACE",
  },
  description: DESCRIPTION,
  applicationName: "METEOR RACE",
  keywords: [
    "METEOR RACE",
    "メテオレース",
    "ボードゲーム",
    "戦略ゲーム",
    "ブラウザゲーム",
    "オンライン対戦",
    "無料ゲーム",
    "CPU対戦",
    "ターン制",
    "陣取りゲーム",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: SITE_URL,
    siteName: "METEOR RACE",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "METEOR RACE の対戦画面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

/**
 * Structured data so Google can classify the page as a game rather than a
 * generic document, which is what makes it eligible for game-style rich
 * results. Keep the facts here in sync with the actual feature set.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "METEOR RACE",
  alternateName: "メテオレース",
  url: SITE_URL,
  description: DESCRIPTION,
  inLanguage: "ja",
  genre: ["Strategy", "Board Game", "Turn-Based Strategy"],
  gamePlatform: "Web Browser",
  applicationCategory: "GameApplication",
  operatingSystem: "Any (modern web browser)",
  playMode: ["SinglePlayer", "MultiPlayer"],
  numberOfPlayers: { "@type": "QuantitativeValue", minValue: 2, maxValue: 4 },
  image: `${SITE_URL}/og-image.jpg`,
  screenshot: `${SITE_URL}/og-image.jpg`,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "JPY",
    availability: "https://schema.org/InStock",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <script
          type="application/ld+json"
          // Serialized from a local literal, never from user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
