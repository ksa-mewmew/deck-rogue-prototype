export type Zone = "deck" | "hand" | "discard" | "front" | "back" | "exhausted" | "vanished";
export type Side = "front" | "back";
export type StatusKey = "vuln" | "weak" | "bleed" | "disrupt";
export type CardTag = "EXHAUST" | "VANISH";

export type NodeType = "BATTLE" | "REST" | "EVENT" | "TREASURE";

export type NodeOfferId = "A" | "B";

export type NodeOffer = {
  id: NodeOfferId;   // A/B 식별
  type: NodeType;
};

export type BranchOffer = {
  root: [NodeOffer, NodeOffer];      // 현재 A/B
  nextIfA: [NodeOffer, NodeOffer];   // A 다음
  nextIfB: [NodeOffer, NodeOffer];   // B 다음
};

export type PlayerDamageKind =
  | "ENEMY_ATTACK"
  | "BLEED"
  | "FATIGUE"
  | "ZERO_SUPPLY"
  | "OTHER";


export type ExhaustWhen = "FRONT" | "BACK" | "BOTH" | "NONE";

export type ChoiceOption = {
  key: string;
  label: string;
  detail?: string;

  cardUid?: string;
};


export type ChoiceState = {
  kind: "EVENT" | "REWARD" | "PICK_CARD" | "VIEW_PILE" | "UPGRADE_PICK";
  title: string;
  prompt?: string;
  options: ChoiceOption[];
};

export type CombatPhase =
  | "REVEAL"
  | "PLACE"
  | "BACK"
  | "FRONT"
  | "ENEMY"
  | "UPKEEP"
  | "DRAW"
  | "NODE";


export type PileKind = "deck" | "discard" | "exhausted" | "vanished" | "hand";

export type CardData = {
  id: string;
  name: string;
  tags?: CardTag[];
  frontText: string;
  backText: string;
  front: PlayerEffect[];
  back: PlayerEffect[];
  design?: string;
  exhaustWhen?: ExhaustWhen;
  vanishWhen?: ExhaustWhen;
  upgrades?: Array<Partial<Pick<CardData,
  "name"|"frontText"|"backText"|"front"|"back"|"tags"|"onWinWhileInBack"|"exhaustWhen"|"vanishWhen">>>;
  onWinWhileInBack?: PlayerEffect[];
  

};

export type EnemyData = {
  id: string;
  name: string;
  omen?: string;
  maxHp: number;
  intents: EnemyIntentData[];
  rule?: string;
};

export type EnemyIntentData = {
  label: string;
  acts: EnemyEffect[];
};

export type CardInstance = {
  uid: string;
  defId: string;
  zone: Zone;
  upgrade: number;
};

export type EnemyState = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  intentIndex: number;
  status: Record<StatusKey, number>;

  immuneNextTurn: boolean;
  immuneThisTurn: boolean;
  soulCastCount?: number;

  soulWarnCount?: number;         // 3번 의도 경고 누적
  soulArmed?: boolean;
  soulWillNukeThisTurn?: boolean;

  intentLabelOverride?: string;

  lastIntentKey?: string | null;
  lastIntentStreak?: number;
};

export type PlayerEffect =
  | { op: "block"; n: number }
  | { op: "supplies"; n: number }
  | { op: "fatigue"; n: number }
  | { op: "heal"; n: number }
  | { op: "draw"; n: number }
  | { op: "damageEnemy"; target: "select" | "random" | "all"; n: number }
  | { op: "damageEnemyBy"; target: "random"; nPer: number; by: "frontCount" }
  | { op: "statusPlayer"; key: StatusKey; n: number }
  | { op: "immuneDisruptThisTurn" }
  | { op: "nullifyDamageThisTurn" }
  | { op: "ifDrewThisTurn"; then: PlayerEffect[] }
  | { op: "triggerFrontOfBackSlot"; index: number }
  | { op: "damageEnemyByPlayerFatigue"; target: "random" | "select"; mult: number }
  | { op: "statusEnemy"; target: "select" | "random" | "all"; key: StatusKey; n: number }
  | { op: "setSupplies"; n: number }
  | { op: "statusEnemiesAttackingThisTurn"; key: StatusKey; n: number }
  | { op: "maxHp"; n: number }
  | { op: "hp"; n: number }
  | { op: "clearStatusSelf"; key: StatusKey }

export type TargetMeta = {

  reason?: "FRONT" | "BACK" | "ENEMY" | "EVENT" | "RELIC" | "OTHER";

  sourceCardUid?: string;

  sourceLabel?: string;

  sourceOp?: string;

  chainIndex?: number;
  chainTotal?: number;
};

export type PendingTarget =
  | {
      kind: "damageSelect";
      amount: number;
      sourceCardUid?: string;
      sourceLabel?: string;
      reason?: TargetMeta["reason"];
    }
  | {
      kind: "statusSelect";
      key: StatusKey;
      n: number;
      sourceCardUid?: string;
      sourceLabel?: string;
      reason?: TargetMeta["reason"];
    };



export type EnemyEffect =
  | { op: "damagePlayer"; n: number }
  | { op: "damagePlayerFormula"; kind: "goblin_raider" | "watching_statue" }
  | { op: "supplies"; n: number }
  | { op: "statusPlayer"; key: StatusKey; n: number }
  | { op: "enemyHealSelf"; n: number }
  | { op: "enemyImmuneThisTurn" }
  | { op: "enemyImmuneNextTurn" }
  | { op: "fatiguePlayer"; n: number }
  | { op: "damagePlayerByDeckSize"; base: number; per: number; div: number; cap?: number };

export type PlayerState = {
  hp: number;
  maxHp: number;
  block: number;
  supplies: number;
  fatigue: number;
  zeroSupplyTurns: number;
  status: Record<StatusKey, number>;
  immuneToDisruptThisTurn: boolean;
  nullifyDamageThisTurn: boolean;
};

export type RunState = {
  encounterCount: number;
  treasureObtained: boolean;
  afterTreasureNodePicks: number;
  
  nodeOfferQueue: NodeType[][];

  finished: boolean;
  nodePickCount: number;
  nodePickByType: Record<"BATTLE" | "REST" | "EVENT" | "TREASURE", number>;
  currentNodeOffers: NodeType[] | null;
  nextBattleSuppliesBonus: number;
  bossPool: string[];
  branchOffer: BranchOffer | null;

  battleCount: number;
  enemyLastSeenBattle: Record<string, number>;

  nextBossId?: string | null;

  nextBossTime: number;
  forcedNext: "BOSS" | null;
  bossOmenText: string | null;
  deckSizeAtTreasure: number | null;

};

export type Content = {
  cardsById: Record<string, CardData>;
  enemiesById: Record<string, EnemyData>;
};

export type GameState = {

  uidSeq: number;

  intentsRevealedThisTurn: boolean;
  disruptIndexThisTurn: number | null;
  attackedEnemyIndicesThisTurn: number[];

  choiceStack: ChoiceState[];

  phase: CombatPhase;
  log: string[];

  run: RunState;
  player: PlayerState;

  content: Content;

  cards: Record<string, CardInstance>;
  deck: string[];
  hand: string[];
  discard: string[];
  exhausted: string[];
  vanished: string[];
  choice: ChoiceState | null;

  frontSlots: (string | null)[];
  backSlots: (string | null)[];
  backSlotDisabled: boolean[];

  enemies: EnemyState[];

  usedThisTurn: number; // 이번 턴에 배치한 카드 수
  frontPlacedThisTurn: number; // 이번 턴 전열에 배치한 카드 수
  selectedHandCardUid: string | null;

  winHooksAppliedThisCombat: boolean;

  drawCountThisTurn: number;

  pendingTarget: PendingTarget | null;
  pendingTargetQueue: PendingTarget[];

  backUidsThisTurn: string[];

  victoryResolvedThisCombat?: boolean;

  time: number

  fx?: {
    enemyShake?: number[]; // 이번 틱에 피해 받은 적 인덱스들
    playerShake?: boolean;
  };

};
