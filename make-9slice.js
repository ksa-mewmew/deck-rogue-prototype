import sharp from "sharp";
import fs from "node:fs";

const out = "public/ui/badge_9slice.png";

const tiles = [
  "public/ui/badge_tl.png", "public/ui/badge_t.png", "public/ui/badge_tr.png",
  "public/ui/badge_l.png",  "public/ui/badge_c.png", "public/ui/badge_r.png",
  "public/ui/badge_bl.png", "public/ui/badge_b.png", "public/ui/badge_br.png",
];

const imgs = await Promise.all(tiles.map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
const w = imgs[0].info.width, h = imgs[0].info.height;

const canvas = sharp({
  create: { width: w * 3, height: h * 3, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
});

const composites = imgs.map((im, i) => ({
  input: Buffer.from(im.data),
  raw: { width: w, height: h, channels: 4 },
  left: (i % 3) * w,
  top: Math.floor(i / 3) * h,
}));

await canvas.composite(composites).png().toFile(out);
console.log("wrote", out);