import type { GameState, EnemyState, PlayerDamageKind } from "./types";
import { logMsg, clampMin, aliveEnemies } from "./rules";
import { checkEndConditions } from "./combat";

export function addBlock(g: GameState, n: number) {
  if (n <= 0) return;
  g.player.block += n;
  logMsg(g, `방어(블록) +${n} (현재 ${g.player.block})`);
}

export function addSupplies(g: GameState, n: number) {
  g.player.supplies = clampMin(g.player.supplies + n, 0);
  logMsg(g, `보급 S ${n >= 0 ? "+" : ""}${n} (현재 ${g.player.supplies})`);
}

export function addFatigue(g: GameState, n: number) {
  g.player.fatigue = clampMin(g.player.fatigue + n, 0);
  logMsg(g, `피로 F ${n >= 0 ? "+" : ""}${n} (현재 ${g.player.fatigue})`);
}

export function healPlayer(g: GameState, n: number) {
  if (n <= 0) return;
  const before = g.player.hp;
  g.player.hp = Math.min(g.player.maxHp, g.player.hp + n);
  logMsg(g, `HP +${g.player.hp - before} (현재 ${g.player.hp}/${g.player.maxHp})`);
}

export function cleanupPendingTargetsIfNoEnemies(g: GameState) {
  if (aliveEnemies(g).length !== 0) return;
  g.pendingTarget = null;
  g.pendingTargetQueue = [];
  (g as any).selectedEnemyIndex = null;
}

//애니메이션!


export function applyDamageToEnemy(g: GameState, enemy: EnemyState, raw: number) {
  if (raw <= 0) return;

  const idx = g.enemies.indexOf(enemy);
  if (idx < 0) {
    logMsg(g, `WARN: applyDamageToEnemy target not in g.enemies (${enemy?.id ?? "?"})`);
    return;
  }

  // 시도 기준: 호출되면 일단 공격 시도로 기록
  if (!g.attackedEnemyIndicesThisTurn.includes(idx)) {
    g.attackedEnemyIndicesThisTurn.push(idx);
  }

  // 면역이면 시도는 했지만 피해는 0 → 애니메이션 없음
  if (enemy.immuneThisTurn) {
    logMsg(g, `적(${enemy.name})은(는) 이번 턴 피해 면역 → ${raw} 피해 무시`);
    cleanupPendingTargetsIfNoEnemies(g);
    return;
  }

  const attackerWeak = g.player.status.weak ?? 0;
  const targetVuln = enemy.status.vuln ?? 0;

  let dmg = raw - attackerWeak + targetVuln;
  if (dmg < 0) dmg = 0;

  enemy.hp = Math.max(0, enemy.hp - dmg);


  logMsg(g, `적(${enemy.name})에게 ${dmg} 피해. (HP ${enemy.hp}/${enemy.maxHp})`);
  
  cleanupPendingTargetsIfNoEnemies(g);
  if (aliveEnemies(g).length === 0) {
    // 타겟팅 남아있을 수 있으니 정리도 같이
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

  let dmg = raw;

  if (kind === "ENEMY_ATTACK") {
    const weak = attackerWeak ?? 0;
    const pv = g.player.status.vuln ?? 0;

    dmg = dmg - weak + pv;
    if (dmg < 0) dmg = 0;

    if (g.player.block > 0) {
      const used = Math.min(g.player.block, dmg);
      g.player.block -= used;
      dmg -= used;
    }
  }

  if (dmg <= 0) return 0;

  g.player.hp = Math.max(0, g.player.hp - dmg);

  logMsg(g, `플레이어 ${dmg} 피해 (${reason ?? kind}). (HP ${g.player.hp}/${g.player.maxHp})`);
  return dmg;
}


export function exhaustCardThisCombat(g: GameState, uid: string) {
  if (g.exhausted.includes(uid) || g.vanished.includes(uid)) return;


  g.deck = g.deck.filter(x => x !== uid);
  g.hand = g.hand.filter(x => x !== uid);
  g.discard = g.discard.filter(x => x !== uid);

  g.frontSlots = g.frontSlots.map(x => (x === uid ? null : x));
  g.backSlots  = g.backSlots.map(x => (x === uid ? null : x));

  g.cards[uid].zone = "exhausted";
  g.exhausted.push(uid);
}

export function vanishCardPermanently(g: GameState, uid: string) {
  const inst = g.cards[uid];
  if (!inst) return;

  if (inst.zone === "vanished") return;
  if (inst.zone === "exhausted") {

    return;
  }

  g.deck = g.deck.filter((x) => x !== uid);
  g.hand = g.hand.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);

  g.frontSlots = g.frontSlots.map((x) => (x === uid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === uid ? null : x));

  inst.zone = "vanished";
  if (!g.vanished.includes(uid)) g.vanished.push(uid);
}
