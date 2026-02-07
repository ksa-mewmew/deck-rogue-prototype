import type { EnemyEffect, GameState, Side, EnemyState } from "./types";
import { aliveEnemies, applyStatus, clampMin, logMsg, pickOne, shuffle } from "./rules";
import { applyDamageToPlayer, applyDamageToEnemy} from "./effects";
import { resolvePlayerEffects } from "./resolve";

function enemyStateFromId(g: GameState, enemyId: string): EnemyState {
  const def = g.content.enemiesById[enemyId];
  return {
    id: def.id,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    intentIndex: 0,
    status: { vuln: 0, weak: 0, bleed: 0, disrupt: 0 },
    immuneThisTurn: false,
    immuneNextTurn: false,
    
    soulCastCount: enemyId === "boss_soul_stealer" ? 0 : undefined,
  };
}

export function spawnEncounter(g: GameState, opt?: { forceBoss?: boolean }) {
  const forceBoss = opt?.forceBoss ?? false;

  // ✅ “현재 노드 번호” (전부 노드 기준으로 통일)
  const nodeNo = g.run.nodePickCount; // onChooseNode에서 +1 된 뒤 호출된다고 가정

  // ✅ 30노드마다 강제 보스 직행을 구현했다면, 여기서는 forceBoss만 보면 됨
  if (forceBoss) {
    if (g.run.bossPool.length === 0) {
      // 보스 다 소진되면 그냥 일반 전투로 폴백(원하시면 여기서 에러/로그로 바꿔도 됨)
      logMsg(g, `보스 풀이 비었습니다. 일반 전투로 진행합니다. (노드 ${nodeNo})`);
    } else {
      const bossId = pickOne(g.run.bossPool);
      g.run.bossPool = g.run.bossPool.filter((x) => x !== bossId);

      g.enemies = [enemyStateFromId(g, bossId)];
      logMsg(g, `보스 등장! (노드 ${nodeNo}) 적: ${g.enemies[0].name}`);
      return;
    }
  }

  // ✅ 인카운터 패턴(적 id들의 배열) - “노드 번호”로 early/late 구분
  const earlyPatterns: string[][] = [
    ["goblin_raider"],
    ["watching_statue"],
    ["pebble_golem"],
    ["wall"], // 언제든 등장 가능
  ];

  const latePatterns: string[][] = [
    ["goblin_raider", "goblin_raider", "goblin_raider"], // 고블린 부대
    ["rock_golem"],
    ["pebble_golem", "pebble_golem"],                    // 조약돌 골렘들
    ["slime"],
    ["wall"],
  ];

  // ✅ 기준은 이제 “노드” (원하시면 10 대신 다른 값으로 바꿔도 됨)
  const patterns = nodeNo <= 10 ? earlyPatterns : latePatterns;
  const chosen = pickOne(patterns);

  g.enemies = chosen.map((id) => enemyStateFromId(g, id));

  logMsg(g, `전투 시작! (노드 ${nodeNo}) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
}

export function startCombat(g: GameState) {
  // ✅ 전투 UI로 확실히 넘어가기
  g.phase = "REVEAL";

  // 전투 시작 시 슬롯/전투 관련 상태만 초기화
  g.frontSlots = [null, null, null];
  g.backSlots = [null, null, null];
  g.backSlotDisabled = [false, false, false];

  // ✅ 더미는 런 지속 자원/더미 정책에 따라 보존해야 함
  // g.discard = [];   // ❌ 삭제
  // g.exhausted = []; // ❌ 삭제
  // (손패는 전투 시작 시 비우는 게 자연스럽습니다)
  g.hand = [];

  g.selectedHandCardUid = null;

  // ✅ 타겟 선택 관련은 반드시 초기화
  g.pendingTarget = null;
  g.pendingTargetQueue = [];

  g.usedThisTurn = 0;

  // ✅ 첫 턴 시작: S=10 (+다음전투 보너스)
  const bonus = g.run.nextBattleSuppliesBonus ?? 0;
  g.player.supplies = 10 + bonus;
  if (bonus > 0) {
    logMsg(g, `다음 전투 보너스 적용: S +${bonus}`);
    g.run.nextBattleSuppliesBonus = 0;
  }

  // ✅ 턴 단위 플래그 초기화
  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  g.intentsRevealedThisTurn = false;
  g.disruptIndexThisTurn = null;

  // 첫 손패 4장
  drawCards(g, 4);

  // ✅ 의도 공개 + 교란 적용
  revealIntentsAndDisrupt(g);

  // ✅ 어떤 함수가 phase를 건드리더라도 전투 진행으로 고정
  // (전투 시작 직후는 배치 단계로 가는 게 UX상 자연스럽습니다)
  g.phase = "PLACE";
}


export function revealIntentsAndDisrupt(g: GameState) {
  if (g.intentsRevealedThisTurn) return; // ✅ 중복 방지
  g.intentsRevealedThisTurn = true;

  g.phase = "REVEAL";

  // 턴 시작 플래그 리셋(연막 관련)
  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  // ✅ 새 턴 시작: 적 “이번 턴 면역” 리셋
  for (const e of g.enemies) {
    e.immuneThisTurn = e.immuneNextTurn;
    e.immuneNextTurn = false;
  }

  // 적 의도 공개
  for (const e of aliveEnemies(g)) {
    const def = g.content.enemiesById[e.id];

    // ✅ 영혼 강탈자: 카운트다운 표시
    if (e.id === "boss_soul_stealer") {
      const count = e.soulCastCount ?? 0;
      const remain = Math.max(0, 5 - count);
      const note = remain === 0 ? " (다음 행동: 50 피해!)" : ` (50피해까지 ${remain}턴)`;
      const intent = def.intents[e.intentIndex % def.intents.length];
      logMsg(g, `적 의도: ${e.name} → ${intent.label}${note}`);
      continue;
    }

    const intent = def.intents[e.intentIndex % def.intents.length];
    logMsg(g, `적 의도: ${e.name} → ${intent.label}`);
  }

  if (g.disruptIndexThisTurn !== null) {
    logMsg(g, `교란: 이번 턴 후열 ${g.disruptIndexThisTurn} 무효`);
  }
    g.phase = "PLACE";
}

export function placeCard(g: GameState, cardUid: string, side: Side, idx: number) {
  if (g.phase !== "PLACE") return;
  if (!g.hand.includes(cardUid)) return;

  const slots = side === "front" ? g.frontSlots : g.backSlots;
  if (slots[idx]) return;

  // 손에서 제거
  g.hand = g.hand.filter((x) => x !== cardUid);

  slots[idx] = cardUid;
  g.cards[cardUid].zone = side;

  // ✅ 이번 턴 사용(배치) 카드 수
  g.usedThisTurn += 1;

  const def = g.content.cardsById[g.cards[cardUid].defId];
  logMsg(g, `[${def.name}]를 ${side === "front" ? "전열" : "후열"} ${idx}번에 배치`);
  if (side === "front") g.frontPlacedThisTurn += 1;
}

function isTag(g: GameState, cardUid: string, tag: "EXHAUST" | "VANISH") {
  const defId = g.cards[cardUid].defId;
  const def = g.content.cardsById[defId];
  return def.tags?.includes(tag) ?? false;
}

function removeFromSlots(g: GameState, cardUid: string) {
  g.frontSlots = g.frontSlots.map(x => (x === cardUid ? null : x));
  g.backSlots  = g.backSlots.map(x => (x === cardUid ? null : x));
}

function moveCardAfterUse(g: GameState, cardUid: string, usedSide: "front" | "back") {
  const def = g.content.cardsById[g.cards[cardUid].defId];
  removeFromSlots(g, cardUid);

  g.hand = g.hand.filter(x => x !== cardUid);
  g.deck = g.deck.filter(x => x !== cardUid);
  g.discard = g.discard.filter(x => x !== cardUid);
  
  // ✅ side 조건이 있으면 그때만 발동하도록
  const vanishOk =
    (def.vanishWhen === "BOTH") ||
    (def.vanishWhen === "FRONT" && usedSide === "front") ||
    (def.vanishWhen === "BACK" && usedSide === "back");

  const exhaustOk =
    (def.exhaustWhen === "BOTH") ||
    (def.exhaustWhen === "FRONT" && usedSide === "front") ||
    (def.exhaustWhen === "BACK" && usedSide === "back");

  // ✅ vanishWhen/exhaustWhen이 정의되어 있으면 그걸 우선 사용
  if (def.vanishWhen && vanishOk) {
    // pile/슬롯에서 실제 제거까지 하고 싶으면 여기서 제거 로직도 같이 넣는 게 베스트
    g.vanished.push(cardUid);
    g.cards[cardUid].zone = "vanished";
    logMsg(g, `[${def.name}] 소실(영구 제거)`);
    return;
  }

  if (def.exhaustWhen && exhaustOk) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[${def.name}] 소모(이번 전투에서 제거)`);
    return;
  }

  // ✅ (하위 호환) 아직 exhaustWhen/vanishWhen 안 옮긴 카드들은 기존 tags로 처리
  if (!def.vanishWhen && isTag(g, cardUid, "VANISH")) {
    g.vanished.push(cardUid);
    g.cards[cardUid].zone = "vanished";
    logMsg(g, `[${def.name}] 소실(영구 제거)`);
    return;
  }

  if (!def.exhaustWhen && isTag(g, cardUid, "EXHAUST")) {
    g.exhausted.push(cardUid);
    g.cards[cardUid].zone = "exhausted";
    logMsg(g, `[${def.name}] 소모(이번 전투에서 제거)`);
    return;
  }

  g.discard.push(cardUid);
  g.cards[cardUid].zone = "discard";
}


function clearSlots(g: GameState) {
  for (let i = 0; i < 3; i++) {
    const f = g.frontSlots[i];
    if (f) moveCardAfterUse(g, f, "front");
    g.frontSlots[i] = null;

    const b = g.backSlots[i];
    if (b) moveCardAfterUse(g, b, "back");
    g.backSlots[i] = null;
  }
}

export function resolveBack(g: GameState) {
  if (g.phase !== "PLACE" && g.phase !== "BACK") return;
  g.phase = "BACK";
  logMsg(g, "=== 후열 단계 ===");

  for (let i = 0; i < 3; i++) {
    const uid = g.backSlots[i];
    if (!uid) continue;

    const def = g.content.cardsById[g.cards[uid].defId];

    // 교란 무효(면역 없을 때만)
    if (!g.player.immuneToDisruptThisTurn && g.backSlotDisabled[i]) {
      logMsg(g, `후열 ${i}번 [${def.name}] 교란으로 무효`);
      continue;
    }

    // ✅ 후열 효과 발동
    resolvePlayerEffects({ game: g, side: "back", cardUid: uid }, def.back);
    moveCardAfterUse(g, uid, "back");

  }

  g.phase = "FRONT";
}


export function resolveFront(g: GameState) {
  if (g.phase !== "FRONT") return;
  logMsg(g, "=== 전열 단계 ===");

  for (let i = 0; i < 3; i++) {
    const uid = g.frontSlots[i];
    if (!uid) continue;

    const def = g.content.cardsById[g.cards[uid].defId];

    // ✅ 전열 효과 발동
    resolvePlayerEffects({ game: g, side: "front", cardUid: uid }, def.front);
    moveCardAfterUse(g, uid, "front");
  }

  g.phase = "ENEMY";
}


export function resolveEnemy(g: GameState) {
  
  if (g.phase !== "ENEMY") return;
  logMsg(g, "=== 적 행동 ===");

  for (const e of aliveEnemies(g)) {
    if (e.id === "boss_soul_stealer") {
      const count = e.soulCastCount ?? 0;
      if (count >= 5) {
        applyDamageToPlayer(g, 50);
        logMsg(g, "영혼 강탈자: 누적 5회 시전 → 50 피해!");
        e.soulCastCount = 0;  // 발동 후 리셋(원하시면 리셋 없이 1회성으로도 가능)
        e.intentIndex += 1;
        continue; // 이번 턴은 50 피해로 대체
      }
    }
    const def = g.content.enemiesById[e.id];
    const intent = def.intents[e.intentIndex % def.intents.length];

    for (const act of intent.acts) {
      resolveEnemyEffect(g, e, act);
    }

    if (e.id === "boss_soul_stealer") {
      e.soulCastCount = (e.soulCastCount ?? 0) + 1;
    }

    e.intentIndex += 1;
  }

  g.phase = "UPKEEP";
}

function resolveEnemyEffect(g: GameState, enemy: EnemyState, act: EnemyEffect) {
  switch (act.op) {
    case "damagePlayer":
      applyDamageToPlayer(g, act.n);
      break;

    case "damagePlayerFormula":
      if (act.kind === "goblin_raider") {
        const dmg = Math.max(0, 12 - g.usedThisTurn);
        applyDamageToPlayer(g, dmg);
        logMsg(g, `고블린 약탈자: 12 - 사용 ${g.usedThisTurn}장 = ${dmg} 피해`);
      } else {
        const dmg = 4 + g.usedThisTurn;          // 감시 석상
        applyDamageToPlayer(g, dmg);
      }
      break;

    case "supplies":
      g.player.supplies = clampMin(g.player.supplies + act.n, 0);
      logMsg(g, `적 효과: 보급 S ${act.n >= 0 ? "+" : ""}${act.n} (현재 ${g.player.supplies})`);
      break;

    case "statusPlayer":
      applyStatus(g.player, act.key, act.n);
      logMsg(g, `적 효과: 플레이어 상태 ${act.key} ${act.n >= 0 ? "+" : ""}${act.n}`);
      break;

    case "enemyHealSelf":
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + act.n);
      logMsg(g, `적(${enemy.name})이(가) ${act.n} 회복 (HP ${enemy.hp}/${enemy.maxHp})`);
      break;

    case "enemyImmuneThisTurn":
      enemy.immuneThisTurn = true;
      logMsg(g, `적(${enemy.name})이(가) 다음 턴 피해 면역 상태가 됨`);
      break;
    
    case "fatiguePlayer":
      g.player.fatigue = Math.max(0, g.player.fatigue + act.n);
      logMsg(g, `적 효과: 피로 F ${act.n >= 0 ? "+" : ""}${act.n} (현재 ${g.player.fatigue})`);
      break;

    default: {
      const _exhaustive: never = act;
      return _exhaustive;
    }
  }
}


export function upkeepEndTurn(g: GameState) {
  if (g.phase !== "UPKEEP") return;
  logMsg(g, "=== 유지비 / 상태 처리 ===");

  // 전열 유지비: 전열 카드 1장당 S-1, 부족하면 HP-3, F+1
  const frontCount = g.frontPlacedThisTurn;
  for (let i = 0; i < frontCount; i++) {
    if (g.player.supplies > 0) {
      g.player.supplies -= 1;
    } else {
      g.player.hp -= 3;
      if (g.player.hp < 0) g.player.hp = 0;
      g.player.fatigue += 1;
      logMsg(g, `전열 유지비 부족: HP -3, F +1 (HP ${g.player.hp}, F ${g.player.fatigue})`);
    }
  }
  if (frontCount > 0) logMsg(g, `전열 유지비 처리: 전열 ${frontCount}장`);

  // S=0 종료 패널티
  if (g.player.supplies === 0) {
    g.player.zeroSupplyTurns += 1;
    const p = g.player.zeroSupplyTurns;
    g.player.hp -= p;
    if (g.player.hp < 0) g.player.hp = 0;
    logMsg(g, `S=0 종료 패널티: 누적 ${p}번째 → HP -${p} (HP ${g.player.hp})`);
  }

  // 출혈: 턴 종료 HP -n
  const bleed = g.player.status.bleed ?? 0;
  if (bleed > 0) {
    g.player.hp -= bleed;
    if (g.player.hp < 0) g.player.hp = 0;
    logMsg(g, `출혈로 HP -${bleed} (현재 ${g.player.hp}/${g.player.maxHp})`);
  }

  // 상태 감소(프로토타입: 1씩 감소)
  decayStatuses(g);

  // ✅ 턴 종료: 배치된 카드 전부 제거
  clearSlots(g);

  // 다음 턴 준비 단계로
  g.phase = "DRAW";
}

function decayStatuses(g: GameState) {
  const keys: Array<keyof typeof g.player.status> = ["vuln", "weak", "bleed", "disrupt"];
  for (const k of keys) {
    if (g.player.status[k] > 0) g.player.status[k] -= 1;
  }
  for (const e of g.enemies) {
    for (const k of keys) {
      if (e.status[k] > 0) e.status[k] -= 1;
    }
  }
}

export function drawStepStartNextTurn(g: GameState) {
  if (g.phase !== "DRAW") return;

  // ✅ 사용한 만큼 드로우 = 이번 턴 배치한 카드 수
  const n = g.usedThisTurn;
  g.usedThisTurn = 0;

  drawCards(g, n);

  // 방어(블록) 다음 턴 소실
  if (g.player.block > 0) {
    g.player.block = 0;
    logMsg(g, "방어(블록) 소실");
  }

  // 승패 체크
  checkEndConditions(g);
  if (g.run.finished) return;

  // 전투 승리 시 NODE로
  if (aliveEnemies(g).length === 0) {
    g.phase = "NODE";
    return;
  }

  revealIntentsAndDisrupt(g);
}

export function drawCards(g: GameState, n: number) {
  for (let i = 0; i < n; i++) {
    maybeReshuffle(g);
    if (g.deck.length === 0) break;
    const c = g.deck.shift()!;
    g.hand.push(c);
    g.cards[c].zone = "hand";
  }
  logMsg(g, `드로우 ${n} (손패 ${g.hand.length})`);
}

function maybeReshuffle(g: GameState) {
  if (g.deck.length === 0 && g.discard.length > 0) {
    g.deck = shuffle(g.discard);
    g.discard = [];

    // HP -= F, 이후 F += 1
    const f = g.player.fatigue;
    if (f > 0) {
      g.player.hp -= f;
      if (g.player.hp < 0) g.player.hp = 0;
      logMsg(g, `리셔플 피로: HP -${f} (F=${f})`);
    } else {
      logMsg(g, "리셔플: 피로 피해 없음 (F=0)");
    }
    g.player.fatigue += 1;
    logMsg(g, `피로 F +1 (현재 ${g.player.fatigue})`);
  }
}

export function resolveTargetSelection(g: GameState, enemyIndex: number) {
  if (!g.pendingTarget || g.pendingTarget.kind !== "damageSelect") return;

  const amount = g.pendingTarget.amount;
  const target = g.enemies[enemyIndex];
  if (!target || target.hp <= 0) return;

  applyDamageToEnemy(g, target, amount);

  // ✅ 다음 선택 피해가 대기 중이면 이어서 세팅
  const next = g.pendingTargetQueue.shift() ?? null;
  g.pendingTarget = next;
}


export function checkEndConditions(g: GameState) {
  if (g.player.hp <= 0) {
    g.run.finished = true;
    logMsg(g, "패배: 플레이어 HP가 0 이하");
    return;
  }

  if (aliveEnemies(g).length === 0 && g.phase !== "NODE") {
    // 전투 승리 처리(phase는 drawStep에서 NODE로 전환)
    logMsg(g, "승리: 적을 모두 처치!");
    endCombatReturnAllToDeck(g);
    g.phase = "NODE";
    if (g.run.treasureObtained) g.run.afterTreasureNodePicks += 1;

    if (g.run.treasureObtained && g.run.afterTreasureNodePicks >= 10) {
      g.run.finished = true;
      logMsg(g, "승리! 저주받은 보물을 얻은 후 10턴 동안 살아남았습니다.");
    }
  }
}


export function endCombatReturnAllToDeck(g: GameState) {
  const pool: string[] = [];

  // 덱/손패/버림 + 슬롯(전열/후열) 전부 회수
  for (const uid of g.deck) pool.push(uid);
  for (const uid of g.hand) pool.push(uid);
  for (const uid of g.discard) pool.push(uid);

  for (const uid of g.frontSlots) if (uid) pool.push(uid);
  for (const uid of g.backSlots) if (uid) pool.push(uid);

  // ✅ 소모 더미도 회수(이번 전투 동안만 제거였으므로)
  for (const uid of g.exhausted) pool.push(uid);

  // 중복 제거
  const seen = new Set<string>();
  const unique = pool.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

  // ✅ 소실만 제외
  const keep = unique.filter((uid) => g.cards[uid]?.zone !== "vanished");

  // 덱으로 정리
  g.deck = keep;
  for (const uid of keep) g.cards[uid].zone = "deck";

  // 전투 영역/더미 비우기
  g.hand = [];
  g.discard = [];
  g.frontSlots = [null, null, null];
  g.backSlots = [null, null, null];
  g.selectedHandCardUid = null;

  // ✅ 소모 목록 초기화(다 회수했으니)
  g.exhausted = [];

  // 전투 중 잔재(있으면)
  g.pendingTarget = null as any;
  if ((g as any).pendingTargetQueue) (g as any).pendingTargetQueue = [];

  // 섞기(전투 종료마다 섞기 원하면 유지)
  shuffleInPlace(g.deck);
}

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}