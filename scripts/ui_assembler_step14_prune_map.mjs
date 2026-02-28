import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const uiPath = path.join(ROOT, "src", "ui", "ui.ts");

function read(p) {
  return fs.readFileSync(p, "utf8");
}
function write(p, s) {
  fs.writeFileSync(p, s, "utf8");
}
function backupOnce(p, tag) {
  const bak = p + `.bak_${tag}`;
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, read(p), "utf8");
  return bak;
}

function findFunctionBlock(src, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\n)(export\s+)?function\s+${esc}\s*\(`);
  const m = re.exec(src);
  if (!m) return null;

  const start = m.index + (m[1] ? 1 : 0);
  const brace0 = src.indexOf("{", m.index);
  if (brace0 < 0) return null;

  let depth = 0;
  let i = brace0;
  let inStr = null;
  let escNext = false;

  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (escNext) escNext = false;
      else if (ch === "\\") escNext = true;
      else if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return { name, start, end: i + 1 };
      }
    }
    i++;
  }
  return null;
}

function removeRanges(src, ranges) {
  const rs = ranges
    .filter(Boolean)
    .sort((a, b) => b.start - a.start);
  let out = src;
  for (const r of rs) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out;
}

function main() {
  if (!fs.existsSync(uiPath)) {
    console.error("Missing:", uiPath);
    process.exit(1);
  }

  const bak = backupOnce(uiPath, "step14_prune_map");
  const before = read(uiPath);

  // Candidates: large map/graph helpers that should live in nodeSelectScreen / graphRuntime.
  const CANDIDATES = [
    "renderMapMiniGraph",
    "renderMapNodeSelect",
    "computeGraphLayout",
    "ensureNoDeadEnds",
    "makeDebugGraphMap",
    "visionParamsFromState",
    "visionParamsFromNode",
    "visionParamsFromStateOrNode",
    "visionParamsFromStateOrNodeOrDefaults",
    "ensureDepths",
    "ensureSeenMap",
    "updateSeenFromVision",
    "bfsDistances",
    "ensureGraphRuntime",
    "totalTimeOnMap",
    "maybeShiftTopology",
    "ensureBossSchedule",
    "dungeonToGraphLite",
    "addUndirectedEdge",
    "pushUniq",
    "sepSpan",
    "nodeLabelParts",
    "appendNodeLabel",
    "hash32",
    "seeded01",
    "clamp01",
    "clampInt",
  ];

  const blocks = CANDIDATES.map((n) => findFunctionBlock(before, n)).filter(Boolean);

  // First, compute what the file would look like if we removed ALL candidates.
  const allPruned = removeRanges(before, blocks);

  // Keep a block if its symbol is still referenced after pruning (meaning it's used elsewhere).
  const keep = new Set();
  for (const b of blocks) {
    const re = new RegExp(`\\b${b.name}\\b`);
    if (re.test(allPruned)) keep.add(b.name);
  }

  const toRemove = blocks.filter((b) => !keep.has(b.name));

  const after = removeRanges(before, toRemove)
    .replace(/\n{4,}/g, "\n\n\n"); // tame huge gaps

  if (after === before) {
    console.log("No changes (nothing prunable found). Backup:", path.basename(bak));
    return;
  }

  write(uiPath, after);

  console.log("Step14 prune-map complete.");
  console.log("Backup:", path.relative(ROOT, bak));
  console.log("Removed blocks:", toRemove.map((b) => b.name).join(", ") || "(none)");
  console.log("Kept (still referenced):", [...keep].join(", ") || "(none)");
  console.log("Size:", before.length, "->", after.length, "bytes");
  console.log("Next: npx tsc --noEmit");
}

main();
