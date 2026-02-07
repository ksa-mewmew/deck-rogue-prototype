import type { GameState, Content, CardInstance } from "./types";
import { shuffle, uid } from "./rules";
import { logMsg } from "./rules";

export function createInitialState(content: Content): GameState {
  const g: GameState = {
    phase: "NODE",
    log: [],


    intentsRevealedThisTurn: false,
    disruptIndexThisTurn: null,

    run: {
      encounterCount: 0,
      treasureObtained: false,
      afterTreasureNodePicks: 0,
      finished: false,
      nextBattleSuppliesBonus: 0,
      bossPool: ["boss_cursed_wall", "boss_giant_orc", "boss_soul_stealer"],
      nodePickCount: 0,

      nodeOfferQueue: [],

      currentNodeOffers: null,
      nodePickByType: { BATTLE: 0, REST: 0, EVENT: 0, TREASURE: 0 }
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



    usedThisTurn: 0,
    frontPlacedThisTurn: 0,
    selectedHandCardUid: null,
    pendingTargetQueue: [],
    pendingTarget: null,

    
  };

  makeBasicDeck(g);
  logMsg(g, "새 런 시작. 다음 인카운터를 선택하세요.");

  return g;
}

function addToDeck(g: GameState, defId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const id = uid();
    const inst: CardInstance = { uid: id, defId, zone: "deck" };
    g.cards[id] = inst;
    g.deck.push(id);
  }
}

export function makeBasicDeck(g: GameState) {
  // 기본 덱: 야전 식량 2, 정비 도구 2, 정찰 2, 방패 2, 강력한 화살 1, 화살 3
  addToDeck(g, "field_ration", 2);
  addToDeck(g, "maintenance", 2);
  addToDeck(g, "scout", 2);
  addToDeck(g, "shield", 2);
  addToDeck(g, "power_arrow", 1);
  addToDeck(g, "arrow", 3);

  g.deck = shuffle(g.deck);
}
