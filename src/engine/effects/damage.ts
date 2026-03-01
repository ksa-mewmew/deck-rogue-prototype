import type { GameState, EnemyState, PlayerDamageKind } from "../types";
import { logMsg, aliveEnemies } from "../rules";
import { checkEndConditions } from "../combat";
import { modifyDamageByRelics, notifyDamageAppliedByRelics, checkRelicUnlocks, getUnlockProgress, isRelicActive } from "../relics";
import { getCardDefFor } from "../../content/cards";
import { getPatronGodOrNull } from "../faith";

export function cleanupPendingTargetsIfNoEnemies(g: GameState) {
  if (aliveEnemies(g).length !== 0) return;
  g.pendingTarget = null;
  g.pendingTargetQueue = [];
  (g as any).selectedEnemyIndex = null;
}

export function applyDamageToEnemy(g: GameState, enemy: EnemyState, raw: number) {
  if (raw <= 0) return;

  const fromInstall = !!(g as any)._playerDamageFromInstall;

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

  {
    let bonus = 0;
    const numBonus = isRelicActive(g, "relic_wrong_dice") ? 1 : 0;
    const withNumBonus = (n: number) => {
      if (numBonus <= 0 || n === 0) return n;
      return n + Math.sign(n) * numBonus;
    };

    const scan = (side: "front" | "back", slots: (string | null)[]) => {
      for (const uid of slots) {
        if (!uid) continue;
        const inst = g.cards[uid];
        if (!inst) continue;

        const def: any = getCardDefFor(g, uid) as any;
        const passives = (def?.passives ?? []) as any[];
        for (const p of passives) {
          if (!p || p.kind !== "bonusDamageToEnemyIndex") continue;
          if (p.side !== side) continue;
          if (withNumBonus((Number(p.enemyIndex ?? -1) | 0)) !== idx) continue;
          bonus += withNumBonus(Number(p.bonus ?? 0) || 0);
        }
      }
    };

    scan("front", g.frontSlots);
    scan("back", g.backSlots);

    if (bonus > 0) raw += bonus;
  }

  if (getPatronGodOrNull(g) === "master_spear") {
    const front = aliveEnemies(g)[0];
    if (front && g.enemies.indexOf(front) === idx) {
      const extra = Math.floor(raw * 0.25);
      if (extra > 0) raw += extra;
    }
  }

  let ctxBase = {
    target: "ENEMY" as const,
    source: "PLAYER_ATTACK" as const,
    raw,
    reason: fromInstall ? ("INSTALL" as const) : undefined,
    enemyIndex: idx,
    enemyId: enemy.id,
  };

  const preStatus = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "PRE_STATUS",
    current: raw,
    targetVuln: enemy.status.vuln ?? 0,
    attackerWeak: g.player.status.weak ?? 0,
  });

  const attackerWeak = g.player.status.weak ?? 0;
  const targetVuln = enemy.status.vuln ?? 0;
  const afterStatus = Math.max(0, preStatus - attackerWeak + targetVuln);

  const postStatus = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "POST_STATUS",
    current: afterStatus,
    afterStatus,
    targetVuln,
    attackerWeak,
  });

  const finalDamage = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "FINAL",
    current: postStatus,
    afterStatus: postStatus,
    targetVuln,
    attackerWeak,
  });

  const formula = `식: ${raw}(기본) → ${preStatus}(사전보정) → max(0, ${preStatus} - ${attackerWeak}(약화) + ${targetVuln}(취약)) = ${afterStatus} → ${postStatus}(상태후) → ${finalDamage}(최종)`;

  if (finalDamage <= 0) {
    logMsg(g, `적(${enemy.name})에게 피해 0 (유물/상태로 상쇄). ${formula}`);
    cleanupPendingTargetsIfNoEnemies(g);
    return;
  }

  const beforeHp = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - finalDamage);
  logMsg(g, `적(${enemy.name})에게 ${finalDamage} 피해. ${formula}. (HP ${enemy.hp}/${enemy.maxHp})`);

  if (fromInstall && finalDamage > 0) {
    const up = getUnlockProgress(g);
    up.installDamageDealt += finalDamage;
    checkRelicUnlocks(g);
  }

  if (beforeHp > 0 && enemy.hp === 0) {
    const up = getUnlockProgress(g);
    up.kills += 1;
    checkRelicUnlocks(g);
  }

  if (beforeHp > 0 && enemy.hp === 0) {
    for (const other of aliveEnemies(g) as any) {
      if (!other || other.hp <= 0) continue;
      if (other.id !== "old_monster_corpse") continue;
      (other as any).corpseRage = Math.max(0, Number((other as any).corpseRage ?? 0) || 0) + 1;
      logMsg(g, `적(${other.name}) 패시브: 썩은 분노 +1 (현재 ${(other as any).corpseRage})`);
    }
  }

  notifyDamageAppliedByRelics(g, {
    ...ctxBase,
    phase: "FINAL",
    current: finalDamage,
    afterStatus: finalDamage,
    targetVuln,
    attackerWeak,
  }, finalDamage);

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

  const preStatus = modifyDamageByRelics(g, {
    ...base,
    phase: "PRE_STATUS",
    current: raw,
    attackerWeak,
    targetVuln: g.player.status.vuln ?? 0,
  });

  const incomingReduction = Math.max(0, Number(g.player.incomingDamageReductionThisTurn ?? 0) || 0);
  const afterIncomingReduction = Math.max(0, preStatus - incomingReduction);

  let finalDamage = afterIncomingReduction;
  let formula = `식: ${raw}(기본) → ${preStatus}(보정) → max(0, ${preStatus} - ${incomingReduction}(받은 피해 감소)) = ${afterIncomingReduction} → ${afterIncomingReduction}(최종)`;

  if (kind === "ENEMY_ATTACK") {
    const weak = attackerWeak ?? 0;
    const pv = g.player.status.vuln ?? 0;

    const afterStatus = Math.max(0, afterIncomingReduction - weak + pv);

    const postStatus = modifyDamageByRelics(g, {
      ...base,
      phase: "POST_STATUS",
      current: afterStatus,
      afterStatus,
      attackerWeak: weak,
      targetVuln: pv,
    });

    const preBlock = modifyDamageByRelics(g, {
      ...base,
      phase: "PRE_BLOCK",
      current: postStatus,
      afterStatus: postStatus,
      attackerWeak: weak,
      targetVuln: pv,
    });

    let afterBlock = preBlock;
    let blockUsed = 0;

    if (g.player.block > 0) {
      blockUsed = Math.min(g.player.block, preBlock);
      g.player.block -= blockUsed;
      afterBlock = preBlock - blockUsed;
    }

    const postBlock = modifyDamageByRelics(g, {
      ...base,
      phase: "POST_BLOCK",
      current: afterBlock,
      afterStatus: postStatus,
      afterBlock,
      attackerWeak: weak,
      targetVuln: pv,
    });

    finalDamage = modifyDamageByRelics(g, { ...base, phase: "FINAL", current: postBlock });
    formula = `식: ${raw}(기본) → ${preStatus}(보정) → max(0, ${preStatus} - ${incomingReduction}(받은 피해 감소)) = ${afterIncomingReduction} → max(0, ${afterIncomingReduction} - ${weak}(약화) + ${pv}(취약)) = ${afterStatus} → ${postStatus}(상태후) → ${preBlock}(방어전) - ${blockUsed}(방어) = ${afterBlock} → ${postBlock}(방어후) → ${finalDamage}(최종)`;
  } else {
    const postStatus = modifyDamageByRelics(g, { ...base, phase: "POST_STATUS", current: afterIncomingReduction, afterStatus: afterIncomingReduction });
    finalDamage = modifyDamageByRelics(g, { ...base, phase: "FINAL", current: postStatus });
    formula = `식: ${raw}(기본) → ${preStatus}(보정) → max(0, ${preStatus} - ${incomingReduction}(받은 피해 감소)) = ${afterIncomingReduction} → ${postStatus}(상태후) → ${finalDamage}(최종)`;
  }

  if (finalDamage <= 0) return 0;

  g.player.hp = Math.max(0, g.player.hp - finalDamage);
  logMsg(g, `플레이어 ${finalDamage} 피해 (${reason ?? kind}). ${formula}. (HP ${g.player.hp}/${g.player.maxHp})`);

  {
    const up = getUnlockProgress(g);
    let changed = false;

    if (finalDamage >= 10) {
      up.tookBigHit10 += 1;
      changed = true;
    }
    if (g.player.hp <= 15) {
      up.hpLeq15 += 1;
      changed = true;
    }

    if (changed) checkRelicUnlocks(g);
  }

  notifyDamageAppliedByRelics(g, { ...base, phase: "FINAL", current: finalDamage }, finalDamage);
  return finalDamage;
}
