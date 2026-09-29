import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { THEME } from "@/lib/config";

// Placeholder icons (§7.1) until there's a real name: accent square with a
// plain "plate". Re-run after changing THEME.accent: `pnpm gen-icons`.

function svg(size: number, plateScale: number, rounded: boolean): string {
  const r = (size / 2) * plateScale;
  const c = size / 2;
  const corner = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${corner}" fill="${THEME.accent}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="#ffffff"/>
  <circle cx="${c}" cy="${c}" r="${r * 0.62}" fill="none" stroke="${THEME.accent}" stroke-width="${size * 0.02}" opacity="0.35"/>
</svg>`;
}

async function png(out: string, size: number, plateScale: number, rounded = false) {
  await sharp(Buffer.from(svg(size, plateScale, rounded))).png().toFile(out);
  console.log(`wrote ${out}`);
}

async function main() {
  await mkdir("public/icons", { recursive: true });
  // Square corners: iOS and Android apply their own masks.
  await png("public/icons/icon-192.png", 192, 0.62);
  await png("public/icons/icon-512.png", 512, 0.62);
  // Maskable: plate inside the central 80% safe zone.
  await png("public/icons/icon-maskable-512.png", 512, 0.5);
  // Next.js file conventions: <link rel="apple-touch-icon"> and favicon.
  await png("app/apple-icon.png", 180, 0.62);
  await png("app/icon.png", 64, 0.62, true);
}

main();
