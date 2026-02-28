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
      const extra = Math.floor(raw * 0.5);
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

  let dmg = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "PRE_STATUS",
    current: raw,
    targetVuln: enemy.status.vuln ?? 0,
    attackerWeak: g.player.status.weak ?? 0,
  });

  const attackerWeak = g.player.status.weak ?? 0;
  const targetVuln = enemy.status.vuln ?? 0;
  dmg = dmg - attackerWeak + targetVuln;
  if (dmg < 0) dmg = 0;

  dmg = modifyDamageByRelics(g, {
    ...ctxBase,
    phase: "POST_STATUS",
    current: dmg,
    afterStatus: dmg,
    targetVuln,
    attackerWeak,
  });

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

  if (fromInstall && dmg > 0) {
    const up = getUnlockProgress(g);
    up.installDamageDealt += dmg;
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

    dmg = modifyDamageByRelics(g, {
      ...base,
      phase: "POST_STATUS",
      current: dmg,
      afterStatus: dmg,
      attackerWeak: weak,
      targetVuln: pv,
    });

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

  dmg = modifyDamageByRelics(g, { ...base, phase: "FINAL", current: dmg });

  if (dmg <= 0) return 0;

  g.player.hp = Math.max(0, g.player.hp - dmg);
  logMsg(g, `플레이어 ${dmg} 피해 (${reason ?? kind}). (HP ${g.player.hp}/${g.player.maxHp})`);

  {
    const up = getUnlockProgress(g);
    let changed = false;

    if (dmg >= 10) {
      up.tookBigHit10 += 1;
      changed = true;
    }
    if (g.player.hp <= 15) {
      up.hpLeq15 += 1;
      changed = true;
    }

    if (changed) checkRelicUnlocks(g);
  }

  notifyDamageAppliedByRelics(g, { ...base, phase: "FINAL", current: dmg }, dmg);
  return dmg;
}
