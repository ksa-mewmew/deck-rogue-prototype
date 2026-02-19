// engine/types.ts

export type Zone = "deck" | "hand" | "discard" | "front" | "back" | "exhausted" | "vanished";
export type Side = "front" | "back";

export type StatusKey = "vuln" | "weak" | "bleed" | "disrupt";
export type CardTag = "EXHAUST" | "VANISH";
export type RelicId = string;

export type NodeType = "BATTLE" | "ELITE" | "REST" | "TREASURE" | "EVENT";

// =========================
// Map / Dungeon graph
// =========================
export type MapNodeId = string;
export type MapNodeKind = "START" | NodeType;

export type MapNode = {
  id: MapNodeId;
  kind: MapNodeKind;
  depth: number;
  order?: number;
  visited: boolean;
  cleared: boolean;
  reprocCount: number;
  lastProcTime: number;
};

export type DungeonMap = {
  nodes: Record<MapNodeId, MapNode>;
  edges: Record<MapNodeId, MapNodeId[]>;
  startId: MapNodeId;
  pos: MapNodeId;
  treasureId: MapNodeId | null;
  visionNonce: number;
};

export type PursuitState = { heat: number };

export type VisionMode = "NORMAL" | "FOCUS" | "WIDE";

export type VisionState = {
  mode: VisionMode;
  blind: boolean;
  presenceR: number;
  typeR: number;
  detailR: number;
  noise: number;
};


export type NodeOfferId = "A" | "B";

export type NodeOffer = {
  id: NodeOfferId;
  type: NodeType;
};

export type BranchOffer = {
  root: [NodeOffer, NodeOffer];
  nextIfA: [NodeOffer, NodeOffer];
  nextIfB: [NodeOffer, NodeOffer];
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
  kind: "EVENT" | "REWARD" | "PICK_CARD" | "VIEW_PILE" | "UPGRADE_PICK" | "RELIC";
  title: string;
  prompt?: string;
  art?: string;
  options: ChoiceOption[];
};

export type CombatPhase = "REVEAL" | "PLACE" | "BACK" | "FRONT" | "ENEMY" | "UPKEEP" | "DRAW" | "NODE";

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
  upgrades?: Array<
    Partial<
      Pick<
        CardData,
        "name" | "frontText" | "backText" | "front" | "back" | "tags" | "onWinWhileInBack" | "exhaustWhen" | "vanishWhen"
      >
    >
  >;
  onWinWhileInBack?: PlayerEffect[];
};


export type IntentCategory =
  | "ATTACK"
  | "ATTACK_DEBUFF"
  | "ATTACK_BUFF"
  | "DEBUFF"
  | "BUFF"
  | "DEFEND"
  | "OTHER";

export type IntentApplyKind =
  | "vuln"
  | "weak"
  | "bleed"
  | "disrupt"
  | "immune"
  | "supplies"
  | "fatigue"
  | string;

export type IntentApply = {
  target: "player" | "enemy";
  kind: IntentApplyKind;
  amount: number;
};

export type IntentPreview = {
  cat: IntentCategory;

  baseDmg?: number;
  dmgTotal?: number;
  hits?: number;
  perHit?: number; 
  notes?: string[];

  applies?: IntentApply[];

  shortText?: string;
};

export type IntentMeta = {
  cat?: IntentCategory;

  hits?: number;
  baseDmg?: number;

  applies?: IntentApply[];

  preview?: (g: any, e: any) => IntentPreview | null;
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
  meta?: IntentMeta;
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
  soulWarnCount?: number;
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
  | { op: "damageEnemyFormula"; target: "select" | "random" | "all"; kind: string };

export type PendingTarget =
  | {
      kind: "damageSelect";
      amount: number;
      formulaKind?: string
      sourceCardUid?: string;
      sourceLabel?: string;
      reason?: "FRONT" | "BACK" | "ENEMY" | "EVENT" | "RELIC" | "OTHER";
    }
  | {
      kind: "statusSelect";
      key: StatusKey;
      n: number;
      sourceCardUid?: string;
      sourceLabel?: string;
      reason?: "FRONT" | "BACK" | "ENEMY" | "EVENT" | "RELIC" | "OTHER";
    };

export type DamagePhase = "PRE_STATUS" | "POST_STATUS" | "PRE_BLOCK" | "POST_BLOCK" | "FINAL";
export type DamageSource = "PLAYER_ATTACK" | "ENEMY_ATTACK" | "CARD_EFFECT" | "DOT" | "ENV" | "FATIGUE" | "OTHER";
export type DamageTarget = "PLAYER" | "ENEMY";

export type DamageContext = {
  phase: DamagePhase;
  target: DamageTarget;
  source: DamageSource;
  raw: number;
  afterStatus?: number;
  afterBlock?: number;
  current: number;
  reason?: string;
  attackerWeak?: number;
  targetVuln?: number;
  enemyIndex?: number;
  enemyId?: string;
  turn?: number;
};

export type EnemyEffect =
  | { op: "damagePlayer"; n: number }
  | { op: "damagePlayerFormula"; kind: "goblin_raider" | "watching_statue" | "gloved_hunter" }
  | { op: "supplies"; n: number }
  | { op: "statusPlayer"; key: StatusKey; n: number }
  | { op: "enemyHealSelf"; n: number }
  | { op: "enemyImmuneThisTurn" }
  | { op: "enemyImmuneNextTurn" }
  | { op: "fatiguePlayer"; n: number }
  | { op: "damagePlayerByDeckSize"; base: number; per: number; div: number; cap?: number }
  | {
      op: "damagePlayerRampHits";
      n: number;            // 1타당 피해
      baseHits: number;     // 1턴 기준 타수
      everyTurns: number;   // 몇 턴마다 +1타
      capHits?: number;     // 최대 타수(선택)
    }
  | { op: "damagePlayerIfSuppliesPositive"; n: number }
  | { op: "damagePlayerIfSuppliesZero"; n: number };


export type UnlockProgress = {
  rest: number;          // 휴식 횟수
  eliteWins: number;     // 엘리트 승리
  tookBigHit10: boolean; // 한 번에 10+ 피해
  kills: number;         // 처치 횟수
  endedTurnWeak: boolean;// 약화 상태로 턴 종료
  eventPicks: number;    // 이벤트 선택 횟수
  hpLeq15: boolean;      // HP<=15 경험
  skippedTurn: boolean;  // 아무 행동도 안 하고 턴 종료
  bleedApplied: number;  // 출혈 부여 횟수
};

export type RelicRuntime = {
  active: boolean;      // 효과 적용 중
  pending: boolean;     // 조건 달성했지만 다음 노드부터라 대기
};


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


  timeMove: number;

  map: DungeonMap;

  pursuit: PursuitState;

  vision: VisionState;

  encounterCount: number;
  treasureObtained: boolean;
  afterTreasureNodePicks: number;

  nodeOfferQueue: NodeType[][];

  finished: boolean;
  nodePickCount: number;
  nodePickByType: Record<"BATTLE" | "ELITE" | "REST" | "EVENT" | "TREASURE", number>;
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

  ominousProphecySeen: boolean;

  relics: RelicId[];

  pendingElite: boolean;
  lastBattleWasElite: boolean;
  eliteRelicOfferedThisBattle: boolean;

  relicRuntime?: Record<RelicId, RelicRuntime>;
  pendingRelicActivations?: RelicId[];
  unlock?: UnlockProgress;
};

export type Content = {
  cardsById: Record<string, CardData>;
  enemiesById: Record<string, EnemyData>;
};

export type ChoiceCtx =
  | null
  | { kind: "BATTLE_CARD_REWARD"; offers: Array<{ defId: string; upgrade: number }> }
  | { kind: "ELITE_RELIC"; offerIds: string[] }
  | { kind: "REST"; highF?: boolean }
  | { kind: "EVENT"; eventId: string }
  | { kind: "RELIC_OFFER"; offerIds: string[]; source?: "BOSS" | "ELITE" | "PAID" | string };
  
export type ChoiceFrame = { choice: ChoiceState; ctx: ChoiceCtx };

export type GameState = {

  combatTurn: number;
    
  uidSeq: number;

  intentsRevealedThisTurn: boolean;
  disruptIndexThisTurn: number | null;
  attackedEnemyIndicesThisTurn: number[];

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

  frontSlots: (string | null)[];
  backSlots: (string | null)[];
  backSlotDisabled: boolean[];

  enemies: EnemyState[];

  usedThisTurn: number;
  frontPlacedThisTurn: number;
  selectedHandCardUid: string | null;
  selectedEnemyIndex: number | null;

  winHooksAppliedThisCombat: boolean;
  victoryResolvedThisCombat: boolean;

  drawCountThisTurn: number;

  pendingTarget: PendingTarget | null;
  pendingTargetQueue: PendingTarget[];

  backUidsThisTurn: string[];

  time: number;

  choiceQueue: ChoiceFrame[];
  choiceStack: ChoiceFrame[];
  choice: ChoiceState | null;
  choiceCtx: ChoiceCtx;

  _justStartedCombat: boolean;

};
