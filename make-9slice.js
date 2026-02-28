import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const PARTS = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];
const PART_SET = new Set(PARTS);
const ROOT = process.argv[2] ?? "public/assets";

function walkPngFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const ents = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of ents) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile() && /\.png$/i.test(ent.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

function collectNineSliceGroups(rootDir) {
  const files = walkPngFiles(rootDir);
  const groups = new Map();

  for (const filePath of files) {
    const dir = path.dirname(filePath);
    const name = path.basename(filePath);
    const m = name.match(/^(.*)_(tl|t|tr|l|c|r|bl|b|br)\.png$/i);
    if (!m) continue;

    const base = m[1];
    const part = m[2].toLowerCase();
    if (!PART_SET.has(part)) continue;

    const key = `${dir}::${base}`;
    let g = groups.get(key);
    if (!g) {
      g = { dir, base, parts: {} };
      groups.set(key, g);
    }
    g.parts[part] = filePath;
  }

  return Array.from(groups.values());
}

async function buildNineSliceImage(group) {
  const missing = PARTS.filter((p) => !group.parts[p]);
  if (missing.length > 0) return { ok: false, reason: `missing parts: ${missing.join(", ")}` };

  const tiles = PARTS.map((p) => group.parts[p]);
  const imgs = await Promise.all(
    tiles.map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true }))
  );

  const colW = [
    Math.max(imgs[0].info.width, imgs[3].info.width, imgs[6].info.width),
    Math.max(imgs[1].info.width, imgs[4].info.width, imgs[7].info.width),
    Math.max(imgs[2].info.width, imgs[5].info.width, imgs[8].info.width),
  ];
  const rowH = [
    Math.max(imgs[0].info.height, imgs[1].info.height, imgs[2].info.height),
    Math.max(imgs[3].info.height, imgs[4].info.height, imgs[5].info.height),
    Math.max(imgs[6].info.height, imgs[7].info.height, imgs[8].info.height),
  ];

  const canvasW = colW[0] + colW[1] + colW[2];
  const canvasH = rowH[0] + rowH[1] + rowH[2];

  const canvas = sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const colX = [0, colW[0], colW[0] + colW[1]];
  const rowY = [0, rowH[0], rowH[0] + rowH[1]];

  const composites = imgs.map((im, i) => ({
    input: Buffer.from(im.data),
    raw: { width: im.info.width, height: im.info.height, channels: 4 },
    left: colX[i % 3],
    top: rowY[Math.floor(i / 3)],
  }));

  const outPath = path.join(group.dir, `${group.base}_9slice.png`);
  await canvas.composite(composites).png().toFile(outPath);
  return { ok: true, outPath };
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`[9slice] root not found: ${ROOT}`);
    process.exit(1);
  }

  const groups = collectNineSliceGroups(ROOT);
  if (groups.length === 0) {
    console.log(`[9slice] no 9-slice groups found under: ${ROOT}`);
    return;
  }

  let okCount = 0;
  let skipCount = 0;
  for (const g of groups) {
    const result = await buildNineSliceImage(g);
    if (result.ok) {
      okCount += 1;
      console.log(`[9slice] wrote ${result.outPath}`);
    } else {
      skipCount += 1;
      console.warn(`[9slice] skipped ${path.join(g.dir, g.base)} (${result.reason})`);
    }
  }

  console.log(`[9slice] done: ${okCount} written, ${skipCount} skipped`);
}

await main();