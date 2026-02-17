import type { CardInstance, Content, GameState, RunState } from "./types";
import { logMsg, shuffle } from "./rules";

function nextUid(g: GameState): string {
  g.uidSeq += 1;
  return String(g.uidSeq);
}

export function createInitialRunState(): RunState {
  return {
    relicRuntime: {},
    pendingRelicActivations: [],
    unlock: {
      rest: 0,
      eliteWins: 0,
      tookBigHit10: false,
      kills: 0,
      endedTurnWeak: false,
      eventPicks: 0,
      hpLeq15: false,
      skippedTurn: false,
      bleedApplied: 0,
    },

    encounterCount: 0,
    treasureObtained: false,
    afterTreasureNodePicks: 0,

    nodeOfferQueue: [],

    finished: false,
    nodePickCount: 0,
    nodePickByType: { BATTLE: 0, ELITE: 0, REST: 0, EVENT: 0, TREASURE: 0 },
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

    lastBattleWasElite: false,
    eliteRelicOfferedThisBattle: false,
    pendingElite: false
  };
}

export function createInitialState(content: Content): GameState {
  const g: GameState = {
    uidSeq: 0,

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
      status: { vuln: 0, weak: 0, bleed: 0, disrupt: 0 },
      immuneToDisruptThisTurn: false,
      nullifyDamageThisTurn: false,
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

    victoryResolvedThisCombat: false,

    time: 0,

    choice: null,
    choiceQueue: [],
    choiceStack: [],
    choiceCtx: null,

    selectedEnemyIndex: null,
  };

  makeBasicDeck(g);
  logMsg(g, "새 런 시작.");

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
