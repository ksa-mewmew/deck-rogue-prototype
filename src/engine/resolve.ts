import type { GameState, Side, PlayerEffect } from "./types";
import { aliveEnemies, logMsg, pickOne } from "./rules";
import { addBlock, addFatigue, addSupplies, applyDamageToEnemy, healPlayer } from "./effects";
import { drawCards } from "./combat";

export type ResolveCtx = {
  game: GameState;
  side: Side;
  cardUid: string;
};

// ✅ select 타겟 요청을 "현재 1개 + 대기열" 규칙으로 추가
function enqueueTargetSelect(g: GameState, amount: number) {
  const req = { kind: "damageSelect" as const, amount };

  if (g.pendingTarget == null) {
    g.pendingTarget = req;              // ✅ 첫 개는 현재로
  } else {
    g.pendingTargetQueue.push(req);     // ✅ 나머지는 큐로
  }

  const remaining = (g.pendingTarget ? 1 : 0) + g.pendingTargetQueue.length;
  logMsg(g, `대상 선택 필요: 적을 클릭하세요. (남은 선택 ${remaining})`);

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

      case "draw":
        drawCards(g, e.n);
        break;

      case "damageEnemy":
        if (e.target === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          applyDamageToEnemy(g, pickOne(alive), e.n);
        } else if (e.target === "all") {
          for (const en of aliveEnemies(g)) applyDamageToEnemy(g, en, e.n);
        } else {
          // ✅ select: 여기서 "한 번만" 추가해야 함
          enqueueTargetSelect(g, e.n);
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

      case "statusPlayer":
        g.player.status[e.key] = Math.max(0, (g.player.status[e.key] ?? 0) + e.n);
        logMsg(g, `플레이어 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
        break;

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
          logMsg(g, `재배치: 후열 ${e.index}번 슬롯이 비어 있음`);
          break;
        }
        const defId = g.cards[uid0].defId;
        const def = g.content.cardsById[defId];
        logMsg(g, `재배치: [${def.name}]의 전열 효과를 추가 발동`);
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
