import type { GameState } from "../types";
import { aliveEnemies, applyStatusTo, pushUiToast, logMsg } from "../rules";
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


  // 대상 지정 공격 제한: 고블린 암살자(②/③일 때)
  // - 패시브는 "공격(대상 지정)"만 막는다. (설치/무작위/전체 피해 등은 허용)
  if (req.kind === "damageSelect" && target.id === "goblin_assassin") {
    const alive = aliveEnemies(g);
    const rank = alive.indexOf(target) + 1; // ①=1
    if (rank === 2 || rank === 3) {
      pushUiToast(g, "WARN", "공격 대상으로 지정할 수 없습니다.");
      logMsg(g, "고블린 암살자: 잠행 → 대상 지정 공격 무효");
      return false;
    }
  }

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