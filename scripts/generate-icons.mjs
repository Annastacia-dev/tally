// Generates Tally's logo, favicons and PWA icons from one design:
// four tally marks struck through, on Tally purple, with an outlined
// neo-brutalist look. Run with: node scripts/generate-icons.mjs
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

// sharp ships with Next.js, so no extra dependency is needed.
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

const C = { accent: "#7c5cff", edge: "#17142b", lime: "#d9f56b", pink: "#ffa6d5", bg: "#f6f4ff" };

// The marks, drawn in a 512 box around its centre. `s` scales them.
function marks(s = 1, { stroke = 12, barW = 38, gap = 24, barH = 210 } = {}) {
  const w = (4 * barW + 3 * gap) * s;
  const x0 = 256 - w / 2;
  const y0 = 256 - (barH * s) / 2;
  const bars = [0, 1, 2, 3]
    .map((i) => {
      const x = x0 + i * (barW + gap) * s;
      return `<rect x="${x}" y="${y0}" width="${barW * s}" height="${barH * s}" rx="${(barW * s) / 2}" fill="${C.lime}" stroke="${C.edge}" stroke-width="${stroke * s}"/>`;
    })
    .join("");
  const [x1, y1, x2, y2] = [x0 - 26 * s, 256 + 72 * s, x0 + w + 26 * s, 256 - 72 * s];
  const strike =
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.edge}" stroke-width="${54 * s}" stroke-linecap="round"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.pink}" stroke-width="${30 * s}" stroke-linecap="round"/>`;
  return bars + strike;
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;

// Full logo: tile with a hard offset shadow, like the cards on the site.
const logo = svg(
  `<rect x="58" y="58" width="420" height="420" rx="104" fill="${C.edge}"/>` +
    `<rect x="34" y="34" width="420" height="420" rx="104" fill="${C.accent}" stroke="${C.edge}" stroke-width="18"/>` +
    `<g transform="translate(-12 -12)">${marks(0.92)}</g>`,
);

// Favicon: no shadow, edge to edge, chunkier so it reads at 16 px.
const favicon = svg(
  `<rect x="8" y="8" width="496" height="496" rx="120" fill="${C.accent}" stroke="${C.edge}" stroke-width="16"/>` +
    marks(1.05, { stroke: 16, barW: 46, gap: 22, barH: 230 }),
);

// Maskable: full-bleed background, marks inside the 80% safe zone.
const maskable = svg(`<rect width="512" height="512" fill="${C.accent}"/>${marks(0.78)}`);

// Apple touch icon: iOS adds its own rounded corners and ignores transparency.
const apple = svg(`<rect width="512" height="512" fill="${C.accent}"/>${marks(0.9)}`);

// Notification badge: Android uses only the alpha channel, so plain white marks.
const badge = svg(
  [0, 1, 2, 3].map((i) => `<rect x="${136 + i * 64}" y="140" width="40" height="232" rx="20" fill="#fff"/>`).join("") +
    `<line x1="104" y1="336" x2="408" y2="176" stroke="#fff" stroke-width="40" stroke-linecap="round"/>`,
);

const png = (src, size) => sharp(Buffer.from(src), { density: 300 }).resize(size, size).png().toBuffer();

/** An .ico that holds PNG images, which every current browser accepts. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

await mkdir("public/icons", { recursive: true });
const out = {
  "public/logo.svg": logo,
  "src/app/icon.svg": favicon,
  "src/app/apple-icon.png": await png(apple, 180),
  "public/icons/icon-192.png": await png(logo, 192),
  "public/icons/icon-512.png": await png(logo, 512),
  "public/icons/maskable-512.png": await png(maskable, 512),
  "public/icons/badge-96.png": await png(badge, 96),
  "src/app/favicon.ico": ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(favicon, size) })))),
};
for (const [file, data] of Object.entries(out)) {
  await writeFile(file, data);
  console.log("wrote", file);
}
