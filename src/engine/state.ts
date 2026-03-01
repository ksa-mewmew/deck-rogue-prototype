import type { CardInstance, Content, GameState, RunState } from "./types";
import { logMsg, shuffle } from "./rules";
import { generateDungeonMap } from "./map";
import { ensureFaith, openFaithStartChoice } from "./faith";

function nextUid(g: GameState): string {
  g.uidSeq += 1;
  return String(g.uidSeq);
}

export function createInitialRunState(): RunState {
  return {
    relicRuntime: {},
    pendingRelicActivations: [],
    relicUnlocked: {},
    unlock: {
      rest: 0,
      eliteWins: 0,
      tookBigHit10: 0,
      kills: 0,
      endedTurnWeak: 0,
      eventPicks: 0,
      hpLeq15: 0,
      skippedTurn: 0,
      bleedApplied: 0,
      endedTurnSupplyZero: 0,

      moonScrollUses: 0,
      threeEnemyWins: 0,
      endedTurnWith3Installs: 0,
      installDamageDealt: 0,
      itemDiscards: 0,
    },

    timeMove: 0,
    slotCapFront: 3,
    slotCapBack: 3,
    bossKillCount: 0,
    bossSlotFirstPick: null,

    map: generateDungeonMap(),
    vision: { mode: "NORMAL", blind: false, presenceR: 2, typeR: 2, detailR: 0, noise: 0 },

    encounterCount: 0,
    treasureObtained: false,
    afterTreasureNodePicks: 0,

    nodeOfferQueue: [],

    finished: false,
    nodePickCount: 0,
    nodePickByType: { BATTLE: 0, ELITE: 0, REST: 0, EVENT: 0, TREASURE: 0, SHOP: 0 },
    currentNodeOffers: null,
    nextBattleSuppliesBonus: 0,
    bossPool: ["boss_gravity_master", "boss_cursed_wall", "boss_giant_orc", "boss_soul_stealer"],
    branchOffer: null,

    battleCount: 0,
    enemyLastSeenBattle: {},

    nextBossId: null,

    nextBossTime: 40,
    forcedNext: null,
    bossOmenText: null,
    deckSizeAtTreasure: null,

    ominousProphecySeen: false,

    relics: [],

    items: [],

    itemCap: 2,

    lastBattleWasElite: false,
    lastBattleWasBoss: false,
    eliteRelicOfferedThisBattle: false,
    itemOfferedThisBattle: false,
    pendingElite: false,

    rewardPityNonElite: 0,

    gold: 0,

    shops: {},
  };
}

export function createInitialState(content: Content): GameState {
  const g: GameState = {
    uidSeq: 0,
    combatTurn: 0,
    intentsRevealedThisTurn: false,
    disruptIndexThisTurn: null,
    attackedEnemyIndicesThisTurn: [],

    phase: "NODE",
    log: [],

    run: createInitialRunState(),

    player: {
      hp: 40,
      maxHp: 40,
      block: 0,
      supplies: 7,
      fatigue: 0,
      zeroSupplyTurns: 0,
      status: { vuln: 0, weak: 0, bleed: 0, disrupt: 0, slash: 0 },
      immuneToDisruptThisTurn: false,
      nullifyDamageThisTurn: false,
      incomingDamageReductionThisTurn: 0,
    },

    content,

    cards: {},
    deck: [],
    hand: [],
    discard: [],
    exhausted: [],
    vanished: [],

    frontSlots: [null, null, null],
    backSlots: [null, null, null],
    backSlotDisabled: [false, false, false],

    enemies: [],

    usedThisTurn: 0,
    frontPlacedThisTurn: 0,
    selectedHandCardUid: null,

    winHooksAppliedThisCombat: false,

    drawCountThisTurn: 0,

    pendingTarget: null,
    pendingTargetQueue: [],

    backUidsThisTurn: [],
    placedUidsThisTurn: [],

    installAgeByUid: {},

    victoryResolvedThisCombat: false,

    time: 0,

    choice: null,
    choiceQueue: [],
    choiceStack: [],
    choiceCtx: null,

    selectedEnemyIndex: null,
    _justStartedCombat: false,
  };

  makeBasicDeck(g);
  logMsg(g, "새 런 시작.");

  ensureFaith(g);
  openFaithStartChoice(g);

  return g;
}

function addToDeck(g: GameState, defId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const uid = nextUid(g);
    const inst: CardInstance = { uid, defId, zone: "deck", upgrade: 0 };
    g.cards[uid] = inst;
    g.deck.push(uid);
  }
}

export function makeBasicDeck(g: GameState) {
  addToDeck(g, "field_ration", 2);
  addToDeck(g, "maintenance", 2);
  addToDeck(g, "scout", 2);
  addToDeck(g, "shield", 2);
  addToDeck(g, "power_arrow", 1);
  addToDeck(g, "arrow", 3);

  g.deck = shuffle(g.deck);
}
