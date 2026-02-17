import type { GameState, NodeType, StatusKey, NodeOffer, BranchOffer } from "./types";

function makePair(types: NodeType[]): [NodeOffer, NodeOffer] {
  return [
    { id: "A", type: types[0] },
    { id: "B", type: types[1] },
  ];
}

export type HasStatus = { status: Record<StatusKey, number> };

export type StatusSource = "PLAYER" | "ENEMY" | "SYSTEM";

export function applyStatusTo(target: HasStatus, key: StatusKey, n: number, g?: GameState, src: StatusSource = "SYSTEM") {
  let amount = n;

  if (g && src === "PLAYER" && key === "bleed") {
    const bonus = Number((g as any)._bleedBonusPerApply ?? 0);
    if (bonus) amount += bonus;
  }
  target.status[key] = Math.max(0, (target.status[key] ?? 0) + n);
}


export function rollBranchOffer(g: GameState): BranchOffer {
  const root = makePair(rollNodeOffers(g));
  const nextIfA = makePair(rollNodeOffers(g));
  const nextIfB = makePair(rollNodeOffers(g));
  return { root, nextIfA, nextIfB };
}

export function advanceBranchOffer(g: GameState, pickedId: "A" | "B") {
  if (!g.run.branchOffer) g.run.branchOffer = rollBranchOffer(g);
  const br = g.run.branchOffer;

  const nextRoot = pickedId === "A" ? br.nextIfA : br.nextIfB;

  const fresh = rollBranchOffer(g);
  g.run.branchOffer = {
    root: nextRoot,
    nextIfA: fresh.nextIfA,
    nextIfB: fresh.nextIfB,
  };
}

export function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

export function clampMin(n: number, min = 0) {
  return n < min ? min : n;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickOne<T>(arr: readonly T[], why = "pickOne"): T {
  if (arr.length === 0) throw new Error(`${why}: empty array`);
  return arr[Math.floor(Math.random() * arr.length)];
}

export function logMsg(g: GameState, msg: string) {
  g.log.unshift(msg);
  g.log = g.log.slice(0, 250);
}

export function aliveEnemies(g: GameState) {
  return g.enemies.filter((e) => e.hp > 0);
}



export function rollNodeOffers(g: GameState): NodeType[] {

  const pool: NodeType[] = [];

  const battleW = !g.run.treasureObtained ? 20 : 24;
  const restW = !g.run.treasureObtained ? 4 : 1;
  const eventW = !g.run.treasureObtained ? 5 : 5;

  const canOfferTreasure = !g.run.treasureObtained && g.run.nodePickCount >= 30;
  const treasureW = canOfferTreasure ? 1 : 0;

  for (let i = 0; i < battleW; i++) pool.push("BATTLE");
  for (let i = 0; i < restW; i++) pool.push("REST");
  for (let i = 0; i < eventW; i++) pool.push("EVENT");
  for (let i = 0; i < treasureW; i++) pool.push("TREASURE");

  const a = pickOne(pool, "rollNodeOffers pool");
  let b = pickOne(pool, "rollNodeOffers pool");

  if (a === "TREASURE") {
    const poolNoTreasure = pool.filter(x => x !== "TREASURE");
    b = pickOne(poolNoTreasure, "rollNodeOffers poolNoTreasure");
  }

  return [a, b];
}




function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

// F=0~5: 거의 없음
// F=6~: 점점 상승, F=12쯤 0.7~0.8 근처
export function madnessP(g: GameState, base = 0.0) {
  const f = g.player?.fatigue ?? 0;
  const p = clamp01(base + Math.max(0, f - 5) * 0.12); // 6부터 12%p씩
  // 단계
  const tier = f <= 5 ? 0 : f <= 8 ? 1 : f <= 11 ? 2 : 3;
  return { f, p, tier };
}


// 확률 체크 헬퍼
export function rollMad(g: GameState, extra = 0) {
  const { p } = madnessP(g, extra);
  return Math.random() < p;
}