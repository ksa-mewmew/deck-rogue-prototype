import type { GameState, NodeType, StatusKey, NodeOffer, BranchOffer } from "./types";

function makePair(types: NodeType[]): [NodeOffer, NodeOffer] {
  return [
    { id: "A", type: types[0] },
    { id: "B", type: types[1] },
  ];
}

export type HasStatus = { status: Record<StatusKey, number> };

export function applyStatusTo(target: HasStatus, key: StatusKey, n: number) {
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

export function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function logMsg(g: GameState, msg: string) {
  g.log.unshift(msg);
  g.log = g.log.slice(0, 250);
}

export function aliveEnemies(g: GameState) {
  return g.enemies.filter((e) => e.hp > 0);
}

export function applyStatus(target: { status: Record<StatusKey, number> }, key: StatusKey, n: number) {
  target.status[key] = clampMin((target.status[key] ?? 0) + n, 0);
}

export function rollNodeOffers(g: GameState): NodeType[] {
  // ✅ 다음 노드 번호 기준
  const nextIndex = g.run.nodePickCount + 1;

  // ✅ 30번째마다 보스 전투만 제시(=선택지 2개를 전투로 채움)
  if (nextIndex % 30 === 0) {
    return ["BATTLE", "BATTLE"];
  }

  const pool: NodeType[] = [];

  const battleW = g.run.treasureObtained ? 20 : 19;
  const restW = 4;
  const eventW = 6;

  const canOfferTreasure = !g.run.treasureObtained && g.run.nodePickCount >= 30;
  const treasureW = canOfferTreasure ? 1 : 0;

  for (let i = 0; i < battleW; i++) pool.push("BATTLE");
  for (let i = 0; i < restW; i++) pool.push("REST");
  for (let i = 0; i < eventW; i++) pool.push("EVENT");
  for (let i = 0; i < treasureW; i++) pool.push("TREASURE");

  const a = pickOne(pool);
  let b = pickOne(pool);

  // 보물+보물만 방지 (나머지는 중복 허용)
  if (a === "TREASURE" && b === "TREASURE") {
    let guard = 0;
    do {
      b = pickOne(pool);
      guard++;
      if (guard > 50) break;
    } while (b === "TREASURE");
  }

  return [a, b];
}