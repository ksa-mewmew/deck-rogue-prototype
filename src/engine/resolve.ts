// =======================================================
// resolve.ts ✅ (전체 수정본)
// - draw: op.n 버그 수정(e.n)
// - drawCountThisTurn 누적(드로우 장수 기준)
// - ifDrewThisTurnThen 구현(2번 대안 방식)
// - statusEnemy target: select도 damage처럼 큐로 처리(완성)
// =======================================================

import type { GameState, Side, PlayerEffect, EnemyState } from "./types";
import { aliveEnemies, logMsg, applyStatusTo, pickOne } from "./rules";
import { addBlock, addFatigue, addSupplies, applyDamageToEnemy, healPlayer } from "./effects";
import { drawCards } from "./combat";
import { cardNameWithUpgrade, getCardDefFor } from "../content/cards";

export type ResolveCtx = {
  game: GameState;
  side: Side;
  cardUid: string;
};

function enqueueTargetSelectDamage(g: GameState, amount: number) {
  const req = { kind: "damageSelect" as const, amount };
  if (g.pendingTarget == null) g.pendingTarget = req;
  else g.pendingTargetQueue.push(req);

  const remaining = (g.pendingTarget ? 1 : 0) + g.pendingTargetQueue.length;
  logMsg(g, `대상 선택 필요: 적을 클릭하세요. (남은 선택 ${remaining})`);
}

function enqueueTargetSelectStatus(g: GameState, key: "vuln" | "weak" | "bleed" | "disrupt", n: number) {
  const req = { kind: "statusSelect" as const, key, n };
  if (g.pendingTarget == null) g.pendingTarget = req;
  else g.pendingTargetQueue.push(req);

  const remaining = (g.pendingTarget ? 1 : 0) + g.pendingTargetQueue.length;
  logMsg(g, `대상 선택 필요: 적을 클릭하세요. (남은 선택 ${remaining})`);
}

function enemyWillAttackThisTurn(g: GameState, en: EnemyState): boolean {
  const def = g.content.enemiesById[en.id];
  const intent = def.intents[en.intentIndex % def.intents.length];
  return intent.acts.some((a) => a.op === "damagePlayer" || a.op === "damagePlayerFormula");
}

export function resolvePlayerEffects(ctx: ResolveCtx, effects: PlayerEffect[]) {
  const g = ctx.game;

  for (const e of effects) {
    switch (e.op) {
      case "block":
        addBlock(g, e.n);
        break;

      case "supplies":
        addSupplies(g, e.n);
        break;

      case "fatigue":
        addFatigue(g, e.n);
        break;

      case "heal":
        healPlayer(g, e.n);
        break;

      case "hp":
        g.player.hp = Math.max(0, Math.min(g.player.maxHp, g.player.hp + e.n));
        logMsg(g, `HP ${e.n >= 0 ? "+" : ""}${e.n} (현재 ${g.player.hp}/${g.player.maxHp})`);
        break;

      case "maxHp":
        g.player.maxHp += e.n;
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + e.n);
        logMsg(g, `최대 HP +${e.n} (현재 ${g.player.hp}/${g.player.maxHp})`);
        break;

      case "setSupplies":
        g.player.supplies = Math.max(0, e.n);
        logMsg(g, `보급 S를 ${g.player.supplies}으로 설정`);
        break;

      case "draw": {
        const drawn = drawCards(g, e.n); // ✅ e.n
        g.drawCountThisTurn += drawn;    // ✅ 이번 턴 드로우 장수 누적
        break;
      }

      case "ifDrewThisTurn": {
        if (g.drawCountThisTurn > 0) {
          resolvePlayerEffects(ctx, e.then);
        }
        break;
      }

      case "damageEnemy":
        if (e.target === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          applyDamageToEnemy(g, pickOne(alive), e.n);
        } else if (e.target === "all") {
          for (const en of aliveEnemies(g)) applyDamageToEnemy(g, en, e.n);
        } else {
          enqueueTargetSelectDamage(g, e.n);
        }
        break;

      case "damageEnemyBy": {
        if (e.target !== "random") break;
        const alive = aliveEnemies(g);
        if (alive.length === 0) break;

        let amount = 0;
        if (e.by === "frontCount") {
          const frontCount = g.frontSlots.filter(Boolean).length;
          amount = frontCount * e.nPer;
        }
        applyDamageToEnemy(g, pickOne(alive), amount);
        break;
      }

      case "damageEnemyByPlayerFatigue": {
        if (e.target !== "random") break;
        const alive = aliveEnemies(g);
        if (alive.length === 0) break;
        const amount = Math.max(0, g.player.fatigue * e.mult);
        applyDamageToEnemy(g, pickOne(alive), amount);
        break;
      }

      case "statusPlayer":
        g.player.status[e.key] = Math.max(0, (g.player.status[e.key] ?? 0) + e.n);
        logMsg(g, `플레이어 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
        break;

      case "statusEnemy":
        if (e.target === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          const en = pickOne(alive);
          applyStatusTo(en, e.key, e.n);
          logMsg(g, `적(${en.name}) 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
        } else if (e.target === "all") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          for (const en of alive) applyStatusTo(en, e.key, e.n);
          logMsg(g, `모든 적 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
        } else {
          enqueueTargetSelectStatus(g, e.key, e.n);
        }
        break;

      case "statusEnemiesAttackingThisTurn": {
        const targets = aliveEnemies(g).filter((en) => enemyWillAttackThisTurn(g, en));
        if (targets.length === 0) {
          logMsg(g, `이번 턴 공격 의도 적 없음 → ${e.key} 적용 없음`);
          break;
        }
        for (const en of targets) {
          en.status[e.key] = Math.max(0, (en.status[e.key] ?? 0) + e.n);
        }
        logMsg(g, `공격 의도 적에게 ${e.key} ${e.n >= 0 ? "+" : ""}${e.n} (대상 ${targets.length})`);
        break;
      }

      case "immuneDisruptThisTurn":
        g.player.immuneToDisruptThisTurn = true;
        logMsg(g, "이번 턴 교란 무시");
        break;

      case "nullifyDamageThisTurn":
        g.player.nullifyDamageThisTurn = true;
        logMsg(g, "이번 턴 피해 무효");
        break;

      case "triggerFrontOfBackSlot": {
        const uid0 = g.backSlots[e.index];
        if (!uid0) {
          logMsg(g, `재배치: 후열 ${e.index + 1}번 슬롯이 비어 있음`);
          break;
        }

        const def = getCardDefFor(g, uid0); // 업그레이드 반영된 정의
        logMsg(g, `재배치: [[${cardNameWithUpgrade(g, uid0)}]]의 전열 효과를 추가 발동`);

        resolvePlayerEffects({ game: g, side: "front", cardUid: uid0 }, def.front);
        break;
      }

      default: {
        const _exhaustive: never = e;
        return _exhaustive;
      }
    }
  }
}
