import type { GameState } from "../engine/types";
import { shuffle, logMsg, pickOne, madnessP } from "../engine/rules";
import { displayCardNameWithUpgrade } from "../engine/cardText";
import { currentTotalDeckLikeSize } from "../engine/combat";
import { awakenMadness, openMadnessTemptChoice, isForgeHostile } from "../engine/faith";

export function obtainTreasure(g: GameState) {
  if (g.run.treasureObtained) return;

  g.run.treasureObtained = true;
  g.run.afterTreasureNodePicks = 0;
  g.run.deckSizeAtTreasure = currentTotalDeckLikeSize(g);

  const id = newUid(g);
  g.cards[id] = { uid: id, defId: "goal_treasure", zone: "deck", upgrade: 0 };
  g.deck.push(id);
  g.deck = shuffle(g.deck);

  logMsg(g, "저주받은 보물을 획득했습니다! 덱에 [저주받은 보물] 추가. 이제 입구(START)로 돌아가 탈출하세요!");

  repopulateDungeonAfterTreasure(g);
  logMsg(g, "보물이 울부짖자, 던전의 모든 방이 다시 채워집니다...");

  // 광기(0) 각성: 보물 즉시 1회 선택
  awakenMadness(g);
  openMadnessTemptChoice(g);
}

function repopulateDungeonAfterTreasure(g: GameState) {
  const map: any = (g.run as any)?.map;
  if (!map || !map.nodes) return;

  const startId = map.startId;
  const treasureId = map.treasureId;

  const ids = Object.keys(map.nodes);
  const repopulatedIds: string[] = [];
  for (const id of ids) {
    if (id === startId) continue;
    if (id === treasureId) continue;

    const node: any = map.nodes[id];
    if (!node) continue;

    node.cleared = false;
    delete node.noRespawn;
    delete node.lastClearedMove;

    node.reprocCount = Number(node.reprocCount ?? 0) + 1;

    const depth = Number(node.depth ?? 0);

    if (node.kind === "ELITE") continue;
    if (node.kind === "START" || node.kind === "TREASURE") continue;

    repopulatedIds.push(id);

    // 보물 이후 가혹함 완화: 전투 비중을 조금 낮추고 상점을 포함.
    const pBattle = Math.min(0.7, 0.54 + depth * 0.008);
    const pEvent = 0.20;
    const pRest = 0.16;
    const r = Math.random();

    node.kind =
      r < pBattle
        ? "BATTLE"
        : r < pBattle + pEvent
        ? "EVENT"
        : r < pBattle + pEvent + pRest
        ? "REST"
        : "SHOP";
  }

  // 보물 이후 맵: 상점 최소 보장
  const minShopCount = Math.min(2, repopulatedIds.length);
  let shopCount = repopulatedIds.reduce((acc, id) => acc + (map.nodes[id]?.kind === "SHOP" ? 1 : 0), 0);
  if (shopCount < minShopCount) {
    const convertCandidates = repopulatedIds
      .filter((id) => map.nodes[id]?.kind !== "SHOP")
      .sort((a, b) => Number(map.nodes[a]?.depth ?? 999) - Number(map.nodes[b]?.depth ?? 999));

    for (const id of convertCandidates) {
      const node: any = map.nodes[id];
      if (!node) continue;
      node.kind = "SHOP";
      shopCount += 1;
      if (shopCount >= minShopCount) break;
    }
  }
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
  { id: "mad_echo", weight: 12 },
  { id: "mad_insight", weight: 12 },
  { id: "mad_bargain", weight: 12 },
  { id: "mad_no_impossible", weight: 3 },
  { id: "mad_bed_of_thorns", weight: 3 },
];

export const REWARD_POOL: RewardEntry[] = [
  { id: "smoke", weight: 0 },

  { id: "redeploy", weight: 3 },
  { id: "secret_strike", weight: 3 },
  { id: "fire_scroll", weight: 3 },
  { id: "emergency_rations", weight: 3 },
  { id: "field_experience", weight: 3 },
  { id: "install_makeshift_wall", weight: 3 },
  { id: "install_scriptorium", weight: 3 },
  { id: "cut_second", weight: 3 },
  { id: "coin_toss", weight: 3 },
  { id: "unforgettable_memory", weight: 3 },

  { id: "bandage", weight: 12 },
  { id: "caltrops", weight: 12 },
  { id: "painkiller", weight: 12 },
  { id: "vital_shot", weight: 12 },
  { id: "taunt", weight: 12 },
  { id: "cloth_scrap_armor", weight: 12 },
  { id: "hide_on_floor", weight: 12 },
  { id: "prey_mark", weight: 12 },
  { id: "hand_blade", weight: 12 },
  { id: "lone_blow", weight: 12 },
  { id: "install_cursed_banner", weight: 12 },
  { id: "install_lead_observation", weight: 12 },
  { id: "scribe_hand", weight: 12 },
  { id: "innate_march_shield", weight: 12 },
  { id: "fuel_kindling", weight: 12 },
  { id: "impossible_plan", weight: 12 },
  { id: "slash_frenzy", weight: 12 },
  { id: "doppelganger", weight: 12 },

  { id: "berserk", weight: 20 },
  { id: "arrow_rain", weight: 20 },
  { id: "camp_prep", weight: 20 },
  { id: "rapid_fire", weight: 20 },
  { id: "quiet_ambush", weight: 20 },
  { id: "blood_contract", weight: 20 },
  { id: "brawl_cleaver", weight: 20 },
  { id: "gambler_glove", weight: 20 },
  { id: "install_ballista", weight: 20 },
  { id: "install_iron_bulwark", weight: 20 },
  { id: "install_castle_ballista", weight: 20 },
  { id: "install_wedge_spike", weight: 20 },
  { id: "blood_tribute", weight: 20 },
  { id: "heavy_shield", weight: 20 },
  { id: "reinforced_bastion", weight: 20 },
  { id: "improv_arrow", weight: 20 },
  { id: "low_body_temperature", weight: 20 },

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
    mult3?: number;
    mult12?: number;
    mult20?: number;
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

export type RewardPickContext = "BATTLE" | "ELITE" | "BOSS";

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

function offerNFromPool(
  g: GameState,
  pool: RewardEntry[],
  n: number,
  opt?: Parameters<typeof buildWeightMapBiased>[1]
): OfferedCard[] {
  const out: OfferedCard[] = [];
  let map = opt ? buildWeightMapBiased(pool, opt) : buildWeightMap(pool);
  const isMad = pool === MAD_REWARD_POOL;

  for (let i = 0; i < n; i++) {
    if (map.length <= 0) break;
    const id = pickWeightedOne(map);
    out.push({ defId: id, upgrade: isMad ? 0 : rollOfferedUpgrade(g) });
    map = map.filter((x) => x.id !== id);
  }
  return out;
}

function isHighRarity(g: GameState, defId: string): boolean {
  const r = (g.content.cardsById[defId] as any)?.rarity as string | undefined;
  return r === "SPECIAL" || r === "RARE";
}

function rewardBiasForContext(g: GameState, ctx: RewardPickContext): Parameters<typeof buildWeightMapBiased>[1] {

  if (ctx === "BOSS") {
    return { drop12: true, drop20: true };
  }

  if (ctx === "ELITE") {
    return { mult3: 2.7, mult12: 1.8, mult20: 0.8 };
  }

  // 일반 전투: 특별/희귀 pity
  const pity = Math.max(0, Math.min(10, Number((g.run as any).rewardPityNonElite ?? 0) || 0));
  const mult12 = 1 + pity * 0.18; // 특별 상승
  const mult3  = 1 + pity * 0.30; // 희귀 상승
  const mult20 = Math.max(0.65, 1 - pity * 0.04);
  return { mult3, mult12, mult20 };
}

export function offerRewardN(g: GameState, ctx: RewardPickContext, n: number): OfferedCard[] {
  const wantN = Math.max(1, Math.min(6, Math.floor(Number(n) || 0)));
  const f = g.player?.fatigue ?? 0;

  const junk: OfferedCard = { defId: pickOne(JUNK_REWARD_POOL) as any, upgrade: 0 };

  const pickNormal = (): OfferedCard[] => {
    const opt = rewardBiasForContext(g, ctx);
    return offerNFromPool(g, REWARD_POOL, wantN, opt);
  };

  const maybeMad = (c: OfferedCard): OfferedCard => {
    if (ctx === "BOSS") return c; // 보스는 "레어만" 고정
    if (!shouldOfferMadCard(g)) return c;
    return offerOneFromPool(g, MAD_REWARD_POOL);
  };

  let picks: OfferedCard[] = pickNormal();
  while (picks.length < wantN) picks.push({ defId: "arrow", upgrade: 0 });

  // 피로도에 따른 정크/붕괴(기존 감각 유지, N슬롯 버전)
  if (f >= 12) {
    // 대부분 광기, 마지막은 정크/광기 변동
    const next: OfferedCard[] = [];
    for (let i = 0; i < wantN; i++) {
      const isLast = i === wantN - 1;
      if (isLast) next.push(Math.random() < 0.55 ? offerOneFromPool(g, MAD_REWARD_POOL) : junk);
      else next.push(offerOneFromPool(g, MAD_REWARD_POOL));
    }
    picks = next;
  } else if (f >= 9) {
    // 9~11: 정크 1칸 고정
    const idx = Math.floor(Math.random() * wantN);
    picks[idx] = junk;
    picks = picks.map(maybeMad);
  } else if (f >= 7) {
    // 7~8: 정크 오염 확률
    const pJunk = f === 7 ? 0.25 : 0.45;
    if (Math.random() < pJunk) {
      const idx = Math.floor(Math.random() * wantN);
      picks[idx] = junk;
    }
    picks = picks.map(maybeMad);
  } else {
    picks = picks.map(maybeMad);
  }

  // pity 업데이트
  // - 특별/희귀가 "등장"하면 즉시 초기화
  // - 일반 전투에서만(비정예) 미등장 시 누적
  const hasHigh = picks.some((x) => isHighRarity(g, x.defId));
  if (hasHigh) {
    (g.run as any).rewardPityNonElite = 0;
  } else if (ctx === "BATTLE") {
    (g.run as any).rewardPityNonElite = (Number((g.run as any).rewardPityNonElite ?? 0) || 0) + 1;
  }

  return picks.slice(0, wantN);
}

export function offerRewardTrio(g: GameState, ctx: RewardPickContext): [OfferedCard, OfferedCard, OfferedCard] {
  const picks = offerRewardN(g, ctx, 3);
  while (picks.length < 3) picks.push({ defId: "arrow", upgrade: 0 });
  return [picks[0], picks[1], picks[2]] as any;
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

  const removedName = displayCardNameWithUpgrade(
    g,
    g.content.cardsById[g.cards[c.uid].defId]?.name ?? g.cards[c.uid].defId,
    g.cards[c.uid].upgrade ?? 0
  );
  logMsg(g, `카드 제거: [${removedName}]`);
}

const CURSED_TREASURE_ID = "goal_treasure";

export function removeCardByUid(g: GameState, uid: string): boolean {
  const inst = g.cards[uid];
  if (!inst) return false;

  if (inst.defId === CURSED_TREASURE_ID) {
    logMsg(g, "저주받은 보물은 덱에서 제거할 수 없습니다.");
    return false;
  }  

  g.deck = g.deck.filter((x) => x !== uid);
  g.hand = g.hand.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);

  g.frontSlots = g.frontSlots.map((x) => (x === uid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === uid ? null : x));

  inst.zone = "vanished";
  g.vanished.push(uid);

  const removedName = displayCardNameWithUpgrade(
    g,
    g.content.cardsById[g.cards[inst.uid].defId]?.name ?? g.cards[inst.uid].defId,
    g.cards[inst.uid].upgrade ?? 0
  );
  logMsg(g, `카드 제거: [${removedName}]`);

  return true;
}

export function canUpgradeUid(g: GameState, uid: string): boolean {
  // 화로의 주인 적대: 강화 불가
  if (isForgeHostile(g)) return false;
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