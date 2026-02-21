import type { EnemyEffect, EnemyState, GameState, Side } from "../types";
import { aliveEnemies, clampMin, logMsg, shuffle, applyStatusTo } from "../rules";
import { applyDamageToPlayer, cleanupPendingTargetsIfNoEnemies } from "../effects";
import { resolvePlayerEffects } from "../resolve";
import { getCardDefFor, cardNameWithUpgrade } from "../../content/cards";
import { runRelicHook, checkRelicUnlocks, getUnlockProgress, isRelicActive } from "../relics";
import { revealIntentsAndDisrupt, __SOUL_WARN_INTENT_INDEX } from "./intents";
import { checkEndConditions } from "./victory";

export function startCombat(g: GameState) {
  g.combatTurn = 1;
  g.time = (g.time ?? 0) + 1;
  logMsg(g, "전투: 시간 +1");

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
  g.frontPlacedThisTurn = 0;

  g.winHooksAppliedThisCombat = false;
  g.victoryResolvedThisCombat = false;

  g.run.eliteRelicOfferedThisBattle = false;
  (g.run as any).itemOfferedThisBattle = false;

  const bonus = g.run.nextBattleSuppliesBonus ?? 0;
  g.player.supplies = Math.max(0, 7 + bonus);
  if (bonus !== 0) {
    logMsg(g, `다음 전투 S 변동: ${bonus}`);
    g.run.nextBattleSuppliesBonus = 0;
  }

  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;

  g.drawCountThisTurn = 0;
  g.attackedEnemyIndicesThisTurn = [];

  drawCards(g, 4);
  
  revealIntentsAndDisrupt(g);
  g.phase = "PLACE";

  runRelicHook(g, "onCombatStart");

  // 전투 시작 추가 드로우(예: 뼈가 만든 나침반)
  {
    const extra = Number((g as any)._combatStartExtraDraw ?? 0);
    (g as any)._combatStartExtraDraw = 0;
    if (extra > 0) drawCards(g, extra);
  }
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
  if (side === "front") g.frontPlacedThisTurn += 1;

  logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}]를 ${side === "front" ? "전열" : "후열"} ${idx}번에 배치`);
  runRelicHook(g, "onPlaceCard", { side, idx, cardUid });
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

  const vanishWhen = (def as any).vanishWhen;
  const exhaustWhen = (def as any).exhaustWhen;

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

const SOUL_NUKE_CHANCE = 0.6;

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

      if (e.intentIndex === __SOUL_WARN_INTENT_INDEX) {
        e.soulWarnCount = (e.soulWarnCount ?? 0) + 1;
        logMsg(g, `영혼 강탈자: 경고 +1 (${e.soulWarnCount}/3)`);
        if ((e.soulWarnCount ?? 0) >= 3) {
          e.soulArmed = true;
          logMsg(g, "영혼 강탈자: 경고 3회 완료 → 폭발 가능 상태!");
          if (Math.random() < SOUL_NUKE_CHANCE) {
            e.soulWillNukeThisTurn = true;
          }
        }
      }

      continue;
    }

    for (const act of intent.acts) resolveEnemyEffect(g, e, act);
  }

  g.phase = "UPKEEP";
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
      } else if (act.kind === "gloved_hunter") {
        const blk = g.player.block ?? 0;
        const dmg = blk >= 4 ? 12 : 6;
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
      let n = act.n;
      // 쥐가죽 부적: 취약을 받을 때 1 덜 받는다.
      if (act.key === "vuln" && n > 0 && isRelicActive(g, "relic_ratskin_charm")) {
        n = Math.max(0, n - 1);
      }
      applyStatusTo(g.player, act.key, n, g, "ENEMY");
      logMsg(g, `적 효과: 플레이어 상태 ${act.key} ${n >= 0 ? "+" : ""}${n}`);
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
      const deckSize = getCombatDeckSize(g);
      const { dmg: rawDmg, scale } = calcDeckSizeDamage(act, deckSize);
      const ew = enemy.status.weak ?? 0;

      const applied = applyDamageToPlayer(g, rawDmg, "ENEMY_ATTACK", enemy.name, ew);
      logMsg(
        g,
        `중력 피해(공식): base ${act.base} + per ${act.per} * ceil(${deckSize}/${act.div})=${scale} => raw ${rawDmg}, 적용 ${applied}`
      );
      return;
    }

    case "damagePlayerRampHits": {
      const turn = Math.max(1, Number(g.combatTurn ?? 1));
      const baseHits = Math.max(1, Number(act.baseHits ?? 1));
      const every = Math.max(1, Number(act.everyTurns ?? 1));

      let hits = baseHits + Math.floor((turn - 1) / every);
      if (act.capHits != null) hits = Math.min(hits, Math.max(1, Number(act.capHits)));

      const ew = enemy.status.weak ?? 0;
      const reason = `${enemy.name} (${hits}타)`;

      for (let i = 0; i < hits; i++) {
        applyDamageToPlayer(g, act.n, "ENEMY_ATTACK", reason, ew);
      }
      return;
    }

    case "damagePlayerIfSuppliesPositive": {
      const s = g.player.supplies ?? 0;
      if (s > 0) {
        const ew = enemy.status.weak ?? 0;
        applyDamageToPlayer(g, act.n, "ENEMY_ATTACK", enemy.name, ew);
      } else {
        logMsg(g, `덮치기: S = 0 → 피해 없음`);
      }
      break;
    }

    case "damagePlayerIfSuppliesZero": {
      const s = g.player.supplies ?? 0;
      if (s === 0) {
        const ew = enemy.status.weak ?? 0;
        applyDamageToPlayer(g, act.n, "ENEMY_ATTACK", enemy.name, ew); // 프로젝트에서 쓰는 실제 함수명으로
      } else {
        logMsg(g, `압류: S = ${s} → 피해 없음`);
      }
      break;
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

  // Unlock progress for relic activation: end turn with weak / skip turn
  {
    const up = getUnlockProgress(g);
    let changed = false;

    if ((g.player.status.weak ?? 0) > 0) {
      up.endedTurnWeak += 1;
      changed = true;
    }

    const didNothing =
      (g.usedThisTurn ?? 0) === 0 &&
      (g.frontPlacedThisTurn ?? 0) === 0 &&
      (g.backUidsThisTurn?.length ?? 0) === 0;

    if (didNothing) {
      up.skippedTurn += 1;
      changed = true;
    }

    if (changed) checkRelicUnlocks(g);
  }


  const frontCount = g.frontPlacedThisTurn;
  if (frontCount > 0) logMsg(g, `전열 유지비 처리: 전열 ${frontCount}장`);

  {
    const hadS = g.player.supplies ?? 0;
    const pay = Math.min(hadS, frontCount); // 실제 낸 S
    g.player.supplies = hadS - pay;

    const shortfall = frontCount - pay; // 부족분 = 전열 수 - 낸 S
    if (shortfall > 0) {
      g.player.fatigue += shortfall;
      logMsg(g, `전열 유지비 부족! (부족 ${shortfall} → F +${shortfall})`);
    }
  }

  if (g.player.supplies === 0) {
    g.player.zeroSupplyTurns += 1;

    // Unlock progress for relic activation: ended turn with S=0
    {
      const up = getUnlockProgress(g);
      up.endedTurnSupplyZero += 1;
      checkRelicUnlocks(g);
    }

    const f = g.player.fatigue;
    applyDamageToPlayer(g, f, "ZERO_SUPPLY", "보급 없이 턴 종료! 피해 " + f);
  }

  const bleed = g.player.status.bleed ?? 0;
  if (bleed > 0) applyDamageToPlayer(g, bleed, "BLEED", "출혈");

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
  cleanupPendingTargetsIfNoEnemies(g);

  checkEndConditions(g);

  runRelicHook(g, "onUpkeepEnd");

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

  const extra = Number((g as any)._extraDrawNextTurn ?? 0);
  (g as any)._extraDrawNextTurn = 0;

  drawCards(g, n + (extra > 0 ? extra : 0));

  if (g.player.block > 0) {
    g.player.block = 0;
    logMsg(g, "방어(블록) 소실");
  }

  revealIntentsAndDisrupt(g);

  g.phase = "PLACE";
  g.backUidsThisTurn = [];
  g.attackedEnemyIndicesThisTurn = [];
  g.drawCountThisTurn = 0;
  g.combatTurn = (g.combatTurn ?? 0) + 1;
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

    g.player.fatigue += 1;
    logMsg(g, `피로도 F +1 (셔플, 현재 ${g.player.fatigue})`);
  }
}

function cleanupBattleTransient(g: GameState) {
  if (g.player.block > 0) {
    g.player.block = 0;
    logMsg(g, "방어(블록) 소실");
  }
  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;
}

export function _clearSlotsForVictory(g: GameState) {
  clearSlots(g);
}

export function _cleanupBattleTransientForVictory(g: GameState) {
  cleanupBattleTransient(g);
}
