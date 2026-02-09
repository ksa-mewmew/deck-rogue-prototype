import type { GameState, EnemyState } from "./types";
import { logMsg, clampMin, aliveEnemies } from "./rules";

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

function cleanupPendingTargetsIfNoEnemies(g: GameState) {
  if (aliveEnemies(g).length !== 0) return;
  g.pendingTarget = null;
  g.pendingTargetQueue = [];
}

export function applyDamageToEnemy(g: GameState, enemy: EnemyState, raw: number) {
  const idx = g.enemies.indexOf(enemy);
  if (idx >= 0 && !g.attackedEnemyIndicesThisTurn.includes(idx)) {
    g.attackedEnemyIndicesThisTurn.push(idx);
  }
  if (raw <= 0) return;


  const attackerWeak = g.player.status.weak ?? 0;     // ✅ 플레이어 약화
  const targetVuln   = enemy.status.vuln ?? 0;        // ✅ 적 취약

  // ✅ 슬라임 등: 이번 턴 피해 면역
  if (enemy.immuneThisTurn) {
    logMsg(g, `적(${enemy.name})은(는) 이번 턴 피해 면역 → ${raw} 피해 무시`);
    return;
  }

  let dmg = raw - attackerWeak + targetVuln;
  if (dmg < 0) dmg = 0;

  enemy.hp -= dmg;
  if (enemy.hp < 0) enemy.hp = 0;

  logMsg(g, `적(${enemy.name})에게 ${dmg} 피해. (HP ${enemy.hp}/${enemy.maxHp})`);

  cleanupPendingTargetsIfNoEnemies(g);
}

export function applyDamageToPlayer(g: GameState, raw: number, sourceEnemy: EnemyState | null = null) {
  if (raw <= 0) return;

  if (g.player.nullifyDamageThisTurn) {
    logMsg(g, `이번 턴 피해 무효(연막): ${raw} 피해가 무시됨`);
    return;
  }


  const attackerWeak = sourceEnemy?.status.weak ?? 0; // ✅ 적 약화(없으면 0)
  const targetVuln   = g.player.status.vuln ?? 0;     // ✅ 플레이어 취약

  let dmg = raw - attackerWeak + targetVuln;
  if (dmg < 0) dmg = 0;

  // 블록 흡수
  const blocked = Math.min(g.player.block, dmg);
  g.player.block -= blocked;
  dmg -= blocked;

  if (dmg > 0) g.player.hp -= dmg;
  if (g.player.hp < 0) g.player.hp = 0;

  logMsg(
    g,
    `플레이어 피해 → 블록 ${blocked} 흡수, 실제 ${dmg} 피해. (HP ${g.player.hp}/${g.player.maxHp}, 블록 ${g.player.block})`
  );
}

export function exhaustCardThisCombat(g: GameState, uid: string) {
  // 이미 소모/소실된 카드면 중복 방지
  if (g.exhausted.includes(uid) || g.vanished.includes(uid)) return;

  // pile/zone에서 제거
  g.deck = g.deck.filter(x => x !== uid);
  g.hand = g.hand.filter(x => x !== uid);
  g.discard = g.discard.filter(x => x !== uid);

  // 슬롯에서도 제거(즉시)
  g.frontSlots = g.frontSlots.map(x => (x === uid ? null : x));
  g.backSlots  = g.backSlots.map(x => (x === uid ? null : x));

  g.cards[uid].zone = "exhausted";
  g.exhausted.push(uid);
}

export function vanishCardPermanently(g: GameState, uid: string) {
  const inst = g.cards[uid];
  if (!inst) return;

  // 이미 소실/소모 처리된 경우 중복 방지
  if (inst.zone === "vanished") return;
  if (inst.zone === "exhausted") {
    // 소모로 이미 빠진 카드를 소실로 또 보내진 않게 방지
    return;
  }

  // 모든 pile에서 제거
  g.deck = g.deck.filter((x) => x !== uid);
  g.hand = g.hand.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);

  // 슬롯에서도 제거 (전투 중일 수 있으니)
  g.frontSlots = g.frontSlots.map((x) => (x === uid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === uid ? null : x));

  // 기록
  inst.zone = "vanished";
  if (!g.vanished.includes(uid)) g.vanished.push(uid);
}
