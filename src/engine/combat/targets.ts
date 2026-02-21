import type { GameState } from "../types";
import { aliveEnemies, applyStatusTo } from "../rules";
import { applyDamageToEnemy, cleanupPendingTargetsIfNoEnemies } from "../effects";
import { checkEndConditions } from "./victory";
import { checkRelicUnlocks, getUnlockProgress } from "../relics";

export function isTargeting(g: GameState) {
  return g.pendingTarget != null || (g.pendingTargetQueue?.length ?? 0) > 0;
}

function calcDamageForTargetSelection(g: GameState, req: any, target: any): number {
  const base = Number(req.amount ?? 0) | 0;
  const kind = req.formulaKind as string | undefined;
  if (!kind) return base;

  const aliveNow = aliveEnemies(g).length;
  const aliveSnapRaw = req.aliveCountSnap;
  const alive = Number.isFinite(Number(aliveSnapRaw)) ? Number(aliveSnapRaw) : aliveNow;

  switch (kind) {
    case "prey_mark": {
      const bonus = 5;
      return target.hp > g.player.hp ? base + bonus : base;
    }
    case "prey_mark_u1": {
      const bonus = 6;
      return target.hp > g.player.hp ? base + bonus : base;
    }
    case "triple_bounty": {
      const bonus = 8;
      return alive >= 3 ? base + bonus : base;
    }
    case "triple_bounty_u1": {
      const bonus = 10;
      return alive >= 3 ? base + bonus : base;
    }
    default:
      return base;
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

  const req = g.pendingTarget as any;

  if (req.kind === "damageSelect") {
    const amount = calcDamageForTargetSelection(g, req, target);
    applyDamageToEnemy(g, target, amount);
  } else if (req.kind === "statusSelect") {
    applyStatusTo(target, req.key, req.n, g, "PLAYER");
    if (req.key === "bleed" && req.n > 0) {
      const up = getUnlockProgress(g);
      up.bleedApplied += 1;
      checkRelicUnlocks(g);
    }
  }

  cleanupPendingTargetsIfNoEnemies(g);
  checkEndConditions(g);

  if (aliveEnemies(g).length === 0) return true;

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