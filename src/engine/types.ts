// engine/types.ts

export type Zone = "deck" | "hand" | "discard" | "front" | "back" | "exhausted" | "vanished";
export type Side = "front" | "back";

export type StatusKey = "vuln" | "weak" | "bleed" | "disrupt";
export type CardTag = "EXHAUST" | "VANISH" | "INSTALL" | "TOKEN";
export type CardRarity = "BASIC" | "COMMON" | "SPECIAL" | "RARE" | "MADNESS";
export type RelicId = string;
export type ItemId = string;

export type UiToastKind = "INFO" | "WARN" | "GOLD" | "RELIC";
export type UiToast = {
  kind: UiToastKind;
  text: string;
  ms?: number; // 표시 시간(ms). UI 쪽에서 animMul을 곱해 늘려줌
};


export type NodeType = "BATTLE" | "ELITE" | "REST" | "TREASURE" | "EVENT" | "SHOP";

// =========================
// Map / Dungeon graph
// =========================
export type MapNodeId = string;
export type MapNodeKind = "START" | NodeType | "EMPTY";

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
  rarity?: CardRarity;
  tags?: CardTag[];
  frontText: string;
  backText: string;
  front: PlayerEffect[];
  back: PlayerEffect[];
  design?: string;
  exhaustWhen?: ExhaustWhen;
  vanishWhen?: ExhaustWhen;
  installWhen?: ExhaustWhen;
  upgrades?: Array<
    Partial<
      Pick<
        CardData,
        "name" | "frontText" | "backText" | "front" | "back" | "tags" | "onWinWhileInBack" | "exhaustWhen" | "vanishWhen" | "installWhen"
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
  | { op: "damageEnemyFormula"; target: "select" | "random" | "all"; kind: string }
  | { op: "damageEnemyFormula"; target: "select" | "random" | "all"; kind: string }
  | { op: "addCardToHand"; defId: string; n?: number; upgrade?: number };

export type ItemData = {
  id: ItemId;
  name: string;
  text: string;
  art: string;
  effects: PlayerEffect[];
  priceGold?: number;
  tags?: string[];
  consumable?: boolean;
};


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
  rest: number;                 // 휴식 횟수
  eliteWins: number;            // 엘리트 승리
  tookBigHit10: number;         // 한 번에 10+ 피해 받은 횟수
  kills: number;                // 처치 횟수
  endedTurnWeak: number;         // 약화 상태로 턴 종료한 횟수
  eventPicks: number;            // 이벤트 선택 횟수
  hpLeq15: number;              // HP<=15 경험 횟수
  skippedTurn: number;           // 아무 행동도 안 하고 턴 종료한 횟수
  bleedApplied: number;          // 출혈 부여 횟수
  endedTurnSupplyZero: number;   // S=0으로 턴 종료한 횟수
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


export type ShopCardOffer = {
  defId: string;
  upgrade: number;
  priceGold: number;
  sold?: boolean;
};

export type ShopItemOffer = {
  itemId: ItemId;
  priceGold: number;
  sold?: boolean;
};

export type ShopState = {
  nodeId: MapNodeId;
  cards: ShopCardOffer[];
  items?: ShopItemOffer[];
  usedUpgrade: boolean;
  usedRemove: boolean;
  // 선택 화면 오른쪽 칸(illuBox)에 표시할 이미지 경로(assets/..). 필요하면 설정.
  art?: string;
  // 디버그/추적용
  createdAtMove?: number;
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
  nodePickByType: Record<"BATTLE" | "ELITE" | "REST" | "EVENT" | "TREASURE" | "SHOP", number>;
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

  // 이벤트/토스트 관련(런 상태)
  eventsSeen?: Record<string, number>;
  pendingEventWinRelicId?: string | null;
  pendingEventWinGold?: number;
  bossApproachToastBossTime?: number;

  relics: RelicId[];

  // 아이템(소모품)
  items?: ItemId[];

  // 아이템 보유 한도(기본 2, 유물 등으로 확장 가능)
  itemCap?: number;


  pendingElite: boolean;
  lastBattleWasElite: boolean;
  lastBattleWasBoss: boolean;
  eliteRelicOfferedThisBattle: boolean;

  itemOfferedThisBattle?: boolean;

  // 카드 보상 희귀도 가중치(pity) — 일반 전투(비정예)에서 특별/희귀가 안 뜬 횟수
  rewardPityNonElite?: number;

  relicRuntime?: Record<RelicId, RelicRuntime>;
  pendingRelicActivations?: RelicId[];
  unlock?: UnlockProgress;

  // 상점 재고/서비스 상태(노드별로 유지, 재진입해도 리필되지 않음)
  shops?: Record<MapNodeId, ShopState>;

  gold?: number;
};

export type Content = {
  cardsById: Record<string, CardData>;
  enemiesById: Record<string, EnemyData>;
  itemsById?: Record<string, ItemData>;
};

export type ChoiceCtx =
  | null
  | {
      kind: "BATTLE_REWARD";
      offers: Array<{ defId: string; upgrade: number }>;
      itemOfferId?: ItemId;
      itemSource?: "BATTLE" | "ELITE" | "BOSS" | string;
      itemDecision?: "TAKEN" | "SKIPPED";
    }
  | { kind: "BATTLE_CARD_REWARD"; offers: Array<{ defId: string; upgrade: number }> }
  | { kind: "ELITE_RELIC"; offerIds: string[] }
  | { kind: "ITEM_REWARD"; offerId: ItemId; source?: "BATTLE" | "ELITE" | "BOSS" | string }
  | { kind: "REST"; highF?: boolean }
  | { kind: "EVENT"; eventId: string }
  | { kind: "RELIC_OFFER"; offerIds: string[]; source?: "BOSS" | "ELITE" | "PAID" | string }
  | { kind: "SHOP"; nodeId: string }
  | { kind: "UPGRADE_PICK"; returnTo?: { kind: "SHOP"; nodeId: string }; priceGold?: number }
  | { kind: "REMOVE_PICK"; returnTo?: { kind: "SHOP"; nodeId: string }; priceGold?: number };
  
export type ChoiceFrame = { choice: ChoiceState; ctx: ChoiceCtx };

export type GameState = {

  combatTurn: number;
    
  uidSeq: number;

  intentsRevealedThisTurn: boolean;
  disruptIndexThisTurn: number | null;
  attackedEnemyIndicesThisTurn: number[];

  phase: CombatPhase;
  log: string[];

  // UI 전용 토스트(로그 아님). 저장에는 포함되지 않도록 persist에서 제거함.
  uiToasts?: UiToast[];

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
  placedUidsThisTurn: string[];

  time: number;

  choiceQueue: ChoiceFrame[];
  choiceStack: ChoiceFrame[];
  choice: ChoiceState | null;
  choiceCtx: ChoiceCtx;

  _justStartedCombat: boolean;

};
