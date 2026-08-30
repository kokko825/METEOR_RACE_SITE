import { access, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const requiredAssets = [
  "public/assets/branding/meteor-race-favicon.svg",
  "public/assets/branding/meteor-race-social-card.jpg",
  "public/assets/branding/METEOR_RACE_logo.svg",
  "public/assets/branding/METEOR_RACE_txt.svg",
  "public/assets/fonts/geist-sans.woff2",
  "public/assets/fonts/geist-mono.woff2",
  "public/assets/images/items/item-preview-board.jpg",
  "public/assets/audio/README.md",
];

await Promise.all(requiredAssets.map((path) => access(resolve(path))));

const forbiddenRootAssets = ["favicon.svg", "og-image.jpg", "file.svg", "globe.svg", "window.svg"];
const publicEntries = await readdir(resolve("public"));
const leftovers = forbiddenRootAssets.filter((name) => publicEntries.includes(name));
if (leftovers.length) throw new Error(`public直下に未整理の素材があります: ${leftovers.join(", ")}`);

console.log(`assets: ${requiredAssets.length} required files verified`);
