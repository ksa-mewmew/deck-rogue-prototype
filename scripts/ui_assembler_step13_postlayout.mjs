import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const uiPath = path.join(ROOT, "src", "ui", "ui.ts");
const legacyLayoutPath = path.join(ROOT, "src", "ui", "layout.ts");
const outDir = path.join(ROOT, "src", "ui", "layout");
const outPath = path.join(outDir, "postLayout.ts");

const TARGET_EXPORTS = [
  "schedulePostLayout",
  "normalizeEnemyNameWidth",
  "alignHandToBoardAnchor",
  "alignEnemyHudToViewportCenter",
];

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function write(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, "utf8");
}

function backupOnce(p, tag) {
  const bak = `${p}.bak_${tag}`;
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, read(p), "utf8");
}

function findFunctionBlock(src, name) {
  const re = new RegExp(`\\bfunction\\s+${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;

  const start = m.index;
  const brace0 = src.indexOf("{", m.index);
  if (brace0 < 0) return null;

  let depth = 0;
  for (let i = brace0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { start, end: i + 1, code: src.slice(start, i + 1) };
      }
    }
  }
  return null;
}

function removeRanges(src, ranges) {
  const rs = ranges.filter(Boolean).sort((a, b) => b.start - a.start);
  let out = src;
  for (const r of rs) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out;
}

function insertImportAfterImports(src, importLine) {
  if (src.includes(importLine.trim())) return src;
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("import ")) i++;
  lines.splice(i, 0, importLine.trimEnd());
  return lines.join("\n");
}

function rewriteNamedImport(src, fromPath, transformer) {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${fromPath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}["'];?`);
  const m = re.exec(src);
  if (!m) return src;

  const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  const next = transformer(names);

  if (!next || next.length === 0) {
    return src.slice(0, m.index) + src.slice(m.index + m[0].length);
  }

  const repl = `import { ${next.join(", ")} } from "${fromPath}";`;
  return src.slice(0, m.index) + repl + src.slice(m.index + m[0].length);
}

function splitLayoutImports(uiSrc) {
  const collected = new Set();

  uiSrc = rewriteNamedImport(uiSrc, "./layout", (names) => {
    const kept = [];
    for (const n of names) {
      if (TARGET_EXPORTS.includes(n)) collected.add(n);
      else kept.push(n);
    }
    return kept;
  });

  uiSrc = rewriteNamedImport(uiSrc, "./layout/postLayout", (names) => {
    for (const n of names) {
      if (TARGET_EXPORTS.includes(n)) collected.add(n);
    }
    return names;
  });

  return { uiSrc, collected: Array.from(collected) };
}

function detectSourceFile() {
  if (!fs.existsSync(uiPath)) return null;
  const uiSrc = read(uiPath);

  const uiHasCore =
    findFunctionBlock(uiSrc, "schedulePostLayout") ||
    findFunctionBlock(uiSrc, "normalizeEnemyNameWidth") ||
    findFunctionBlock(uiSrc, "alignHandToBoardAnchor") ||
    findFunctionBlock(uiSrc, "alignEnemyHudToViewportCenter");

  if (uiHasCore) return uiPath;
  if (fs.existsSync(legacyLayoutPath)) return legacyLayoutPath;
  return uiPath;
}

function stripUnusedImports(src) {
  src = rewriteNamedImport(src, "./slots", (names) => names.filter((n) => n !== "applySlotCardScale"));
  return src;
}

function main() {
  const sourcePath = detectSourceFile();
  if (!sourcePath || !fs.existsSync(sourcePath) || !fs.existsSync(uiPath)) {
    console.error("Missing required files:", sourcePath, uiPath);
    process.exit(1);
  }

  backupOnce(sourcePath, "step13_postlayout");
  if (sourcePath !== uiPath) backupOnce(uiPath, "step13_postlayout");

  let sourceSrc = read(sourcePath);

  const declIdx = sourceSrc.indexOf("let postLayoutScheduled = false;");
  const sched = findFunctionBlock(sourceSrc, "schedulePostLayout");
  const scale = findFunctionBlock(sourceSrc, "scaleAllSlotCards");
  const normalize = findFunctionBlock(sourceSrc, "normalizeEnemyNameWidth");
  const alignHand = findFunctionBlock(sourceSrc, "alignHandToBoardAnchor");
  const alignEnemy = findFunctionBlock(sourceSrc, "alignEnemyHudToViewportCenter");

  const ranges = [];
  if (declIdx >= 0 && sched) {
    ranges.push({ start: declIdx, end: sched.end });
  }
  if (scale) ranges.push(scale);
  if (normalize) ranges.push(normalize);
  if (alignHand) ranges.push(alignHand);
  if (alignEnemy) ranges.push(alignEnemy);

  const strippedSource = stripUnusedImports(removeRanges(sourceSrc, ranges));

  if (sourcePath === legacyLayoutPath) {
    write(
      sourcePath,
      `export { schedulePostLayout, normalizeEnemyNameWidth, alignHandToBoardAnchor, alignEnemyHudToViewportCenter } from "./layout/postLayout";\n`
    );
  } else {
    write(sourcePath, strippedSource);
  }

  let uiSrc = read(uiPath);
  const { uiSrc: uiNoLayoutImport, collected } = splitLayoutImports(uiSrc);

  let afterUi = uiNoLayoutImport;
  const needed = new Set(collected);
  for (const name of TARGET_EXPORTS) {
    if (new RegExp(`\\b${name}\\b`).test(afterUi)) needed.add(name);
  }

  const orderedNeeded = TARGET_EXPORTS.filter((n) => needed.has(n));
  if (orderedNeeded.length > 0) {
    afterUi = insertImportAfterImports(afterUi, `import { ${orderedNeeded.join(", ")} } from "./layout/postLayout";`);
  }

  write(uiPath, afterUi);

  const pieces = [];
  pieces.push('import type { GameState } from "../../engine/types";');
  pieces.push('import { applySlotCardScale } from "../slots";');
  pieces.push("");
  pieces.push("let postLayoutScheduled = false;");
  pieces.push("");

  if (scale) pieces.push("export " + scale.code.replace(/^function\\s+scaleAllSlotCards/, "function scaleAllSlotCards"));
  else pieces.push("export function scaleAllSlotCards() {}");
  pieces.push("");

  if (sched) pieces.push("export " + sched.code.replace(/^function\\s+schedulePostLayout/, "function schedulePostLayout"));
  else pieces.push("export function schedulePostLayout(_g: GameState) {}");
  pieces.push("");

  if (normalize) pieces.push("export " + normalize.code.replace(/^function\\s+normalizeEnemyNameWidth/, "function normalizeEnemyNameWidth"));
  else pieces.push("export function normalizeEnemyNameWidth() {}");
  pieces.push("");

  if (alignHand) pieces.push("export " + alignHand.code.replace(/^function\\s+alignHandToBoardAnchor/, "function alignHandToBoardAnchor"));
  else pieces.push("export function alignHandToBoardAnchor(_g: GameState) {}");
  pieces.push("");

  if (alignEnemy) pieces.push("export " + alignEnemy.code.replace(/^function\\s+alignEnemyHudToViewportCenter/, "function alignEnemyHudToViewportCenter"));
  else pieces.push("export function alignEnemyHudToViewportCenter() {}");
  pieces.push("");

  write(outPath, pieces.join("\n"));

  console.log("Step13: extracted post-layout helpers to", path.relative(ROOT, outPath));
  console.log("Updated", path.relative(ROOT, sourcePath), `(backup: ${path.basename(sourcePath)}.bak_step13_postlayout)`);
  if (sourcePath !== uiPath) {
    console.log("Updated", path.relative(ROOT, uiPath), "(backup: ui.ts.bak_step13_postlayout)");
  }
  console.log("Next: git add src/ui/layout/postLayout.ts && run: npx tsc --noEmit");
}

main();
