import type { EnemyData, EnemyEffect, EnemyState, GameState, Side, PlayerEffect } from "../types";
import { aliveEnemies, clampMin, logMsg, shuffle, applyStatusTo, pushUiToast } from "../rules";
import { applyDamageToPlayer, cleanupPendingTargetsIfNoEnemies, addBlock } from "../effects";
import { resolvePlayerEffects } from "../resolve";
import { getCardDefFor, cardNameWithUpgrade } from "../../content/cards";
import { calcDamagePlayerFormula } from "../../content/enemyFormulas";
import { runRelicHook, checkRelicUnlocks, getUnlockProgress, isRelicActive } from "../relics";
import { revealIntentsAndDisrupt } from "./intents";
import { checkEndConditions } from "./victory";
import {
  GOD_LINES,
  applyFaithCombatStartHooks,
  applyFaithOnCardUsedHooks,
  applyFaithUpkeepEndTurnHooks,
  applyMadnessCombatStartHooks,
  applyWingArteryEvery5Turns,
  combatStartDrawDeltaFromFaith,
  ensureFaith,
  getPatronGodOrNull,
  wingArteryBaseSuppliesBonus,
} from "../faith";

function clampSlotCap(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 3;
  return Math.max(3, Math.min(4, Math.floor(n)));
}

function getSlotCap(g: GameState, side: "front" | "back"): number {
  const runAny: any = g.run as any;
  return clampSlotCap(side === "front" ? runAny.slotCapFront : runAny.slotCapBack);
}

function getSlotCols(g: GameState): number {
  return Math.max(getSlotCap(g, "front"), getSlotCap(g, "back"));
}

function enemyAtkRampPerTurnFromDef(def: EnemyData | undefined): number {
  const ps = (def?.passives ?? []) as any[];
  let best = 0;
  for (const p of ps) {
    const id = String(p?.id ?? "");
    const m = /^ramp_atk_(\d+)$/.exec(id);
    if (!m) continue;
    const n = Math.max(0, Number(m[1]) || 0);
    if (n > best) best = n;
  }
  return best;
}

function resetCombatSlots(g: GameState) {
  const cols = getSlotCols(g);
  g.frontSlots = Array.from({ length: cols }, () => null);
  g.backSlots = Array.from({ length: cols }, () => null);
  g.backSlotDisabled = Array.from({ length: cols }, () => false);
}

export function startCombat(g: GameState) {
  g.combatTurn = 1;
  g.time = (g.time ?? 0) + 1;
  logMsg(g, "전투: 시간 +1");
  g.installAgeByUid = {};

  (g as any)._passiveGainedThisTurn = {};

  g.player.block = 0;
  g.player.status.vuln = 0;
  g.player.status.weak = 0;
  g.player.status.bleed = 0;
  g.player.status.disrupt = 0;
  g.player.status.slash = 0;
  g.player.zeroSupplyTurns = 0;

  g.phase = "REVEAL";

  resetCombatSlots(g);

  g.backUidsThisTurn = [];

  g.hand = [];
  g.selectedHandCardUid = null;
  g.pendingTarget = null;
  g.pendingTargetQueue = [];

  g.usedThisTurn = 0;

  (g as any)._placedUidsThisTurn = [];
  (g as any)._placedSideThisTurn = {};

  for (const en of g.enemies) {
    const def = g.content.enemiesById[en.id];
    if (enemyAtkRampPerTurnFromDef(def) > 0) (en as any).atkRamp = 0;
  }


  g.frontPlacedThisTurn = 0;

  (g as any)._gainedBlockThisTurn = false;
  (g as any)._indifferentHostileWarnedThisTurn = false;
  (g as any)._indifferentPatronPenaltyAppliedThisCombat = false;
  (g as any)._indifferentHostilePenaltyAppliedThisCombat = 0;
  (g as any)._rabbitHuntBlockToastShownThisCombat = false;

  g.winHooksAppliedThisCombat = false;
  g.victoryResolvedThisCombat = false;

  g.run.eliteRelicOfferedThisBattle = false;
  (g.run as any).itemOfferedThisBattle = false;

  const bonus = g.run.nextBattleSuppliesBonus ?? 0;
  const baseBonus = wingArteryBaseSuppliesBonus(g);
  g.player.supplies = Math.max(0, 7 + bonus + baseBonus);
  if (bonus !== 0) {
    logMsg(g, `다음 전투 S 변동: ${bonus}`);
    g.run.nextBattleSuppliesBonus = 0;
  }
  if (baseBonus !== 0) {
    const signed = `${baseBonus >= 0 ? "+" : ""}${baseBonus}`;
    logMsg(g, `후원 효과: 시작 보급 ${signed} (현재 ${g.player.supplies})`);
  }

  {
    const patron = getPatronGodOrNull(g);
    if (patron === "forge_master") {
      const f = ensureFaith(g);
      if (!f.forgeIntroShown) {
        f.forgeIntroShown = true;
        pushUiToast(g, "INFO", GOD_LINES.forge_master.firstBattle, 2000);
        logMsg(g, GOD_LINES.forge_master.firstBattle);
      }
    }
  }

  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;

  g.drawCountThisTurn = 0;
  g.attackedEnemyIndicesThisTurn = [];

  applyMadnessCombatStartHooks(g);

  applyFaithCombatStartHooks(g);

  {
    const runAny = g.run as any;
    let n = 4;
    n += combatStartDrawDeltaFromFaith(g);

    const once = Number(runAny.nextCombatDrawDelta ?? 0) || 0;
    if (once !== 0) {
      n += once;
      runAny.nextCombatDrawDelta = 0;
    }

    const rh = Number(runAny.rabbitHuntDrawBoostBattles ?? 0) || 0;
    if (rh > 0) {
      n += 1;
      runAny.rabbitHuntDrawBoostBattles = rh - 1;
    }

    const nv = Number(runAny.namelessVowDrawBoostBattles ?? 0) || 0;
    if (nv > 0) {
      n += 2;
      runAny.namelessVowDrawBoostBattles = nv - 1;
    }

    n = Math.max(0, n);

    const innate: string[] = [];
    const takeInnateFrom = (zone: "deck" | "discard") => {
      const arr = zone === "deck" ? g.deck : g.discard;
      for (const uid of arr) {
        const def = getCardDefFor(g, uid);
        if (def.tags?.includes("INNATE")) innate.push(uid);
      }
    };
    takeInnateFrom("deck");
    takeInnateFrom("discard");

    if (innate.length) {
      const unique = Array.from(new Set(innate));
      g.deck = g.deck.filter((uid) => !unique.includes(uid));
      g.discard = g.discard.filter((uid) => !unique.includes(uid));
      for (const uid of unique) {
        g.hand.push(uid);
        g.cards[uid].zone = "hand";
      }
      logMsg(g, `선천성: ${unique.length}장 시작 손패에 배치`);
      n = Math.max(0, n - unique.length);
    }

    drawCards(g, n);
  }

  revealIntentsAndDisrupt(g);
  g.phase = "PLACE";

  runRelicHook(g, "onCombatStart");

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
  const cap = getSlotCap(g, side);
  if (idx < 0 || idx >= cap) return;
  if (idx >= slots.length) return;
  if (slots[idx]) return;

  g.hand = g.hand.filter((x) => x !== cardUid);
  slots[idx] = cardUid;
  g.cards[cardUid].zone = side;

  if (isInstalledHere(g, cardUid, side)) {
    (g as any).installAgeByUid ??= {};
    g.installAgeByUid[cardUid] ??= 0;
  }

  g.usedThisTurn += 1;
  if (side === "front") g.frontPlacedThisTurn += 1;
  (g.placedUidsThisTurn ??= []);

  (g as any)._placedUidsThisTurn ??= [];
  if (!(g as any)._placedUidsThisTurn.includes(cardUid)) (g as any)._placedUidsThisTurn.push(cardUid);
  (g as any)._placedSideThisTurn ??= {};
  (g as any)._placedSideThisTurn[cardUid] = side;


  if (!g.placedUidsThisTurn.includes(cardUid)) g.placedUidsThisTurn.push(cardUid);

  applyFaithOnCardUsedHooks(g);

  applyOnPlaceIncrementUnlockProgressPassives(g, cardUid, side);

  logMsg(g, `[${cardNameWithUpgrade(g, cardUid)}]를 ${side === "front" ? "전열" : "후열"} ${idx}번에 배치`);
  runRelicHook(g, "onPlaceCard", { side, idx, cardUid });
}

function isTag(g: GameState, cardUid: string, tag: "EXHAUST" | "VANISH" | "INSTALL" | "TOKEN") {
  const def = getCardDefFor(g, cardUid);
  return def.tags?.includes(tag) ?? false;
}

function removeFromSlots(g: GameState, cardUid: string) {
  g.frontSlots = g.frontSlots.map((x) => (x === cardUid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === cardUid ? null : x));

  const ages = (g as any).installAgeByUid as Record<string, number> | undefined;
  if (ages && (cardUid in ages)) delete ages[cardUid];
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
    if ((g.run as any)?.faith?.hostile?.retort_fusion) applyDamageToPlayer(g, 1, "OTHER", "레토르트 퓨전");
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
    if ((g.run as any)?.faith?.hostile?.retort_fusion) applyDamageToPlayer(g, 1, "OTHER", "레토르트 퓨전");
    return;
  }

  g.discard.push(cardUid);
  g.cards[cardUid].zone = "discard";
}

function isInstalledHere(g: GameState, cardUid: string, usedSide: "front" | "back") {
  const def = getCardDefFor(g, cardUid) as any;
  if (!(def.tags?.includes("INSTALL"))) return false;

  // 설치 유지보다 소모/소실이 우선합니다.
  const vanishWhen = def.vanishWhen as any;
  const exhaustWhen = def.exhaustWhen as any;

  const vanishOk =
    vanishWhen === "BOTH" ||
    (vanishWhen === "FRONT" && usedSide === "front") ||
    (vanishWhen === "BACK" && usedSide === "back");

  const exhaustOk =
    exhaustWhen === "BOTH" ||
    (exhaustWhen === "FRONT" && usedSide === "front") ||
    (exhaustWhen === "BACK" && usedSide === "back");

  if ((vanishWhen && vanishWhen !== "NONE" && vanishOk) || (!vanishWhen && def.tags?.includes("VANISH"))) return false;
  if ((exhaustWhen && exhaustWhen !== "NONE" && exhaustOk) || (!exhaustWhen && def.tags?.includes("EXHAUST"))) return false;

  const w = def.installWhen as ("FRONT" | "BACK" | "BOTH" | "NONE" | undefined);
  if (!w || w === "BOTH") return true;
  if (w === "FRONT") return usedSide === "front";
  if (w === "BACK") return usedSide === "back";
  return false;
}

function clearSlots(g: GameState, force = false) {
  for (let i = 0; i < g.frontSlots.length; i++) {
    const f = g.frontSlots[i];
    if (f) {
      if (!force && isInstalledHere(g, f, "front")) {
      } else {
        moveCardAfterUse(g, f, "front");
        g.frontSlots[i] = null;
      }
    } else {
      g.frontSlots[i] = null;
    }

    const b = g.backSlots[i];
    if (b) {
      if (!force && isInstalledHere(g, b, "back")) {
      } else {
        moveCardAfterUse(g, b, "back");
        g.backSlots[i] = null;
      }
    } else {
      g.backSlots[i] = null;
    }
  }
}

function incrementInstallAges(g: GameState) {
  (g as any).installAgeByUid ??= {};
  for (let i = 0; i < g.frontSlots.length; i++) {
    const f = g.frontSlots[i];
    if (f && isInstalledHere(g, f, "front")) {
      g.installAgeByUid[f] = (g.installAgeByUid[f] ?? 0) + 1;
    }
    const b = g.backSlots[i];
    if (b && isInstalledHere(g, b, "back")) {
      g.installAgeByUid[b] = (g.installAgeByUid[b] ?? 0) + 1;
    }
  }
}



function mapSelectTargetsToRandom(effects: PlayerEffect[]): PlayerEffect[] {
  const map1 = (e: PlayerEffect): PlayerEffect => {
    switch (e.op) {
      case "damageEnemy":
        return e.target === "select" ? { ...e, target: "random" } : e;
      case "damageEnemyByPlayerFatigue":
        return e.target === "select" ? { ...e, target: "random" } : e;
      case "damageEnemyFormula":
        return e.target === "select" ? { ...e, target: "random" } : e;
      case "statusEnemy":
        return e.target === "select" ? { ...e, target: "random" } : e;
      case "repeat":
        return { ...e, effects: mapArr(e.effects) };
      case "ifDrewThisTurn":
        return { ...e, then: mapArr(e.then) };
      case "ifPlacedThisTurn":
        return { ...e, then: mapArr(e.then) };
      case "ifOtherRowHasDefId":
        return { ...e, then: mapArr(e.then) };
      case "ifPlaced":
        return { ...e, then: mapArr(e.then) };
      case "exhaustSlot":
        return e.then ? { ...e, then: mapArr(e.then) } : e;
      default:
        return e;
    }
  };

  const mapArr = (arr: PlayerEffect[]) => arr.map(map1);
  return mapArr(effects);
}

function getEffectiveEffectsForSide(g: GameState, uid: string, side: Side) {
  const inst = g.cards[uid];
  const def = getCardDefFor(g, uid);
  const flipped = Boolean((inst as any)?.flipped);
  if (!flipped) return side === "front" ? def.front : def.back;
  return side === "front" ? def.back : def.front;
}

function autoFlipSynthAfterResolve(g: GameState, uid: string) {
  const inst: any = g.cards[uid] as any;
  const syn: any = inst?.synth;
  if (!syn?.autoFlip) return;
  inst.flipped = !Boolean(inst.flipped);
  logMsg(g, `합성(뒤집기): [${cardNameWithUpgrade(g, uid)}] ${(inst.flipped ? "ON" : "OFF")}`);
}

export function resolveBack(g: GameState) {
  if (g.phase !== "PLACE" && g.phase !== "BACK") return;
  g.phase = "BACK";
  logMsg(g, "=== 후열 단계 ===");

  for (let i = 0; i < g.backSlots.length; i++) {
    const uid = g.backSlots[i];
    if (!uid) continue;

    const def = getCardDefFor(g, uid);

    if (!g.player.immuneToDisruptThisTurn && g.backSlotDisabled[i]) {
      logMsg(g, `후열 ${i}번 [${def.name}] 교란으로 무효`);
      continue;
    }

    resolvePlayerEffects({ game: g, side: "back", cardUid: uid }, getEffectiveEffectsForSide(g, uid, "back"));
    autoFlipSynthAfterResolve(g, uid);
  }
  g.phase = "FRONT";
}

export function resolveFront(g: GameState) {
  if (g.phase !== "FRONT") return;
  logMsg(g, "=== 전열 단계 ===");

  for (let i = 0; i < g.frontSlots.length; i++) {
    const uid = g.frontSlots[i];
    if (!uid) continue;

    const def = getCardDefFor(g, uid);
    resolvePlayerEffects({ game: g, side: "front", cardUid: uid }, getEffectiveEffectsForSide(g, uid, "front"));
    autoFlipSynthAfterResolve(g, uid);
  }

  g.phase = "ENEMY";
}


export function resolveEnemy(g: GameState) {
  if (g.phase !== "ENEMY") return;
  logMsg(g, "=== 적 행동 ===");

  for (const e of aliveEnemies(g)) {
    const def = g.content.enemiesById[e.id];
    const intent = def.intents[e.intentIndex % def.intents.length];

    const sp = def.special;
    if (sp?.kind === "SOUL_STEALER") {
      const st = (e.special && e.special.kind === "SOUL_STEALER")
        ? e.special
        : (e.special = { kind: "SOUL_STEALER", warnCount: 0, armed: false, willNukeThisTurn: false });

      if (st.willNukeThisTurn) {
        const ew = e.status.weak ?? 0;
        applyDamageToPlayer(g, sp.nukeDamage, "ENEMY_ATTACK", e.name, ew);
        logMsg(g, `영혼 강탈자: 영혼 폭발 → ${sp.nukeDamage} 피해!`);
        st.willNukeThisTurn = false;
        st.armed = false;
        st.warnCount = 0;
        continue;
      }

      for (const act of intent.acts) resolveEnemyEffect(g, e, act);

      if (e.intentIndex === sp.warnIntentIndex) {
        st.warnCount = Math.max(0, Number(st.warnCount ?? 0) || 0) + 1;
        logMsg(g, `영혼 강탈자: 경고 +1 (${st.warnCount}/${sp.warnCap})`);
        if (st.warnCount >= sp.warnCap) {
          st.armed = true;
          logMsg(g, `영혼 강탈자: 경고 ${sp.warnCap}회 완료 → 폭발 가능 상태!`);
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

function getEnemyAtkRamp(enemy: EnemyState): number {
  const v = Number((enemy as any).atkRamp ?? 0) || 0;
  return v > 0 ? v : 0;
}

function resolveEnemyEffect(g: GameState, enemy: EnemyState, act: EnemyEffect) {
  switch (act.op) {
    case "damagePlayer": {
      const ew = enemy.status.weak ?? 0;
      applyDamageToPlayer(g, act.n + getEnemyAtkRamp(enemy), "ENEMY_ATTACK", enemy.name, ew);
      return;
    }

    case "damagePlayerFormula": {
      const ew = enemy.status.weak ?? 0;


      const r = calcDamagePlayerFormula(g, enemy, act.kind);
      const hits = Math.max(1, Number(r.hits ?? 1) || 1);
      const per = Math.max(0, Number(r.raw ?? 0) || 0);
      const ramp = getEnemyAtkRamp(enemy);

      for (let i = 0; i < hits; i++) {
        applyDamageToPlayer(g, per + ramp, "ENEMY_ATTACK", enemy.name, ew);
      }

      if (r.consumeEnemyKey === "assassinAim") (enemy as any).assassinAim = 0;
      return;
    }

    case "supplies": {
      g.player.supplies = clampMin(g.player.supplies + act.n, 0);
      logMsg(g, `적 효과: 보급 S ${act.n >= 0 ? "+" : ""}${act.n} (현재 ${g.player.supplies})`);
      return;
    }

    case "statusPlayer": {
      const n = act.n;
      applyStatusTo(g.player, act.key, n, g, "ENEMY");

      let shown = n;
      if (act.key === "vuln" && shown > 0 && isRelicActive(g, "relic_ratskin_charm")) {
        shown = Math.max(0, shown - 1);
      }
      logMsg(g, `적 효과: 플레이어 상태 ${act.key} ${shown >= 0 ? "+" : ""}${shown}`);
      return;
    }

    case "enemyHealSelf": {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + act.n);
      logMsg(g, `적(${enemy.name})이(가) ${act.n} 회복 (HP ${enemy.hp}/${enemy.maxHp})`);
      return;
    }

    case "enemySetAssassinAim": {
      (enemy as any).assassinAim = Math.max(0, Number((enemy as any).assassinAim ?? 0) || 0) + (Number(act.n ?? 0) || 0);
      logMsg(g, `적(${enemy.name})이(가) 조준 상태가 됨`);
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

      const applied = applyDamageToPlayer(g, rawDmg + getEnemyAtkRamp(enemy), "ENEMY_ATTACK", enemy.name, ew);
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
        applyDamageToPlayer(g, act.n + getEnemyAtkRamp(enemy), "ENEMY_ATTACK", reason, ew);
      }
      return;
    }

    case "damagePlayerIfSuppliesPositive": {
      const s = g.player.supplies ?? 0;
      if (s > 0) {
        const ew = enemy.status.weak ?? 0;
        applyDamageToPlayer(g, act.n + getEnemyAtkRamp(enemy), "ENEMY_ATTACK", enemy.name, ew);
      } else {
        logMsg(g, `덮치기: S = 0 → 피해 없음`);
      }
      break;
    }

    case "damagePlayerIfSuppliesZero": {
      const s = g.player.supplies ?? 0;
      if (s === 0) {
        const ew = enemy.status.weak ?? 0;
        applyDamageToPlayer(g, act.n + getEnemyAtkRamp(enemy), "ENEMY_ATTACK", enemy.name, ew);
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

  applyFaithUpkeepEndTurnHooks(g);

  {
    const patron = getPatronGodOrNull(g);
    if (patron === "twin_heart") {
      const list: string[] = ((g as any)._placedUidsThisTurn as string[]) ?? [];
      if (list.length > 0) {
        const uid = list[(Math.random() * list.length) | 0];
        const side0 = String(((g as any)._placedSideThisTurn ?? {})[uid] ?? g.cards[uid]?.zone ?? "") as any;
        const other: Side = side0 === "front" ? "back" : "front";

        const inst = g.cards[uid];
        if (inst) {
          const z0 = inst.zone;
          (inst as any).zone = other;
          pushUiToast(g, "INFO", "두 심장이 같은 박자를 냅니다.", 1400);
          logMsg(g, `쌍둥이 심장: [${cardNameWithUpgrade(g, uid)}] 반대열 효과 발동 (${other})`);
          resolvePlayerEffects({ game: g, side: other, cardUid: uid, sourceLabel: "쌍둥이 심장", reason: "OTHER" }, mapSelectTargetsToRandom(getEffectiveEffectsForSide(g, uid, other)));
          (inst as any).zone = z0;
        }
      }
    }
  }

  logMsg(g, "=== 유지비 / 상태 처리 ===");

  {
    const up = getUnlockProgress(g);
    let changed = false;

    if ((g.player.status.weak ?? 0) > 0) {
      up.endedTurnWeak = (up.endedTurnWeak ?? 0) + 1;
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


  const frontCount = g.frontSlots.filter(Boolean).length;
  if (frontCount > 0) logMsg(g, `전열 유지비 처리: 전열 ${frontCount}장`);

  {
    const hadS = g.player.supplies ?? 0;
    const pay = Math.min(hadS, frontCount);
    g.player.supplies = hadS - pay;
    const shortfall = frontCount - pay;
    if (shortfall > 0) {
      g.player.fatigue += shortfall;
      logMsg(g, `전열 유지비 부족! (부족 ${shortfall} → F +${shortfall})`);
    }
  }

  if (g.player.supplies === 0) {
    g.player.zeroSupplyTurns += 1;

    {
      const up = getUnlockProgress(g);
      up.endedTurnSupplyZero = (up.endedTurnSupplyZero ?? 0) + 1;
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

  for (const en of aliveEnemies(g)) {
    const def = g.content.enemiesById[en.id];
    const d = enemyAtkRampPerTurnFromDef(def);
    if (d <= 0) continue;
    (en as any).atkRamp = getEnemyAtkRamp(en) + d;
    logMsg(g, `적 패시브: ${en.name} 공격력 +${d} (누적 +${(en as any).atkRamp})`);
  }


  g.frontPlacedThisTurn = 0;

  decayStatuses(g);
  clearSlots(g);
  incrementInstallAges(g);
  cleanupPendingTargetsIfNoEnemies(g);

  checkEndConditions(g);

  // 유물 해금 진행도: 설치물이 3개 이상인 채로 턴 종료
  {
    const installs = (g.frontSlots.filter(Boolean).length + g.backSlots.filter(Boolean).length) | 0;
    if (installs >= 3) {
      const up = getUnlockProgress(g);
      up.endedTurnWith3Installs += 1;
      checkRelicUnlocks(g);
    }
  }
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

  (g as any)._placedUidsThisTurn = [];
  (g as any)._placedSideThisTurn = {};


  const extra = Number((g as any)._extraDrawNextTurn ?? 0);
  (g as any)._extraDrawNextTurn = 0;

  (g as any)._passiveGainedThisTurn = {};

  const blockBefore = g.player.block ?? 0;
  drawCards(g, n + (extra > 0 ? extra : 0));

  const retain = hasPassiveRetainBlockBetweenTurnsFront(g);
  if (!retain && blockBefore > 0) {
    g.player.block = Math.max(0, (g.player.block ?? 0) - blockBefore);
    logMsg(g, "방어(블록) 소실");
  }

  revealIntentsAndDisrupt(g);

  g.phase = "PLACE";
  g.backUidsThisTurn = [];
  g.attackedEnemyIndicesThisTurn = [];
  g.drawCountThisTurn = 0;
  g.combatTurn = (g.combatTurn ?? 0) + 1;

  (g as any)._gainedBlockThisTurn = false;
  (g as any)._indifferentHostileWarnedThisTurn = false;

  {
    const patron = getPatronGodOrNull(g);
    if (patron === "armored_tiger" && (g.combatTurn ?? 0) === 2) {
      g.player.block = (g.player.block ?? 0) + 5;
      (g as any)._gainedBlockThisTurn = true;
      logMsg(g, "중갑 입은 호랑이: 2턴 시작 방어 +5");
    }
  }



  {
    const patron = getPatronGodOrNull(g);
    if (patron === "twin_heart") {
      const before = g.player.supplies ?? 0;
      g.player.supplies = clampMin(before - 1, 0);
      logMsg(g, `쌍둥이 심장: S -1 (S ${before}→${g.player.supplies})`);
    }
  }
  applyWingArteryEvery5Turns(g);
}


function hasPassiveRetainBlockBetweenTurnsFront(g: GameState): boolean {
  for (const uid of g.frontSlots) {
    if (!uid) continue;
    const inst = g.cards[uid];
    if (!inst) continue;
    const def: any = getCardDefFor(g, uid) as any;
    const passives = (def?.passives ?? []) as any[];
    for (const p of passives) {
      if (p?.kind === "retainBlockBetweenTurns" && p?.side === "front") return true;
    }
  }
  return false;
}

function applyOnDrawGainBlockPassives(g: GameState) {
  const gainedMap: Record<string, number> = ((g as any)._passiveGainedThisTurn ??= {});
  const numBonus = isRelicActive(g, "relic_wrong_dice") ? 1 : 0;
  const withNumBonus = (n: number) => {
    if (numBonus <= 0 || n === 0) return n;
    return n + Math.sign(n) * numBonus;
  };

  const applySide = (side: Side, slots: (string | null)[]) => {
    for (const uid of slots) {
      if (!uid) continue;
      const inst = g.cards[uid];
      if (!inst) continue;

      const def: any = getCardDefFor(g, uid) as any;
      const passives = (def?.passives ?? []) as any[];
      for (let pi = 0; pi < passives.length; pi++) {
        const p = passives[pi];
        if (!p || p.kind !== "onDrawGainBlock") continue;
        if (p.side !== side) continue;

        const cap0 = Number(p.perTurnCap ?? 0) || 0;
        const cap = cap0 > 0 ? withNumBonus(cap0) : 0;
        const key = `${uid}|${side}|onDrawGainBlock|${pi}`;
        const gained = Number(gainedMap[key] ?? 0) || 0;

        let add = withNumBonus(Number(p.block ?? 0) || 0);
        if (add <= 0) continue;

        if (cap > 0) {
          if (gained >= cap) continue;
          add = Math.min(add, cap - gained);
        }

        if (add > 0) {
          addBlock(g, add);
          gainedMap[key] = gained + add;
        }
      }
    }
  };

  applySide("front", g.frontSlots);
  applySide("back", g.backSlots);
}

function applyOnPlaceIncrementUnlockProgressPassives(g: GameState, cardUid: string, usedSide: Side) {
  const def: any = getCardDefFor(g, cardUid) as any;
  const passives = (def?.passives ?? []) as any[];
  if (!passives.length) return;

  for (const p of passives) {
    if (!p || p.kind !== "onPlaceIncrementUnlockProgress") continue;
    if (p.side && p.side !== usedSide) continue;
    const counter = String(p.counter ?? "");
    if (!counter) continue;
    const n = Number(p.n ?? 1) || 1;
    const up = getUnlockProgress(g) as unknown as Record<string, number>;
    up[counter] = (Number(up[counter] ?? 0) || 0) + n;
    checkRelicUnlocks(g);
  }
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

    applyOnDrawGainBlockPassives(g);
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
  clearSlots(g, true);
}

export function _cleanupBattleTransientForVictory(g: GameState) {
  cleanupBattleTransient(g);
}
