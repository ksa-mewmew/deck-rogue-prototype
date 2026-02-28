export type Zone = "deck" | "hand" | "discard" | "front" | "back" | "exhausted" | "vanished";
export type Side = "front" | "back";

export type StatusKey = "vuln" | "weak" | "bleed" | "disrupt" | "slash";
export type CardTag = "EXHAUST" | "VANISH" | "INSTALL" | "TOKEN" | "INNATE" | "LOCKED" | "FORGE_START" | "ARROW";
export type CardRarity = "BASIC" | "COMMON" | "SPECIAL" | "RARE" | "MADNESS";
export type RelicId = string;
export type ItemId = string;

export const DAMAGE_ENEMY_FORMULA_KINDS = [
  "prey_mark",
  "prey_mark_u1",
  "triple_bounty",
  "triple_bounty_u1",
  "hand_blade",
  "hand_blade_u1",
  "lone_blow_20",
  "lone_blow_26",
  "castle_ballista_age",
  "castle_ballista_age_u1",
] as const;
export type DamageEnemyFormulaKind = (typeof DAMAGE_ENEMY_FORMULA_KINDS)[number];

export const BLOCK_FORMULA_KINDS = [
  "hand_blade_back",
  "hand_blade_back_u1",
  "lone_blow_block_10",
  "lone_blow_block_14",
] as const;
export type BlockFormulaKind = (typeof BLOCK_FORMULA_KINDS)[number];

export type UiToastKind = "INFO" | "WARN" | "GOLD" | "RELIC";
export type UiToast = {
  kind: UiToastKind;
  text: string;
  ms?: number;
};

export type GodId =
  | "dream_shadow"
  | "wing_artery"
  | "master_spear"
  | "retort_fusion"
  | "nameless_vow"
  | "bright_darkness"
  | "twin_heart"
  | "indifferent_one"
  | "armored_tiger"
  | "first_human"
  | "card_dealer"
  | "rabbit_hunt"
  | "wave_breath"
  | "forge_master"
  | "madness";
export type TemptGodId = Exclude<GodId, "madness">;
export type FaithState = {
  offered: [GodId, GodId, GodId];
  points: Record<GodId, number>;
  focus: GodId;
  lastFocus: GodId;
  chosen: boolean;
  hostile?: Partial<Record<GodId, boolean>>;
  lastTempter?: GodId;

  madnessAwakened?: boolean; // 보물 이후 각성
  madnessTemptUsed?: boolean; // 보물 즉시 1회 선택 소진
  madnessAccepted?: boolean; // 광기 수락 여부
  madnessBoon?: 1 | 2 | 3; // 수락 시 적용되는 긍정
  madnessBane?: 1 | 2 | 3; // 거부 시(적대) 적용되는 부정
  forgeIntroShown?: boolean;
};


export type NodeType = "BATTLE" | "ELITE" | "REST" | "TREASURE" | "EVENT" | "SHOP";


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
  kind:
    | "EVENT"
    | "REWARD"
    | "PICK_CARD"
    | "VIEW_PILE"
    | "UPGRADE_PICK"
    | "RELIC"
    | "FAITH"
    | "GOD_TEMPT"
    | "MADNESS_TEMPT";
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
  passives?: CardPassive[];
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
        "name" | "frontText" | "backText" | "front" | "back" | "tags" | "passives" | "onWinWhileInBack" | "exhaustWhen" | "vanishWhen" | "installWhen"
      >
    >
  >;
  onWinWhileInBack?: PlayerEffect[];
};


export type CardPassive =
  | { kind: "onDrawGainBlock"; side: Side; block: number; perTurnCap?: number }
  | { kind: "retainBlockBetweenTurns"; side: Side }
  | { kind: "bonusDamageToEnemyIndex"; side: Side; enemyIndex: number; bonus: number }
  | { kind: "onPlaceIncrementUnlockProgress"; counter: string; n?: number; side?: Side };


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




export type EnemyPassive = {
  id: string;
  icon: string;
  name: string;
  text: string;
};


export type EnemySpecialRule =
  | {
      kind: "SOUL_STEALER";
      warnIntentIndex: number;
      warnCap: number;
      nukeChance: number;
      nukeDamage: number;
      nukeLabel?: string;
    };


export type EnemySpecialState =
  | {
      kind: "SOUL_STEALER";
      warnCount: number;
      armed: boolean;
      willNukeThisTurn: boolean;
    };


export type EnemyData = {
  id: string;
  name: string;
  omen?: string;
  maxHp: number;
  isBoss?: boolean;
  intents: EnemyIntentData[];
  passives?: EnemyPassive[];
  special?: EnemySpecialRule;
  rule?: string;
  intentRules?: {
    noRepeatIntentIndexes?: number[];
  };
  targeting?: {
    forbidTargetedAttackWhenNotLeftmost?: boolean;
  };
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
  flipped?: boolean;
  synth?: {
    done?: boolean;
    overrun?: boolean;
    autoFlip?: boolean;
    removeExhaust?: boolean;
    addTags?: CardTag[];
  };
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

  special?: EnemySpecialState;

  intentLabelOverride?: string;

  lastIntentKey?: string | null;
  lastIntentStreak?: number;

  // custom enemy vars
  assassinAim?: number;
  corpseRage?: number;
  atkRamp?: number;
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
  | { op: "damageEnemyByPlayerBlock"; target: "random" | "select" | "all"; mult?: number }
  | { op: "statusEnemy"; target: "select" | "random" | "all"; key: StatusKey; n: number }
  | { op: "setSupplies"; n: number }
  | { op: "setFatigue"; n: number }
  | { op: "statusEnemiesAttackingThisTurn"; key: StatusKey; n: number }
  | { op: "maxHp"; n: number }
  | { op: "hp"; n: number }
  | { op: "clearStatusSelf"; key: StatusKey }
  | { op: "damageEnemyFormula"; target: "select" | "random" | "all"; kind: DamageEnemyFormulaKind }
  | { op: "addCardToHand"; defId: string; n?: number; upgrade?: number }
  | { op: "blockFormula"; kind: BlockFormulaKind }
  | { op: "discardHandAllDraw"; extraDraw?: number }
  | { op: "discardHandRandom"; n: number }
  | { op: "repeat"; times: number; effects: PlayerEffect[] }
  | { op: "repeatByOtherInstall"; effects: PlayerEffect[]; includeSelf?: boolean }
  | { op: "ifPlacedThisTurn"; then: PlayerEffect[] }
  | { op: "ifPlayerBlockAtLeast"; n: number; then: PlayerEffect[] }
  | { op: "ifOtherRowHasDefId"; defId: string; then: PlayerEffect[] }
  | { op: "triggerRandomVanished"; side: Side; times: number }
  | { op: "exhaustSlot"; side: Side; index: number; then?: PlayerEffect[] }
  | { op: "flipSelf" }
  | { op: "ifPlaced"; side: Side; then: PlayerEffect[] }
  | { op: "blockByPlayerBlock"; mult?: number }
  | { op: "damageEnemyLowestHp"; n: number }
  | { op: "repeatBySupplies"; timesBase?: number; effects: PlayerEffect[]; reset?: boolean }
  | { op: "damageEnemyRepeatByStatus"; target: "random"; n: number; key: StatusKey; reset?: boolean }
  | { op: "increaseCardDamageByDefId"; defId: string; n: number }
  | { op: "increaseCardDamageByTag"; tag: CardTag; n: number }
  | { op: "halveEnemyHpAtIndex"; index: number }
  | { op: "flipAllPlayerCardsUntilCombatEnd" }
  | { op: "pickVanishedToHand"; title?: string; prompt?: string };


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
      formulaKind?: DamageEnemyFormulaKind;
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

export type DamagePlayerFormulaKind =
  | "goblin_raider"
  | "watching_statue"
  | "gloved_hunter"
  | "goblin_assassin"
  | "old_monster_corpse"
  | "punishing_one";

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
  | { op: "damagePlayerFormula"; kind: DamagePlayerFormulaKind }
  | { op: "supplies"; n: number }
  | { op: "statusPlayer"; key: StatusKey; n: number }
  | { op: "enemyHealSelf"; n: number }
  | { op: "enemySetAssassinAim"; n: number }
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

  moonScrollUses: number;        // 달의 두루마리 사용 횟수
  threeEnemyWins: number;        // 적 3마리 전투 승리 횟수
  endedTurnWith3Installs: number;// 설치물 3개 이상인 채로 턴 종료한 횟수
  installDamageDealt: number;    // 설치물로 준 피해 누적
  itemDiscards: number;          // 아이템 버린 횟수
};


export type RelicUnlockBaseline = {
  unlock: UnlockProgress;
  moves: number;
  timeTotal: number;
  fatigue: number;
  supplies: number;
};


export type RelicRuntime = {
  active: boolean;      // 효과 적용 중
  pending: boolean;     // 조건 달성했지만 다음 노드부터라 대기

  obtainedAtNode?: number;
  activatedAtNode?: number;
  unlockBase?: RelicUnlockBaseline;
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

export type ShopRelicOffer = {
  relicId: RelicId;
  priceGold: number;
  sold?: boolean;
};

export type ShopState = {
  nodeId: MapNodeId;
  cards: ShopCardOffer[];
  items?: ShopItemOffer[];
  relics?: ShopRelicOffer[];
  usedUpgrade: boolean;
  usedRemove: boolean;
  art?: string;
  createdAtMove?: number;
};

export type RunState = {


  timeMove: number;

  slotCapFront?: number;
  slotCapBack?: number;
  bossKillCount?: number;
  bossSlotFirstPick?: "front" | "back" | null;

  map: DungeonMap;

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

  eventsSeen?: Record<string, number>;
  pendingEventWinRelicId?: string | null;
  pendingEventWinGold?: number;
  bossApproachToastBossTime?: number;

  relics: RelicId[];

  items?: ItemId[];

  itemCap?: number;


  pendingElite: boolean;
  lastBattleWasElite: boolean;
  lastBattleWasBoss: boolean;
  eliteRelicOfferedThisBattle: boolean;

  itemOfferedThisBattle?: boolean;

  rewardPityNonElite?: number;

  relicRuntime?: Record<RelicId, RelicRuntime>;
  pendingRelicActivations?: RelicId[];
  relicUnlocked?: Record<RelicId, boolean>;
  unlock?: UnlockProgress;

  shops?: Record<MapNodeId, ShopState>;

  gold?: number;

  cardDamageBonusByDefId?: Record<string, number>;
  cardDamageBonusByTag?: Partial<Record<CardTag, number>>;

  faith?: FaithState;
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
  | { kind: "BOSS_SLOT_UPGRADE" }
  | { kind: "RELIC_OFFER"; offerIds: string[]; source?: "BOSS" | "ELITE" | "PAID" | string }
  | { kind: "SHOP"; nodeId: string }
  | { kind: "UPGRADE_PICK"; returnTo?: { kind: "SHOP"; nodeId: string }; priceGold?: number }
  | { kind: "REMOVE_PICK"; returnTo?: { kind: "SHOP"; nodeId: string }; priceGold?: number }
  | { kind: "FAITH_START"; offered: [GodId, GodId, GodId] }
  | { kind: "GOD_TEMPT"; tempter: GodId }
  | { kind: "MADNESS_TEMPT"; offerBoon: 1 | 2 | 3; offerBane: 1 | 2 | 3 }
  | { kind: "PICK_VANISHED_TO_HAND"; sourceCardUid: string };

export type ChoiceFrame = { choice: ChoiceState; ctx: ChoiceCtx };

export type GameState = {

  combatTurn: number;

  uidSeq: number;

  intentsRevealedThisTurn: boolean;
  disruptIndexThisTurn: number | null;
  attackedEnemyIndicesThisTurn: number[];

  phase: CombatPhase;
  log: string[];

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


  installAgeByUid: Record<string, number>;

  time: number;

  choiceQueue: ChoiceFrame[];
  choiceStack: ChoiceFrame[];
  choice: ChoiceState | null;
  choiceCtx: ChoiceCtx;

  _justStartedCombat: boolean;

};
