import type { EnemyState, GameState } from "../types";
import { logMsg, pickOne } from "../rules";
import { BOSS_OMEN_HINT } from "../../content";

export function escapeRequiredNodePicks(deckSizeAtTreasure: number, baseReq = 10, baseDeck = 16) {
  const excess = Math.max(0, deckSizeAtTreasure - baseDeck);
  const extra = Math.ceil(Math.sqrt(excess));
  return baseReq + extra;
}

export function enemyStateFromId(g: GameState, enemyId: string): EnemyState {
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
    lastIntentKey: null,
    lastIntentStreak: 0,
    soulWarnCount: enemyId === "boss_soul_stealer" ? 0 : undefined,
    soulArmed: enemyId === "boss_soul_stealer" ? false : undefined,
    soulWillNukeThisTurn: enemyId === "boss_soul_stealer" ? false : undefined,
  };
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
    g.run.lastBattleWasElite = false;
    logMsg(g, `전투 시작! (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
    return;
  }

  if (forceBoss) {
    g.run.lastBattleWasElite = false;

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
      g.run.ominousProphecySeen = false;

      logMsg(g, `보스 등장! (노드 ${nodeNo}) 적: ${g.enemies[0].name}`);
      g.run.battleCount = battleNo;
      g.run.enemyLastSeenBattle[bossId] = battleNo;
      return;
    }
  }

  const patternsByTier: string[][][] = [
    [["goblin_raider"], ["watching_statue"], ["pebble_golem"], ["slime"]],
    [
      ["goblin_raider", "slime"],
      ["pebble_golem", "pebble_golem"],
      ["rock_golem"],
      ["goblin_raider", "goblin_raider"],
      ["poison_spider"],
    ],
    [
      ["goblin_raider", "goblin_raider", "goblin_raider"],
      ["pebble_golem", "pebble_golem", "slime"],
      ["rock_golem", "pebble_golem"],
      ["slime", "slime"],
      ["poison_spider", "slime"],
      ["gravity_echo"],
    ],
  ];

  const postTreasurePatterns: string[][] = [
    ["gravity_echo", "poison_spider"],
    ["poison_spider", "slime"],
    ["watching_statue", "slime"],
    ["watching_statue", "watching_statue"],
    ["poison_spider", "poison_spider"],
    ["rock_golem", "gravity_echo"],
    ["goblin_raider", "goblin_raider", "watching_statue"],
  ];

  const elitePatternsByTier: string[][][] = [
    [["rock_golem"], ["poison_spider"], ["watching_statue", "slime"]],
    [["rock_golem", "slime"], ["poison_spider", "slime"], ["watching_statue", "watching_statue"]],
    [["gravity_echo"], ["rock_golem", "gravity_echo"], ["poison_spider", "poison_spider"]],
  ];

  const elitePostTreasurePatterns: string[][] = [
    ["gravity_echo", "gravity_echo"],
    ["rock_golem", "poison_spider"],
    ["watching_statue", "gravity_echo"],
  ];

  const T = (g.run.nodePickCount ?? 0) + (g.time ?? 0);
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

  g.run.lastBattleWasElite = forceElite;
  const eliteTag = forceElite ? " [정예]" : "";
  logMsg(g, `전투 시작!${eliteTag} (노드 ${nodeNo}, 전투 ${battleNo}회차) 적: ${g.enemies.map((e) => e.name).join(", ")}`);
}
