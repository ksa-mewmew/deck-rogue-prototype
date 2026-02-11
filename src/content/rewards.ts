import type { GameState } from "../engine/types";
import { shuffle, logMsg, pickOne } from "../engine/rules";
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


export const REWARD_POOL: RewardEntry[] = [
  { id: "berserk", weight: 20 },
  { id: "bandage", weight: 12 },
  { id: "arrow_rain", weight: 20 },
  { id: "smoke", weight: 0 },
  { id: "redeploy", weight: 12 },
 
  { id: "secret_strike", weight: 1 },
  { id: "fire_scroll", weight: 1 },
  { id: "caltrops", weight: 12 },
  { id: "emergency_rations", weight: 1 },
  { id: "painkiller", weight: 1 },
  { id: "field_experience", weight: 1 },

  { id: "camp_prep", weight: 20 },
  { id: "vital_shot", weight: 12 },
  { id: "taunt", weight: 12 },
  { id: "rapid_fire", weight: 12 },

];

function buildWeightMap(pool: RewardEntry[]): Array<{ id: string; w: number }> {
  const m = new Map<string, number>();
  for (const e of pool) {
    const w = Math.max(0, e.weight ?? 0);
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

export function rollOfferedUpgrade(): number {
  return Math.random() < 0.1 ? 1 : 0; // 10%
}

export function offerRewardPair(): [OfferedCard, OfferedCard] {
  const mapA = buildWeightMap(REWARD_POOL);
  const idA = pickWeightedOne(mapA);

  const mapB = mapA.filter((x) => x.id !== idA);
  const idB = pickWeightedOne(mapB);

  return [
    { defId: idA, upgrade: rollOfferedUpgrade() },
    { defId: idB, upgrade: rollOfferedUpgrade() },
  ];
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