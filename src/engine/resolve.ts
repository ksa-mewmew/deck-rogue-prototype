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
  sourceLabel?: string;
  reason?: "FRONT" | "BACK" | "ENEMY" | "EVENT" | "RELIC" | "OTHER";
};

function enqueueTargetSelectDamage(ctx: ResolveCtx, amount: number, formulaKind?: string) {
  const g = ctx.game;
  const req = {
    kind: "damageSelect" as const,
    amount,
    formulaKind,
    aliveCountSnap: aliveEnemies(g).length,
    sourceCardUid: ctx.cardUid || undefined,
    sourceLabel: ctx.sourceLabel,
    reason: ctx.reason ?? (ctx.side === "front" ? "FRONT" : "BACK"),
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
    sourceCardUid: ctx.cardUid || undefined,
    sourceLabel: ctx.sourceLabel,
    reason: ctx.reason ?? (ctx.side === "front" ? "FRONT" : "BACK"),
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

function onlyThisCardUsedThisTurn(ctx: ResolveCtx): boolean {
  const g = ctx.game;
  const used = Number(g.usedThisTurn ?? 0) || 0;
  if (used !== 1) return false;
  const placed = (g.placedUidsThisTurn ?? []).filter(Boolean);
  if (placed.length !== 1) return false;
  return placed[0] === ctx.cardUid;
}

function calcDamageEnemyFormulaBase(ctx: ResolveCtx, kind: string): number {
  switch (kind) {

    case "prey_mark": return 10;
    case "prey_mark_u1": return 12;
    case "triple_bounty": return 10;
    case "triple_bounty_u1": return 10;
    case "hand_blade": {
      const g = ctx.game;
      const handOthers = Object.values(g.cards).filter((c) => c.zone === "hand" && c.uid !== ctx.cardUid).length;
      return 4 + 2 * handOthers;
    }
    case "hand_blade_u1": {
      const g = ctx.game;
      const handOthers = Object.values(g.cards).filter((c) => c.zone === "hand" && c.uid !== ctx.cardUid).length;
      return 6 + 2 * handOthers;
    }
    case "lone_blow_20": {
      return onlyThisCardUsedThisTurn(ctx) ? 20 : 0;
    }
    case "lone_blow_26": {
      return onlyThisCardUsedThisTurn(ctx) ? 26 : 0;
    }

    // 설치물: 성곽 쇠뇌
    case "castle_ballista_age": {
      const uid = ctx.cardUid ?? "";
      const age = (ctx.game.installAgeByUid?.[uid] ?? 0) | 0;
      return 1 + Math.max(0, age);
    }
    case "castle_ballista_age_u1": {
      const uid = ctx.cardUid ?? "";
      const age = (ctx.game.installAgeByUid?.[uid] ?? 0) | 0;
      return 2 + Math.max(0, age);
    }




    default: return 0;
  }
}

function calcBlockFormula(ctx: ResolveCtx, kind: string): number {
  const g = ctx.game;
  const handCount = Object.values(g.cards).filter((c) => c.zone === "hand" && c.uid !== ctx.cardUid).length;

  switch (kind) {
    // 손 안의 칼날(후열): 손패 1장당 방어 2, 최대 6
    case "hand_blade_back": {
      const amount = 1 * handCount;
      return Math.min(6, amount);
    }

    // 강화: 캡 없음
    case "hand_blade_back_u1": {
      return 1 * handCount;
    }
    // 고독한 일격(후열): 이번 턴 이 카드만 사용했으면 방어
    case "lone_blow_block_10": {
      return onlyThisCardUsedThisTurn(ctx) ? 10 : 0;
    }
    case "lone_blow_block_14": {
      return onlyThisCardUsedThisTurn(ctx) ? 14 : 0;
    }


    default:
      return 0;
  }
}

function calcDamageEnemyFormulaForTarget(g: GameState, kind: string, target: EnemyState, base: number, aliveCountSnapshot?: number): number {
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
      const bonus = 6;
      const alive = (aliveCountSnapshot ?? aliveEnemies(g).length);
      return alive >= 3 ? base + bonus : base;
    }
    case "triple_bounty_u1": {
      const bonus = 10;
      const alive = (aliveCountSnapshot ?? aliveEnemies(g).length);
      return alive >= 3 ? base + bonus : base;
    }
    default:
      return base;
    
  }
}

export function resolvePlayerEffects(ctx: ResolveCtx, effects: PlayerEffect[]) {
  const g = ctx.game;

  // 설치물에서 발생한 피해인지 여부를 메타로 전달합니다.
  // (설치물 피해 누적/유물 보정/언락 카운트 등에 사용)
  const fromInstall = (() => {
    try {
      const def: any = getCardDefFor(g, ctx.cardUid);
      if (!(def?.tags?.includes("INSTALL"))) return false;
      const w = def.installWhen as ("FRONT" | "BACK" | "BOTH" | "NONE" | undefined);
      if (!w || w === "BOTH") return true;
      if (w === "FRONT") return ctx.side === "front";
      if (w === "BACK") return ctx.side === "back";
      return false;
    } catch {
      return false;
    }
  })();

  const damageEnemyWithMeta = (en: EnemyState, amount: number) => {
    const key = "_playerDamageFromInstall";
    const prev = (g as any)[key];
    (g as any)[key] = fromInstall;
    try {
      applyDamageToEnemy(g, en, amount);
    } finally {
      (g as any)[key] = prev;
    }
  };

  for (const e of effects) {
    switch (e.op) {
      case "block":
        addBlock(g, e.n);
        break;

      case "blockFormula": {
        const amount = calcBlockFormula(ctx, e.kind);
        if (amount > 0) addBlock(g, amount);
        break;
      }

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

      case "discardHandAllDraw": {
        const extra = Number((e as any).extraDraw ?? 0) || 0;
        const toDiscard = g.hand.slice();
        if (toDiscard.length > 0) {
          g.hand = [];
          for (const uid of toDiscard) {
            g.discard.push(uid);
            g.cards[uid].zone = "discard";
          }
          logMsg(g, `손패 ${toDiscard.length}장 버림`);
        } else {
          logMsg(g, `손패 버림: 0장`);
        }

        const want = toDiscard.length + extra;
        if (want > 0) {
          const drawn = drawCards(g, want);
          g.drawCountThisTurn += drawn;
        }
        break;
      }

      case "discardHandRandom": {
        let n = Number((e as any).n ?? 0) || 0;
        n = Math.max(0, Math.min(n, g.hand.length));
        if (n <= 0) {
          logMsg(g, `손패 무작위 버림: 0장`);
          break;
        }

        const pool = g.hand.slice();
        const picked: string[] = [];
        for (let i = 0; i < n; i++) {
          const uid = pickOne(pool);
          const ix = pool.indexOf(uid);
          if (ix >= 0) pool.splice(ix, 1);
          picked.push(uid);
        }

        g.hand = g.hand.filter((u) => !picked.includes(u));
        for (const uid of picked) {
          g.discard.push(uid);
          g.cards[uid].zone = "discard";
        }

        logMsg(g, `손패 무작위 버림: ${picked.length}장`);
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
          damageEnemyWithMeta(pickOne(alive), e.n);
        } else if (e.target === "all") {
          for (const en of aliveEnemies(g)) damageEnemyWithMeta(en, e.n);
        } else {
          enqueueTargetSelectDamage(ctx, e.n);
        }
        break;

      case "halveEnemyHpAtIndex": {
        const idx = (e.index ?? -1) | 0;
        const en = g.enemies[idx];
        if (!en || en.hp <= 0) break;

        const before = en.hp;
        // 절반으로(내림). 1 미만으로는 내려가지 않게(즉사 방지)
        const after = Math.max(1, Math.floor(before / 2));
        if (after >= before) break;
        en.hp = after;
        logMsg(g, `적(${en.name})의 HP를 절반으로: ${before} → ${after}`);
        break;
      }

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
        damageEnemyWithMeta(pickOne(alive), amount);
        break;
      }

      case "damageEnemyByPlayerFatigue": {
        const amount = Math.max(0, Math.floor(g.player.fatigue * e.mult));

        if (e.target === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          damageEnemyWithMeta(pickOne(alive), amount);
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
          const amount = calcDamageEnemyFormulaForTarget(g, e.kind, en, base, alive.length);
          damageEnemyWithMeta(en, amount);
          break;
        }

        if (e.target === "all") {
          const targets = aliveEnemies(g);
          const aliveCountSnap = targets.length;
          for (const en of targets) {
            const amount = calcDamageEnemyFormulaForTarget(g, e.kind, en, base, aliveCountSnap);
            damageEnemyWithMeta(en, amount);
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
      case "addCardToHand": {
        const defId = e.defId;
        const base = g.content.cardsById[defId];
        if (!base) {
          logMsg(g, `WARN: addCardToHand unknown defId: ${defId}`);
          break;
        }

        const count = Math.max(1, (Number(e.n ?? 1) | 0));
        const up = Math.max(0, (Number(e.upgrade ?? 0) | 0));

        for (let i = 0; i < count; i++) {
          g.uidSeq += 1;
          const uid = String(g.uidSeq);
          g.cards[uid] = { uid, defId, zone: "hand", upgrade: up } as any;
          g.hand.push(uid);
        }

        logMsg(g, `손패에 [${base.name}${up > 0 ? " +" + up : ""}] ${count}장 추가`);
        break;
      }

      default: {
        const _exhaustive: never = e;
        return _exhaustive;
      }
    }
  }
}