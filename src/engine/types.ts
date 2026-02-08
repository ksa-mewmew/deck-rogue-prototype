export type Zone = "deck" | "hand" | "discard" | "front" | "back" | "exhausted" | "vanished";
export type Side = "front" | "back";
export type StatusKey = "vuln" | "weak" | "bleed" | "disrupt";
export type CardTag = "EXHAUST" | "VANISH";

export type NodeType = "BATTLE" | "REST" | "EVENT" | "TREASURE";

export type NodeOfferId = "A" | "B";

export type NodeOffer = {
  id: NodeOfferId;   // A/B 식별자
  type: NodeType;    // BATTLE/REST/EVENT/TREASURE
};

export type BranchOffer = {
  root: [NodeOffer, NodeOffer];      // 현재 A/B
  nextIfA: [NodeOffer, NodeOffer];   // A를 고르면 다음
  nextIfB: [NodeOffer, NodeOffer];   // B를 고르면 다음
};

export type ExhaustWhen = "FRONT" | "BACK" | "BOTH";

export type ChoiceOption = {
  key: string;
  label: string;
  detail?: string;

  cardUid?: string;
};

export type ChoiceState = {
  kind: "EVENT" | "REWARD" | "PICK_CARD" | "VIEW_PILE";
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

export type TargetRequest =
  | { kind: "damageSelect"; amount: number }
  | { kind: "statusSelect"; key: StatusKey; n: number }
  | null;

export type PendingTargetItem =
  | { kind: "damageSelect"; amount: number }
  | { kind: "statusSelect"; key: StatusKey; n: number };


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
  exhaustWhen?: ExhaustWhen; // ✅ 어느 위치에서 발동했을 때 소모되는지
  vanishWhen?: ExhaustWhen;  // (필요하면 소실도 동일 패턴)

  onWinWhileInBack?: PlayerEffect[];
  

};

export type EnemyData = {
  id: string;
  name: string;
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
};

export type EnemyState = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  intentIndex: number;
  status: Record<StatusKey, number>;

  immuneNextTurn: boolean;
  immuneThisTurn: boolean; // ✅ 슬라임 1패턴용
  soulCastCount?: number;

  soulWarnCount?: number;         // 3번 의도 경고 누적(0..3)
  soulArmed?: boolean;            // 경고 3번 완료 → 폭발 가능 상태
  soulWillNukeThisTurn?: boolean; // 의도 공개 때 이번 턴 50딜로 확정됐는지
};

// Effect에 적 전용 op 추가
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
  | { op: "damageEnemyByPlayerFatigue"; target: "random"; mult: number } // ✅ F*mult
  | { op: "statusEnemy"; target: "select" | "random" | "all"; key: StatusKey; n: number }
  | { op: "setSupplies"; n: number }                                     // ✅ S를 n으로
  | { op: "statusEnemiesAttackingThisTurn"; key: StatusKey; n: number }   // ✅ 이번 턴 공격한 적들
  | { op: "maxHp"; n: number }                                           // ✅ 최대체력 증가
  | { op: "hp"; n: number }                                             // ✅ HP 직접 증감(음수 가능)
  | { op: "statusEnemiesAttackingThisTurn"; key: StatusKey; n: number };


export type PendingTarget =
  | { kind: "damageSelect"; amount: number }
  | { kind: "statusSelect"; key: "vuln" | "weak" | "bleed" | "disrupt"; n: number };


export type EnemyEffect =
  | { op: "damagePlayer"; n: number }
  | { op: "damagePlayerFormula"; kind: "goblin_raider" | "watching_statue" }
  | { op: "supplies"; n: number } // 적이 S 깎는 용도
  | { op: "statusPlayer"; key: StatusKey; n: number } // 적이 플레이어 상태 부여
  | { op: "enemyHealSelf"; n: number }
  | { op: "enemyImmuneThisTurn" }
  | { op: "enemyImmuneNextTurn" }
  | { op: "fatiguePlayer"; n: number };

export type PlayerState = {
  hp: number;
  maxHp: number;
  block: number; // 방어
  supplies: number; // S
  fatigue: number; // F
  zeroSupplyTurns: number; // S=0 종료 누적
  status: Record<StatusKey, number>;
  immuneToDisruptThisTurn: boolean;
  nullifyDamageThisTurn: boolean;
};

export type RunState = {
  encounterCount: number;
  treasureObtained: boolean;
  afterTreasureNodePicks: number;
  
  nodeOfferQueue: NodeType[][]; // ✅ [현재, 다음, 다다음] 각 원소는 길이 2

  finished: boolean;
  nodePickCount: number;
  nodePickByType: Record<"BATTLE" | "REST" | "EVENT" | "TREASURE", number>;
  currentNodeOffers: NodeType[] | null;
  nextBattleSuppliesBonus: number;
  bossPool: string[];
  branchOffer: BranchOffer | null;

  battleCount: number; // ✅ 지금까지 “전투 시작”한 횟수
  enemyLastSeenBattle: Record<string, number>; // ✅ enemyId -> 마지막 등장 battleCount
};

export type Content = {
  cardsById: Record<string, CardData>;
  enemiesById: Record<string, EnemyData>;
};

export type GameState = {

  intentsRevealedThisTurn: boolean;
  disruptIndexThisTurn: number | null; // ✅ 이번 턴 교란된 후열 슬롯(없으면 null)
  attackedEnemyIndicesThisTurn: number[];

  choiceStack: ChoiceState[];

  phase: CombatPhase;
  log: string[];

  run: RunState;
  player: PlayerState;

  content: Content;

  cards: Record<string, CardInstance>; // uid -> instance
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

  usedThisTurn: number; // ✅ 이번 턴에 배치(사용)한 카드 수
  frontPlacedThisTurn: number; // ✅ 이번 턴 전열에 배치한 카드 수
  selectedHandCardUid: string | null;

  winHooksAppliedThisCombat: boolean;

  drawCountThisTurn: number;

  pendingTarget: PendingTarget | null;
  pendingTargetQueue: PendingTarget[];

};
