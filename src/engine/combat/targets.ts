import type { GameState, DamageEnemyFormulaKind } from "../types";
import { aliveEnemies, applyStatusTo, pushUiToast, logMsg } from "../rules";
import { applyDamageToEnemy, cleanupPendingTargetsIfNoEnemies } from "../effects";
import { checkEndConditions } from "./victory";
import { checkRelicUnlocks, getUnlockProgress } from "../relics";
import { calcDamageEnemyFormulaForTarget } from "../../content/formulas";
import { getPatronGodOrNull } from "../faith";

export function isTargeting(g: GameState) {
  return g.pendingTarget != null || (g.pendingTargetQueue?.length ?? 0) > 0;
}

function calcDamageForTargetSelection(g: GameState, req: any, target: any): number {
  const base = Number(req.amount ?? 0) | 0;
  const kind = req.formulaKind as DamageEnemyFormulaKind | undefined;
  if (!kind) return base;

  const aliveNow = aliveEnemies(g).length;
  const aliveSnapRaw = req.aliveCountSnap;
  const alive = Number.isFinite(Number(aliveSnapRaw)) ? Number(aliveSnapRaw) : aliveNow;

  return calcDamageEnemyFormulaForTarget({ game: g, cardUid: req.sourceCardUid ?? null }, kind, target, base, alive);
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

  if (getPatronGodOrNull(g) === "master_spear") {
    const front = aliveEnemies(g)[0];
    if (front && target !== front) {
      pushUiToast(g, "WARN", "맨 앞의 적만 지정할 수 있습니다.");
      logMsg(g, "달인의 창: 대상 지정은 선두 적만 허용");
      return false;
    }
  }


  if (req.kind === "damageSelect") {
    const def = g.content.enemiesById[target.id] as any;
    if (def?.targeting?.forbidTargetedAttackWhenNotLeftmost) {
      const alive = aliveEnemies(g);
      const rank = alive.indexOf(target) + 1;
      if (rank > 1) {
        pushUiToast(g, "WARN", "공격 대상으로 지정할 수 없습니다.");
        logMsg(g, `${target.name}: 그림자 장막 → 대상 지정 공격 무효 (왼쪽에 적 존재)`);
        return false;
      }
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