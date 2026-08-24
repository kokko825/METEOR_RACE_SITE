import type { Metadata } from "next";
import { ASSET_PATHS } from "../config/asset-paths";
import "./globals.css";
import { SITE_URL } from "./site-url";

/**
 * The katakana reading leads the description on purpose: it is the term a
 * Japanese player is most likely to type, and the page's own visible copy is
 * almost entirely Latin, so the title and description are where that spelling
 * has to appear for Google to connect the query to this site.
 */
const DESCRIPTION =
  "「メテオレース」はメテオの爆風で相手を吹き飛ばし、中央のCOREを目指す2〜4人用のオンライン戦略ボードゲームです。7種類のアイテムを駆使したCPU対戦・オンライン対戦・ランク戦を、インストール不要・登録不要でブラウザからすぐに遊べます。";

const TITLE = "メテオレース | METEOR RACE";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | メテオレース | METEOR RACE",
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
    images: [{ url: ASSET_PATHS.branding.socialCard, width: 1200, height: 630, alt: "METEOR RACE の対戦画面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [ASSET_PATHS.branding.socialCard],
  },
  icons: {
    icon: ASSET_PATHS.branding.favicon,
    shortcut: ASSET_PATHS.branding.favicon,
  },
};

/**
 * Structured data so Google can classify the page as a game rather than a
 * generic document, which is what makes it eligible for game-style rich
 * results. Keep the facts here in sync with the actual feature set.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  // Google requires a software-app type alongside VideoGame for app rich results.
  "@type": ["VideoGame", "WebApplication"],
  name: "METEOR RACE",
  alternateName: "メテオレース",
  url: SITE_URL,
  description: DESCRIPTION,
  inLanguage: "ja",
  genre: ["Strategy", "Board Game", "Turn-Based Strategy"],
  gamePlatform: "Web Browser",
  browserRequirements: "Requires a modern browser with JavaScript enabled",
  applicationCategory: "GameApplication",
  operatingSystem: "Any (modern web browser)",
  playMode: ["SinglePlayer", "MultiPlayer"],
  numberOfPlayers: { "@type": "QuantitativeValue", minValue: 2, maxValue: 4 },
  image: `${SITE_URL}${ASSET_PATHS.branding.socialCard}`,
  screenshot: `${SITE_URL}${ASSET_PATHS.branding.socialCard}`,
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
