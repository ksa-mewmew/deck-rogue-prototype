import type { DungeonMap, GameState, MapNode, NodeType } from "../../engine/types";
import { logMsg, pushUiToast } from "../../engine/rules";
import { GOD_LINES, getPatronGodOrNull, isHostile } from "../../engine/faith";
import { getUiScaleNow } from "../settings/uiSettings";
import { div, divText, h3, p, mkButton } from "../dom";

const VS15 = "\uFE0E";

let mapDetailOverlayOpen = false;
let mapDetailOutsideDown: ((ev: PointerEvent) => void) | null = null;

function detachMapDetailOutsideDown() {
  if (!mapDetailOutsideDown) return;
  document.removeEventListener("pointerdown", mapDetailOutsideDown, true);
  mapDetailOutsideDown = null;
}

export function onLeaveNodePhase() {
  mapDetailOverlayOpen = false;
  detachMapDetailOutsideDown();
}

type ForcedNext = null | "BOSS";

export function ensureBossSchedule(g: GameState) {
  const runAny = g.run as any;
  if (runAny.timeMove == null) runAny.timeMove = (g.run as any).nodePickCount ?? 0;
  if (runAny.nextBossTime == null) runAny.nextBossTime = 40;
  if (runAny.forcedNext == null) runAny.forcedNext = null as ForcedNext;
}
function sepSpan(cls: string, txt: string) {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = txt;
  return s;
}

function nodeLabelParts(t: NodeType, isBoss: boolean) {
  if (t === "BATTLE") {
    return isBoss
      ? { icon: "☠" + VS15, text: "보스", kind: "boss" as const }
      : { icon: "⚔" + VS15, text: "전투", kind: "battle" as const };
  }
  if (t === "ELITE") return { icon: "☠" + VS15, text: "정예", kind: "elite" as const };
  if (t === "REST")  return { icon: "⛺︎" + VS15, text: "휴식", kind: "rest" as const };
  if (t === "EVENT") return { icon: "❔︎" + VS15, text: "미지", kind: "event" as const };
  if (t === "SHOP")  return { icon: "¤" + VS15, text: "상점", kind: "shop" as const };

  return { icon: "✦", text: "보물", kind: "treasure" as const };
}


function appendNodeLabel(parent: Node, t: NodeType, isBoss: boolean) {
  const p = nodeLabelParts(t, isBoss);

  const icon = document.createElement("span");
  icon.className = `nodeIcon ${p.kind}`;
  icon.textContent = p.icon;

  const text = document.createElement("span");
  text.className = "nodeText";
  text.textContent = `(${p.text})`;

  parent.appendChild(icon);
  parent.appendChild(text);
}

export function renderLabelList(
  el: HTMLElement,
  offers: Array<{ type: NodeType }>,
  isBoss: boolean
) {
  el.replaceChildren();

  if (isBoss) {


    appendNodeLabel(el, "BATTLE", true);
    return;
  }

  offers.forEach((o, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "nodeSep";
      sep.textContent = " / ";
      el.appendChild(sep);
    }
    appendNodeLabel(el, o.type, false);
  });
}





type VisionMode = "NORMAL" | "FOCUS" | "WIDE";

type VisionParams = {
  mode: VisionMode;

  presenceR: number;

  typeR: number;

  detailR: number;

  noise: number;
};

type MapNodeKind = NodeType | "START" | "EMPTY";

type MapNodeLite = {
  id: string;
  kind: MapNodeKind;
  visited?: boolean;
  cleared?: boolean;
  depth?: number;
  order?: number;
};

type GraphMapLite = {
  pos: string;
  startId: string;
  nodes: Record<string, MapNodeLite>;
  edges: Record<string, string[]>;
  visionNonce?: number;
  treasureId?: string | null;

  seen?: Record<string, 0 | 1 | 2 | 3>;
};

function pushUniq(arr: string[], v: string) {
  if (!arr.includes(v)) arr.push(v);
}
function addUndirectedEdge(edges: Record<string, string[]>, a: string, b: string) {
  (edges[a] ||= []);
  (edges[b] ||= []);
  pushUniq(edges[a], b);
  pushUniq(edges[b], a);
}

function dungeonToGraphLite(dm: DungeonMap, opts?: { verticalLinks?: boolean }): GraphMapLite {
  const nodes: Record<string, MapNodeLite> = {};

  const dmNodes = dm.nodes as Record<string, MapNode>;
  for (const n of Object.values(dmNodes)) {
    nodes[n.id] = { id: n.id, kind: n.kind as any, depth: n.depth, order: n.order };
  }

  const edges: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) edges[id] = [];

  for (const n of Object.values(dmNodes)) {
    nodes[n.id] = { id: n.id, kind: n.kind as any, depth: n.depth, order: n.order };
  }


  if (opts?.verticalLinks) {
    const byDepth = new Map<number, string[]>();
    for (const id of Object.keys(nodes)) {
      const d = nodes[id].depth ?? 0;
      const arr = byDepth.get(d) ?? [];
      arr.push(id);
      byDepth.set(d, arr);
    }
    for (const [, ids] of byDepth) {
      ids.sort((a, b) => (nodes[a].order ?? 0) - (nodes[b].order ?? 0));
      for (let i = 0; i < ids.length - 1; i++) {
        addUndirectedEdge(edges, ids[i], ids[i + 1]);
      }
    }
  }

  return {
    pos: dm.pos,
    startId: dm.startId,
    nodes,
    edges,
    visionNonce: dm.visionNonce,
    treasureId: dm.treasureId,
  };
}


function hash32(s: string) {

  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded01(seed: number) {

  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) / 4294967296);
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function clampInt(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, Math.floor(x))); }

export function ensureGraphRuntime(g: GameState) {
  const runAny = g.run as any;

  runAny.timeMove ??= 0;

  runAny.vision ??= {
    mode: "NORMAL" as VisionMode,
    presenceR: 2,
    typeR: 1,
    detailR: 0,
    noise: 0,
  };


  if (!runAny.map) {
    runAny.map = makeDebugGraphMap();
  } else {

    const m = runAny.map as any;
    if (Array.isArray(m.nodes)) {
      const rec: Record<string, MapNodeLite> = {};
      for (const n of m.nodes) rec[String(n.id)] = n;
      m.nodes = rec;
    }
  }

    const mapLite = runAny.map as GraphMapLite;
  const isLayered = Object.keys(mapLite?.nodes ?? {}).every(
    (id) => typeof (mapLite.nodes[id] as any)?.order === "number"
  );

  if (!isLayered) {
    try { ensureNoDeadEnds(mapLite, 2); } catch {}
  }

  try { ensureSeenMap(mapLite); } catch {}


  return {
    map: runAny.map as GraphMapLite,
    vision: runAny.vision as VisionParams,
    timeMove: runAny.timeMove as number,
  };
}

export function totalTimeOnMap(g: GameState) {
  const runAny = g.run as any;
  const tm = Number(runAny.timeMove ?? 0) || 0;
  const ta = Number(g.time ?? 0) || 0;
  return tm + ta;
}

const PURSUIT_TOPOLOGY_SHIFT_ENABLED = false;


export function maybeShiftTopology(g: GameState) {
  if (!PURSUIT_TOPOLOGY_SHIFT_ENABLED) return;
  const { map } = ensureGraphRuntime(g);
  const p = 0.05;
  if (Math.random() >= p) return;

  const edges = (map.edges ??= {});
  const ids = Object.keys(map.nodes);
  if (ids.length < 4) return;

  const depthOf = (id: string) => Number(map.nodes[id]?.depth ?? 999);
  const orderOf = (id: string) => Number((map.nodes[id] as any)?.order ?? 0);

  const ensureUndirected = (a: string, b: string) => {
    edges[a] ??= [];
    edges[b] ??= [];
    if (!edges[a].includes(b)) edges[a].push(b);
    if (!edges[b].includes(a)) edges[b].push(a);
  };

  const removeUndirected = (a: string, b: string) => {
    edges[a] = (edges[a] ?? []).filter((x) => x !== b);
    edges[b] = (edges[b] ?? []).filter((x) => x !== a);
  };

  const connectedFrom = (start: string) => {
    const seen = new Set<string>();
    const q: string[] = [start];
    seen.add(start);
    while (q.length) {
      const cur = q.shift()!;
      for (const nx of edges[cur] ?? []) {
        if (seen.has(nx)) continue;
        seen.add(nx);
        q.push(nx);
      }
    }
    return seen;
  };

  const byDepth = new Map<number, string[]>();
  for (const id of ids) {
    const d = depthOf(id);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  for (const [d, arr] of byDepth) arr.sort((a, b) => (orderOf(a) - orderOf(b)) || a.localeCompare(b));

  const pairKeys = Array.from(byDepth.keys()).filter((d) => byDepth.has(d) && byDepth.has(d + 1));
  if (pairKeys.length === 0) return;

  const layerEdgePairs = (d: number) => {
    const left = byDepth.get(d) ?? [];
    const right = byDepth.get(d + 1) ?? [];
    const li = new Map<string, number>();
    const ri = new Map<string, number>();
    for (let i = 0; i < left.length; i++) li.set(left[i], i);
    for (let j = 0; j < right.length; j++) ri.set(right[j], j);

    const pairs: Array<[number, number]> = [];
    for (const a of left) {
      for (const b of edges[a] ?? []) {
        if (depthOf(b) !== d + 1) continue;
        const i = li.get(a);
        const j = ri.get(b);
        if (i == null || j == null) continue;
        pairs.push([i, j]);
      }
    }
    return { left, right, li, ri, pairs };
  };

  const wouldCross = (d: number, leftId: string, rightId: string) => {
    const { li, ri, pairs } = layerEdgePairs(d);
    const i = li.get(leftId);
    const j = ri.get(rightId);
    if (i == null || j == null) return true;
    for (const [i2, j2] of pairs) {
      if ((i < i2 && j > j2) || (i > i2 && j < j2)) return true;
    }
    return false;
  };

  const addPlanar = (a: string, b: string) => {
    if ((edges[a] ?? []).includes(b)) return false;
    const da = depthOf(a);
    const db = depthOf(b);
    if (Math.abs(da - db) !== 1) return false;

    const d = Math.min(da, db);
    const left = da < db ? a : b;
    const right = da < db ? b : a;
    if (wouldCross(d, left, right)) return false;

    ensureUndirected(left, right);
    return true;
  };

  const doAdd = Math.random() < 0.55;

  if (doAdd) {
    for (let tries = 0; tries < 80; tries++) {
      const d = pairKeys[Math.floor(Math.random() * pairKeys.length)];
      const { left, right } = layerEdgePairs(d);
      if (!left.length || !right.length) continue;

      const a = left[Math.floor(Math.random() * left.length)];
      const b = right[Math.floor(Math.random() * right.length)];
      if (addPlanar(a, b)) {
        logMsg(g, `대격변: 길이 새로 열렸습니다. (${a} ↔ ${b})`);
        return;
      }
    }
    return;
  }

  const allPairs: Array<[string, string]> = [];
  for (const a of ids) {
    for (const b of edges[a] ?? []) {
      if (a >= b) continue;
      if (Math.abs(depthOf(a) - depthOf(b)) !== 1) continue;
      allPairs.push([a, b]);
    }
  }
  if (allPairs.length === 0) return;

  for (let tries = 0; tries < 120; tries++) {
    const [a, b] = allPairs[Math.floor(Math.random() * allPairs.length)];
    const degA = (edges[a] ?? []).length;
    const degB = (edges[b] ?? []).length;
    if (degA <= 1 || degB <= 1) continue;

    removeUndirected(a, b);

    const start = Object.values(map.nodes).find((n) => n.kind === "START")?.id ?? map.pos;
    const seen = connectedFrom(start);

    if (seen.size === ids.length && ids.every((id) => (edges[id] ?? []).length >= 1)) {
      logMsg(g, `대격변: 길이 무너졌습니다. (${a} ↔ ${b})`);
      return;
    }

    ensureUndirected(a, b);
  }
}

function bfsDistances(map: GraphMapLite, start: string, maxDist: number) {
  const dist: Record<string, number> = {};
  const q: string[] = [];

  dist[start] = 0;
  q.push(start);

  while (q.length) {
    const cur = q.shift()!;
    const d = dist[cur] ?? 0;
    if (d >= maxDist) continue;

    const ns = map.edges[cur] ?? [];
    for (const nx of ns) {
      if (dist[nx] != null) continue;
      dist[nx] = d + 1;
      q.push(nx);
    }
  }

  return dist;
}


type RevealLevel = 0 | 1 | 2 | 3;

function ensureSeenMap(map: GraphMapLite): Record<string, RevealLevel> {
  const m: any = map as any;
  if (!m.seen) m.seen = {};

  m.seen[map.pos] = 3;
  return m.seen as Record<string, RevealLevel>;
}


function updateSeenFromVision(map: GraphMapLite, vp: VisionParams) {
  const seen = ensureSeenMap(map);
  const maxD = Math.max(0, vp.presenceR | 0);
  const distNow = bfsDistances(map, map.pos, maxD);

  for (const id of Object.keys(distNow)) {
    const d = distNow[id] ?? 0;
    const r = revealLevelForDist(d, vp);
    const prev = (seen[id] ?? 0) as RevealLevel;
    if (r > prev) seen[id] = r;
  }


  seen[map.pos] = 3;
}

function seenLevel(map: GraphMapLite, id: string): RevealLevel {
  const seen = (map.seen ?? {}) as Record<string, RevealLevel>;
  return (seen[id] ?? 0) as RevealLevel;
}


function ensureNoDeadEnds(map: GraphMapLite, minDegree: number = 2) {
  const ids = Object.keys(map.nodes);
  if (ids.length <= 2) return;

  map.edges ??= {};

  for (const a of Object.keys(map.edges)) {
    for (const b of (map.edges[a] ?? []).slice()) {
      map.edges[b] ??= [];
      if (!map.edges[b].includes(a)) map.edges[b].push(a);
    }
  }

  const depthOf = (id: string) => Number(map.nodes[id]?.depth ?? 999);
  const orderOf = (id: string) => Number((map.nodes[id] as any)?.order ?? 0);
  const degree = (id: string) => (map.edges[id] ?? []).length;

  const hasLayered = ids.every((id) => {
    const d = depthOf(id);
    return d >= 0 && d < 900 && typeof (map.nodes[id] as any)?.order === "number";
  });

  const byDepth = new Map<number, string[]>();
  if (hasLayered) {
    for (const id of ids) {
      const d = depthOf(id);
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(id);
    }
    for (const [d, arr] of byDepth) arr.sort((a, b) => (orderOf(a) - orderOf(b)) || a.localeCompare(b));
  }

  const layerPairs = (d: number) => {
    const left = byDepth.get(d) ?? [];
    const right = byDepth.get(d + 1) ?? [];
    const li = new Map<string, number>();
    const ri = new Map<string, number>();
    for (let i = 0; i < left.length; i++) li.set(left[i], i);
    for (let j = 0; j < right.length; j++) ri.set(right[j], j);

    const pairs: Array<[number, number]> = [];
    for (const a of left) {
      for (const b of map.edges[a] ?? []) {
        if (depthOf(b) !== d + 1) continue;
        const i = li.get(a);
        const j = ri.get(b);
        if (i == null || j == null) continue;
        pairs.push([i, j]);
      }
    }
    return { left, right, li, ri, pairs };
  };

  const wouldCross = (leftId: string, rightId: string) => {
    const dl = depthOf(leftId);
    const dr = depthOf(rightId);
    if (dr !== dl + 1) return true;

    const { li, ri, pairs } = layerPairs(dl);
    const i = li.get(leftId);
    const j = ri.get(rightId);
    if (i == null || j == null) return true;

    for (const [i2, j2] of pairs) {
      if ((i < i2 && j > j2) || (i > i2 && j < j2)) return true;
    }
    return false;
  };

  const tryAddEdge = (from: string) => {
    map.edges[from] ??= [];
    const neigh = new Set(map.edges[from] ?? []);
    const fromD = depthOf(from);

    let candidates = ids.filter((x) => x !== from && !neigh.has(x));
    if (candidates.length === 0) return false;

    if (hasLayered) {
      candidates = candidates.filter((x) => Math.abs(depthOf(x) - fromD) === 1);
      if (candidates.length === 0) return false;

      candidates = candidates.filter((to) => {
        const da = depthOf(from);
        const db = depthOf(to);
        const left = da < db ? from : to;
        const right = da < db ? to : from;
        return !wouldCross(left, right);
      });
      if (candidates.length === 0) return false;
    }

    candidates.sort((a, b) => degree(b) - degree(a));

    const to = candidates[0];
    map.edges[from].push(to);
    map.edges[to] ??= [];
    map.edges[to].push(from);
    return true;
  };

  for (let iter = 0; iter < 200; iter++) {
    const dead = ids.filter((id) => degree(id) < minDegree);
    if (dead.length === 0) break;

    let progressed = false;
    for (const id of dead) {
      while (degree(id) < minDegree) {
        if (!tryAddEdge(id)) break;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
}

function makeDebugGraphMap(): GraphMapLite {
  const N = 18;

  const nodes: Record<string, MapNodeLite> = {};
  const edges: Record<string, string[]> = {};

  const ids = Array.from({ length: N }, (_, i) => `n${i}`);


  edges[ids[0]] = [];
  nodes[ids[0]] = { id: ids[0], kind: "START", visited: true, cleared: true, depth: 0 };

  for (let i = 1; i < ids.length; i++) {
    const id = ids[i];
    const parent = ids[Math.floor(Math.random() * i)];
    edges[id] ??= [];
    edges[parent] ??= [];
    edges[id].push(parent);
    edges[parent].push(id);
    nodes[id] = { id, kind: "BATTLE", visited: false, cleared: false };
  }


  const extra = 10;
  for (let k = 0; k < extra; k++) {
    const a = ids[Math.floor(Math.random() * ids.length)];
    const b = ids[Math.floor(Math.random() * ids.length)];
    if (a === b) continue;
    edges[a] ??= [];
    edges[b] ??= [];
    if (edges[a].includes(b)) continue;
    edges[a].push(b);
    edges[b].push(a);
  }


  const tmpMap: GraphMapLite = {
    pos: ids[0],
    startId: ids[0],
    nodes,
    edges,
    visionNonce: 1,
    treasureId: ids[ids.length - 1],
  };

  ensureNoDeadEnds(tmpMap, 2);

  const dist = bfsDistances(tmpMap, ids[0], 999);
  let deepest = ids[1];
  let bestD = -1;
  for (const id of ids) {
    const d = dist[id] ?? 999;
    nodes[id].depth = d;
    if (id !== ids[0] && d > bestD) {
      bestD = d;
      deepest = id;
    }
  }


  for (const id of ids) {
    if (id === ids[0]) continue;
    nodes[id].kind = "BATTLE";
  }


  const pickKinds: NodeType[] = ["BATTLE", "BATTLE", "BATTLE", "EVENT", "REST", "ELITE"];
  for (const id of ids) {
    if (id === ids[0] || id === deepest) continue;
    const k = pickKinds[Math.floor(Math.random() * pickKinds.length)];
    nodes[id].kind = k;
  }

  nodes[deepest].kind = "TREASURE";

  return {
    pos: ids[0],
    startId: ids[0],
    nodes,
    edges,
    visionNonce: 1,
    treasureId: deepest,
  };
}


function visionParamsFromState(g: GameState): VisionParams {
  const { vision } = ensureGraphRuntime(g);
  const runAny = g.run as any;
  const tm = Number(runAny.timeMove ?? 0) || 0;
  const vAny = vision as any;


  if (vAny.forceModeUntilMove != null && tm >= Number(vAny.forceModeUntilMove)) {
    vAny.forceModeUntilMove = null;
    vAny.forceMode = null;
  }
  if (vAny.switchLockedUntilMove != null && tm >= Number(vAny.switchLockedUntilMove)) {
    vAny.switchLockedUntilMove = null;
  }


  let mode = ((vAny.forceMode ?? vision.mode) ?? "NORMAL") as VisionMode;
  let presenceR = Number(vision.presenceR ?? 2) || 0;
  let typeR = Number(vision.typeR ?? 1) || 0;
  let detailR = Number(vision.detailR ?? 0) || 0;
  let noise = clamp01(Number(vision.noise ?? 0.08) || 0);


  if (mode === "FOCUS") {
    presenceR -= 1;
    typeR -= 1;
    detailR += 1;
    noise = 0;
  } else if (mode === "WIDE") {
    presenceR += 1;
    typeR += 1;
    detailR += 0;
    noise = 0;
  }


  if (g.run.treasureObtained) {
    noise = 0;
  }

  {
    const patron = getPatronGodOrNull(g);
    if (patron === "bright_darkness") {
      presenceR = Math.max(presenceR, 4);
      typeR = Math.max(typeR, 4);
    }
  }


  /*const f = Math.max(0, Number(g.player.fatigue ?? 0) || 0);
  if (f > 0) {

    const losePresence = Math.floor(f / 14);
    const loseType = Math.floor(f / 6);
    const loseDetail = Math.floor(f / 10);

    presenceR -= losePresence;
    typeR -= loseType;
    detailR -= loseDetail;

    noise = clamp01(noise + Math.min(0.30, f * 0.015));
  }*/

  presenceR = clampInt(presenceR, 0, 99);
  typeR = clampInt(typeR, 0, presenceR);
  detailR = clampInt(detailR, 0, typeR);
  noise = 0;

  return { mode, presenceR, typeR, detailR, noise };
}


function revealLevelForDist(dist: number, vp: VisionParams): 0 | 1 | 2 | 3 {
  if (dist <= 0) return 3;
  if (dist <= vp.detailR) return 3;
  if (dist <= vp.typeR) return 2;
  if (dist <= vp.presenceR) return 1;
  return 0;
}

function perceivedKindForNode(
  g: GameState,
  nodeId: string,
  actual: MapNodeKind,
  reveal: 0 | 1 | 2 | 3,
  vp: VisionParams
): { shown: NodeType | null; label: string; certainty: "HIDDEN" | "PRESENCE" | "TYPE" | "DETAIL" } {

  // 밝은 어둠(적대): 지도 정보는 전부 '?'
  if (isHostile(g, "bright_darkness")) {
    return { shown: null, label: "?", certainty: "HIDDEN" };
  }

  if (reveal === 0) return { shown: null, label: "보이지 않음", certainty: "HIDDEN" };
  if (reveal === 1) return { shown: null, label: "무언가", certainty: "PRESENCE" };

  if (actual === "START") {
    return { shown: null, label: "입구", certainty: reveal === 3 ? "DETAIL" : "TYPE" };
  }

  if (actual === "EMPTY") {
    return { shown: null, label: "지나간 곳", certainty: "PRESENCE" };
  }

  if (reveal === 3) {
    return { shown: actual, label: nodeLabelParts(actual, false).text, certainty: "DETAIL" };
  }
  return { shown: actual, label: nodeLabelParts(actual, false).text, certainty: "TYPE" };
}

function renderPerceivedLabel(parent: HTMLElement, pk: ReturnType<typeof perceivedKindForNode>) {
  const line = div("mapNodeLine");
  line.style.cssText = `display:flex; gap:calc(${8} * var(--u)); align-items:center;`;

  if (pk.shown) {
    appendNodeLabel(line, pk.shown, false);
  } else {
    const s = document.createElement("span");
    s.className = "nodeText";
    s.textContent = `(${pk.label})`;
    line.appendChild(s);
  }

  parent.appendChild(line);
}

type GraphLayout = {
  width: number;
  height: number;
  pos: Record<string, { x: number; y: number; depth: number }>;
  maxDepth: number;
  maxCount: number;
};

function ensureDepths(map: GraphMapLite) {
  const ids = Object.keys(map.nodes);
  if (ids.length === 0) return;

  const hasStableDepths = ids.every((id) => {
    const d0 = (map.nodes[id] as any)?.depth;
    const d = Number(d0);
    return d0 != null && Number.isFinite(d) && d >= 0 && d < 900;
  });
  if (hasStableDepths) return;

  const start =
    Object.values(map.nodes).find((n) => n.kind === "START")?.id ??
    map.pos ??
    ids[0];

  const dist = bfsDistances(map, start, 999);

  for (const id of ids) {
    const cur = (map.nodes[id] as any)?.depth;
    if (cur != null && Number.isFinite(Number(cur)) && Number(cur) < 900) continue;
    const d = dist[id];
    map.nodes[id].depth = d != null ? d : (map.nodes[id].depth ?? 999);
  }
}

function computeGraphLayout(map: GraphMapLite): GraphLayout {
  ensureDepths(map);

  const ids = Object.keys(map.nodes);
  const lockOrder = ids.every((id) => typeof (map.nodes[id] as any)?.order === "number");

  const byDepth = new Map<number, string[]>();
  let maxDepthRaw = 0;

  for (const id of ids) {
    const d0 = Number(map.nodes[id]?.depth ?? 999);
    const d = Number.isFinite(d0) ? d0 : 999;
    maxDepthRaw = Math.max(maxDepthRaw, d);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  const depthKeysRaw = Array.from(byDepth.keys()).sort((a, b) => a - b);
  const effectiveMaxDepth = depthKeysRaw.filter((d) => d < 900).length
    ? Math.max(...depthKeysRaw.filter((d) => d < 900))
    : maxDepthRaw;

  const hasUnreach = depthKeysRaw.some((d) => d >= 900);
  const maxDepthForWidth = effectiveMaxDepth + (hasUnreach ? 1 : 0);

  const STEP_X = 80;
  const STEP_Y = 64;
  const PAD_X = 54;
  const PAD_Y = 40;

  const depthOf = (id: string) => {
    const d0 = Number(map.nodes[id]?.depth ?? 999);
    const dd = Number.isFinite(d0) ? d0 : 999;
    return dd >= 900 ? (effectiveMaxDepth + 1) : dd;
  };

  const depths = Array.from({ length: maxDepthForWidth + 1 }, (_, i) => i);

  const order: Record<number, string[]> = {};
  for (const d of depths) order[d] = [];

  for (const id of ids) {
    const d = depthOf(id);
    order[d].push(id);
  }

  for (const d of depths) {
    order[d].sort((a, b) =>
      (((map.nodes[a] as any).order ?? 0) - ((map.nodes[b] as any).order ?? 0)) || a.localeCompare(b)
    );
  }

  const idxIn = (d: number) => {
    const m = new Map<string, number>();
    const arr = order[d] ?? [];
    for (let i = 0; i < arr.length; i++) m.set(arr[i], i);
    return m;
  };

  const adj = (id: string) => (map.edges[id] ?? []) as string[];

  const sweep = (dir: "LR" | "RL") => {
    if (dir === "LR") {
      for (let d = 1; d <= maxDepthForWidth; d++) {
        const prev = order[d - 1];
        if (!prev || prev.length === 0) continue;
        const prevIdx = idxIn(d - 1);
        const cur = order[d];
        cur.sort((a, b) => {
          const ba = bary(a, prevIdx, d - 1);
          const bb = bary(b, prevIdx, d - 1);
          if (ba !== bb) return ba - bb;
          return a.localeCompare(b);
        });
      }
    } else {
      for (let d = maxDepthForWidth - 1; d >= 0; d--) {
        const nxt = order[d + 1];
        if (!nxt || nxt.length === 0) continue;
        const nxtIdx = idxIn(d + 1);
        const cur = order[d];
        cur.sort((a, b) => {
          const ba = bary(a, nxtIdx, d + 1);
          const bb = bary(b, nxtIdx, d + 1);
          if (ba !== bb) return ba - bb;
          return a.localeCompare(b);
        });
      }
    }
  };

  const bary = (id: string, idxMap: Map<string, number>, targetDepth: number) => {
    const ns = adj(id);
    let sum = 0;
    let cnt = 0;
    for (const n of ns) {
      if (depthOf(n) !== targetDepth) continue;
      const ix = idxMap.get(n);
      if (ix == null) continue;
      sum += ix;
      cnt += 1;
    }
    if (cnt === 0) {
      const dHere = depthOf(id);
      const ix0 = (order[dHere] ?? []).indexOf(id);
      return ix0 < 0 ? 9999 : ix0;
    }
    return sum / cnt;
  };

  if (!lockOrder) {
    for (let iter = 0; iter < 4; iter++) {
      sweep("LR");
      sweep("RL");
    }
  }

  let maxCount = 1;
  for (const d of depths) maxCount = Math.max(maxCount, (order[d]?.length ?? 0));

  const innerH = maxCount * STEP_Y;
  const height = PAD_Y * 2 + innerH;
  const width = PAD_X * 2 + (maxDepthForWidth + 1) * STEP_X;

  const pos: GraphLayout["pos"] = {};

  for (const d of depths) {
    const col = order[d] ?? [];
    const k = col.length;
    const colH = k * STEP_Y;
    const offsetY = (innerH - colH) / 2;
    const x = PAD_X + d * STEP_X;

    for (let i = 0; i < k; i++) {
      const id = col[i];
      const y = PAD_Y + offsetY + (i + 0.5) * STEP_Y;
      pos[id] = { x, y, depth: Number(map.nodes[id]?.depth ?? 999) };
    }
  }

  return { width, height, pos, maxDepth: maxDepthForWidth, maxCount };
}

function mapIconFor(shown: NodeType | null, certainty: "HIDDEN" | "PRESENCE" | "TYPE" | "DETAIL", actualIsStart: boolean) {
  if (actualIsStart) return "◎";
  if (certainty === "HIDDEN") return "";
  if (certainty === "PRESENCE") return "·";
  if (!shown) return "?";
  return nodeLabelParts(shown, false).icon;
}

function renderMapMiniGraph(
  parent: HTMLElement,
  g: GameState,
  actions: any,
  map: GraphMapLite,
  vp: VisionParams,
  detailMode: boolean
) {

  const layout = computeGraphLayout(map);
  const seen = ensureSeenMap(map);

  const distNow = bfsDistances(map, map.pos, Math.max(0, vp.presenceR | 0));
  const isShown = (id: string) => id === map.pos || ((seen[id] ?? 0) as RevealLevel) > 0;

  const shownIds = Object.keys(map.nodes).filter(isShown);
  if (!shownIds.includes(map.pos)) shownIds.push(map.pos);

  const PAD = 70;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of shownIds) {
    const p = layout.pos[id];
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 300; maxY = 200; }

  const viewX = (minX - PAD);
  const viewY = (minY - PAD);
  const viewW = (maxX - minX) + PAD * 2;
  const viewH = (maxY - minY) + PAD * 2;

  const mapZoom = detailMode ? 0.8 : 1.4;
  const scrollerH = detailMode ? 420 : 460;


  const C_WHITE = "#F2F1EA";
  const C_BLACK = "#0B0B0B";
  const C_ACCENT = "#B34A46";
  const C_ACCENT_DARK = "#1A0B0B";

  const EDGE_STROKE = "rgba(242,241,234,.70)";
  const EDGE_STROKE_DIM = "rgba(242,241,234,.25)";

  const NODE_FILL_BASE = "rgba(242,241,234,.34)";
  const NODE_STROKE_BASE = "rgba(242,241,234,1)";
  const NODE_FILL_ACCENT = "rgba(179,74,70,.34)";
  const NODE_STROKE_ACCENT = C_ACCENT_DARK;

  const ICON_FILL = C_BLACK;

  const box = div("mapMiniBox");
  box.style.cssText =
    `margin-top:calc(${12} * var(--u)); ` +
    `border:0 solid rgba(255,255,255,.12); border-radius:calc(${12} * var(--u)); ` +
    `background:rgba(0,0,0,0); ` +
    `padding:calc(${10} * var(--u));`;

  const title = divText("", "");
  title.style.cssText = `font-weight:700; margin-bottom:calc(${8} * var(--u)); opacity:.95;`;
  box.appendChild(title);

  const scroller = div("mapMiniScroller");
  const viewport = div("mapMiniViewport");
  scroller.appendChild(viewport);

  scroller.style.cssText =
    `position:relative; ` +
    `overflow:auto; ` +
    `max-height:calc(${scrollerH} * var(--u)); ` +
    `border-radius:calc(${10} * var(--u)); ` +
    `background:rgba(255,255,255,.0);`;

  viewport.addEventListener("wheel", (ev) => {
    if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
      viewport.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }
  }, { passive: false });

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `${viewX} ${viewY} ${viewW} ${viewH}`);
  (svg.style as any).width = `calc(${viewW * mapZoom} * var(--u))`;
  (svg.style as any).height = `calc(${viewH * mapZoom} * var(--u))`;
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.display = "block";

  const gEdges = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(gEdges);
  svg.appendChild(gNodes);

  const neigh = new Set<string>((map.edges[map.pos] ?? []) as any);

  const memoryPk = (id: string, actual: MapNodeKind, lv: RevealLevel) => {
    const r = (Math.max(0, Math.min(3, lv)) as RevealLevel);
    return perceivedKindForNode(g, id, actual, r, { ...vp, noise: 0 });
  };

  const mkEdgeD = (pa: { x: number; y: number; depth: number }, pb: { x: number; y: number; depth: number }) => {
    const x1 = pa.x, y1 = pa.y;
    const x2 = pb.x, y2 = pb.y;
    const dd = Math.abs((pa.depth ?? 0) - (pb.depth ?? 0));

    if (dd === 0) return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (dd >= 2) {
      const off = 38 + 10 * dd;
      const xOut = Math.max(x1, x2) + off;
      return `M ${x1} ${y1} C ${xOut} ${y1}, ${xOut} ${y2}, ${x2} ${y2}`;
    }
    const dx = x2 - x1;
    const c1x = x1 + dx * 0.35;
    const c2x = x1 + dx * 0.65;
    return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
  };

  const shownSet = new Set(shownIds);
  for (const a of shownIds) {
    for (const b of (map.edges[a] ?? [])) {
      if (a >= b) continue;
      if (!shownSet.has(b)) continue;

      const da = (map.nodes[a] as any)?.depth;
      const db = (map.nodes[b] as any)?.depth;
      if (da != null && db != null) {
        const dd = Math.abs(Number(da) - Number(db));
        if (dd > 1) continue;
      }

      const pa = layout.pos[a];
      const pb = layout.pos[b];
      if (!pa || !pb) continue;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", mkEdgeD(pa, pb));
      path.setAttribute("fill", "none");

      path.setAttribute("stroke", EDGE_STROKE);
      path.setAttribute("stroke-width", detailMode ? "1.6" : "2");

      gEdges.appendChild(path);
    }
  }

  const sortedShown = shownIds.slice().sort((a, b) => a.localeCompare(b));
  for (const id of sortedShown) {
    const p = layout.pos[id];
    if (!p) continue;

    const node = map.nodes[id];
    const actual = (node?.kind ?? "BATTLE") as MapNodeKind;

    const dNow = distNow[id];
    const revealNow: RevealLevel =
      id === map.pos ? 3 : (dNow == null ? 0 : (revealLevelForDist(dNow, vp) as RevealLevel));

    const lv = (seen[id] ?? 0) as RevealLevel;
    const pk =
      revealNow > 0
        ? perceivedKindForNode(g, id, actual, revealNow as any, vp)
        : memoryPk(id, actual, lv);

    const isCur = id === map.pos;
    const isAdj = neigh.has(id);
    const isStart = actual === "START";

    if (isCur) {
      const halo1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo1.setAttribute("cx", String(p.x));
      halo1.setAttribute("cy", String(p.y));
      halo1.setAttribute("r", String(detailMode ? 20 : 22));
      halo1.setAttribute("fill", "none");
      halo1.setAttribute("stroke", C_ACCENT);
      halo1.setAttribute("stroke-width", String(detailMode ? 3 : 3.5));
      halo1.setAttribute("opacity", "0.55");
      (halo1.style as any).filter = "drop-shadow(0 0 calc(6 * var(--u)) rgba(179,74,70,.65))";
      gNodes.appendChild(halo1);
    }

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(p.x));
    circle.setAttribute("cy", String(p.y));
    circle.setAttribute("r", String(isCur ? (detailMode ? 12 : 13) : (detailMode ? 9 : 10)));

    const useAccent = isCur || isAdj;
    circle.setAttribute("fill", useAccent ? NODE_FILL_ACCENT : NODE_FILL_BASE);
    circle.setAttribute("stroke", "none");
    circle.setAttribute("stroke-width", "0");
    circle.style.cursor = isAdj && !isCur ? "pointer" : "default";

    if (isAdj && !isCur) {
      circle.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        actions.onMoveToNode?.(id);
      });
    }

    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const cleared = node?.cleared ? "" : node?.visited ? "" : "";
    titleEl.textContent = `${cleared}`;
    circle.appendChild(titleEl);
    gNodes.appendChild(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(p.x));
    label.setAttribute("y", String(p.y));
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", detailMode ? "12" : "14");
    label.style.fontSize = "var(--mapNodeEmojiSize, calc(16 * var(--u)))";

    label.setAttribute("fill", ICON_FILL);

    label.style.pointerEvents = "none";
    label.style.userSelect = "none";

    const icon = mapIconFor(pk.shown, pk.certainty as any, isStart);
    label.textContent = icon;
    label.style.opacity = "0.95";
    gNodes.appendChild(label);
  }

  viewport.appendChild(svg);

  if (detailMode) {
    const overlay = div("mapMiniOverlay");
    overlay.style.cssText =
      `position:absolute; right:calc(${10} * var(--u)); bottom:calc(${10} * var(--u)); ` +
      `max-width:calc(${360} * var(--u)); ` +
      `padding:calc(${10} * var(--u)); border-radius:calc(${12} * var(--u)); ` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.12); ` +
      `background:rgba(0,0,0,.55); backdrop-filter: blur(calc(2 * var(--u))); ` +
      `font-size:calc(12 * var(--u)); line-height:1.35;`;

    const ns = map.edges[map.pos] ?? [];
    const neighLine = div("mapMiniOverlayNeigh");
    neighLine.style.cssText = `margin-bottom:calc(${8} * var(--u)); opacity:.95;`;
    neighLine.appendChild(divText("", `이웃 ${ns.length}곳`));
    overlay.appendChild(neighLine);

    if (vp.presenceR >= 2) {
      const dist = bfsDistances(map, map.pos, vp.presenceR);
      const farIds = Object.keys(dist)
        .filter((id) => (dist[id] ?? 999) >= 2 && (dist[id] ?? 999) <= vp.presenceR)
        .sort((a, b) => (dist[a] - dist[b]) || a.localeCompare(b));

      const buckets = new Map<number, Record<string, number>>();
      for (const id of farIds) {
        const d = dist[id] ?? 0;
        const n = map.nodes[id];
        const actual = n?.kind ?? "BATTLE";
        const reveal = revealLevelForDist(d, vp);
        const pk = perceivedKindForNode(g, id, actual, reveal as any, vp);
        const key = (pk.certainty === "PRESENCE") ? "무언가" : pk.label;

        const m = buckets.get(d) ?? {};
        m[key] = (m[key] ?? 0) + 1;
        buckets.set(d, m);
      }

      const ds = Array.from(buckets.keys()).sort((a, b) => a - b).slice(0, 4);
      for (const d of ds) {
        const m = buckets.get(d)!;
        const parts = Object.keys(m).map((k) => `${k}×${m[k]}`);
        overlay.appendChild(divText("", `거리 ${d}: ${parts.join(" · ")}`));
      }
    }

    scroller.appendChild(overlay);
  }

  box.appendChild(scroller);

  requestAnimationFrame(() => {
    const p = layout.pos[map.pos];
    if (!p) return;
    const scale = getUiScaleNow();
    const vx = (p.x - viewX) * scale * mapZoom;
    const vy = (p.y - viewY) * scale * mapZoom;
    const targetX = Math.max(0, vx - viewport.clientWidth * 0.45);
    const targetY = Math.max(0, vy - viewport.clientHeight * 0.45);
    viewport.scrollLeft = targetX;
    viewport.scrollTop = targetY;
  });

  const tip = divText(
    "",
    detailMode
      ? "상세: 지도 위에 요약 정보가 표시됩니다. 이동은 인접 노드 클릭으로만 가능합니다."
      : ""
  );
  tip.style.cssText = `margin-top:calc(${8} * var(--u)); font-size:calc(12 * var(--u)); opacity:.8; line-height:1.3;`;
  box.appendChild(tip);

  parent.appendChild(box);
}
function renderMapNodeSelect(root: HTMLElement, g: GameState, actions: any) {
  const { map, timeMove } = ensureGraphRuntime(g);
  const vp = visionParamsFromState(g);
  updateSeenFromVision(map, vp);

  const wrap = div("nodeSelectWrap");
  wrap.classList.add("mapNodeSelect");

  const hdr = div("nodeSelectHeader");
  hdr.style.cssText = "display:flex; align-items:flex-end; justify-content:space-between; gap:calc(16 * var(--u));";

  const left = div("nodeSelectTitle");
  const tNow = totalTimeOnMap(g);
  const ex = g.run.nodePickCount ?? 0;

  left.appendChild(divText("", `총 시간 ${tNow} · 탐험 ${ex} · 이동 ${timeMove}`));

  ensureBossSchedule(g);
  const runAny = g.run as any;
  const nextBossTime = Number(runAny.nextBossTime ?? 40) || 40;
  const remainingBoss = Math.max(0, nextBossTime - tNow);
  const omenText =
    (g.run.bossOmenText && String(g.run.bossOmenText).trim() !== "")
      ? String(g.run.bossOmenText)
      : "아직 징조가 없다.";

  left.appendChild(divText("", `다음 보스까지 ${remainingBoss} · ${omenText}`));

  if (remainingBoss <= 3) {
    const runAnyBoss = g.run as any;
    const stamp = Number(runAnyBoss.bossApproachToastBossTime ?? -1) || -1;
    if (stamp !== nextBossTime) {
      runAnyBoss.bossApproachToastBossTime = nextBossTime;
      pushUiToast(g, "WARN", `보스가 다가옵니다 (남은 이동 ${remainingBoss})`, 2200);
    }
  }

  if (g.run.treasureObtained) {
    const distToStart = bfsDistances(map, map.pos, 9999)[map.startId];
    const distTxt = distToStart == null ? "?" : String(distToStart);
    left.appendChild(
      divText("", `입구까지 ${distTxt}`)
    );
  }

  const right = div("nodeSelectHeaderRight");

  /*const hint = divText("", "시야 " + vp.presenceR + "/" + vp.typeR + "/" + vp.detailR + " (" + vp.mode + ")");
  hint.style.opacity = "0.8";
  right.appendChild(hint);*/

  const btnDetail = mkButton(mapDetailOverlayOpen ? "상세 닫기" : "상세", () => {
    mapDetailOverlayOpen = !mapDetailOverlayOpen;
    if (!mapDetailOverlayOpen) detachMapDetailOutsideDown();
    actions.rerender();
  });
  btnDetail.classList.add("mapDetailToggleBtn");
  btnDetail.style.cssText = `margin-left:calc(${-30} * var(--u)); padding:calc(${2} * var(--u)) calc(${5} * var(--u)); opacity:.9;`;
  right.appendChild(btnDetail);

  hdr.appendChild(left);
  hdr.appendChild(right);
  wrap.appendChild(hdr);

  renderMapMiniGraph(wrap, g, actions, map, vp, false);

  if (mapDetailOverlayOpen) {

    const panel = div("mapDetailPanel");
    panel.style.cssText =
      `position:fixed; right:calc(${24} * var(--u)); top:calc(${24} * var(--u)); ` +
      `width:min(calc(${520} * var(--u)), calc(100vw - calc(${64} * var(--u)))); ` +
      `max-height:calc(100vh - calc(${64} * var(--u))); ` +
      `overflow-y:auto; overflow-x:hidden; ` +
      `z-index:70001; ` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.14); border-radius:calc(${14} * var(--u)); ` +
      `background:rgba(0,0,0,1); ` +
      `backdrop-filter:none; ` +
      `padding:calc(${12} * var(--u));`;

    panel.addEventListener("click", (ev) => ev.stopPropagation());
    panel.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });

    const onDocPointerDown = (ev: PointerEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && panel.contains(el)) return;

      mapDetailOverlayOpen = false;
      detachMapDetailOutsideDown();

      try { panel.remove(); } catch {}
      const tb = document.querySelector<HTMLButtonElement>(".mapDetailToggleBtn");
      if (tb) tb.textContent = "상세";
    };

    const head = div("");
    head.style.cssText = `display:flex; align-items:center; justify-content:space-between; gap:calc(${10} * var(--u));`;

    const hTitle = divText("", "지도 상세");
    hTitle.style.cssText = `font-weight:700; opacity:.95;`;
    head.appendChild(hTitle);

    const btnClose = mkButton("닫기", () => {
      mapDetailOverlayOpen = false;
      detachMapDetailOutsideDown();
      actions.rerender();
    });
    btnClose.style.cssText = `padding:calc(${6} * var(--u)) calc(${10} * var(--u)); opacity:.9;`;
    head.appendChild(btnClose);

    panel.appendChild(head);

    const neighBox = div("");
    neighBox.style.cssText =
      `margin-top:calc(${10} * var(--u)); padding:calc(${10} * var(--u)); ` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); border-radius:calc(${12} * var(--u)); background:rgba(255,255,255,.03);`;

    const neighTitle = h3("이동 가능한 이웃");
    neighTitle.style.margin = `0 0 calc(${6} * var(--u)) 0`;
    neighBox.appendChild(neighTitle);

    const ns = map.edges[map.pos] ?? [];
    if (ns.length === 0) neighBox.appendChild(p("이웃이 없습니다."));

    for (let i = 0; i < ns.length; i++) {
      const toId = ns[i];
      const n = map.nodes[toId];
      const actual = (n?.kind ?? "BATTLE") as MapNodeKind;

      const revealNow: RevealLevel = (vp.presenceR >= 1) ? (revealLevelForDist(1, vp) as RevealLevel) : 0;
      const lv = seenLevel(map, toId);

      const pk =
        revealNow > 0
          ? perceivedKindForNode(g, toId, actual, revealNow as any, vp)
          : (lv >= 2
              ? (actual === "START"
                  ? ({ shown: null, label: "입구", certainty: (lv === 3 ? "DETAIL" : "TYPE") as any } as any)
                  : ({ shown: actual as any, label: nodeLabelParts(actual as any, false).text, certainty: (lv === 3 ? "DETAIL" : "TYPE") as any } as any))
              : (lv === 1
                  ? ({ shown: null, label: "무언가", certainty: "PRESENCE" as any } as any)
                  : ({ shown: null, label: "보이지 않음", certainty: "HIDDEN" as any } as any)));

      const row = div("");
      row.style.cssText =
        `display:flex; align-items:center; gap:calc(${10} * var(--u)); ` +
        `padding:calc(${8} * var(--u)) calc(${10} * var(--u)); border-radius:calc(${10} * var(--u)); ` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); background:rgba(0,0,0,.20);` +
        `margin-top:calc(${6} * var(--u));`;

      const badge = divText("", (revealNow > 0 || lv > 0) ? `${toId}` : `출구 ${i + 1}`);
      badge.style.cssText =
        `flex:0 0 auto; padding:calc(${4} * var(--u)) calc(${8} * var(--u)); border-radius:calc(${10} * var(--u)); ` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.14); background:rgba(0,0,0,.25); opacity:.9;`;
      row.appendChild(badge);

      const mid = div("");
      mid.style.cssText = "flex:1 1 auto; min-width:0;";
      renderPerceivedLabel(mid, pk);
      row.appendChild(mid);

      neighBox.appendChild(row);
    }

    panel.appendChild(neighBox);

    if (vp.presenceR >= 2) {
      const dist = bfsDistances(map, map.pos, vp.presenceR);
      const farIds = Object.keys(dist)
        .filter((id) => (dist[id] ?? 999) >= 2 && (dist[id] ?? 999) <= vp.presenceR)
        .sort((a, b) => (dist[a] - dist[b]) || a.localeCompare(b));

      if (farIds.length) {
        const scout = div("");
        scout.style.cssText =
          `margin-top:calc(${10} * var(--u)); padding:calc(${10} * var(--u)); ` +
          `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); border-radius:calc(${12} * var(--u)); background:rgba(255,255,255,.03);`;

        const t = h3("멀리 보이는 곳");
        t.style.margin = `0 0 calc(${6} * var(--u)) 0`;
        scout.appendChild(t);

        const buckets = new Map<number, Record<string, number>>();
        for (const id of farIds) {
          const d = dist[id] ?? 0;
          const n = map.nodes[id];
          const actual = n?.kind ?? "BATTLE";
          const reveal = revealLevelForDist(d, vp);
          const pk = perceivedKindForNode(g, id, actual, reveal as any, vp);
          const key = (pk.certainty === "PRESENCE") ? "무언가" : pk.label;

          const m = buckets.get(d) ?? {};
          m[key] = (m[key] ?? 0) + 1;
          buckets.set(d, m);
        }

        const ds = Array.from(buckets.keys()).sort((a, b) => a - b);
        for (const d of ds) {
          const m = buckets.get(d)!;
          const parts = Object.keys(m).map((k) => `${k}×${m[k]}`);
          scout.appendChild(divText("", `거리 ${d}: ${parts.join(" · ")}`));
        }

        panel.appendChild(scout);
      }
    }
    detachMapDetailOutsideDown();
    mapDetailOutsideDown = onDocPointerDown;
    document.addEventListener("pointerdown", mapDetailOutsideDown, true);
    root.appendChild(panel);
  }

  root.appendChild(wrap);
}
export function renderNodeSelect(root: HTMLElement, g: GameState, actions: any) {
  const { map } = ensureGraphRuntime(g);

  // 밝은 어둠: 노드셀렉트 진입 토스트
  {
    const runAny = g.run as any;
    const key = `${String(map.pos ?? "")}::${Number(runAny.timeMove ?? 0) || 0}`;
    if (runAny._bdNodeToastKey !== key) {
      runAny._bdNodeToastKey = key;
      const patron = getPatronGodOrNull(g);
      if (patron === "bright_darkness") {
        pushUiToast(g, "INFO", GOD_LINES.bright_darkness.nodeSelect, 1800);
        logMsg(g, GOD_LINES.bright_darkness.nodeSelect);
      }
      if (isHostile(g, "bright_darkness")) {
        pushUiToast(g, "WARN", GOD_LINES.bright_darkness.hostileMap, 2200);
        logMsg(g, GOD_LINES.bright_darkness.hostileMap);
      }
    }
  }
  renderMapNodeSelect(root, g, actions);
}
