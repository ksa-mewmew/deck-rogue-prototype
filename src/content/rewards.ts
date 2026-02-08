import type { GameState } from "../engine/types";
import { uid, shuffle, logMsg, pickOne } from "../engine/rules";

export function obtainTreasure(g: GameState) {
  if (g.run.treasureObtained) return;

  g.run.treasureObtained = true;

  const id = uid();
  g.cards[id] = { uid: id, defId: "goal_treasure", zone: "deck" };
  g.deck.push(id);
  g.deck = shuffle(g.deck);

  logMsg(g, "저주받은 보물을 획득했습니다! 덱에 [저주받은 보물] 추가");
}

export type RewardEntry = { id: string; weight: number };

// 원본 풀(절대 수정하지 않기)
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
  // ...
];

function buildWeightMap(pool: RewardEntry[]): Array<{ id: string; w: number }> {
  const m = new Map<string, number>();
  for (const e of pool) {
    const w = Math.max(0, e.weight ?? 0);
    if (w <= 0) continue;
    m.set(e.id, (m.get(e.id) ?? 0) + w); // 같은 id면 합산
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

// ✅ 매번 “원본 풀에서 새로” 2장(서로 다르게) 뽑는다 = 풀은 항상 초기 상태
export function offerRewardPair(): [string, string] {
  const items = buildWeightMap(REWARD_POOL); // 로컬 계산(원본 불변)
  if (items.length < 2) throw new Error("Reward pool must have at least 2 distinct ids.");

  const a = pickWeightedOne(items);
  const items2 = items.filter(x => x.id !== a); // 로컬 필터(원본 불변)
  const b = pickWeightedOne(items2);

  return [a, b];
}


export function addCardToDeck(g: GameState, defId: string) {
  const id = uid();
  g.cards[id] = { uid: id, defId, zone: "deck" };
  g.deck.push(id);
  g.deck = shuffle(g.deck);
  logMsg(g, `보상 획득: [${g.content.cardsById[defId].name}] 덱에 추가`);
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

  logMsg(g, `카드 제거: [${g.content.cardsById[c.defId].name}]`);
}

const CURSED_TREASURE_ID = "goal_treasure";

export function removeCardByUid(g: GameState, uid: string) {
  const inst = g.cards[uid];
  if (!inst) return;

  if (inst.defId === CURSED_TREASURE_ID) {
    logMsg(g, "저주받은 보물은 덱에서 제거할 수 없습니다.");
    return; // ✅ 제거 막기
  }  
  // zone 제거
  g.deck = g.deck.filter((x) => x !== uid);
  g.hand = g.hand.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);

  // 전투 중일 수도 있으니 슬롯에서도 제거
  g.frontSlots = g.frontSlots.map((x) => (x === uid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === uid ? null : x));

  // 영구 제거(소실처럼 취급)
  inst.zone = "vanished";
  g.vanished.push(uid);
}