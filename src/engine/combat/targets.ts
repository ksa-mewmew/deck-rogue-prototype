import type { GameState } from "../types";
import { aliveEnemies, applyStatusTo } from "../rules";
import { applyDamageToEnemy, cleanupPendingTargetsIfNoEnemies } from "../effects";
import { checkEndConditions } from "./victory";
import { checkRelicUnlocks, getUnlockProgress } from "../relics";

export function isTargeting(g: GameState) {
  return g.pendingTarget != null || (g.pendingTargetQueue?.length ?? 0) > 0;
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
    applyDamageToEnemy(g, target, req.amount);
  } else if (req.kind === "statusSelect") {
    applyStatusTo(target, req.key, req.n, g, "PLAYER");
    // 유물 해금 진행도: 출혈 부여 횟수
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
