import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const input = "public/ui/frame01.png";
const outDir = "public/ui/frame_9slice";
const prefix = "frame";


const DARK_T = 20;


const CENTER_FRAC = 0.35;

await fs.mkdir(outDir, { recursive: true });

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;

const cx0 = Math.floor(W * (0.5 - CENTER_FRAC));
const cx1 = Math.floor(W * (0.5 + CENTER_FRAC));
const cy0 = Math.floor(H * (0.5 - CENTER_FRAC));
const cy1 = Math.floor(H * (0.5 + CENTER_FRAC));

let minX = W, minY = H, maxX = -1, maxY = -1;
let found = 0;

for (let y = cy0; y < cy1; y++) {
  for (let x = cx0; x < cx1; x++) {
    const i = (y * W + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

    if (a === 0) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      found++;
      continue;
    }

    if (r <= DARK_T && g <= DARK_T && b <= DARK_T) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      found++;
    }
  }
}

if (found < 1000 || maxX < 0) {
  throw new Error("중앙 어두운 영역을 충분히 찾지 못했습니다. DARK_T 또는 CENTER_FRAC를 조정해보세요.");
}

const PAD = 2;
const x1 = Math.max(1, minX - PAD);
const x2 = Math.min(W - 1, maxX + 1 + PAD);
const y1 = Math.max(1, minY - PAD);
const y2 = Math.min(H - 1, maxY + 1 + PAD);

if (!(0 < x1 && x1 < x2 && x2 < W && 0 < y1 && y1 < y2 && y2 < H)) {
  throw new Error(`Invalid slice bounds for image ${W}x${H}: x1=${x1},x2=${x2},y1=${y1},y2=${y2}`);
}

console.log("Detected guides:", { W, H, x1, x2, y1, y2 });

const rects = {
  tl: { left: 0,  top: 0,  width: x1,      height: y1 },
  t:  { left: x1, top: 0,  width: x2-x1,   height: y1 },
  tr: { left: x2, top: 0,  width: W-x2,    height: y1 },

  l:  { left: 0,  top: y1, width: x1,      height: y2-y1 },
  c:  { left: x1, top: y1, width: x2-x1,   height: y2-y1 },
  r:  { left: x2, top: y1, width: W-x2,    height: y2-y1 },

  bl: { left: 0,  top: y2, width: x1,      height: H-y2 },
  b:  { left: x1, top: y2, width: x2-x1,   height: H-y2 },
  br: { left: x2, top: y2, width: W-x2,    height: H-y2 },
};

for (const [name, rect] of Object.entries(rects)) {
  const out = path.join(outDir, `${prefix}_${name}.png`);
  await sharp(input).ensureAlpha().extract(rect).png().toFile(out);
}

await fs.writeFile(
  path.join(outDir, `${prefix}_slices.json`),
  JSON.stringify({ input, size: { W, H }, guides: { x1, x2, y1, y2 } }, null, 2),
  "utf8"
);

console.log("wrote 9-slice tiles to", outDir);