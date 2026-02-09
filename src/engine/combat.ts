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
import { getCardDefFor } from "../content/cards";
import { cardNameWithUpgrade, getCardDefByIdWithUpgrade } from "../content/cards";
import { offerRewardPair } from "../content";


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

function patternAllowedByCooldown(
  g: GameState,
  pattern: string[],
  nowBattleNo: number,
  cooldownBattles = 5
) {
  for (const id of pattern) {
    const last = g.run.enemyLastSeenBattle[id];
    if (last != null && nowBattleNo - last < cooldownBattles) return false;
  }
  return true;
}


export function spawnEncounter(
  g: GameState,
  opt?: { forceBoss?: boolean; forcePatternIds?: string[] }
) {
  const forceBoss = opt?.forceBoss ?? false;

  // ✅ 티어 기준: 노드 번호
  // onChooseNode에서 nodePickCount를 +1한 뒤 spawnEncounter를 호출하는 흐름을 전제로 함
  const nodeNo = g.run.nodePickCount;

  // ✅ 쿨다운/기록 기준: 전투 번호(이번에 실제로 전투가 시작될 때만 +1)
  const battleNo = g.run.battleCount + 1;

  // -------------------------
  // (0) 강제 패턴(이벤트 전투 등)
  // -------------------------
  if (opt?.forcePatternIds && opt.forcePatternIds.length > 0) {
    const chosen = opt.forcePatternIds;

    // 전투 시작 확정 기록
    g.run.battleCount = battleNo;
    for (const id of chosen) g.run.enemyLastSeenBattle[id] = battleNo;

    g.enemies = chosen.map((id) => enemyStateFromId(g, id));
    logMsg(
      g,
      `전투 시작! (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`
    );
    return;
  }

  // -------------------------
  // (1) 보스 강제
  // -------------------------
  if (forceBoss) {
    if (g.run.bossPool.length === 0) {
      // 보스 풀이 비면 일반 전투로 폴백
      logMsg(g, `보스 풀이 비었습니다. 일반 전투로 진행합니다. (노드 ${nodeNo})`);
      // 아래 일반 패턴 선택으로 계속 진행
    } else {
      const bossId = pickOne(g.run.bossPool);
      g.run.bossPool = g.run.bossPool.filter((x) => x !== bossId);

      // 전투 시작 확정 기록
      g.run.battleCount = battleNo;
      g.run.enemyLastSeenBattle[bossId] = battleNo;

      g.enemies = [enemyStateFromId(g, bossId)];
      logMsg(g, `보스 등장! (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies[0].name}`);
      return;
    }
  }

  // -------------------------
  // (2) 노드 기준 티어 테이블
  // -------------------------
  const patternsByTier: string[][][] = [
    // 1~10 노드
    [["goblin_raider"], ["watching_statue"], ["pebble_golem"], ["slime"]],

    // 11~20 노드
    [
      ["goblin_raider", "slime"],
      ["pebble_golem", "pebble_golem"],
      ["rock_golem"],
      ["goblin_raider", "goblin_raider"],
      ["poison_spider"],
    ],

    // 21~30 노드
    [
      ["goblin_raider", "goblin_raider", "goblin_raider"],
      ["pebble_golem", "pebble_golem", "slime"],
      ["rock_golem", "pebble_golem"],
      ["slime", "slime"],
      ["poison_spider", "slime"]
    ],
  ];

  // ✅ 노드 기준 tier: 1~10 => 0, 11~20 => 1, ...
  const tier = Math.min(patternsByTier.length - 1, Math.floor((nodeNo - 1) / 10));
  const patterns = patternsByTier[tier];

  // -------------------------
  // (3) 쿨다운 필터(전투 기준)
  // -------------------------
  const cooldownBattles = 5;
  const allowed = patterns.filter((p) => patternAllowedByCooldown(g, p, battleNo, cooldownBattles));
  const pickFrom = allowed.length > 0 ? allowed : patterns; // 전부 막히면 폴백

  const chosen = pickOne(pickFrom);

  // -------------------------
  // (4) 전투 시작 확정 기록(전투 기준)
  // -------------------------
  g.run.battleCount = battleNo;
  for (const id of chosen) g.run.enemyLastSeenBattle[id] = battleNo;

  // -------------------------
  // (5) 스폰 + 로그(노드/전투 둘 다 표기)
  // -------------------------
  g.enemies = chosen.map((id) => enemyStateFromId(g, id));
  logMsg(
    g,
    `전투 시작! (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`
  );
}


export function startCombat(g: GameState) {
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
  g.backUidsThisTurn = [];

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
  if (side === "back") {
    // 중복 방지
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
    logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}] 소실(영구 제거)`);
    return;
  }

  if (def.exhaustWhen && exhaustOk) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}] 소모(이번 전투에서 제거)`);
    return;
  }

  if (!def.vanishWhen && isTag(g, cardUid, "VANISH")) {
    g.vanished.push(cardUid);
    g.cards[cardUid].zone = "vanished";
    logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}] 소실(영구 제거)`);
    return;
  }

  if (!def.exhaustWhen && isTag(g, cardUid, "EXHAUST")) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[[${cardNameWithUpgrade(g, cardUid)}]] 소모(이번 전투에서 제거)`);
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

    const def = getCardDefFor(g, uid);

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

  if (frontCount > 0) logMsg(g, `전열 유지비 처리: 전열 ${frontCount}장`);

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

  // ✅ 새 턴 시작 플래그 리셋
  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;

  // ✅ 먼저 종료 조건부터 확인 (전투가 끝났으면 드로우/리셔플 자체를 하지 않음)
  checkEndConditions(g);
  if (g.run.finished) return;

  if (aliveEnemies(g).length === 0) {
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

  // 승리: 적 전멸
  if (aliveEnemies(g).length === 0 && g.phase !== "NODE") {
    applyWinHooksWhileInBackThisTurn(g);
    logMsg(g, "승리: 적을 모두 처치!");
    endCombatReturnAllToDeck(g);
    g.player.zeroSupplyTurns = 0;

    // ✅ 보물 승리 조건 체크(런 종료면 보상 없이 끝낼지, 보상 줄지 선택)
    if (g.run.treasureObtained && g.run.afterTreasureNodePicks >= 10) {
      g.run.finished = true;
      logMsg(g, "승리! 저주받은 보물을 얻은 후 10턴 동안 살아남았습니다.");
      return;
    }

    // ✅ 전투 보상: 여기서 choice를 만든다
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

    // ✅ 지금은 보상 화면을 띄울 거라 NODE로 안 넘김
    // g.phase를 별도로 두면 더 깔끔하지만, 최소 수정이면 그냥 유지
    // (UI는 overlay/choice 우선 렌더링이라 괜찮음)
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