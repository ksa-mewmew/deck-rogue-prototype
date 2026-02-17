import type { GameState, EnemyState, PlayerDamageKind } from "./types";
import { logMsg, clampMin, aliveEnemies } from "./rules";
import { checkEndConditions } from "./combat";
import { modifyDamageByRelics, notifyDamageAppliedByRelics, checkRelicUnlocks, getUnlockProgress } from "./relics";


export function addBlock(g: GameState, n: number) {
  if (n <= 0) return;
  g.player.block += n;
  logMsg(g, `방어(블록) +${n} (현재 ${g.player.block})`);
}

export function addSupplies(g: GameState, n: number) {
  g.player.supplies = clampMin(g.player.supplies + n, 0);
  logMsg(g, `보급 S ${n >= 0 ? "+" : ""}${n} (현재 ${g.player.supplies})`);
}

export function addFatigue(g: GameState, n: number) {
  g.player.fatigue = clampMin(g.player.fatigue + n, 0);
  logMsg(g, `피로 F ${n >= 0 ? "+" : ""}${n} (현재 ${g.player.fatigue})`);
}

export function healPlayer(g: GameState, n: number) {
  if (n <= 0) return;
  const before = g.player.hp;
  g.player.hp = Math.min(g.player.maxHp, g.player.hp + n);
  logMsg(g, `HP +${g.player.hp - before} (현재 ${g.player.hp}/${g.player.maxHp})`);
}

export function cleanupPendingTargetsIfNoEnemies(g: GameState) {
  if (aliveEnemies(g).length !== 0) return;
  g.pendingTarget = null;
  g.pendingTargetQueue = [];
  (g as any).selectedEnemyIndex = null;
}

//애니메이션!


export function applyDamageToEnemy(g: GameState, enemy: EnemyState, raw: number) {
  if (raw <= 0) return;

  const idx = g.enemies.indexOf(enemy);
  if (idx < 0) {
    logMsg(g, `WARN: applyDamageToEnemy target not in g.enemies (${enemy?.id ?? "?"})`);
    return;
  }

  if (!g.attackedEnemyIndicesThisTurn.includes(idx)) {
    g.attackedEnemyIndicesThisTurn.push(idx);
  }

  if (enemy.immuneThisTurn) {
    logMsg(g, `적(${enemy.name})은(는) 이번 턴 피해 면역 → ${raw} 피해 무시`);
    cleanupPendingTargetsIfNoEnemies(g);
    return;
  }

  // PRE_STATUS
  let ctxBase = {
    target: "ENEMY" as const,
    source: "PLAYER_ATTACK" as const,
    raw,
    enemyIndex: idx,
    enemyId: enemy.id,
  };

  let dmg = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "PRE_STATUS",
    current: raw,
    targetVuln: enemy.status.vuln ?? 0,
    attackerWeak: g.player.status.weak ?? 0,
  });

  // 상태 계산
  const attackerWeak = g.player.status.weak ?? 0;
  const targetVuln = enemy.status.vuln ?? 0;
  dmg = dmg - attackerWeak + targetVuln;
  if (dmg < 0) dmg = 0;

  // POST_STATUS
  dmg = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "POST_STATUS",
    current: dmg,
    afterStatus: dmg,
    targetVuln,
    attackerWeak,
  });

  // FINAL
  dmg = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "FINAL",
    current: dmg,
    afterStatus: dmg,
    targetVuln,
    attackerWeak,
  });

  if (dmg <= 0) {
    logMsg(g, `적(${enemy.name})에게 피해 0 (유물/상태로 상쇄)`);
    cleanupPendingTargetsIfNoEnemies(g);
    return;
  }

  const beforeHp = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - dmg);
  logMsg(g, `적(${enemy.name})에게 ${dmg} 피해. (HP ${enemy.hp}/${enemy.maxHp})`);

  // 유물 해금 진행도: 적 처치 카운트
  if (beforeHp > 0 && enemy.hp === 0) {
    const up = getUnlockProgress(g);
    up.kills += 1;
    checkRelicUnlocks(g);
  }

  notifyDamageAppliedByRelics(g, {
    ...ctxBase,
    phase: "FINAL",
    current: dmg,
    afterStatus: dmg,
    targetVuln,
    attackerWeak,
  }, dmg);

  cleanupPendingTargetsIfNoEnemies(g);
  if (aliveEnemies(g).length === 0) {
    cleanupPendingTargetsIfNoEnemies(g);
    checkEndConditions(g);
  }
}



export function applyDamageToPlayer(
  g: GameState,
  raw: number,
  kind: PlayerDamageKind,
  reason?: string,
  attackerWeak?: number,
) {
  if (kind === "ENEMY_ATTACK" && g.player.nullifyDamageThisTurn) {
    logMsg(g, `적 공격 피해 무효 (${reason ?? kind})`);
    return 0;
  }
  if (raw <= 0) return 0;

  // source 정규화
  const source =
    kind === "ENEMY_ATTACK" ? ("ENEMY_ATTACK" as const) :
    kind === "FATIGUE" ? ("FATIGUE" as const) :
    ("OTHER" as const);

  const base = {
    target: "PLAYER" as const,
    source,
    raw,
    reason,
  };

  // PRE_STATUS
  let dmg = modifyDamageByRelics(g, {
    ...base,
    phase: "PRE_STATUS",
    current: raw,
    attackerWeak,
    targetVuln: g.player.status.vuln ?? 0,
  });

  if (kind === "ENEMY_ATTACK") {
    const weak = attackerWeak ?? 0;
    const pv = g.player.status.vuln ?? 0;

    dmg = dmg - weak + pv;
    if (dmg < 0) dmg = 0;

    // POST_STATUS
    dmg = modifyDamageByRelics(g, {
      ...base,
      phase: "POST_STATUS",
      current: dmg,
      afterStatus: dmg,
      attackerWeak: weak,
      targetVuln: pv,
    });

    // PRE_BLOCK
    dmg = modifyDamageByRelics(g, {
      ...base,
      phase: "PRE_BLOCK",
      current: dmg,
      afterStatus: dmg,
      attackerWeak: weak,
      targetVuln: pv,
    });

    if (g.player.block > 0) {
      const used = Math.min(g.player.block, dmg);
      g.player.block -= used;
      dmg -= used;
    }

    // POST_BLOCK
    dmg = modifyDamageByRelics(g, {
      ...base,
      phase: "POST_BLOCK",
      current: dmg,
      afterStatus: dmg,
      afterBlock: dmg,
      attackerWeak: weak,
      targetVuln: pv,
    });
  } else {

    dmg = modifyDamageByRelics(g, { ...base, phase: "POST_STATUS", current: dmg, afterStatus: dmg });
  }

  // FINAL
  dmg = modifyDamageByRelics(g, { ...base, phase: "FINAL", current: dmg });

  if (dmg <= 0) return 0;

  g.player.hp = Math.max(0, g.player.hp - dmg);
  logMsg(g, `플레이어 ${dmg} 피해 (${reason ?? kind}). (HP ${g.player.hp}/${g.player.maxHp})`);

  // 유물 해금 진행도: 한 번에 10+ 피해 / HP<=15 경험
  {
    const up = getUnlockProgress(g);
    let changed = false;
    if (dmg >= 10 && !up.tookBigHit10) {
      up.tookBigHit10 = true;
      changed = true;
    }
    if (g.player.hp <= 15 && !up.hpLeq15) {
      up.hpLeq15 = true;
      changed = true;
    }
    if (changed) checkRelicUnlocks(g);
  }

  notifyDamageAppliedByRelics(g, { ...base, phase: "FINAL", current: dmg }, dmg);
  return dmg;
}

export function exhaustCardThisCombat(g: GameState, uid: string) {
  if (g.exhausted.includes(uid) || g.vanished.includes(uid)) return;


  g.deck = g.deck.filter(x => x !== uid);
  g.hand = g.hand.filter(x => x !== uid);
  g.discard = g.discard.filter(x => x !== uid);

  g.frontSlots = g.frontSlots.map(x => (x === uid ? null : x));
  g.backSlots  = g.backSlots.map(x => (x === uid ? null : x));

  g.cards[uid].zone = "exhausted";
  g.exhausted.push(uid);
}

export function vanishCardPermanently(g: GameState, uid: string) {
  const inst = g.cards[uid];
  if (!inst) return;

  if (inst.zone === "vanished") return;
  if (inst.zone === "exhausted") {

    return;
  }

  g.deck = g.deck.filter((x) => x !== uid);
  g.hand = g.hand.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);

  g.frontSlots = g.frontSlots.map((x) => (x === uid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === uid ? null : x));

  inst.zone = "vanished";
  if (!g.vanished.includes(uid)) g.vanished.push(uid);
}
