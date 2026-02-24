import type { EnemyState, GameState } from "../types";
import { logMsg, pickOne } from "../rules";
import { getMadnessBane } from "../faith";
import { BOSS_OMEN_HINT } from "../../content";

export function escapeRequiredNodePicks(deckSizeAtTreasure: number, baseReq = 10, baseDeck = 16) {
  const excess = Math.max(0, deckSizeAtTreasure - baseDeck);
  const extra = Math.ceil(Math.sqrt(excess));
  return baseReq + extra;
}

export function enemyStateFromId(g: GameState, enemyId: string): EnemyState {
  const def = g.content.enemiesById[enemyId];
  const e: EnemyState = {
    id: def.id,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    intentIndex: 0,
    status: { vuln: 0, weak: 0, bleed: 0, disrupt: 0 },
    immuneThisTurn: false,
    immuneNextTurn: false,
    lastIntentKey: null,
    lastIntentStreak: 0,
    soulWarnCount: enemyId === "boss_soul_stealer" ? 0 : undefined,
    soulArmed: enemyId === "boss_soul_stealer" ? false : undefined,
    soulWillNukeThisTurn: enemyId === "boss_soul_stealer" ? false : undefined,
  };

  // 광기(적대) 1: 모든 적 HP +10
  if (getMadnessBane(g) === 1) {
    e.maxHp += 10;
    e.hp += 10;
  }

  return e;
}

function patternAllowedByCooldown(g: GameState, pattern: string[], nowBattleNo: number, cooldownBattles = 5) {
  for (const id of pattern) {
    const last = g.run.enemyLastSeenBattle?.[id];
    if (last != null && nowBattleNo - last < cooldownBattles) return false;
  }
  return true;
}

export function spawnEncounter(
  g: GameState,
  opt?: { forceBoss?: boolean; forceElite?: boolean; forcePatternIds?: string[] }
) {
  const forceBoss = opt?.forceBoss ?? false;

  const runAny = g.run as any;
  const forceElite = (opt?.forceElite ?? runAny.pendingElite ?? false) === true;
  runAny.pendingElite = false;

  g.run.enemyLastSeenBattle ??= {};
  g.run.battleCount ??= 0;

  const nodeNo = g.run.nodePickCount ?? 0;
  const battleNo = (g.run.battleCount ?? 0) + 1;

  if (opt?.forcePatternIds && opt.forcePatternIds.length > 0) {
    const chosen = opt.forcePatternIds;
    g.run.battleCount = battleNo;
    for (const id of chosen) g.run.enemyLastSeenBattle[id] = battleNo;
    g.enemies = chosen.map((id) => enemyStateFromId(g, id));
    runAny.lastBattleEnemyCount = g.enemies.length;
    g.run.lastBattleWasElite = false;
    (g.run as any).lastBattleWasBoss = false;
    logMsg(g, `전투 시작! (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
    return;
  }

  if (forceBoss) {
    g.run.lastBattleWasElite = false;
    (g.run as any).lastBattleWasBoss = true;

    g.run.bossPool ??= ["boss_gravity_master", "boss_cursed_wall", "boss_giant_orc", "boss_soul_stealer"];

    if (g.run.bossPool.length === 0 && !g.run.nextBossId) {
      logMsg(g, `보스 풀이 비었습니다. 일반 전투로 진행합니다. (노드 ${nodeNo})`);
    } else {
      let bossId = g.run.nextBossId ?? null;

      if (bossId != null) {
        const def = g.content.enemiesById[bossId];
        g.run.bossOmenText = BOSS_OMEN_HINT[bossId] ?? (def as any).omen ?? null;
      }

      if (bossId) {
        g.run.nextBossId = null;
        g.run.bossPool = g.run.bossPool.filter((x) => x !== bossId);
      } else {
        bossId = pickOne(g.run.bossPool);
        g.run.bossPool = g.run.bossPool.filter((x) => x !== bossId);
      }

      g.enemies = [enemyStateFromId(g, bossId)];
      runAny.lastBattleEnemyCount = g.enemies.length;
      g.run.ominousProphecySeen = false;

      logMsg(g, `보스 등장! (노드 ${nodeNo}) 적: ${g.enemies[0].name}`);
      g.run.battleCount = battleNo;
      g.run.enemyLastSeenBattle[bossId] = battleNo;
      return;
    }
  }

  const patternsByTier: string[][][] = [
    [
      ["goblin_raider"],       // 카드 사용 유도(많이 쓰면 덜 맞음)
      ["watching_statue"],     // 카드 사용 억제 + 램프(시간 제한)
      ["pebble_golem"],        // 단순 공격 + 회복 + 램프(빨리 잡아라)
      ["slime"],               // bleed/weak 입문
      ["rat_swarm"],           // 다타/램프히트 입문
      ["supply_hound"],        // 보급 축 입문
      ["goblin_assassin"],     // 조준→암살 입문(단독이라 장막이 없음)

    ],
    [
      ["goblin_commander", "goblin_archer"], // 취약+연타(턴1 확정)  ← 대표 시너지
      ["supply_hound", "rat_swarm"],         // 취약(턴1) → 쥐떼 연타(턴1)
      ["goblin_commander", "goblin_assassin"], // 지휘관이 왼쪽이면 암살자 장막이 켜져 “바디가드 전투”
      ["goblin_raider", "watching_statue"],  // 많이 써도/적게 써도 한쪽이 아픈 딜레마 + 램프
      ["archive_censor"],                   // 교란/보급/약화로 행동 방해 단독
      ["poison_spider"],                    // 출혈 압박 단독
      ["goblin_archer", "goblin_raider"],   // 연타 + 보급/출혈로 잔딜 누적
      ["pebble_golem", "slime"],            // 회복+램프 + 디버프(길어지면 위험)
      
    ],
    [
      ["rock_golem"],                        // 램프+2 + 회복8 = 순수 DPS 체크(솔로가 깔끔)
      ["gravity_echo"],                      // 덱사이즈 압박(정리/경량화 유도)
      ["gloved_hunter"],                     // 취약+조건부 고딜(방어 계산 퍼즐)
      ["debt_collector"],                    // 보급락 퍼즐(전열 유지비와 직접 충돌)

      ["archive_censor", "debt_collector"],  // (핵심) 교란/보급-2 + 보급락 조건딜 → 전열 많이 깔면 터짐
      ["archive_censor", "slime"],           // 교란+약화 + 출혈/약화 = 운영 붕괴형
      ["poison_spider", "slime"],            // 출혈+약화 누적
      ["old_monster_corpse", "rat_swarm"],   // 킬 순서 퍼즐: 쥐부터 죽이면 사체 분노↑
      ["punishing_one"],                     // 손패 크기 자체가 위험(드로우/토큰 덱 견제)
    ],
  ];

  const postTreasurePatterns: string[][] = [
    ["gravity_echo", "poison_spider"],
    ["poison_spider", "poison_spider", "slime"],      // (교체) 디버프 폭주
    ["goblin_raider", "watching_statue"],             // (교체) 딜레마+램프
    ["watching_statue", "watching_statue"],
    ["poison_spider", "poison_spider"],
    ["rock_golem", "gravity_echo"],
    ["goblin_raider", "goblin_raider", "watching_statue"],
    ["rat_swarm", "rat_swarm", "rat_swarm"],
    ["archive_censor", "debt_collector"],             // (교체) 보급락 퍼즐
  ];

  const elitePatternsByTier: string[][][] = [
    [
      ["goblin_raider", "watching_statue"],   // 카드 사용 딜레마 + 램프(초반 정예답게)
      ["supply_hound", "rat_swarm"],          // 취약 → 연타 (턴1부터 체감)
      ["pebble_golem", "goblin_archer"],      // 램프(+1) + 연타 = ‘빨리 죽이기’ 강제
    ],
    [
        ["goblin_commander", "goblin_archer", "goblin_archer"], // 취약 + 6연타(턴1부터)
        ["archive_censor", "goblin_archer", "goblin_raider"],   // 교란/보급 + 연타 + 카드사용딜레마
        ["poison_spider", "poison_spider", "slime"],            // 출혈 스택 + 약화 = 회복/방어 시험
    ],
    [
      ["rock_golem", "gravity_echo"],                          // 램프+2 + 덱사이즈 고딜
      ["archive_censor", "debt_collector", "supply_hound"],    // 교란 + 보급락 + 취약 (3축)
      ["punishing_one", "gloved_hunter"],                      // 손패 벌점 + 취약+조건부 고딜
    ]
 ];

  const elitePostTreasurePatterns: string[][] = [
    ["gravity_echo", "gravity_echo"],
    ["watching_statue", "gravity_echo", "rock_golem"],
    ["debt_collector", "supply_hound", "supply_hound"],
  ];

  const T = Number((g.run as any).timeMove ?? 0) + (g.time ?? 0);
  const tierIdx = Math.min(patternsByTier.length - 1, Math.floor(Math.max(0, T) / 15));

  const patterns: string[][] = (() => {
    if (forceElite) return g.run.treasureObtained ? elitePostTreasurePatterns : elitePatternsByTier[tierIdx];
    return g.run.treasureObtained ? postTreasurePatterns : patternsByTier[tierIdx];
  })();

  const cooldownBattles = 5;
  const allowed = patterns.filter((p) => patternAllowedByCooldown(g, p, battleNo, cooldownBattles));
  const pickFrom = allowed.length > 0 ? allowed : patterns;

  const chosen = pickOne(pickFrom);

  g.run.battleCount = battleNo;
  for (const id of chosen) g.run.enemyLastSeenBattle[id] = battleNo;

  g.enemies = chosen.map((id) => enemyStateFromId(g, id));
  runAny.lastBattleEnemyCount = g.enemies.length;

  g.run.lastBattleWasElite = forceElite;
  (g.run as any).lastBattleWasBoss = false;
  const eliteTag = forceElite ? " [정예]" : "";
  logMsg(g, `전투 시작!${eliteTag} (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
}
