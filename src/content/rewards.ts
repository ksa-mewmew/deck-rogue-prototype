import type { GameState } from "../engine/types";
import { shuffle, logMsg, pickOne, madnessP } from "../engine/rules";
import { getCardDefFor } from "./cards";
import { currentTotalDeckLikeSize } from "../engine/combat";

export function obtainTreasure(g: GameState) {
  if (g.run.treasureObtained) return;

  g.run.treasureObtained = true;
  g.run.afterTreasureNodePicks = 0;
  g.run.deckSizeAtTreasure = currentTotalDeckLikeSize(g);

  const id = newUid(g);
  g.cards[id] = { uid: id, defId: "goal_treasure", zone: "deck", upgrade: 0 };
  g.deck.push(id);
  g.deck = shuffle(g.deck);

  logMsg(g, "저주받은 보물을 획득했습니다! 덱에 [저주받은 보물] 추가");
}

export type RewardEntry = { id: string; weight: number };

const BASIC_REWARD_POOL: string[] = [
  "arrow",
  "shield",
  "scout",
  "field_ration",
  "maintenance",
  "power_arrow",
] as any;

const JUNK_REWARD_POOL: string[] = [
  "arrow",
  "shield",
  "scout",
  "field_ration",
] as any;

const MAD_REWARD_POOL: RewardEntry[] = [
  { id: "mad_echo", weight: 20 },
  { id: "mad_insight", weight: 12 },
  { id: "mad_bargain", weight: 3 },
];

export const REWARD_POOL: RewardEntry[] = [
  { id: "berserk", weight: 20 },
  { id: "bandage", weight: 12 },
  { id: "arrow_rain", weight: 20 },
  { id: "smoke", weight: 0 },
  { id: "redeploy", weight: 12 },
 
  { id: "secret_strike", weight: 3 },
  { id: "fire_scroll", weight: 3 },
  { id: "caltrops", weight: 20 },
  { id: "emergency_rations", weight: 3 },
  { id: "painkiller", weight: 12 },
  { id: "field_experience", weight: 3 },

  { id: "camp_prep", weight: 12 },
  { id: "vital_shot", weight: 20 },
  { id: "taunt", weight: 12 },
  { id: "rapid_fire", weight: 12 },

];

function offerOneFromPool(g: GameState, pool: RewardEntry[], opt?: Parameters<typeof buildWeightMapBiased>[1]): OfferedCard {
  const map = opt ? buildWeightMapBiased(pool, opt) : buildWeightMap(pool);
  const id = pickWeightedOne(map);
  const isMad = pool === MAD_REWARD_POOL;
  return { defId: id, upgrade: isMad ? 0 : rollOfferedUpgrade(g) };
}

function offerPairFromPool(g: GameState, pool: RewardEntry[], opt?: Parameters<typeof buildWeightMapBiased>[1]) {
  const mapA = opt ? buildWeightMapBiased(pool, opt) : buildWeightMap(pool);
  const idA = pickWeightedOne(mapA);

  const mapB = mapA.filter(x => x.id !== idA);
  const idB = pickWeightedOne(mapB);

  const isMad = pool === MAD_REWARD_POOL;
  const upA = isMad ? 0 : rollOfferedUpgrade(g);
  const upB = isMad ? 0 : rollOfferedUpgrade(g);

  return [{ defId: idA, upgrade: upA }, { defId: idB, upgrade: upB }] as const;
}

function shouldOfferMadCard(g: GameState): boolean {
  const { tier } = madnessP(g);
  // 티어가 높을수록 보상 슬롯이 광기로 오염될 확률
  return Math.random() < (tier === 0 ? 0 : tier === 1 ? 0.15 : tier === 2 ? 0.35 : 0.60);
}



function buildWeightMap(pool: RewardEntry[]): Array<{ id: string; w: number }> {
  const m = new Map<string, number>();
  for (const e of pool) {
    const w = Math.max(0, e.weight ?? 0);
    if (w <= 0) continue;
    m.set(e.id, (m.get(e.id) ?? 0) + w);
  }
  return [...m.entries()].map(([id, w]) => ({ id, w }));
}

function buildWeightMapBiased(
  pool: RewardEntry[],
  opt: {
    mult3?: number;   // weight=3 배수
    mult12?: number;  // weight=12 배수
    mult20?: number;  // weight=20 배수
    drop3?: boolean;
    drop12?: boolean;
    drop20?: boolean;
  } = {}
): Array<{ id: string; w: number }> {
  const m3 = opt.mult3 ?? 1;
  const m12 = opt.mult12 ?? 1;
  const m20 = opt.mult20 ?? 1;

  const m = new Map<string, number>();
  for (const e of pool) {
    const base = Math.max(0, e.weight ?? 0);
    if (base <= 0) continue;

    if (base === 3 && opt.drop3) continue;
    if (base === 12 && opt.drop12) continue;
    if (base === 20 && opt.drop20) continue;

    let w: number | null = null;
    if (base === 3) w = base * m3;
    else if (base === 12) w = base * m12;
    else if (base === 20) w = base * m20;
    else w = base;

    if (w <= 0) continue;
    m.set(e.id, (m.get(e.id) ?? 0) + w);
  }
  return [...m.entries()].map(([id, w]) => ({ id, w }));
}


function pickWeightedOne(items: Array<{ id: string; w: number }>): string {
  let total = 0;
  for (const it of items) total += it.w;
  if (total <= 0) throw new Error("No positive weights to pick from.");

  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.id;
  }
  return items[items.length - 1].id;
}


export type OfferedCard = { defId: string; upgrade: number };

export function rollOfferedUpgrade(g?: GameState): number {
  const f = g?.player?.fatigue ?? 0;
  const n = g?.run.nodePickCount ?? 999;

  // 초반 봉인
  if (n <= 6) return 0;

  // 피로에 따른 확률 감소
  const base = 0.1;
  const mult = f >= 12 ? 0 : f >= 9 ? 0.25 : f >= 6 ? 0.5 : 1;

  return Math.random() < base * mult ? 1 : 0;
}

export function offerRewardsByFatigue(g: GameState): OfferedCard[] {
  const f = g.player?.fatigue ?? 0;

  const junk: OfferedCard = { defId: pickOne(JUNK_REWARD_POOL) as any, upgrade: 0 };
  const basic: OfferedCard = { defId: pickOne(BASIC_REWARD_POOL) as any, upgrade: 0 };

  const pickNormalPair = (): readonly [OfferedCard, OfferedCard] => {
    if (f <= 3) return offerPairFromPool(g, REWARD_POOL);
    if (f <= 6) return offerPairFromPool(g, REWARD_POOL, { mult3: 0.25, mult12: 0.75, mult20: 1 });
    if (f <= 8) return offerPairFromPool(g, REWARD_POOL, { mult3: 0.10, mult12: 0.55, mult20: 1 });
    return offerPairFromPool(g, REWARD_POOL, { drop3: true, mult12: 0.45, mult20: 1 });
  };

  const maybeMad = (c: OfferedCard): OfferedCard => {
    if (!shouldOfferMadCard(g)) return c;
    return offerOneFromPool(g, MAD_REWARD_POOL);
  };

  // 0~8: 정상 2장(혹은 약한 정크 오염) + 슬롯별 광기 치환
  if (f <= 8) {
    if (f <= 6) {
      const [a, b] = pickNormalPair();
      return [maybeMad(a), maybeMad(b)];
    }

    // 7~8 정크 오염 룰 유지
    const pJunk = f === 7 ? 0.30 : 0.55;
    if (Math.random() < pJunk) {
      const [a] = pickNormalPair();
      const x = maybeMad(a);
      return Math.random() < 0.5 ? [junk, x] : [x, junk];
    }

    const [a, b] = pickNormalPair();
    return [maybeMad(a), maybeMad(b)];
  }

  // 9~11: 정크 1칸 + 나머지 1칸은 강한 필터
  if (f <= 11) {
    const x = maybeMad(offerOneFromPool(g, REWARD_POOL, { drop3: true, mult12: 0.45, mult20: 1 }));
    return Math.random() < 0.5 ? [junk, x] : [x, junk];
  }

  // 12+: 붕괴 유지
  const a = offerOneFromPool(g, MAD_REWARD_POOL);
  const b = Math.random() < 0.65 ? offerOneFromPool(g, MAD_REWARD_POOL) : junk;
  return Math.random() < 0.5 ? [a, b] : [b, a];
}


export function offerRewardPair(g: GameState): [OfferedCard, OfferedCard] {
  const r = offerRewardsByFatigue(g);
  const a = r[0] ?? { defId: "arrow", upgrade: 0 };
  const b = r[1] ?? { defId: "shield", upgrade: 0 };
  return [a, b];
}


export function newUid(g: GameState) {
  g.uidSeq += 1;
  return `c_${g.uidSeq}`;
}

export function addCardToDeck(g: GameState, defId: string, opt?: { upgrade?: number }) {
  const uid = newUid(g);
  g.cards[uid] = { uid, defId, zone: "deck", upgrade: opt?.upgrade ?? 0 };
  g.deck.push(uid);
}

export function removeRandomCardFromDeck(g: GameState) {
  const candidates = Object.values(g.cards).filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard");
  if (candidates.length === 0) return;

  const c = pickOne(candidates);
  g.cards[c.uid].zone = "vanished";
  g.vanished.push(c.uid);

  g.deck = g.deck.filter((x) => x !== c.uid);
  g.hand = g.hand.filter((x) => x !== c.uid);
  g.discard = g.discard.filter((x) => x !== c.uid);

  logMsg(g, `카드 제거: [${getCardDefFor(g, c.uid).name} +${g.cards[c.uid].upgrade ?? 0}]`);
}

const CURSED_TREASURE_ID = "goal_treasure";

export function removeCardByUid(g: GameState, uid: string) {
  const inst = g.cards[uid];
  if (!inst) return;

  if (inst.defId === CURSED_TREASURE_ID) {
    logMsg(g, "저주받은 보물은 덱에서 제거할 수 없습니다.");
    return;
  }  

  g.deck = g.deck.filter((x) => x !== uid);
  g.hand = g.hand.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);

  g.frontSlots = g.frontSlots.map((x) => (x === uid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === uid ? null : x));

  inst.zone = "vanished";
  g.vanished.push(uid);

  logMsg(g, `카드 제거: [${getCardDefFor(g, inst.uid).name} +${g.cards[inst.uid].upgrade ?? 0}]`);
}

export function canUpgradeUid(g: GameState, uid: string): boolean {
  const inst = g.cards[uid];
  if (!inst) return false;
  const def = g.content.cardsById[inst.defId];
  const max = def.upgrades?.length ?? 0;
  return (inst.upgrade ?? 0) < max;
}

export function upgradeCardByUid(g: GameState, uid: string): boolean {
  if (!canUpgradeUid(g, uid)) return false;

  g.cards[uid].upgrade = (g.cards[uid].upgrade ?? 0) + 1;

  return true;
}