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
    status: { vuln: 0, weak: 0, bleed: 0, disrupt: 0, slash:0 },
    immuneThisTurn: false,
    immuneNextTurn: false,
    lastIntentKey: null,
    lastIntentStreak: 0,
  };

  if (def.special?.kind === "SOUL_STEALER") {
    e.special = { kind: "SOUL_STEALER", warnCount: 0, armed: false, willNukeThisTurn: false };
  }

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

      const bossPatternsById: Record<string, string[][]> = {
        boss_gravity_master: [
          ["gravity_echo", "boss_gravity_master"],
        ],
        boss_cursed_wall: [
          ["boss_cursed_wall", "goblin_assassin"],
        ],
        boss_giant_orc: [
          ["boss_giant_orc"],
        ],
        boss_soul_stealer: [
          ["boss_soul_stealer"],
        ],
      };

      const bossPatternPool = bossPatternsById[bossId] ?? [[bossId]];
      const bossChosen = pickOne(bossPatternPool);

      g.enemies = bossChosen.map((id) => enemyStateFromId(g, id));
      runAny.lastBattleEnemyCount = g.enemies.length;
      g.run.ominousProphecySeen = false;

      logMsg(g, `보스 등장! (노드 ${nodeNo}) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
      g.run.battleCount = battleNo;
      for (const id of bossChosen) g.run.enemyLastSeenBattle[id] = battleNo;
      return;
    }
  }

  const patternsByTier: string[][][] = [
    [
      ["goblin_raider"],
      ["watching_statue"],
      ["pebble_golem"],
      ["slime"],
      ["rat_swarm"],
      ["supply_hound"],
      ["goblin_assassin"],
    ],
    [
      ["goblin_commander", "goblin_archer"],
      ["supply_hound", "rat_swarm"],
      ["goblin_commander", "goblin_assassin"],
      ["archive_censor"],
      ["living_chain"],
      ["poison_spider", "rat_swarm"],
      ["goblin_archer", "goblin_raider"],
      ["pebble_golem", "slime"],
    ],
    [
      ["rock_golem"],
      ["gravity_echo", "watching_statue"],
      ["gloved_hunter"],
      ["debt_collector", "supply_hound"],
      ["supply_blocker", "archive_censor"],
      ["archive_censor", "slime"],
      ["poison_spider", "slime"],
      ["old_monster_corpse", "rat_swarm", "rat_swarm"],
    ],
    [
      ["archive_censor", "debt_collector"],
      ["rock_golem", "gravity_echo"],
      ["supply_hound", "gloved_hunter"],
      ["supply_blocker", "debt_collector"],
      ["old_monster_corpse", "old_monster_corpse"],
      ["archive_censor", "watching_statue"],
      ["poison_spider", "poison_spider", "slime"],
      ["rat_swarm", "rat_swarm", "rat_swarm"],
    ]
  ];

  const postTreasurePatterns: string[][] = [
    ["gravity_echo", "poison_spider"],
    ["goblin_raider", "watching_statue", "watching_statue"],
    ["poison_spider", "poison_spider", "goblin_raider"],
    ["rock_golem", "rock_golem"],
    ["punishing_one", "punishing_one"],
    ["goblin_raider", "goblin_raider", "watching_statue"],
    ["archive_censor", "debt_collector"],
    ["supply_blocker",],
    ["punishing_one", "watching_statue"],
  ];

  const elitePatternsByTier: string[][][] = [
    [
      ["goblin_raider", "watching_statue"],
      ["supply_hound", "rat_swarm"],
      ["pebble_golem", "goblin_archer"],
    ],
    [
      ["goblin_commander", "goblin_archer", "goblin_archer"],
      ["archive_censor", "goblin_assassin", "goblin_assassin"],
      ["punishing_one", "slime"],
    ],
    [
      ["rock_golem", "gravity_echo"],
      ["archive_censor", "debt_collector", "supply_hound"],
      ["punishing_one", "gloved_hunter"],
      ["supply_blocker", "archive_censor", "debt_collector"],
    ],
    [
      ["archive_censor", "living_chain", "goblin_assassin"],
      ["supply_blocker", "debt_collector"],
      ["supply_blocker", "supply_hound", "supply_hound"],
    ] 
 ];

  const elitePostTreasurePatterns: string[][] = [
    ["living_chain", "living_chain", "living_chain"],
    ["old_monster_corpse", "old_monster_corpse", "old_monster_corpse"],
    ["poison_spider", "poison_spider", "punishing_one"],
  ];

  const T = Number((g.run as any).timeMove ?? 0) + (g.time ?? 0);
  const tierIdx = Math.min(patternsByTier.length - 1, Math.floor(Math.max(0, T) / 14));

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
