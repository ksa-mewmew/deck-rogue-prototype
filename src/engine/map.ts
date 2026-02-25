import type { MapNode, DungeonMap } from "./types";


export type MapGenOptions = {
  nodeCount: number;
  extraEdges: number;
  eliteCount: number;

  deadEndMinDepth?: number;
  deadEndBias?: {
    battleMul?: number;
    eventMul?: number;
    restMul?: number;
  };
};

function uniqPush<T>(arr: T[], v: T) {
  if (!arr.includes(v)) arr.push(v);
}

function addEdge(edges: Record<string, string[]>, a: string, b: string) {
  edges[a] ??= [];
  edges[b] ??= [];
  uniqPush(edges[a], b);
  uniqPush(edges[b], a);
}

function hasEdge(edges: Record<string, string[]>, a: string, b: string) {
  return (edges[a] ?? []).includes(b);
}

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function bfsDistances(map: Pick<DungeonMap, "edges" | "startId">, startId?: string) {
  const start = startId ?? map.startId;
  const dist: Record<string, number> = {};
  const q: string[] = [start];
  dist[start] = 0;

  while (q.length) {
    const cur = q.shift()!;
    const cd = dist[cur] ?? 0;
    for (const nb of map.edges[cur] ?? []) {
      if (dist[nb] != null) continue;
      dist[nb] = cd + 1;
      q.push(nb);
    }
  }
  return dist;
}

function computeLayerCount(nodeCount: number) {

  const hi = Math.floor((nodeCount + 1) / 2);
  const W_TARGET = nodeCount <= 24 ? 2.6 : 3.2;
  const base = Math.round((Math.max(4, nodeCount) - 1) / W_TARGET) + 1;

  const minL = nodeCount <= 24 ? 6 : 12;
  const maxL = Math.min(hi, 32);

  const L = Math.max(minL, Math.min(maxL, base));
  return Math.max(3, Math.min(hi, L));
}
function planLayerSizes(nodeCount: number) {
  const CAP = 4;

  let L = computeLayerCount(nodeCount);

  while (L > 2 && 1 + 2 * (L - 1) > nodeCount) L -= 1;

  const hi = Math.floor((nodeCount + 1) / 2);
  while (L < hi && 1 + CAP * (L - 1) < nodeCount) L += 1;

  const maxW = CAP;

  const sizes = new Array(L).fill(2);
  sizes[0] = 1;

  let remaining = nodeCount - (1 + 2 * (L - 1));
  while (remaining > 0) {
    const d = 1 + Math.floor(Math.random() * (L - 1));
    if (sizes[d] >= maxW) continue;
    sizes[d] += 1;
    remaining -= 1;
  }

  for (let it = 0; it < 24; it++) {
    const d1 = 1 + Math.floor(Math.random() * (L - 1));
    const d2 = 1 + Math.floor(Math.random() * (L - 1));
    if (d1 === d2) continue;
    if (sizes[d1] <= 2) continue;
    if (sizes[d2] >= maxW) continue;
    if (Math.random() < 0.5) {
      sizes[d1] -= 1;
      sizes[d2] += 1;
    }
  }

  return sizes;
}


export function generateDungeonMap(opt?: Partial<MapGenOptions>): DungeonMap {
  const nodeCount = opt?.nodeCount ?? 72;
  const extraEdges = opt?.extraEdges ?? Math.max(18, Math.floor(nodeCount * 0.12));
  const eliteCount = opt?.eliteCount ?? Math.max(2, Math.floor(nodeCount / 15));

  const nodes: Record<string, MapNode> = {};
  const edges: Record<string, string[]> = {};

  const layerSizes = planLayerSizes(nodeCount);
  const layers: string[][] = [];

  let idx = 0;
  for (let d = 0; d < layerSizes.length; d++) {
    const k = layerSizes[d];
    const arr: string[] = [];
    for (let i = 0; i < k; i++) {
      const id = `n${idx++}`;
      arr.push(id);
    }
    layers.push(arr);
  }

  while (idx < nodeCount) {
    if (layers[layers.length - 1].length >= 4) layers.push([]);
    layers[layers.length - 1].push(`n${idx++}`);
  }

  for (let d = 0; d < layers.length; d++) {
    const arr = layers[d];
    for (let i = 0; i < arr.length; i++) {
      const id = arr[i];
      nodes[id] = {
        id,
        kind: d === 0 && i === 0 ? "START" : "BATTLE",
        depth: d,
        order: i,
        visited: d === 0 && i === 0,
        cleared: d === 0 && i === 0,
        reprocCount: 0,
        lastProcTime: -999,
      };
      edges[id] = [];
    }
  }

  const pairEdges: Array<Array<[number, number]>> = layers.slice(0, -1).map(() => []);

  const addLayerEdge = (a: string, b: string) => {
    if (hasEdge(edges, a, b)) return false;

    const da = nodes[a]?.depth ?? 0;
    const db = nodes[b]?.depth ?? 0;
    if (Math.abs(da - db) !== 1) return false;

    const d = Math.min(da, db);
    const left = da < db ? a : b;
    const right = da < db ? b : a;

    const i = nodes[left]?.order ?? 0;
    const j = nodes[right]?.order ?? 0;

    for (const [i2, j2] of pairEdges[d]) {
      if ((i < i2 && j > j2) || (i > i2 && j < j2)) return false;
    }

    addEdge(edges, left, right);
    pairEdges[d].push([i, j]);
    return true;
  };

  for (let d = 0; d < layers.length - 1; d++) {
    const A = layers[d];
    const B = layers[d + 1];

    for (let j = 0; j < B.length; j++) {
      const pi0 = Math.floor((j * A.length) / B.length);
      const jitter = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.35 ? 1 : 0);
      const pi = Math.max(0, Math.min(A.length - 1, pi0 + jitter));
      addLayerEdge(A[pi], B[j]);
    }

    const pForward = 0.35;
    for (let i = 0; i < A.length; i++) {
      if (Math.random() > pForward) continue;
      const cj0 = Math.floor((i * B.length) / A.length);
      const jitter = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.35 ? 1 : 0);
      const cj = Math.max(0, Math.min(B.length - 1, cj0 + jitter));
      addLayerEdge(A[i], B[cj]);
    }
  }

  if (layers.length >= 2 && layers[1].length >= 2) {
    addLayerEdge(layers[0][0], layers[1][layers[1].length - 1]);
  }


  const maxExtra = Math.max(0, Math.min(extraEdges, 2 * nodeCount));
  let added = 0;
  let tries = 0;
  while (added < maxExtra && tries++ < 8000) {
    const d = Math.floor(Math.random() * (layers.length - 1));
    const A = layers[d];
    const B = layers[d + 1];
    const a = A[Math.floor(Math.random() * A.length)];
    const b = B[Math.floor(Math.random() * B.length)];
    if (addLayerEdge(a, b)) added += 1;
  }


  const V_LINK_P = 0.25;

  for (let d = 0; d < layers.length; d++) {
    const L = layers[d];
    if (L.length < 2) continue;

    const j = Math.floor(Math.random() * (L.length - 1));
    addEdge(edges, L[j], L[j + 1]);

    for (let i = 0; i < L.length - 1; i++) {
      if (i === j) continue;
      if (Math.random() < V_LINK_P) addEdge(edges, L[i], L[i + 1]);
    }
  }


  const map: DungeonMap = {
    nodes,
    edges,
    startId: layers[0][0],
    pos: layers[0][0],
    treasureId: null,
    visionNonce: 0,
  };

  const treasureCandidates: string[] = [];

  const minTreasureD = Math.max(2, Math.floor(layers.length * 0.85));
  const maxTreasureD = Math.max(minTreasureD, Math.floor(layers.length * 1) - 1);

  for (let d = minTreasureD; d <= maxTreasureD && d < layers.length; d++) {
    for (const id of layers[d]) treasureCandidates.push(id);
  }
  const treasureId = treasureCandidates.length ? pickOne(treasureCandidates) : `n${nodeCount - 1}`;
  map.treasureId = treasureId;
  nodes[treasureId].kind = "TREASURE";

  const others = Object.keys(nodes).filter((id) => id !== map.startId && id !== treasureId);
  shuffleInPlace(others);
  const FORCE_BATTLE_COLS = 5;

  const forcedBattleDepths = new Set<number>();
  if (layers.length > 1) forcedBattleDepths.add(1);

  const depthCandidates: number[] = [];
  for (let d = 2; d < layers.length; d++) {
    depthCandidates.push(d);
  }
  shuffleInPlace(depthCandidates);

  for (const d of depthCandidates) {
    if (forcedBattleDepths.size >= Math.min(FORCE_BATTLE_COLS, Math.max(0, layers.length - 1))) break;
    forcedBattleDepths.add(d);
  }

  const FORCE_REST_COLS = 2;
  const forcedRestDepths = new Set<number>();
  const treasureDepth = nodes[treasureId]?.depth ?? -1;
  const restCandidates: number[] = [];
  for (let d = 2; d < layers.length; d++) {
    if (forcedBattleDepths.has(d)) continue;
    if (d === treasureDepth) continue;
    restCandidates.push(d);
  }
  shuffleInPlace(restCandidates);
  for (const d of restCandidates) {
    if (forcedRestDepths.size >= Math.min(FORCE_REST_COLS, restCandidates.length)) break;
    forcedRestDepths.add(d);
  }


  const elitePool = others
    .filter((id) => (nodes[id]?.depth ?? 0) >= 2)
    .filter((id) => !forcedBattleDepths.has(nodes[id]?.depth ?? 0)).filter((id) => !forcedRestDepths.has(nodes[id]?.depth ?? 0));
  shuffleInPlace(elitePool);
  const elites = new Set(elitePool.slice(0, Math.min(eliteCount, elitePool.length)));
  const deadEndMinDepth = opt?.deadEndMinDepth ?? 4;
  const deadEndBias = opt?.deadEndBias ?? { battleMul: 0.25, eventMul: 1.35, restMul: 1.55 };

  const deg = (id: string) => (edges[id]?.length ?? 0);

  const deadEnds = new Set(
    Object.keys(nodes).filter((id) => {
      if (id === map.startId) return false;
      const d = nodes[id]?.depth ?? 0;
      if (d < deadEndMinDepth) return false;
      return deg(id) === 1;
    })
  );

  const rollKind = (d: number, isDeadEnd: boolean): MapNode["kind"] => {
    let wB = 0.5, wE = 0.25, wR = 0.20, wS = 0.05;
    if (d <= 1) { wB = 0.8; wE = 0.14; wR = 0.04; wS = 0.02; }
    else if (d <= 3) { wB = 0.7; wE = 0.16; wR = 0.08; wS = 0.06; }
    else { wB = 0.6; wE = 0.2; wR = 0.12; wS = 0.08; }

    if (isDeadEnd) {
      wB *= (deadEndBias.battleMul ?? 0.25);
      wE *= (deadEndBias.eventMul ?? 1.35);
      wR *= (deadEndBias.restMul ?? 1.8);
      wS *= 0.8;
    }

    const sum = wB + wE + wR + wS;
    const r = Math.random() * sum;
    if (r < wB) return "BATTLE";
    if (r < wB + wE) return "EVENT";
    if (r < wB + wE + wR) return "REST";
    return "SHOP";
  };
  for (const id of others) {
    const d = nodes[id]?.depth ?? 0;

    if (forcedRestDepths.has(d)) {
      nodes[id].kind = "REST";
      continue;
    }

    if (forcedBattleDepths.has(d)) {
      nodes[id].kind = "BATTLE";
      continue;
    }

    if (elites.has(id)) {
      nodes[id].kind = "ELITE";
      continue;
    }

    nodes[id].kind = rollKind(d, deadEnds.has(id));
  }


  {
    const anyShop = Object.values(nodes).some((n) => n.kind === "SHOP");
    if (!anyShop) {
      const cand = Object.keys(nodes)
        .filter((id) => id !== map.startId && id !== treasureId)
        .filter((id) => (nodes[id]?.depth ?? 0) >= 2)
        .filter((id) => nodes[id].kind !== "ELITE" && nodes[id].kind !== "TREASURE")
        .filter((id) => !forcedBattleDepths.has(nodes[id]?.depth ?? 0))
      ;
      if (cand.length) {
        const id = pickOne(cand);
        nodes[id].kind = "SHOP";
      }
    }
  }

  return map;
}

export function maybeShiftTopology(
  map: DungeonMap,
  posId: string,
  tier: number
): { changed: boolean; msg?: string } {
  if (tier <= 0) return { changed: false };

  const p = 0.05 + 0.04 * tier;
  if (Math.random() >= p) return { changed: false };

  const ids = Object.keys(map.nodes);
  if (ids.length < 4) return { changed: false };

  const depthOf = (id: string) => Number(map.nodes[id]?.depth ?? 999);
  const orderOf = (id: string) => Number(map.nodes[id]?.order ?? 0);

  const byDepth = new Map<number, string[]>();
  for (const id of ids) {
    const d = depthOf(id);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  for (const [d, arr] of byDepth) arr.sort((a, b) => (orderOf(a) - orderOf(b)) || a.localeCompare(b));

  const pairKeys = Array.from(byDepth.keys()).filter((d) => byDepth.has(d) && byDepth.has(d + 1));
  if (pairKeys.length === 0) return { changed: false };

  const connectedFrom = (start: string) => {
    const seen = new Set<string>();
    const q: string[] = [start];
    seen.add(start);
    while (q.length) {
      const cur = q.shift()!;
      for (const nx of map.edges[cur] ?? []) {
        if (seen.has(nx)) continue;
        seen.add(nx);
        q.push(nx);
      }
    }
    return seen;
  };

  const layerEdgePairs = (d: number) => {
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

  const wouldCross = (d: number, a: string, b: string) => {
    const { li, ri, pairs } = layerEdgePairs(d);
    const i = li.get(a);
    const j = ri.get(b);
    if (i == null || j == null) return true;
    for (const [i2, j2] of pairs) {
      if ((i < i2 && j > j2) || (i > i2 && j < j2)) return true;
    }
    return false;
  };

  const addPlanar = (a: string, b: string) => {
    if (hasEdge(map.edges, a, b)) return false;
    const da = depthOf(a);
    const db = depthOf(b);
    if (Math.abs(da - db) !== 1) return false;

    const d = Math.min(da, db);
    const left = da < db ? a : b;
    const right = da < db ? b : a;

    if (wouldCross(d, left, right)) return false;
    addEdge(map.edges, left, right);
    return true;
  };

  const removeUndirected = (a: string, b: string) => {
    map.edges[a] = (map.edges[a] ?? []).filter((x) => x !== b);
    map.edges[b] = (map.edges[b] ?? []).filter((x) => x !== a);
  };

  const doAdd = Math.random() < 0.55;

  if (doAdd) {
    for (let tries = 0; tries < 80; tries++) {
      const d = pickOne(pairKeys);
      const { left, right } = layerEdgePairs(d);
      const a = pickOne(left);
      const b = pickOne(right);
      if (addPlanar(a, b)) return { changed: true, msg: `대격변: 길이 새로 열렸습니다. (${a} ↔ ${b})` };
    }
    return { changed: false };
  }

  const candidates: Array<[string, string]> = [];
  for (const a of ids) {
    for (const b of map.edges[a] ?? []) {
      if (a >= b) continue;
      if (Math.abs(depthOf(a) - depthOf(b)) !== 1) continue;
      candidates.push([a, b]);
    }
  }
  if (!candidates.length) return { changed: false };

  for (let tries = 0; tries < 120; tries++) {
    const [a, b] = pickOne(candidates);
    const degA = (map.edges[a] ?? []).length;
    const degB = (map.edges[b] ?? []).length;
    if (degA <= 1 || degB <= 1) continue;

    removeUndirected(a, b);
    const start = map.startId ?? posId;
    const seen = connectedFrom(start);

    const ok = seen.size === ids.length && ids.every((id) => (map.edges[id] ?? []).length >= 1);
    if (ok) return { changed: true, msg: `대격변: 길이 무너졌습니다. (${a} ↔ ${b})` };

    addEdge(map.edges, a, b);
  }

  return { changed: false };
}

export function pursuitTier(heat: number): 0 | 1 | 2 | 3 {
  if (heat >= 18) return 3;
  if (heat >= 12) return 2;
  if (heat >= 6) return 1;
  return 0;
}