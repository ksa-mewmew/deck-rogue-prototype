import sharp from "sharp";

const out = "public/ui/badge_9slice.png";

const tiles = [
  "public/ui/badge_tl.png", "public/ui/badge_t.png", "public/ui/badge_tr.png",
  "public/ui/badge_l.png",  "public/ui/badge_c.png", "public/ui/badge_r.png",
  "public/ui/badge_bl.png", "public/ui/badge_b.png", "public/ui/badge_br.png",
];

// 첫 타일 크기 가져오기
const meta = await sharp(tiles[0]).metadata();
const w = meta.width;
const h = meta.height;

const canvas = sharp({
  create: {
    width: w * 3,
    height: h * 3,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }
});

const composites = tiles.map((path, i) => ({
  input: path,
  left: (i % 3) * w,
  top: Math.floor(i / 3) * h,
}));

await canvas
  .composite(composites)
  .png()
  .toFile(out);

console.log("wrote", out);