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
}

function findBlockByAnchor(src, anchor, endFuncName) {
  const start = src.indexOf(anchor);
  if (start < 0) return null;

  const re = new RegExp(`\\bfunction\\s+${endFuncName}\\s*\\(`);
  const m = re.exec(src.slice(start));
  if (!m) return null;

  const fnPos = start + m.index;
  const brace0 = src.indexOf("{", fnPos);
  if (brace0 < 0) return null;

  let depth = 0;
  for (let i = brace0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

function findFunctionBlock(src, name) {
  const re = new RegExp(`\\bfunction\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;

  const start = m.index;
  const brace0 = src.indexOf("{", start);
  if (brace0 < 0) return null;

  let depth = 0;
  for (let i = brace0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

function removeRanges(src, ranges) {
  const rs = ranges.filter(Boolean).sort((a, b) => b.start - a.start);
  let out = src;
  for (const r of rs) out = out.slice(0, r.start) + out.slice(r.end);
  return out;
}

function removeGraphRuntimeImportIfUnused(src) {
  const re = /import\s*\{[^}]*\}\s*from\s*["']\.\/map\/graphRuntime["'];?\s*\n/;
  const m = re.exec(src);
  if (!m) return src;

  const uses = [
    "ensureGraphRuntimeRt",
    "maybeShiftTopologyRt",
    "totalTimeOnMapRt",
    "ensureBossScheduleRt",
  ].some((n) => new RegExp(`\\b${n}\\b`).test(src));

  if (uses) return src;
  return src.slice(0, m.index) + src.slice(m.index + m[0].length);
}

function pruneTypeImportNames(src, modPath, names) {
  const re = new RegExp(`import\\s+type\\s*\\{([^}]*)\\}\\s*from\\s*["']${modPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'];?`);
  const m = re.exec(src);
  if (!m) return src;

  const inside = m[1];
  const parts = inside.split(",").map((s) => s.trim()).filter(Boolean);

  const kept = [];
  for (const p of parts) {
    const name = p.split(/\s+as\s+/)[0].trim();
    if (names.includes(name)) {
      if (new RegExp(`\\b${name}\\b`).test(src.replace(m[0], ""))) kept.push(p);
    } else {
      kept.push(p);
    }
  }

  const repl = kept.length
    ? `import type { ${kept.join(", ")} } from "${modPath}";`
    : "";
  return src.slice(0, m.index) + repl + src.slice(m.index + m[0].length);
}

function main() {
  if (!fs.existsSync(uiPath)) {
    console.error("Missing:", uiPath);
    process.exit(1);
  }

  backupOnce(uiPath, "step14_prune_map_v2");

  let src = read(uiPath);

  const removed = [];

  // 1) Remove the big map/graph section: VisionMode types -> renderMapNodeSelect()
  const big = findBlockByAnchor(src, "type VisionMode", "renderMapNodeSelect");
  if (big) {
    src = removeRanges(src, [big]);
    removed.push("map/graph block (VisionMode..renderMapNodeSelect)");
  }

  // 2) Remove early boss schedule helpers (type ForcedNext..rollExtraTime01FromDeck)
  const forcedStart = src.indexOf("type ForcedNext");
  const roll = findFunctionBlock(src, "rollExtraTime01FromDeck");
  if (forcedStart >= 0 && roll) {
    src = removeRanges(src, [{ start: forcedStart, end: roll.end }]);
    removed.push("ForcedNext/ensureBossSchedule/rollExtraTime01FromDeck");
  }

  // 3) If any legacy calls remain, rewire to Rt imports (safe)
  src = src.replace(/\bensureGraphRuntime\s*\(/g, "ensureGraphRuntimeRt(");
  src = src.replace(/\bmaybeShiftTopology\s*\(/g, "maybeShiftTopologyRt(");
  src = src.replace(/\btotalTimeOnMap\s*\(/g, "totalTimeOnMapRt(");
  src = src.replace(/\bensureBossSchedule\s*\(/g, "ensureBossScheduleRt(");

  // 4) Remove unused graphRuntime import line if nothing uses it.
  src = removeGraphRuntimeImportIfUnused(src);

  // 5) Prune type-only imports that were only for the removed map section
  src = pruneTypeImportNames(src, "../engine/types", ["DungeonMap", "MapNode"]);

  write(uiPath, src);

  console.log("Step14(v2): pruned legacy map/graph code from src/ui/ui.ts");
  console.log("Removed:", removed.length ? removed.join(" | ") : "(nothing matched)");
  console.log("Backup:", "src/ui/ui.ts.bak_step14_prune_map_v2");
  console.log("Next: run `npx tsc --noEmit` and smoke-test node select + combat.");
}

main();
