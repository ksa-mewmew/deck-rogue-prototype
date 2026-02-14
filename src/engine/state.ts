import type { GameState, Content, CardInstance } from "./types";
import { shuffle, uid, logMsg, rollBranchOffer } from "./rules";

export function createInitialState(content: Content): GameState {
  const g: GameState = {
    phase: "NODE",
    log: [],

    uidSeq: 0,
    winHooksAppliedThisCombat: false,

    intentsRevealedThisTurn: false,
    disruptIndexThisTurn: null,
    backUidsThisTurn: [],
    run: {
      encounterCount: 0,
      treasureObtained: false,
      afterTreasureNodePicks: 0,
      finished: false,
      nextBattleSuppliesBonus: 0,
      nextBossId: null,
      bossPool: ["boss_gravity_master","boss_cursed_wall", "boss_giant_orc", "boss_soul_stealer"],
      nodePickCount: 0,
      branchOffer: null,

      nodeOfferQueue: [],

      currentNodeOffers: null,
      nodePickByType: { BATTLE: 0, REST: 0, EVENT: 0, TREASURE: 0 },

      battleCount: 0,
      enemyLastSeenBattle: {},

      nextBossTime: 40,
      forcedNext: null,
      bossOmenText: null,

      deckSizeAtTreasure: null,

      ominousProphecySeen: false

    },

    player: {
      hp: 40,
      maxHp: 40,
      block: 0,
      supplies: 0,
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
    choice: null,
    choiceStack: [],

    frontSlots: [null, null, null],
    backSlots: [null, null, null],
    backSlotDisabled: [false, false, false],

    enemies: [],

    attackedEnemyIndicesThisTurn: [],

    usedThisTurn: 0,
    frontPlacedThisTurn: 0,
    selectedHandCardUid: null,
    pendingTargetQueue: [],
    pendingTarget: null,

    drawCountThisTurn: 0,

    time: 0,

  };

  g.run.branchOffer = rollBranchOffer(g);
  makeBasicDeck(g);
  logMsg(g, "새 런 시작.");

  return g;
}

function addToDeck(g: GameState, defId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const id = uid();
    const inst: CardInstance = { uid: id, defId, zone: "deck", upgrade: 0 };
    g.cards[id] = inst;
    g.deck.push(id);
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
