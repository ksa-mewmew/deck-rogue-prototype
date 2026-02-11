import type { EnemyEffect, GameState, Side, EnemyState } from "./types";
import { aliveEnemies, applyStatus, clampMin, logMsg, pickOne, shuffle, applyStatusTo } from "./rules";
import { applyDamageToPlayer, applyDamageToEnemy, markEnemyShaken } from "./effects";
import { resolvePlayerEffects } from "./resolve";
import { getCardDefFor } from "../content/cards";
import { cardNameWithUpgrade, getCardDefByIdWithUpgrade } from "../content/cards";
import { offerRewardPair } from "../content";
import { BOSS_OMEN_HINT } from "../content";

export function escapeRequiredNodePicks(deckSizeAtTreasure: number, baseReq = 10, baseDeck = 16) {
  const excess = Math.max(0, deckSizeAtTreasure - baseDeck);
  const extra = Math.ceil(Math.sqrt(excess));
  return baseReq + extra;
}


export function enemyStateFromId(g: GameState, enemyId: string): EnemyState {
  const def = g.content.enemiesById[enemyId];
  return {
    id: def.id,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    intentIndex: 0,
    status: { vuln: 0, weak: 0, bleed: 0, disrupt: 0 },
    immuneThisTurn: false,
    immuneNextTurn: false,
    lastIntentKey: null,
    lastIntentStreak: 0,
    soulWarnCount: enemyId === "boss_soul_stealer" ? 0 : undefined,
    soulArmed: enemyId === "boss_soul_stealer" ? false : undefined,
    soulWillNukeThisTurn: enemyId === "boss_soul_stealer" ? false : undefined,
  };
}

function patternAllowedByCooldown(g: GameState, pattern: string[], nowBattleNo: number, cooldownBattles = 5) {
  for (const id of pattern) {
    const last = g.run.enemyLastSeenBattle[id];
    if (last != null && nowBattleNo - last < cooldownBattles) return false;
  }
  return true;
}

export function spawnEncounter(g: GameState, opt?: { forceBoss?: boolean; forcePatternIds?: string[] }) {
  const forceBoss = opt?.forceBoss ?? false;
  const nodeNo = g.run.nodePickCount;
  const battleNo = g.run.battleCount + 1;

  if (opt?.forcePatternIds && opt.forcePatternIds.length > 0) {
    const chosen = opt.forcePatternIds;
    g.run.battleCount = battleNo;
    for (const id of chosen) g.run.enemyLastSeenBattle[id] = battleNo;
    g.enemies = chosen.map((id) => enemyStateFromId(g, id));
    logMsg(g, `전투 시작! (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
    return;
  }

  if (forceBoss) {
    if (g.run.bossPool.length === 0 && !g.run.nextBossId) {
      logMsg(g, `보스 풀이 비었습니다. 일반 전투로 진행합니다. (노드 ${nodeNo})`);
    } else {
      let bossId = g.run.nextBossId ?? null;
      if (bossId != null){
        g.run.bossOmenText = g.content.enemiesById[bossId].omen ?? null;
        g.run.bossOmenText = BOSS_OMEN_HINT[bossId] ?? null;
      }
        if (bossId) {
        g.run.nextBossId = null;
        g.run.bossPool = g.run.bossPool.filter((x) => x !== bossId);
      } else {
        bossId = pickOne(g.run.bossPool);
        g.run.bossPool = g.run.bossPool.filter((x) => x !== bossId);
      }
      g.enemies = [enemyStateFromId(g, bossId)];
      logMsg(g, `보스 등장! (노드 ${nodeNo}) 적: ${g.enemies[0].name}`);
      return;
    }
  }

  const patternsByTier: string[][][] = [
    [["goblin_raider"], ["watching_statue"], ["pebble_golem"], ["slime"]],

    [
      ["goblin_raider", "slime"],
      ["pebble_golem", "pebble_golem"],
      ["rock_golem"],
      ["goblin_raider", "goblin_raider"],
      ["poison_spider"],
    ],
    
    [
      ["goblin_raider", "goblin_raider", "goblin_raider"],
      ["pebble_golem", "pebble_golem", "slime"],
      ["rock_golem", "pebble_golem"],
      ["slime", "slime"],
      ["poison_spider", "slime"],
      ["gravity_echo"],
    ],
  ];

  const postTreasurePatterns: string[][] = [
    ["gravity_echo", "poison_spider"],
    ["poison_spider", "slime"],
    ["watching_statue", "slime"],
    ["watching_statue", "watching_statue"],
    ["poison_spider", "poison_spider"],
    ["rock_golem", "gravity_echo"],
    ["goblin_raider", "goblin_raider", "watching_statue"],
  ];

  const T = (g.run.nodePickCount ?? 0) + (g.time ?? 0);
  const tierIdx = Math.min(patternsByTier.length - 1, Math.floor(Math.max(0, T) / 10));
  const patterns: string[][] = g.run.treasureObtained ? postTreasurePatterns : patternsByTier[tierIdx];

  const cooldownBattles = 5;
  const allowed = patterns.filter((p) => patternAllowedByCooldown(g, p, battleNo, cooldownBattles));
  const pickFrom = allowed.length > 0 ? allowed : patterns;

  const chosen = pickOne(pickFrom);

  g.run.battleCount = battleNo;
  for (const id of chosen) g.run.enemyLastSeenBattle[id] = battleNo;

  g.enemies = chosen.map((id) => enemyStateFromId(g, id));
  logMsg(g, `전투 시작! (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
}

export function startCombat(g: GameState) {

  g.player.block = 0;
  g.player.status.vuln = 0;
  g.player.status.weak = 0;
  g.player.status.bleed = 0;
  g.player.status.disrupt = 0;

  g.player.zeroSupplyTurns = 0;

  g.phase = "REVEAL";

  g.frontSlots = [null, null, null];
  g.backSlots = [null, null, null];
  g.backSlotDisabled = [false, false, false];

  g.backUidsThisTurn = [];

  g.hand = [];
  g.selectedHandCardUid = null;

  g.pendingTarget = null;
  g.pendingTargetQueue = [];

  g.usedThisTurn = 0;
  g.winHooksAppliedThisCombat = false;

  const bonus = g.run.nextBattleSuppliesBonus ?? 0;
  g.player.supplies = 10 + bonus;
  if (bonus !== 0) {
    logMsg(g, `다음 전투 보너스 적용: S +${bonus}`);
    g.run.nextBattleSuppliesBonus = 0;
  }

  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;

  g.drawCountThisTurn = 0;
  g.attackedEnemyIndicesThisTurn = [];

  g.frontPlacedThisTurn = 0;
  g.usedThisTurn = 0;

  drawCards(g, 4);

  revealIntentsAndDisrupt(g);
  g.phase = "PLACE";

  g.victoryResolvedThisCombat = false;
}

function getCombatDeckSize(g: GameState): number {
  return (
    g.deck.length +
    g.hand.length +
    g.discard.length +
    g.frontSlots.filter(Boolean).length +
    g.backSlots.filter(Boolean).length +
    g.exhausted.length
  );
}

function calcDeckSizeDamage(act: { base: number; per: number; div: number; cap?: number }, deckSize: number) {
  const scale = Math.ceil(deckSize / act.div);
  let dmg = act.base + act.per * scale;
  if (act.cap != null) dmg = Math.min(dmg, act.cap);
  return { dmg, scale };
}

const NO_REPEAT_INTENT_INDEXES: Record<string, ReadonlySet<number>> = {
  other_adventurer: new Set([1]),
  slime: new Set([0, 1]),
  poison_spider: new Set([0, 2]),
  boss_cursed_wall: new Set([0]),
  boss_giant_orc: new Set([1]),
};

function shouldBlockRepeatByIndex(enemyId: string, intentIndex: number) {
  const s = NO_REPEAT_INTENT_INDEXES[enemyId];
  return !!s && s.has(intentIndex);
}

function stableStringify(v: any): string {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "number" || t === "boolean") return String(v);
  if (t === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (t === "object") {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  }
  return JSON.stringify(String(v));
}

function intentActionKey(intent: any): string {
  if (!intent) return "NONE";
  const clone: any = {};
  for (const k of Object.keys(intent)) {
    if (k === "label" || k === "text" || k === "desc" || k === "name") continue;
    clone[k] = intent[k];
  }
  if (clone.effects && Array.isArray(clone.effects)) {
    clone.effects = clone.effects.map((e: any) => {
      const ec: any = {};
      for (const kk of Object.keys(e ?? {})) {
        if (kk === "label" || kk === "text" || kk === "desc" || kk === "name") continue;
        ec[kk] = e[kk];
      }
      return ec;
    });
  }
  return stableStringify(clone);
}

function commitIntentHistory(e: any, key: string) {
  const lastKey: string | null = e.lastIntentKey ?? null;
  const streak: number = e.lastIntentStreak ?? 0;
  if (lastKey === key) {
    e.lastIntentStreak = Math.min(3, streak + 1);
  } else {
    e.lastIntentKey = key;
    e.lastIntentStreak = 1;
  }
}

function pickNextIntentIndex(
  intents: any[],
  lastIndex: number,
  enemyId: string,
  lastKey: string | null,
  streak: number
) {
  const n = intents.length;
  if (n <= 1) return 0;

  const candidates = Array.from({ length: n }, (_, i) => i);

  const block2 = (ix: number) => ix === lastIndex && shouldBlockRepeatByIndex(enemyId, ix);
  const block3 = (ix: number) => !!lastKey && streak >= 2 && intentActionKey(intents[ix]) === lastKey;

  const both = candidates.filter((ix) => !block2(ix) && !block3(ix));
  if (both.length > 0) return pickOne(both);

  const onlyNo3 = candidates.filter((ix) => !block3(ix));
  if (onlyNo3.length > 0) return pickOne(onlyNo3);

  const onlyNo2 = candidates.filter((ix) => !block2(ix));
  if (onlyNo2.length > 0) return pickOne(onlyNo2);

  return pickOne(candidates);
}

const SOUL_WARN_INTENT_INDEX = 2;
const SOUL_NUKE_CHANCE = 0.6;

export function revealIntentsAndDisrupt(g: GameState) {
  if (g.intentsRevealedThisTurn) return;
  g.intentsRevealedThisTurn = true;

  g.attackedEnemyIndicesThisTurn = [];
  g.backUidsThisTurn = [];
  g.drawCountThisTurn = 0;

  g.phase = "REVEAL";

  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  g.disruptIndexThisTurn = null;
  g.backSlotDisabled = [false, false, false];

  const disrupt = g.player.status.disrupt ?? 0;
  if (disrupt > 0) {
    g.disruptIndexThisTurn = Math.floor(Math.random() * 3);
    g.backSlotDisabled[g.disruptIndexThisTurn] = true;
  }

  for (const e of g.enemies) {
    e.immuneThisTurn = e.immuneNextTurn;
    e.immuneNextTurn = false;
  }

  for (const e of aliveEnemies(g)) {
    e.intentLabelOverride = undefined;

    const def = g.content.enemiesById[e.id];
    const intents = def.intents;
    if (!intents || intents.length === 0) continue;

    const nextIx = pickNextIntentIndex(
      intents,
      e.intentIndex ?? 0,
      e.id,
      e.lastIntentKey ?? null,
      e.lastIntentStreak ?? 0
    );

    e.intentIndex = nextIx;

    const picked = intents[nextIx % intents.length];
    commitIntentHistory(e, intentActionKey(picked));

    if (e.id === "boss_soul_stealer") {
      e.soulWillNukeThisTurn = false;
      const warn = e.soulWarnCount ?? 0;
      const armed = !!e.soulArmed;

      if (armed) {
        if (Math.random() < SOUL_NUKE_CHANCE) {
          e.soulWillNukeThisTurn = true;
          e.intentLabelOverride = "종말: 50 피해";
          logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
          continue;
        }
        const it = intents[e.intentIndex % intents.length];
        e.intentLabelOverride = `${it.label} (⚠ 폭발 가능 상태)`;
        logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
        continue;
      }

      const it = intents[e.intentIndex % intents.length];
      e.intentLabelOverride = `${it.label} (경고 ${warn}/3)`;
      logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
      continue;
    }

    const intent = intents[e.intentIndex % intents.length];
    let label = intent.label;

    const deckAct = intent.acts.find((a: any) => a.op === "damagePlayerByDeckSize");
    if (deckAct && deckAct.op === "damagePlayerByDeckSize") {
      const deckSize = getCombatDeckSize(g);
      const { dmg } = calcDeckSizeDamage(deckAct, deckSize);
      const capText = deckAct.cap != null ? ` (최대 ${deckAct.cap})` : "";
      const head = intent.label.split(":")[0].trim();
      label = `${head}: ${dmg} 피해${capText}`;
    }

    e.intentLabelOverride = label;
    logMsg(g, `적 의도: ${e.name} → ${label}`);
  }

  if (g.disruptIndexThisTurn !== null) {
    logMsg(g, `교란: 이번 턴 후열 ${g.disruptIndexThisTurn} 무효`);
  }

  g.phase = "PLACE";
}

export function placeCard(g: GameState, cardUid: string, side: Side, idx: number) {
  if (g.phase !== "PLACE") return;
  if (!g.hand.includes(cardUid)) return;

  if (side === "back") {
    if (!g.backUidsThisTurn.includes(cardUid)) g.backUidsThisTurn.push(cardUid);
  }

  const slots = side === "front" ? g.frontSlots : g.backSlots;
  if (slots[idx]) return;

  g.hand = g.hand.filter((x) => x !== cardUid);
  slots[idx] = cardUid;
  g.cards[cardUid].zone = side;

  g.usedThisTurn += 1;
  logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}]를 ${side === "front" ? "전열" : "후열"} ${idx}번에 배치`);
  if (side === "front") g.frontPlacedThisTurn += 1;
}

function isTag(g: GameState, cardUid: string, tag: "EXHAUST" | "VANISH") {
  const def = getCardDefFor(g, cardUid);
  return def.tags?.includes(tag) ?? false;
}

function removeFromSlots(g: GameState, cardUid: string) {
  g.frontSlots = g.frontSlots.map((x) => (x === cardUid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === cardUid ? null : x));
}

function moveCardAfterUse(g: GameState, cardUid: string, usedSide: "front" | "back") {
  const def = getCardDefFor(g, cardUid);
  removeFromSlots(g, cardUid);

  g.hand = g.hand.filter((x) => x !== cardUid);
  g.deck = g.deck.filter((x) => x !== cardUid);
  g.discard = g.discard.filter((x) => x !== cardUid);

  const vanishWhen = def.vanishWhen;
  const exhaustWhen = def.exhaustWhen;

  const vanishOk =
    vanishWhen === "BOTH" ||
    (vanishWhen === "FRONT" && usedSide === "front") ||
    (vanishWhen === "BACK" && usedSide === "back");

  const exhaustOk =
    exhaustWhen === "BOTH" ||
    (exhaustWhen === "FRONT" && usedSide === "front") ||
    (exhaustWhen === "BACK" && usedSide === "back");

  if (vanishWhen && vanishWhen !== "NONE" && vanishOk) {
    g.vanished.push(cardUid);
    g.cards[cardUid].zone = "vanished";
    logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}] 소실(영구 제거)`);
    return;
  }

  if (exhaustWhen && exhaustWhen !== "NONE" && exhaustOk) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}] 소모(이번 전투에서 제거)`);
    return;
  }

  if (!vanishWhen && isTag(g, cardUid, "VANISH")) {
    g.vanished.push(cardUid);
    g.cards[cardUid].zone = "vanished";
    logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}] 소실(영구 제거)`);
    return;
  }

  if (!exhaustWhen && isTag(g, cardUid, "EXHAUST")) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}] 소모(이번 전투에서 제거)`);
    return;
  }

  g.discard.push(cardUid);
  g.cards[cardUid].zone = "discard";
}

function clearSlots(g: GameState) {
  for (let i = 0; i < 3; i++) {
    const f = g.frontSlots[i];
    if (f) moveCardAfterUse(g, f, "front");
    g.frontSlots[i] = null;

    const b = g.backSlots[i];
    if (b) moveCardAfterUse(g, b, "back");
    g.backSlots[i] = null;
  }
}

export function resolveBack(g: GameState) {
  if (g.phase !== "PLACE" && g.phase !== "BACK") return;
  g.phase = "BACK";
  logMsg(g, "=== 후열 단계 ===");

  for (let i = 0; i < 3; i++) {
    const uid = g.backSlots[i];
    if (!uid) continue;

    const def = getCardDefFor(g, uid);

    if (!g.player.immuneToDisruptThisTurn && g.backSlotDisabled[i]) {
      logMsg(g, `후열 ${i}번 [${def.name}] 교란으로 무효`);
      continue;
    }

    resolvePlayerEffects({ game: g, side: "back", cardUid: uid }, def.back);
  }

  g.phase = "FRONT";
}

export function resolveFront(g: GameState) {
  if (g.phase !== "FRONT") return;
  logMsg(g, "=== 전열 단계 ===");

  for (let i = 0; i < 3; i++) {
    const uid = g.frontSlots[i];
    if (!uid) continue;

    const def = getCardDefFor(g, uid);
    resolvePlayerEffects({ game: g, side: "front", cardUid: uid }, def.front);
  }

  g.phase = "ENEMY";
}

export function resolveEnemy(g: GameState) {
  if (g.phase !== "ENEMY") return;
  logMsg(g, "=== 적 행동 ===");

  for (const e of aliveEnemies(g)) {
    const def = g.content.enemiesById[e.id];
    const intent = def.intents[e.intentIndex % def.intents.length];

    if (e.id === "boss_soul_stealer") {
      if (e.soulWillNukeThisTurn) {
        const ew = e.status.weak ?? 0;
        applyDamageToPlayer(g, 50, "ENEMY_ATTACK", "영혼 강탈자", ew);
        logMsg(g, "영혼 강탈자: 영혼 폭발 → 50 피해!");
        e.soulWillNukeThisTurn = false;
        e.soulArmed = false;
        e.soulWarnCount = 0;
        continue;
      }

      for (const act of intent.acts) resolveEnemyEffect(g, e, act);

      if (e.intentIndex === SOUL_WARN_INTENT_INDEX) {
        e.soulWarnCount = (e.soulWarnCount ?? 0) + 1;
        logMsg(g, `영혼 강탈자: 경고 +1 (${e.soulWarnCount}/3)`);
        if ((e.soulWarnCount ?? 0) >= 3) {
          e.soulArmed = true;
          logMsg(g, "영혼 강탈자: 경고 3회 완료 → 폭발 가능 상태!");
        }
      }

      continue;
    }

    for (const act of intent.acts) resolveEnemyEffect(g, e, act);
  }

  g.phase = "UPKEEP";
}

function resolveEnemyEffect(g: GameState, enemy: EnemyState, act: EnemyEffect) {
  switch (act.op) {
    case "damagePlayer": {
      const ew = enemy.status.weak ?? 0;
      applyDamageToPlayer(g, act.n, "ENEMY_ATTACK", enemy.name, ew);
      return;
    }

    case "damagePlayerFormula": {
      if (act.kind === "goblin_raider") {
        const dmg = Math.max(0, 12 - g.usedThisTurn);
        const ew = enemy.status.weak ?? 0;
        applyDamageToPlayer(g, dmg, "ENEMY_ATTACK", enemy.name, ew);
      } else {
        const dmg = 4 + g.usedThisTurn;
        const ew = enemy.status.weak ?? 0;
        applyDamageToPlayer(g, dmg, "ENEMY_ATTACK", enemy.name, ew);
      }
      return;
    }

    case "supplies": {
      g.player.supplies = clampMin(g.player.supplies + act.n, 0);
      logMsg(g, `적 효과: 보급 S ${act.n >= 0 ? "+" : ""}${act.n} (현재 ${g.player.supplies})`);
      return;
    }

    case "statusPlayer": {
      applyStatus(g.player, act.key, act.n);
      logMsg(g, `적 효과: 플레이어 상태 ${act.key} ${act.n >= 0 ? "+" : ""}${act.n}`);
      return;
    }

    case "enemyHealSelf": {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + act.n);
      logMsg(g, `적(${enemy.name})이(가) ${act.n} 회복 (HP ${enemy.hp}/${enemy.maxHp})`);
      return;
    }

    case "enemyImmuneThisTurn": {
      enemy.immuneThisTurn = true;
      logMsg(g, `적(${enemy.name})이(가) 피해 면역 상태가 됨`);
      return;
    }

    case "enemyImmuneNextTurn": {
      enemy.immuneNextTurn = true;
      logMsg(g, `적(${enemy.name})이(가) 다음 턴 피해 면역 상태가 됨`);
      return;
    }

    case "fatiguePlayer": {
      g.player.fatigue = Math.max(0, g.player.fatigue + act.n);
      logMsg(g, `적 효과: 피로 F ${act.n >= 0 ? "+" : ""}${act.n} (현재 ${g.player.fatigue})`);
      return;
    }

    case "damagePlayerByDeckSize": {
      const deckSize =
        g.deck.length +
        g.hand.length +
        g.discard.length +
        g.frontSlots.filter(Boolean).length +
        g.backSlots.filter(Boolean).length +
        g.exhausted.length;

      const scale = Math.ceil(deckSize / act.div);
      let dmg = act.base + act.per * scale;
      if (act.cap != null) dmg = Math.min(dmg, act.cap);

      applyDamageToPlayer(g, dmg, "ENEMY_ATTACK", enemy.name);
      logMsg(g, `중력 피해: base ${act.base} + per ${act.per} * ceil(${deckSize}/${act.div})=${scale} => ${dmg}`);
      return;
    }

    default: {
      const _exhaustive: never = act;
      return _exhaustive;
    }
  }
}

export function upkeepEndTurn(g: GameState) {
  if (g.phase !== "UPKEEP") return;
  logMsg(g, "=== 유지비 / 상태 처리 ===");

  const frontCount = g.frontPlacedThisTurn;
  if (frontCount > 0) logMsg(g, `전열 유지비 처리: 전열 ${frontCount}장`);

  for (let i = 0; i < frontCount; i++) {
    if (g.player.supplies > 0) {
      g.player.supplies -= 1;
    } else {
      g.player.fatigue += 1;
      applyDamageToPlayer(g, 3, "ZERO_SUPPLY", `전열 유지비 부족!`);
    }
  }

  if (g.player.supplies === 0) {
    g.player.zeroSupplyTurns += 1;
    const p = g.player.zeroSupplyTurns;
    applyDamageToPlayer(g, p, "ZERO_SUPPLY", `보급 없이 턴 종료! 누적 ${p}번째`);
  }

  const bleed = g.player.status.bleed ?? 0;
  if (bleed > 0) applyDamageToPlayer(g, bleed, "BLEED", "출혈");

  for (const en of aliveEnemies(g)) {
    const b = en.status.bleed ?? 0;
    if (b > 0) {
      if (!en.immuneThisTurn) {
        en.hp = Math.max(0, en.hp - b);
        const idx = g.enemies.indexOf(en);
        if (idx >= 0) markEnemyShaken(g, idx);
        logMsg(g, `적(${en.name}) 출혈로 HP -${b} (HP ${en.hp}/${en.maxHp})`);
      } else {
        logMsg(g, `적(${en.name})은(는) 이번 턴 면역이라 출혈 피해 무시`);
      }
    }
  }
  

  g.frontPlacedThisTurn = 0;

  decayStatuses(g);
  clearSlots(g);
  checkEndConditions(g)

  g.phase = "DRAW";
}

function decayStatuses(g: GameState) {
  const keys: Array<keyof typeof g.player.status> = ["vuln", "weak", "bleed", "disrupt"];
  for (const k of keys) if (g.player.status[k] > 0) g.player.status[k] -= 1;
  for (const e of g.enemies) for (const k of keys) if (e.status[k] > 0) e.status[k] -= 1;
}

export function drawStepStartNextTurn(g: GameState) {
  if (g.phase !== "DRAW") return;

  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;

  checkEndConditions(g);
  if (g.run.finished) return;

  if (aliveEnemies(g).length === 0) {
    cleanupBattleTransient(g);
    g.phase = "NODE";
    return;
  }

  const n = g.usedThisTurn;
  g.usedThisTurn = 0;

  drawCards(g, n);

  if (g.player.block > 0) {
    g.player.block = 0;
    logMsg(g, "방어(블록) 소실");
  }

  revealIntentsAndDisrupt(g);
}

export function drawCards(g: GameState, n: number): number {
  let drawn = 0;

  for (let i = 0; i < n; i++) {
    maybeReshuffle(g);
    if (g.run.finished) break;

    const card = g.deck.pop();
    if (!card) break;

    g.hand.push(card);
    drawn++;
  }

  logMsg(g, `드로우 ${drawn}/${n} (손패 ${g.hand.length})`);
  return drawn;
}

function maybeReshuffle(g: GameState) {
  if (g.deck.length === 0 && g.discard.length > 0) {
    g.deck = shuffle(g.discard);
    g.discard = [];

    const f = g.player.fatigue;
    applyDamageToPlayer(g, f, "FATIGUE", "피로도");
    checkEndConditions(g);
    if (g.run.finished) return;

    g.player.fatigue += 1;
    logMsg(g, `피로도 F +1 (현재 ${g.player.fatigue})`);
  }
}

export function isTargeting(g: GameState) {
  return g.pendingTarget != null || (g.pendingTargetQueue?.length ?? 0) > 0;
}

export function continueCombatUntilInput(g: GameState) {
  if (g.run.finished) return;
  if (g.choice) return;
  if (aliveEnemies(g).length === 0) return;
  if (g.pendingTarget) return;
  if ((g.pendingTargetQueue?.length ?? 0) > 0) return;

  for (let guard = 0; guard < 50; guard++) {
    if (g.run.finished) return;
    if (g.choice) return;
    if (g.pendingTarget) return;
    if ((g.pendingTargetQueue?.length ?? 0) > 0) return;

    if (g.phase === "PLACE") {
      if (g.enemies.length > 0 && !g.intentsRevealedThisTurn) {
        revealIntentsAndDisrupt(g);
        continue;
      }
      resolveBack(g);
      continue;
    }

    if (g.phase === "BACK") {
      resolveBack(g);
      continue;
    }
    if (g.phase === "FRONT") {
      resolveFront(g);
      continue;
    }
    if (g.phase === "ENEMY") {
      resolveEnemy(g);
      continue;
    }
    if (g.phase === "UPKEEP") {
      upkeepEndTurn(g);
      continue;
    }
    if (g.phase === "DRAW") {
      drawStepStartNextTurn(g);
      return;
    }

    return;
  }
}

export function resolveTargetSelection(g: GameState, enemyIndex: number): boolean {
  if (!g.pendingTarget) return false;

  if (aliveEnemies(g).length === 0) {
    g.pendingTarget = null;
    g.pendingTargetQueue = [];
    (g as any).selectedEnemyIndex = null;
    checkEndConditions(g);
    return true;
  }

  const target = g.enemies[enemyIndex];
  if (!target || target.hp <= 0) return false;

  const req = g.pendingTarget;

  if (req.kind === "damageSelect") {
    applyDamageToEnemy(g, target, req.amount);
  } else if (req.kind === "statusSelect") {
    applyStatusTo(target, req.key, req.n);
    logMsg(g, `적(${target.name}) 상태: ${req.key} ${req.n >= 0 ? "+" : ""}${req.n}`);
  }

  checkEndConditions(g);

  if (aliveEnemies(g).length === 0) {
    g.pendingTarget = null;
    g.pendingTargetQueue = [];
    (g as any).selectedEnemyIndex = null;
    return true;
  }

  advancePendingTarget(g);

  return !g.pendingTarget && (g.pendingTargetQueue?.length ?? 0) === 0;
}

function advancePendingTarget(g: GameState) {
  const q = g.pendingTargetQueue ?? [];
  const next = q.shift() ?? null;
  g.pendingTarget = next;
  g.pendingTargetQueue = q;
  (g as any).selectedEnemyIndex = null;
}

function cleanupBattleTransient(g: GameState) {
  if (g.player.block > 0) {
    g.player.block = 0;
    logMsg(g, "방어(블록) 소실");
  }
  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;
}

function getEscapeReq(g: GameState): number {
  const snap = (g.run as any).deckSizeAtTreasure ?? null;
  return snap == null ? 10 : escapeRequiredNodePicks(snap);
}

export function checkEndConditions(g: GameState) {
  if (g.player.hp <= 0) {
    cleanupBattleTransient(g);
    g.run.finished = true;
    logMsg(g, "패배: 죽었습니다.");
    return;
  }

  if (g.victoryResolvedThisCombat) return;

  if (aliveEnemies(g).length === 0 && g.phase !== "NODE") {
    g.victoryResolvedThisCombat = true;

    cleanupBattleTransient(g);

    applyWinHooksWhileInBackThisTurn(g);
    logMsg(g, "적을 모두 처치!");
    endCombatReturnAllToDeck(g);
    g.enemies = [];
    g.player.zeroSupplyTurns = 0;
    g.phase = "NODE";

    if (g.run.treasureObtained) {
      const req = getEscapeReq(g);
      if (g.run.afterTreasureNodePicks >= req) {
        g.run.finished = true;
        logMsg(g, `승리! 저주받은 보물을 얻은 후 ${req}턴 동안 살아남았습니다.`);
        return;
      }
    }
    const [a, b] = offerRewardPair();

    const da = getCardDefByIdWithUpgrade(g.content, a.defId, a.upgrade);
    const db = getCardDefByIdWithUpgrade(g.content, b.defId, b.upgrade);

    const la = a.upgrade > 0 ? `${da.name} +${a.upgrade}` : da.name;
    const lb = b.upgrade > 0 ? `${db.name} +${b.upgrade}` : db.name;

    g.choice = {
      kind: "REWARD",
      title: "전투 보상",
      prompt: "두 장 중 한 장을 선택하거나 생략합니다.",
      options: [
        { key: `pick:${a.defId}:${a.upgrade}`, label: la, detail: `전열: ${da.frontText} / 후열: ${da.backText}` },
        { key: `pick:${b.defId}:${b.upgrade}`, label: lb, detail: `전열: ${db.frontText} / 후열: ${db.backText}` },
        { key: "skip", label: "생략" },
      ],
    };

    return;
  }
}

export function endCombatReturnAllToDeck(g: GameState) {
  const pool: string[] = [];

  for (const uid of g.deck) pool.push(uid);
  for (const uid of g.hand) pool.push(uid);
  for (const uid of g.discard) pool.push(uid);

  for (const uid of g.frontSlots) if (uid) pool.push(uid);
  for (const uid of g.backSlots) if (uid) pool.push(uid);

  for (const uid of g.exhausted) pool.push(uid);

  const seen = new Set<string>();
  const unique = pool.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

  const keep = unique.filter((uid) => g.cards[uid]?.zone !== "vanished");

  g.deck = keep;
  for (const uid of keep) g.cards[uid].zone = "deck";

  g.hand = [];
  g.discard = [];
  g.frontSlots = [null, null, null];
  g.backSlots = [null, null, null];
  g.selectedHandCardUid = null;

  g.exhausted = [];

  g.pendingTarget = null;
  g.pendingTargetQueue = [];

  shuffleInPlace(g.deck);
}

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function applyWinHooksWhileInBackThisTurn(g: GameState) {
  if (g.winHooksAppliedThisCombat) return;
  g.winHooksAppliedThisCombat = true;

  for (const uid of g.backUidsThisTurn) {
    const card = g.cards[uid];
    if (!card) continue;

    const def = getCardDefFor(g, uid);
    const effs = def.onWinWhileInBack;
    if (!effs || effs.length === 0) continue;

    resolvePlayerEffects({ game: g, side: "back", cardUid: uid }, effs);
  }
}

export function currentTotalDeckLikeSize(g: GameState): number {
  return (
    g.deck.length +
    g.hand.length +
    g.discard.length +
    g.frontSlots.filter(Boolean).length +
    g.backSlots.filter(Boolean).length +
    g.exhausted.length
  );
}