// =======================================================
// combat.ts ✅ (전체 수정본)
// - 턴마다 intentsRevealedThisTurn 플래그 리셋 누락 수정
// - drawCountThisTurn: "이번 턴(의도 공개~유지비 전)" 기준으로 reset
// - drawCards: maybeReshuffle 연동 + 실제 드로우 수 반환
// - resolveTargetSelection: damageSelect + statusSelect 둘 다 처리
// - status select 큐까지 포함해서 "완성본"으로 맞춤
// =======================================================

import type { EnemyEffect, GameState, Side, EnemyState } from "./types";
import { aliveEnemies, applyStatus, clampMin, logMsg, pickOne, shuffle, applyStatusTo } from "./rules";
import { applyDamageToPlayer, applyDamageToEnemy } from "./effects";
import { resolvePlayerEffects } from "./resolve";

function enemyStateFromId(g: GameState, enemyId: string): EnemyState {
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

    soulWarnCount: enemyId === "boss_soul_stealer" ? 0 : undefined,
    soulArmed: enemyId === "boss_soul_stealer" ? false : undefined,
    soulWillNukeThisTurn: enemyId === "boss_soul_stealer" ? false : undefined,
  };
}

function patternAllowedByCooldown(g: GameState, pattern: string[], cooldownBattles = 5) {
  const now = g.run.battleCount + 1;
  for (const id of pattern) {
    const last = g.run.enemyLastSeenBattle[id];
    if (last != null && now - last < cooldownBattles) return false;
  }
  return true;
}

export function spawnEncounter(g: GameState, opt?: { forceBoss?: boolean; forcePatternIds?: string[] }) {
  const forceBoss = opt?.forceBoss ?? false;
  const nodeNo = g.run.nodePickCount;

  if (opt?.forcePatternIds && opt.forcePatternIds.length > 0) {
    g.enemies = opt.forcePatternIds.map((id) => enemyStateFromId(g, id));
    logMsg(g, `전투 시작! (노드 ${nodeNo}) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
    return;
  }

  if (forceBoss) {
    if (g.run.bossPool.length === 0) {
      logMsg(g, `보스 풀이 비었습니다. 일반 전투로 진행합니다. (노드 ${nodeNo})`);
    } else {
      const bossId = pickOne(g.run.bossPool);
      g.run.bossPool = g.run.bossPool.filter((x) => x !== bossId);

      g.enemies = [enemyStateFromId(g, bossId)];
      logMsg(g, `보스 등장! (노드 ${nodeNo}) 적: ${g.enemies[0].name}`);
      return;
    }
  }

  const earlyPatterns: string[][] = [["goblin_raider"], ["watching_statue"], ["pebble_golem"], ["slime"]];
  const latePatterns: string[][] = [
    ["goblin_raider", "goblin_raider", "goblin_raider"],
    ["rock_golem"],
    ["pebble_golem", "pebble_golem"],
    ["slime", "goblin_raider"],
  ];

  const patterns = nodeNo <= 10 ? earlyPatterns : latePatterns;

  const allowed = patterns.filter((p) => patternAllowedByCooldown(g, p, 5));
  const pickFrom = allowed.length > 0 ? allowed : patterns;

  const chosen = pickOne(pickFrom);

  g.run.battleCount += 1;
  for (const id of chosen) g.run.enemyLastSeenBattle[id] = g.run.battleCount;

  g.enemies = chosen.map((id) => enemyStateFromId(g, id));
  logMsg(g, `전투 시작! (노드 ${nodeNo}) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
}

export function startCombat(g: GameState) {
  g.phase = "REVEAL";

  g.frontSlots = [null, null, null];
  g.backSlots = [null, null, null];
  g.backSlotDisabled = [false, false, false];

  g.hand = [];
  g.selectedHandCardUid = null;

  g.pendingTarget = null;
  g.pendingTargetQueue = [];

  g.usedThisTurn = 0;
  g.winHooksAppliedThisCombat = false;

  const bonus = g.run.nextBattleSuppliesBonus ?? 0;
  g.player.supplies = 10 + bonus;
  if (bonus > 0) {
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
}

const SOUL_WARN_INTENT_INDEX = 2;
const SOUL_NUKE_CHANCE = 0.6;

export function revealIntentsAndDisrupt(g: GameState) {
  if (g.intentsRevealedThisTurn) return;
  g.intentsRevealedThisTurn = true;

  g.attackedEnemyIndicesThisTurn = [];

  // ✅ 이번 턴 드로우 카운터 리셋 (턴 단위)
  g.drawCountThisTurn = 0;

  g.phase = "REVEAL";

  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  // ✅ 교란(disrupt) 처리: 이번 턴 후열 슬롯 1칸 무효화
  // - 결정/적용은 엔진에서만 수행(UI는 표시만)
  g.disruptIndexThisTurn = null;
  g.backSlotDisabled = [false, false, false];

  const disrupt = g.player.status.disrupt ?? 0;
  if (disrupt > 0) {
    g.disruptIndexThisTurn = Math.floor(Math.random() * 3); // 0..2
    g.backSlotDisabled[g.disruptIndexThisTurn] = true;
  }

  for (const e of g.enemies) {
    e.immuneThisTurn = e.immuneNextTurn;
    e.immuneNextTurn = false;
  }

  for (const e of aliveEnemies(g)) {
    const def = g.content.enemiesById[e.id];
    const len = def.intents.length;
    if (len <= 0) continue;

    e.intentIndex = Math.floor(Math.random() * len);

    if (e.id === "boss_soul_stealer") {
      e.soulWillNukeThisTurn = false;

      const warn = e.soulWarnCount ?? 0;
      const armed = !!e.soulArmed;

      if (armed) {
        if (Math.random() < SOUL_NUKE_CHANCE) {
          e.soulWillNukeThisTurn = true;
          logMsg(g, `적 의도: ${e.name} → 영혼 폭발 (50 피해!)`);
          continue;
        }

        e.intentIndex = Math.floor(Math.random() * len);
        const intent = def.intents[e.intentIndex];
        logMsg(g, `적 의도: ${e.name} → ${intent.label} (⚠ 폭발 가능 상태)`);
        continue;
      }

      e.intentIndex = Math.floor(Math.random() * len);
      const intent = def.intents[e.intentIndex];
      logMsg(g, `적 의도: ${e.name} → ${intent.label} (경고 ${warn}/3)`);
      continue;
    }

    const intent = def.intents[e.intentIndex];
    logMsg(g, `적 의도: ${e.name} → ${intent.label}`);
  }

  if (g.disruptIndexThisTurn !== null) {
    logMsg(g, `교란: 이번 턴 후열 ${g.disruptIndexThisTurn} 무효`);
  }

  g.phase = "PLACE";
}

export function placeCard(g: GameState, cardUid: string, side: Side, idx: number) {
  if (g.phase !== "PLACE") return;
  if (!g.hand.includes(cardUid)) return;

  const slots = side === "front" ? g.frontSlots : g.backSlots;
  if (slots[idx]) return;

  g.hand = g.hand.filter((x) => x !== cardUid);

  slots[idx] = cardUid;
  g.cards[cardUid].zone = side;

  g.usedThisTurn += 1;

  const def = g.content.cardsById[g.cards[cardUid].defId];
  logMsg(g, `[${def.name}]를 ${side === "front" ? "전열" : "후열"} ${idx}번에 배치`);
  if (side === "front") g.frontPlacedThisTurn += 1;
}

function isTag(g: GameState, cardUid: string, tag: "EXHAUST" | "VANISH") {
  const defId = g.cards[cardUid].defId;
  const def = g.content.cardsById[defId];
  return def.tags?.includes(tag) ?? false;
}

function removeFromSlots(g: GameState, cardUid: string) {
  g.frontSlots = g.frontSlots.map((x) => (x === cardUid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === cardUid ? null : x));
}

function moveCardAfterUse(g: GameState, cardUid: string, usedSide: "front" | "back") {
  const def = g.content.cardsById[g.cards[cardUid].defId];
  removeFromSlots(g, cardUid);

  g.hand = g.hand.filter((x) => x !== cardUid);
  g.deck = g.deck.filter((x) => x !== cardUid);
  g.discard = g.discard.filter((x) => x !== cardUid);

  const vanishOk =
    def.vanishWhen === "BOTH" ||
    (def.vanishWhen === "FRONT" && usedSide === "front") ||
    (def.vanishWhen === "BACK" && usedSide === "back");

  const exhaustOk =
    def.exhaustWhen === "BOTH" ||
    (def.exhaustWhen === "FRONT" && usedSide === "front") ||
    (def.exhaustWhen === "BACK" && usedSide === "back");

  if (def.vanishWhen && vanishOk) {
    g.vanished.push(cardUid);
    g.cards[cardUid].zone = "vanished";
    logMsg(g, `[${def.name}] 소실(영구 제거)`);
    return;
  }

  if (def.exhaustWhen && exhaustOk) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[${def.name}] 소모(이번 전투에서 제거)`);
    return;
  }

  if (!def.vanishWhen && isTag(g, cardUid, "VANISH")) {
    g.vanished.push(cardUid);
    g.cards[cardUid].zone = "vanished";
    logMsg(g, `[${def.name}] 소실(영구 제거)`);
    return;
  }

  if (!def.exhaustWhen && isTag(g, cardUid, "EXHAUST")) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[${def.name}] 소모(이번 전투에서 제거)`);
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

    const def = g.content.cardsById[g.cards[uid].defId];

    if (!g.player.immuneToDisruptThisTurn && g.backSlotDisabled[i]) {
      logMsg(g, `후열 ${i}번 [${def.name}] 교란으로 무효`);
      continue;
    }

    resolvePlayerEffects({ game: g, side: "back", cardUid: uid }, def.back);
    moveCardAfterUse(g, uid, "back");
  }

  g.phase = "FRONT";
}

export function resolveFront(g: GameState) {
  if (g.phase !== "FRONT") return;
  logMsg(g, "=== 전열 단계 ===");

  for (let i = 0; i < 3; i++) {
    const uid = g.frontSlots[i];
    if (!uid) continue;

    const def = g.content.cardsById[g.cards[uid].defId];

    resolvePlayerEffects({ game: g, side: "front", cardUid: uid }, def.front);
    moveCardAfterUse(g, uid, "front");
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
        applyDamageToPlayer(g, 50, e);
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
    case "damagePlayer":
      applyDamageToPlayer(g, act.n, enemy);
      break;

    case "damagePlayerFormula":
      if (act.kind === "goblin_raider") {
        const dmg = Math.max(0, 12 - g.usedThisTurn);
        applyDamageToPlayer(g, dmg, enemy);
        logMsg(g, `고블린 약탈자: 12 - 사용 ${g.usedThisTurn}장 = ${dmg} 피해`);
      } else {
        const dmg = 4 + g.usedThisTurn;
        applyDamageToPlayer(g, dmg, enemy);
      }
      break;

    case "supplies":
      g.player.supplies = clampMin(g.player.supplies + act.n, 0);
      logMsg(g, `적 효과: 보급 S ${act.n >= 0 ? "+" : ""}${act.n} (현재 ${g.player.supplies})`);
      break;

    case "statusPlayer":
      applyStatus(g.player, act.key, act.n);
      logMsg(g, `적 효과: 플레이어 상태 ${act.key} ${act.n >= 0 ? "+" : ""}${act.n}`);
      break;

    case "enemyHealSelf":
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + act.n);
      logMsg(g, `적(${enemy.name})이(가) ${act.n} 회복 (HP ${enemy.hp}/${enemy.maxHp})`);
      break;

    case "enemyImmuneThisTurn":
      enemy.immuneThisTurn = true;
      logMsg(g, `적(${enemy.name})이(가) 피해 면역 상태가 됨`);
      break;

    case "enemyImmuneNextTurn":
      enemy.immuneNextTurn = true;
      logMsg(g, `적(${enemy.name})이(가) 다음 턴 피해 면역 상태가 됨`);
      break;

    case "fatiguePlayer":
      g.player.fatigue = Math.max(0, g.player.fatigue + act.n);
      logMsg(g, `적 효과: 피로 F ${act.n >= 0 ? "+" : ""}${act.n} (현재 ${g.player.fatigue})`);
      break;

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
  for (let i = 0; i < frontCount; i++) {
    if (g.player.supplies > 0) {
      g.player.supplies -= 1;
    } else {
      g.player.hp -= 3;
      if (g.player.hp < 0) g.player.hp = 0;
      g.player.fatigue += 1;
      logMsg(g, `전열 유지비 부족: HP -3, F +1 (HP ${g.player.hp}, F ${g.player.fatigue})`);
    }
  }
  if (frontCount > 0) logMsg(g, `전열 유지비 처리: 전열 ${frontCount}장`);

  if (g.player.supplies === 0) {
    g.player.zeroSupplyTurns += 1;
    const p = g.player.zeroSupplyTurns;
    g.player.hp -= p;
    if (g.player.hp < 0) g.player.hp = 0;
    logMsg(g, `S=0 종료 패널티: 누적 ${p}번째 → HP -${p} (HP ${g.player.hp})`);
  }

  const bleed = g.player.status.bleed ?? 0;
  if (bleed > 0) {
    g.player.hp -= bleed;
    if (g.player.hp < 0) g.player.hp = 0;
    logMsg(g, `출혈로 HP -${bleed} (현재 ${g.player.hp}/${g.player.maxHp})`);
  }

  for (const en of aliveEnemies(g)) {
    const b = en.status.bleed ?? 0;
    if (b > 0) {
      if (!en.immuneThisTurn) {
        en.hp = Math.max(0, en.hp - b);
        logMsg(g, `적(${en.name}) 출혈로 HP -${b} (HP ${en.hp}/${en.maxHp})`);
      } else {
        logMsg(g, `적(${en.name})은(는) 이번 턴 면역이라 출혈 피해 무시`);
      }
    }
  }

  g.frontPlacedThisTurn = 0;

  decayStatuses(g);

  clearSlots(g);

  g.phase = "DRAW";
}

function decayStatuses(g: GameState) {
  const keys: Array<keyof typeof g.player.status> = ["vuln", "weak", "bleed", "disrupt"];
  for (const k of keys) {
    if (g.player.status[k] > 0) g.player.status[k] -= 1;
  }
  for (const e of g.enemies) {
    for (const k of keys) {
      if (e.status[k] > 0) e.status[k] -= 1;
    }
  }
}

export function drawStepStartNextTurn(g: GameState) {
  if (g.phase !== "DRAW") return;

  // ✅ 새 턴 시작을 위해 의도 공개 플래그를 반드시 리셋해야 함

  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;

  const n = g.usedThisTurn;
  g.usedThisTurn = 0;

  drawCards(g, n);

  if (g.player.block > 0) {
    g.player.block = 0;
    logMsg(g, "방어(블록) 소실");
  }

  checkEndConditions(g);
  if (g.run.finished) return;

  if (aliveEnemies(g).length === 0) {
    g.phase = "NODE";
    return;
  }

  revealIntentsAndDisrupt(g);
}

export function drawCards(g: GameState, n: number): number {
  let drawn = 0;

  for (let i = 0; i < n; i++) {
    maybeReshuffle(g);

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
    if (f > 0) {
      g.player.hp -= f;
      if (g.player.hp < 0) g.player.hp = 0;
      logMsg(g, `리셔플 피로: HP -${f} (F=${f})`);
    } else {
      logMsg(g, "리셔플: 피로 피해 없음 (F=0)");
    }
    g.player.fatigue += 1;
    logMsg(g, `피로 F +1 (현재 ${g.player.fatigue})`);
  }
}

export function resolveTargetSelection(g: GameState, enemyIndex: number) {
  if (!g.pendingTarget) return;

  if (aliveEnemies(g).length === 0) {
    g.pendingTarget = null;
    g.pendingTargetQueue = [];
    return;
  }

  const target = g.enemies[enemyIndex];
  if (!target || target.hp <= 0) {
    // ✅ 정책 A: 생략(소모)하지 않음. 그냥 무시.
    return;
  }

  const req = g.pendingTarget;

  if (req.kind === "damageSelect") {
    applyDamageToEnemy(g, target, req.amount);
  } else if (req.kind === "statusSelect") {
    applyStatusTo(target, req.key, req.n);
    logMsg(g, `적(${target.name}) 상태: ${req.key} ${req.n >= 0 ? "+" : ""}${req.n}`);
  }

  g.pendingTarget = g.pendingTargetQueue.shift() ?? null;
}

export function checkEndConditions(g: GameState) {
  if (g.player.hp <= 0) {
    g.run.finished = true;
    logMsg(g, "패배: 플레이어 HP가 0 이하");
    return;
  }

  if (aliveEnemies(g).length === 0 && g.phase !== "NODE") {
    applyWinHooksWhileInBack(g);
    logMsg(g, "승리: 적을 모두 처치!");
    endCombatReturnAllToDeck(g);
    g.player.zeroSupplyTurns = 0;
    g.phase = "NODE";
    if (g.run.treasureObtained) g.run.afterTreasureNodePicks += 1;

    if (g.run.treasureObtained && g.run.afterTreasureNodePicks >= 10) {
      g.run.finished = true;
      logMsg(g, "승리! 저주받은 보물을 얻은 후 10턴 동안 살아남았습니다.");
    }
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

function applyWinHooksWhileInBack(g: GameState) {
  if (g.winHooksAppliedThisCombat) return;
  g.winHooksAppliedThisCombat = true;

  for (const uid of g.backSlots) {
    if (!uid) continue;
    const def = g.content.cardsById[g.cards[uid].defId];
    const effs = def.onWinWhileInBack;
    if (!effs || effs.length === 0) continue;

    resolvePlayerEffects({ game: g, side: "back", cardUid: uid }, effs);
  }
}
