import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const requiredAssets = [
  "public/favicon.ico",
  "public/site.webmanifest",
  ...[16,32,48,180,192,512].map((size) => `public/assets/branding/icons/icon-${size}.png`),
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

for (const size of [16,32,48,180,192,512]) {
  const bytes = await readFile(`public/assets/branding/icons/icon-${size}.png`);
  if (bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) throw new Error(`Invalid icon size: ${size}`);
}
const ico = await readFile("public/favicon.ico");
if (ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) !== 3) throw new Error("Invalid ICO directory");
const manifest = JSON.parse(await readFile("public/site.webmanifest", "utf8"));
for (const icon of manifest.icons) await access(resolve(`public${icon.src}`));

const forbiddenRootAssets = ["favicon.svg", "og-image.jpg", "file.svg", "globe.svg", "window.svg"];
const publicEntries = await readdir(resolve("public"));
const leftovers = forbiddenRootAssets.filter((name) => publicEntries.includes(name));
if (leftovers.length) throw new Error(`public直下に未整理の素材があります: ${leftovers.join(", ")}`);

console.log(`assets: ${requiredAssets.length} required files verified`);
