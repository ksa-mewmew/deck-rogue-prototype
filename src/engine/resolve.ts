import type { GameState, Side, PlayerEffect, EnemyState } from "./types";
import { aliveEnemies, logMsg, applyStatusTo, pickOne } from "./rules";
import { addBlock, addFatigue, addSupplies, applyDamageToEnemy, healPlayer } from "./effects";
import { drawCards } from "./combat";
import { cardNameWithUpgrade, getCardDefFor } from "../content/cards";
import { checkRelicUnlocks, getUnlockProgress } from "./relics";

export type ResolveCtx = {
  game: GameState;
  side: Side;
  cardUid: string;
};

function enqueueTargetSelectDamage(ctx: ResolveCtx, amount: number, formulaKind?: string) {
  const g = ctx.game;
  const req = {
    kind: "damageSelect" as const,
    amount,
    formulaKind,
    sourceCardUid: ctx.cardUid,
    reason: ctx.side === "front" ? "FRONT" : "BACK",
  } as const;

  g.pendingTargetQueue ??= [];
  if (g.pendingTarget == null) g.pendingTarget = req as any;
  else g.pendingTargetQueue.push(req as any);

  logMsg(g, `대상 선택 필요: 적을 클릭하세요. (${1 + g.pendingTargetQueue.length}개 남음)`);
}

function enqueueTargetSelectStatus(ctx: ResolveCtx, key: "vuln" | "weak" | "bleed" | "disrupt", n: number) {
  const g = ctx.game;
  const req = {
    kind: "statusSelect" as const,
    key,
    n,
    sourceCardUid: ctx.cardUid,
    reason: ctx.side === "front" ? "FRONT" : "BACK",
  } as const;

  g.pendingTargetQueue ??= [];
  if (g.pendingTarget == null) g.pendingTarget = req;
  else g.pendingTargetQueue.push(req);

  logMsg(g, `대상 선택 필요: 적을 클릭하세요.`);
}

function enemyWillAttackThisTurn(g: GameState, en: EnemyState): boolean {
  if (en.id === "boss_soul_stealer" && (en as any).soulWillNukeThisTurn) return true;

  const def = g.content.enemiesById[en.id];
  const intent = def.intents[en.intentIndex % def.intents.length];
  return intent.acts.some(
    (a) => a.op === "damagePlayer" || a.op === "damagePlayerFormula" || a.op === "damagePlayerByDeckSize"
  );
}

function calcDamageEnemyFormulaBase(ctx: ResolveCtx, kind: string): number {
  switch (kind) {

    case "prey_mark": return 7;
    case "prey_mark_u1": return 9;
    case "triple_bounty": return 8;
    case "triple_bounty_u1": return 10;

    default: return 0;
  }
}

function calcDamageEnemyFormulaForTarget(g: GameState, kind: string, target: EnemyState, base: number): number {
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
      const alive = aliveEnemies(g).length;
      return alive >= 3 ? base + bonus : base;
    }
    case "triple_bounty_u1": {
      const bonus = 10;
      const alive = aliveEnemies(g).length;
      return alive >= 3 ? base + bonus : base;
    }
    default:
      return base;
    
  }
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
        const drawn = drawCards(g, e.n);
        g.drawCountThisTurn += drawn;
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
          enqueueTargetSelectDamage(ctx, e.n);
        }
        break;

      case "clearStatusSelf": {
        const k = e.key;
        g.player.status[k] = 0;
        logMsg(g, `상태 해제: ${k} = 0`);
        break;
      }

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
        const amount = Math.max(0, Math.floor(g.player.fatigue * e.mult));

        if (e.target === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          applyDamageToEnemy(g, pickOne(alive), amount);
          break;
        }

        if (e.target === "select") {
          if (amount <= 0) break;
          enqueueTargetSelectDamage(ctx, amount);
          break;
        }

        break;
      }

      case "damageEnemyFormula": {
        const base = calcDamageEnemyFormulaBase(ctx, e.kind);
        if (base <= 0) break;

        if (e.target === "select") {
          enqueueTargetSelectDamage(ctx, base, e.kind);
          break;
        }

        if (e.target === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          const en = pickOne(alive);
          const amount = calcDamageEnemyFormulaForTarget(g, e.kind, en, base);
          applyDamageToEnemy(g, en, amount);
          break;
        }

        if (e.target === "all") {
          for (const en of aliveEnemies(g)) {
            const amount = calcDamageEnemyFormulaForTarget(g, e.kind, en, base);
            applyDamageToEnemy(g, en, amount);
          }
          break;
        }

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
          applyStatusTo(en, e.key, e.n, g, "PLAYER");
          logMsg(g, `적(${en.name}) 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
          if (e.key === "bleed" && e.n > 0) {
            const up = getUnlockProgress(g);
            up.bleedApplied += 1;
            checkRelicUnlocks(g);
          }
        } else if (e.target === "all") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          for (const en of alive) applyStatusTo(en, e.key, e.n, g, "PLAYER");
          logMsg(g, `모든 적 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
          if (e.key === "bleed" && e.n > 0) {
            const up = getUnlockProgress(g);
            up.bleedApplied += alive.length;
            checkRelicUnlocks(g);
          }
        } else {
          enqueueTargetSelectStatus(ctx, e.key, e.n);
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
        logMsg(g, "이번 턴 적 공격 피해 무효");
        break;

      case "triggerFrontOfBackSlot": {
        const uid0 = g.backSlots[e.index];
        if (!uid0) {
          logMsg(g, `재배치: 후열 ${e.index + 1}번 슬롯이 비어 있음`);
          break;
        }

        const def = getCardDefFor(g, uid0);
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