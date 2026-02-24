import type { CardData } from "../engine/types";
import type { Content, GameState } from "../engine/types";

export function getCardDefFor(g: GameState, uid: string) {
  const inst = g.cards[uid];
  const base = g.content.cardsById[inst.defId];
  const u = inst.upgrade ?? 0;
  const patch = base.upgrades?.[u - 1]; // +1이면 index0
  return patch ? { ...base, ...patch } : base;
}

export function getCardDefByIdWithUpgrade(content: Content, defId: string, upgrade: number): CardData {
  const base = content.cardsById[defId];
  const u = Math.max(0, upgrade | 0);
  if (u <= 0) return base;

  const patch = base.upgrades?.[u - 1];
  return patch ? ({ ...base, ...patch } as CardData) : base;
}

export function cardNameWithUpgrade(g: GameState, uid: string) {
  const inst = g.cards[uid];
  const u = inst.upgrade ?? 0;
  const def = getCardDefFor(g, uid);
  return u > 0 ? `${def.name} +${u}` : def.name;
}

export const CARDS: CardData[] = [
  // 기본 카드 6장
  {
    id: "field_ration",
    name: "야전 식량",
    rarity: "BASIC",
    frontText: "방어 +3",
    backText: "S +2",
    front: [{ op: "block", n: 3 }],
    back: [{ op: "supplies", n: 2 }],

    upgrades: [
      {
        frontText: "방어 +5",
        front: [{ op: "block", n: 5 }],
        backText: "S +3",
        back: [{ op: "supplies", n: 3 }],
      },
    ]

  },

  {
    id: "maintenance",
    name: "정비 도구",
    rarity: "BASIC",
    exhaustWhen: "BACK",
    frontText: "방어 +3",
    backText: "F -1, 소모",
    front: [{ op: "block", n: 3 }],
    back: [{ op: "fatigue", n: -1 }],

    upgrades: [
      {
        frontText: "방어 +5",
        front: [{ op: "block", n: 5 }],
        backText: "F -1, S +2, 소모",
        back: [{ op: "fatigue", n: -1 }, { op: "supplies", n: 2 }],
      },
    ]    
  

  },
  {
    id: "scout",
    name: "정찰",
    rarity: "BASIC",
    frontText: "지정 피해 3, 방어 +1",
    backText: "드로우 1, S +2",
    front: [
      { op: "damageEnemy", target: "select", n: 3 },
      { op: "block", n: 1 },
    ],
    back: [{ op: "draw", n: 1 }, { op: "supplies", n: 2 }],

    upgrades: [
      {
        frontText: "지정 피해 4, 방어 +2",
        front: [{ op: "damageEnemy", target: "select", n: 4 },
          { op: "block", n: 2 },
        ],
        backText: "드로우 2, S +3",
        back: [{ op: "draw", n: 2 }, { op: "supplies", n: 3 }]
      },
    ]    

  },
  {
    id: "shield",
    name: "방패",
    rarity: "BASIC",
    frontText: "방어 +5",
    backText: "방어 +3",
    front: [{ op: "block", n: 5 }],
    back: [{ op: "block", n: 3 }],

    upgrades: [
      {
        frontText: "방어 +7",
        front: [{ op: "block", n: 7 },
        ],
        backText: "방어 +4",
        back: [{ op: "block", n: 4 }]
      },
    ]    

  },
  {
    id: "power_arrow",
    name: "강력한 화살",
    rarity: "BASIC",
    frontText: "무작위 피해 10, S -2",
    backText: "무작위 피해 7, S -2",
    front: [{ op: "supplies", n: -2 }, { op: "damageEnemy", target: "random", n: 10 }],
    back: [{ op: "supplies", n: -2 }, { op: "damageEnemy", target: "random", n: 7 }],

    upgrades: [
      {
        frontText: "무작위 피해 13, S -2",
        front: [{ op: "supplies", n: -2 }, { op: "damageEnemy", target: "random", n: 13 }],
        backText: "무작위 피해 10, S -2",
        back: [{ op: "supplies", n: -2 }, { op: "damageEnemy", target: "random", n: 10 }]
      },
    ]    


  },
  {
    id: "arrow",
    name: "화살",
    rarity: "BASIC",
    frontText: "지정 피해 5",
    backText: "지정 피해 5, S -1",
    front: [{ op: "damageEnemy", target: "select", n: 5 }],
    back: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "select", n: 5 }],
    upgrades: [
      {
        frontText: "지정 피해 7",
        front: [{ op: "damageEnemy", target: "select", n: 7 }],
        backText: "지정 피해 7, S -1",
        back: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "select", n: 7 }],
      },
    ]
  },

  // 목표한 보물
  {
    id: "goal_treasure",
    name: "저주받은 보물",
    rarity: "MADNESS",
    exhaustWhen: "BOTH",
    frontText: "F +1, 소모",
    backText: "S -1, F +1, 소모",
    front: [{ op: "fatigue", n: 1 }],
    back: [{ op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
  },

  // 저주 카드
  {
    id: "debt_paper",
    name: "빚 문서",
    rarity: "BASIC",
    frontText: "아무 일도 일어나지 않습니다.",
    backText: "아무 일도 일어나지 않습니다.",
    front: [],
    back: [],
  },

  // 파밍 카드 0.1.0 5장
  {
    id: "berserk",
    name: "광폭화",
    rarity: "COMMON",
    frontText: "무작위 피해 15, S -3",
    backText: "S +4, F +1",
    front: [{ op: "damageEnemy", target: "random", n: 15 }, { op: "supplies", n: -3 }],
    back: [{ op: "supplies", n: 4 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "무작위 피해 20, S -4",
        front: [{ op: "damageEnemy", target: "random", n: 20 }, { op: "supplies", n: -4 }],
        backText: "S +6, F +2",
        back: [{ op: "supplies", n: 6 }, { op: "fatigue", n: 2 }],
      },
    ]

  },
  {
    id: "bandage",
    name: "붕대",
    rarity: "SPECIAL",
    exhaustWhen: "BOTH",
    frontText: "HP +4, 소모",
    backText: "HP +4, S -1, 소모",
    front: [{ op: "heal", n: 4 }],
    back: [{ op: "supplies", n: -1 }, { op: "heal", n: 4 }],

    upgrades: [
      {
        frontText: "HP +4, 출혈 제거, 소모",
        front: [{ op: "heal", n: 4 }, { op: "clearStatusSelf", key: "bleed" }],
        backText: "HP +4, 출혈 제거, S -1, 소모",
        back: [{ op: "supplies", n: -1 }, { op: "heal", n: 4 }, { op: "clearStatusSelf", key: "bleed" }],
      },
    ]
  },

  {
    id: "arrow_rain",
    name: "화살의 비",
    rarity: "COMMON",
    exhaustWhen: "BOTH",
    frontText: "전체 피해 9, S -2 소모",
    backText: "드로우 2, S +2, F +1, 소모",
    front: [
      { op: "damageEnemy", target: "all", n: 9 },
      { op: "supplies", n: -2 },
    ],
    back: [{ op: "draw", n: 2 }, { op: "supplies", n: 2 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "전체 피해 11, S -2, 소모",
        front: [{ op: "damageEnemy", target: "all", n: 11 },
        { op: "supplies", n: -2 },],

        backText: "드로우 3, S +3, F +2, 소모",
        back: [{ op: "draw", n: 3 }, { op: "supplies", n: 3 }, { op: "fatigue", n: 2 }],
      },
    ]

  },

  {
    id: "smoke",
    name: "연막",
    rarity: "SPECIAL",
    vanishWhen: "FRONT",
    frontText: "이번 턴 적 공격 피해 무효, 소실",
    backText: "F +1",
    front: [{ op: "nullifyDamageThisTurn" }],
    back: [{ op: "fatigue", n: 1 }],
 
  },



  {
    id: "redeploy",
    name: "재배치",
    rarity: "SPECIAL",
    frontText: "S +2",
    backText: "3번 슬롯에 있는 후열 카드의 전열 효과 발동",
    front: [{ op: "supplies", n: 2 }],
    back: [{ op: "triggerFrontOfBackSlot", index: 2 }],

    upgrades: [
      {
        frontText: "S +3",
        front: [{ op: "supplies", n: 3 }],

        backText: "3번 슬롯에 있는 후열 카드의 전열 효과 발동, S +1",
        back: [{ op: "triggerFrontOfBackSlot", index: 2 }, { op: "supplies", n: 1 }],
      },
    ]


  },


  // 파밍 카드 0.1.1 10장
  // 1) 비장의 일격

  {
    id: "secret_strike",
    name: "비장의 일격",
    rarity: "RARE",
    exhaustWhen: "BOTH",
    frontText: "무작위 피해 (F의 2배), 소모",
    backText: "전체 취약 +3 및 약화 +2, 소모",
    front: [{ op: "damageEnemyByPlayerFatigue", target: "random", mult: 2 }],
    back: [
      { op: "statusEnemy", target: "all", key: "vuln", n: 3 },
      { op: "statusEnemy", target: "all", key: "weak", n: 2 },
    ],

    upgrades: [
      {
        exhaustWhen: "BOTH",
        frontText: "지정 피해 (F의 2배), 소모",
        front: [{ op: "damageEnemyByPlayerFatigue", target: "select", mult: 2 }],

        backText: "전체 취약 +4 및 약화 +3, 소모",
        back: [{ op: "statusEnemy", target: "all", key: "vuln", n: 4 },
        { op: "statusEnemy", target: "all", key: "weak", n: 3 },],
      },
    ]

  },

  // 2) 화염 두루마리
  {
    id: "fire_scroll",
    name: "화염 두루마리",
    rarity: "RARE",
    exhaustWhen: "FRONT",
    vanishWhen: "BACK",
    frontText: "전체 피해 8, 소모",
    backText: "전체 피해 14, 소실",
    front: [{ op: "damageEnemy", target: "all", n: 8 }],
    back: [{ op: "damageEnemy", target: "all", n: 14 }],

    upgrades: [
      {
        frontText: "전체 피해 11, 소모",
        front: [{ op: "damageEnemy", target: "all", n: 11 }],

        backText: "전체 피해 18, 소실",
        back: [{ op: "damageEnemy", target: "all", n: 18 }],
      },
    ]
  },

  // 3) 마름쇠
  {
    id: "caltrops",
    name: "마름쇠",
    rarity: "SPECIAL",
    frontText: "전체 출혈 4 부여",
    backText: "이번 턴에 자신을 공격하려는 적에게 출혈 3 부여",
    front: [{ op: "statusEnemy", target: "all", key: "bleed", n: 4 }],
    back: [{ op: "statusEnemiesAttackingThisTurn", key: "bleed", n: 3 }],

    upgrades: [
      {
        frontText: "전체 출혈 5 부여",
        backText: "이번 턴에 자신을 공격하려는 적에게 출혈 4 부여",
        front: [{ op: "statusEnemy", target: "all", key: "bleed", n: 5 }],
        back: [{ op: "statusEnemiesAttackingThisTurn", key: "bleed", n: 4 }],
      },
    ]
  },

  // 4) 비상식량
  {
    id: "emergency_rations",
    name: "비상식량",
    rarity: "RARE",
    vanishWhen: "BACK",
    frontText: "S +2",
    backText: "S를 7로 만듦. 소실",
    front: [{ op: "supplies", n: 2 }],
    back: [{ op: "setSupplies", n: 7 }],

    upgrades: [
      {
        frontText: "S +3",
        backText: "S를 10으로 만듦. 소실",
        front: [{ op: "supplies", n: 3 }],
        back: [{ op: "setSupplies", n: 10 }],

      },
    ]

  },

  // 5) 진통제
  {
    id: "painkiller",
    name: "진통제",
    rarity: "SPECIAL",
    exhaustWhen: "FRONT",
    vanishWhen: "BACK",
    frontText: "HP -8, F -3, 소모",
    backText: "HP +8, F +1, 소실",
    front: [{ op: "hp", n: -8 }, { op: "fatigue", n: -3 }],
    back: [{ op: "hp", n: 8 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "HP -6, F -3, 소모",
        backText: "HP +11, F +1, 소실",
        front: [{ op: "hp", n: -6 }, { op: "fatigue", n: -3 }],
        back: [{ op: "hp", n: 11 }, { op: "fatigue", n: 1 }],
      },
    ]

  },

  // 6) 실전 경험
  {
    id: "field_experience",
    name: "실전 경험",
    rarity: "RARE",
    exhaustWhen: "BACK",
    frontText: "전체 피해 3",
    backText: "이 카드가 후열에 있는 턴에 승리하면 최대 체력 +2, 소모",
    front: [{ op: "damageEnemy", target: "all", n: 3 }],
    back: [],
    onWinWhileInBack: [{ op: "maxHp", n: 2 }],

    upgrades: [
      {
        frontText: "전체 피해 4",
        backText: "이 카드가 후열에 있는 턴에 승리하면 최대 체력 +3, 소모",
        front: [{ op: "damageEnemy", target: "all", n: 4 }],
        back: [],
        onWinWhileInBack: [{ op: "maxHp", n: 3 }],
      },
    ],
  },

  // 7) 야영 준비
  {
    id: "camp_prep",
    name: "야영 준비",
    rarity: "COMMON",
    frontText: "방어 +4, S +1",
    backText: "S +3",
    front: [{ op: "block", n: 4 }, { op: "supplies", n: 1 }],
    back: [{ op: "supplies", n: 3 }],

    upgrades: [
      {
        frontText: "방어 +5, S +2",
        backText: "S +4",
        front: [{ op: "block", n: 5 }, { op: "supplies", n: 2 }],
        back: [{ op: "supplies", n: 4 }],
      },
    ]


  },

  // 8) 급소 사격
  {
    id: "vital_shot",
    name: "급소 사격",
    rarity: "SPECIAL",
    frontText: "지정 피해 8",
    backText: "지정 피해 5, 출혈 2 부여, S -1",
    front: [{ op: "damageEnemy", target: "select", n: 8 }],
    back: [
      { op: "supplies", n: -1 },
      { op: "damageEnemy", target: "select", n: 5 },
      { op: "statusEnemy", target: "select", key: "bleed", n: 2 },
    ],

    upgrades: [
      {
        frontText: "지정 피해 11",
        backText: "지정 피해 6, 출혈 3 부여, S -1",
        front: [{ op: "damageEnemy", target: "select", n: 11 }],
        back: [
          { op: "supplies", n: -1 },
          { op: "damageEnemy", target: "select", n: 6 },
          { op: "statusEnemy", target: "select", key: "bleed", n: 3 },
        ],
      },
    ]

  },

  // 9) 독설
  {
    id: "taunt",
    name: "독설",
    rarity: "SPECIAL",
    frontText: "지정 약화 +4",
    backText: "전체 취약 +2 및 약화 +2",
    front: [{ op: "statusEnemy", target: "select", key: "weak", n: 4 }],
    back: [
      { op: "statusEnemy", target: "all", key: "vuln", n: 2 },
      { op: "statusEnemy", target: "all", key: "weak", n: 2 },
    ],

    upgrades: [
      {
        frontText: "지정 약화 +5",
        backText: "전체 취약 +2 및 약화 +3",
        front: [{ op: "statusEnemy", target: "select", key: "weak", n: 5 }],
        back: [
          { op: "statusEnemy", target: "all", key: "vuln", n: 2 },
          { op: "statusEnemy", target: "all", key: "weak", n: 3 },
        ]
      },
    ]

  },

  // 10) 연속 사격
  {
    id: "rapid_fire",
    name: "연속 사격",
    rarity: "COMMON",
    frontText: "지정 피해 2, 3번 발동",
    backText: "이번 턴에 카드를 뽑았으면 무작위 피해 8",
    front: [
      { op: "damageEnemy", target: "select", n: 2 },
      { op: "damageEnemy", target: "select", n: 2 },
      { op: "damageEnemy", target: "select", n: 2 },
    ],
    back: [{ op: "ifDrewThisTurn", then: [{ op: "damageEnemy", target: "random", n: 8 }] }],

    upgrades: [
      {
        frontText: "지정 피해 2, 4번 발동",
        backText: "이번 턴에 카드를 뽑았으면 무작위 피해 10",
        front: [
          { op: "damageEnemy", target: "select", n: 2 },
          { op: "damageEnemy", target: "select", n: 2 },
          { op: "damageEnemy", target: "select", n: 2 },
          { op: "damageEnemy", target: "select", n: 2 },
        ],
        back: [{ op: "ifDrewThisTurn", then: [{ op: "damageEnemy", target: "random", n: 10 }] }],
      },
    ]    

  },
  // 11) 피의 계약
  {
    id: "blood_contract",
    name: "피의 계약",
    rarity: "COMMON",
    frontText: "지정 피해 15, HP -3",
    backText: "S +4, F +1",
    front: [{ op: "damageEnemy", target: "select", n: 15 }, { op: "hp", n: -3 }],
    back: [{ op: "supplies", n: 4 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "지정 피해 18, HP -3",
        backText: "S +5, F +1",
        front: [{ op: "damageEnemy", target: "select", n: 18 }, { op: "hp", n: -3 }],
        back: [{ op: "supplies", n: 5 }, { op: "fatigue", n: 1 }],
      },
    ]
  },

  // 12) 천 조각 갑옷
  {
    id: "cloth_scrap_armor",
    name: "천 조각 갑옷",
    rarity: "SPECIAL",
    frontText: "방어 +8, S -1",
    backText: "방어 +4",
    front: [{ op: "supplies", n: -1 }, { op: "block", n: 8 }],
    back: [{ op: "block", n: 4 }],
    upgrades: [
      {
        frontText: "방어 +10, S -1",
        backText: "방어 +5",
        front: [{ op: "supplies", n: -1 }, { op: "block", n: 10 }],
        back: [{ op: "block", n: 5 }],
      },
    ]
  },

  // 13) 사냥감 표시
  {
    id: "prey_mark",
    name: "사냥감 표시",
    rarity: "SPECIAL",
    frontText: "지정 피해 10, HP가 플레이어보다 높으면 피해 15",
    backText: "지정 취약 +2",
    front: [{ op: "damageEnemyFormula", target: "select", kind: "prey_mark" }],
    back: [{ op: "statusEnemy", target: "select", key: "vuln", n: 2 }],
    upgrades: [
      {
        frontText: "지정 피해 12, HP가 플레이어보다 높으면 피해 18",
        front: [{ op: "damageEnemyFormula", target: "select", kind: "prey_mark_u1" }],
        backText: "지정 취약 +3",
        back: [{ op: "statusEnemy", target: "select", key: "vuln", n: 3 }],
      },
    ],
  },

  // 14) 난전 정리

  {
    id: "brawl_cleaver",
    name: "난전 정리",
    rarity: "COMMON",
    frontText: "지정 피해 10, 적이 3명이면 대신 피해 16",
    backText: "방어 +5",
    front: [{ op: "damageEnemyFormula", target: "select", kind: "triple_bounty" }],
    back: [{ op: "block", n: 5 }],
    upgrades: [
      {
        frontText: "지정 피해 10, 적이 3명이면 대신 20",
        front: [{ op: "damageEnemyFormula", target: "select", kind: "triple_bounty_u1" }],
        backText: "방어 +6",
        back: [{ op: "block", n: 6 }],
      },
    ],
  },

// 15) 손 안의 칼날
  {
    id: "hand_blade",
    name: "손 안의 칼날",
    rarity: "RARE",
    frontText: "지정 피해 4, 이 카드 제외 손패 1장당 피해 +2",
    backText: "손패 1장당 방어 +1 (최대 6)",
    front: [{ op: "damageEnemyFormula", target: "select", kind: "hand_blade" }],
    back: [{ op: "blockFormula", kind: "hand_blade_back" }],
    upgrades: [
      {
        frontText: "지정 피해 6, 이 카드 제외 손패 1장당 피해 +2",
        backText: "손패 1장당 방어 +2",
        front: [{ op: "damageEnemyFormula", target: "select", kind: "hand_blade_u1" }],
        back: [{ op: "blockFormula", kind: "hand_blade_back_u1" }],
      },
    ],
  },


  // 16) 도박사의 장갑
  {
    id: "gambler_glove",
    name: "도박사의 장갑",
    rarity: "COMMON",
    tags: ["INSTALL"],
    installWhen: "FRONT",
    frontText: "카드를 뽑을 때마다 방어 +2 (최대 6) (설치)",
    backText: "손패를 모두 버린다. 버린 만큼 뽑는다.",
    front: [],
    back: [{ op: "discardHandAllDraw" }],
    upgrades: [
      {
        frontText: "카드를 뽑을 때마다 방어 +2 (최대 10) (설치)",
        backText: "손패를 모두 버린다. 버린 만큼 뽑는다. 드로우 1",
        front: [],
        back: [{ op: "discardHandAllDraw", extraDraw: 1 }],
      },
    ],
  },

  // 17) 고독한 일격
  {
    id: "lone_blow",
    name: "고독한 일격",
    rarity: "SPECIAL",
    frontText: "이번 턴에 이 카드만 사용했으면, 지정 피해 20",
    backText: "이번 턴에 이 카드만 사용했으면, 방어 +10",
    front: [{ op: "damageEnemyFormula", target: "select", kind: "lone_blow_20" }],
    back: [{ op: "blockFormula", kind: "lone_blow_block_10" }],
    upgrades: [
      {
        frontText: "이번 턴에 이 카드만 사용했으면, 지정 피해 26",
        backText: "이번 턴에 이 카드만 사용했으면, 방어 +14",
        front: [{ op: "damageEnemyFormula", target: "select", kind: "lone_blow_26" }],
        back: [{ op: "blockFormula", kind: "lone_blow_block_14" }],
      },
    ],
  },

  // 18) 간이 방벽
  {
    id: "install_makeshift_wall",
    name: "간이 방벽",
    rarity: "RARE",
    tags: ["INSTALL"],
    installWhen: "BOTH",
    frontText: "턴이 끝날 때 방어도가 사라지지 않음 (설치)",
    backText: "보급 +1 (설치)",
    front: [],
    back: [{ op: "supplies", n: 1 }],
    upgrades: [
      {
        frontText: "턴이 끝날 때 방어도가 사라지지 않음, 방어 +2 (설치)",
        backText: "보급 +1, 방어 +2 (설치)",
        front: [{ op: "block", n: 2 }],
        back: [{ op: "supplies", n: 1 }, { op: "block", n: 2 }],
      },
    ],
  },

  // =========================
  // 설치(장비) / 토큰(두루마리)
  // =========================

  {
    id: "install_ballista",
    name: "발리스타",
    rarity: "COMMON",
    tags: ["INSTALL"],
    installWhen: "BOTH",
    frontText: "지정 피해 3 (설치)",
    backText: "무작위 피해 2 (설치)",
    front: [{ op: "damageEnemy", target: "select", n: 3 }],
    back: [{ op: "damageEnemy", target: "random", n: 2 }],
    upgrades: [
      {
        frontText: "지정 피해 4 (설치)",
        backText: "무작위 피해 3 (설치)",
        front: [{ op: "damageEnemy", target: "select", n: 4 }],
        back: [{ op: "damageEnemy", target: "random", n: 3 }],
      },
    ],
  },

  {
    id: "install_iron_bulwark",
    name: "철갑 방벽",
    rarity: "COMMON",
    tags: ["INSTALL"],
    installWhen: "BOTH",
    frontText: "방어 +4 (설치)",
    backText: "방어 +2 (설치)",
    front: [{ op: "block", n: 4 }],
    back: [{ op: "block", n: 2 }],
    upgrades: [
      {
        frontText: "방어 +5 (설치)",
        backText: "방어 +3 (설치)",
        front: [{ op: "block", n: 5 }],
        back: [{ op: "block", n: 3 }],
      },
    ],
  },

  {
    id: "install_cursed_banner",
    name: "저주의 깃발",
    rarity: "SPECIAL",
    tags: ["INSTALL"],
    installWhen: "BOTH",
    frontText: "무작위 적에게 취약 +1 (설치)",
    backText: "방어 +2 (설치)",
    front: [{ op: "statusEnemy", target: "random", key: "vuln", n: 1 }],
    back: [{ op: "block", n: 2 }],
    upgrades: [
      {
        frontText: "무작위 적에게 취약 +2 (설치)",
        backText: "방어 +3 (설치)",
        front: [{ op: "statusEnemy", target: "random", key: "vuln", n: 2 }],
        back: [{ op: "block", n: 3 }],
      },
    ],
  },

  // (신규) 선두 관측 — 설치형 피해 가이드
  // 전열 설치: (1)에게 주는 피해 +2
  // 후열 설치: (3)에게 주는 피해 +2
  {
    id: "install_lead_observation",
    name: "선두 관측",
    rarity: "COMMON",
    tags: ["INSTALL"],
    installWhen: "BOTH",
    frontText: "(1)번 적에게 주는 피해 +2 (설치)",
    backText: "(3)번 적에게 주는 피해 +2 (설치)",
    front: [],
    back: [],
    upgrades: [
      {
        frontText: "(1)번 적에게 주는 피해 +2, 방어 +2 (설치)",
        backText: "(3)번 적에게 주는 피해 +2, 방어 +2 (설치)",
        front: [{ op: "block", n: 2 }],
        back: [{ op: "block", n: 2 }],
      },
    ],
  },

  // (신규) 기동 방패 — 선천성
  {
    id: "innate_march_shield",
    name: "기동 방패",
    rarity: "COMMON",
    tags: ["INNATE"],
    frontText: "방어 +7 (선천성)",
    backText: "방어 +4 (선천성)",
    front: [{ op: "block", n: 7 }],
    back: [{ op: "block", n: 4 }],
    upgrades: [
      {
        frontText: "방어 +9 (선천성)",
        backText: "방어 +6 (선천성)",
        front: [{ op: "block", n: 9 }],
        back: [{ op: "block", n: 6 }],
      },
    ],
  },

  // (신규) 중열 절단 — (2)번 적의 HP를 절반으로
  {
    id: "rare_cut_second",
    name: "중열 절단",
    rarity: "RARE",
    exhaustWhen: "BOTH",
    frontText: "(2)번 적의 현재 HP를 절반으로, 소모",
    backText: "(2)번 적의 현재 HP를 절반으로, F +1, 소모",
    front: [{ op: "halveEnemyHpAtIndex", index: 1 }],
    back: [{ op: "fatigue", n: 1 }, { op: "halveEnemyHpAtIndex", index: 1 }],
    upgrades: [
      {
        frontText: "(2)번 적의 현재 HP를 절반으로, S +2, 소모",
        backText: "(2)번 적의 현재 HP를 절반으로, 소모",
        front: [{ op: "halveEnemyHpAtIndex", index: 1 }, { op: "supplies", n: 2 }],
        back: [{ op: "halveEnemyHpAtIndex", index: 1 }],
      },
    ],
  },

  // (신규) 성곽 쇠뇌 — 오래 둘수록 강해지는 설치
  {
    id: "install_castle_ballista",
    name: "성곽 쇠뇌",
    rarity: "COMMON",
    tags: ["INSTALL"],
    installWhen: "BOTH",
    frontText: "무작위 피해 1 + 설치한 턴 수 (설치)",
    backText: "방어 +2 (설치)",
    front: [{ op: "damageEnemyFormula", target: "random", kind: "castle_ballista_age" }],
    back: [{ op: "block", n: 2 }],
    upgrades: [
      {
        frontText: "무작위 피해 2 + 설치한 턴 수 (설치)",
        backText: "방어 +3 (설치)",
        front: [{ op: "damageEnemyFormula", target: "random", kind: "castle_ballista_age_u1" }],
        back: [{ op: "block", n: 3 }],
      },
    ],
  },

  // (토큰) 달빛 두루마리 — 전투 한정, 소모
  {
    id: "token_moon_scroll",
    name: "달빛 두루마리",
    rarity: "COMMON",
    tags: ["TOKEN", "EXHAUST"],
    frontText: "지정 적에게 취약 +1, 소모",
    backText: "방어 +2, 소모",
    front: [{ op: "statusEnemy", target: "select", key: "vuln", n: 1 }],
    back: [{ op: "block", n: 2 }],
  },

  {
    id: "scribe_hand",
    name: "필경사의 손",
    rarity: "SPECIAL",
    frontText: "방어 +5",
    backText: "달빛 두루마리 2장 생성",
    front: [{ op: "block", n: 5 }],
    back: [{ op: "addCardToHand", defId: "token_moon_scroll", n: 2 }],
    upgrades: [
      {
        frontText: "방어 +7",
        backText: "달빛 두루마리 3장 생성",
        front: [{ op: "block", n: 7 }],
        back: [{ op: "addCardToHand", defId: "token_moon_scroll", n: 3 }],
      },
    ],
  },

  {
    id: "install_scriptorium",
    name: "피 묻은 필사대",
    rarity: "RARE",
    tags: ["INSTALL"],
    installWhen: "BOTH",
    frontText: "방어 +1 (설치)",
    backText: "S -1, 달빛 두루마리 1장 생성 (설치)",
    front: [{ op: "block", n: 1 }],
    back: [{ op: "supplies", n: -1 }, { op: "addCardToHand", defId: "token_moon_scroll", n: 1 }],
    upgrades: [
      {
        frontText: "방어 +2 (설치)",
        backText: "S -1, 달빛 두루마리 2장 생성 (설치)",
        front: [{ op: "block", n: 2 }],
        back: [{ op: "supplies", n: -1 }, { op: "addCardToHand", defId: "token_moon_scroll", n: 2 }],
      },
    ],
  },


// 광기 카드
  {
    id: "mad_echo",
    name: "메아리",
    rarity: "MADNESS",
    frontText: "무작위 피해 (F의 절반 (버림))",
    backText: "드로우 1, S +2, F +1",
    front: [{ op: "damageEnemyByPlayerFatigue", target: "random", mult: 0.5 }],
    back: [{ op: "draw", n: 1 }, { op: "supplies", n: 2 }, { op: "fatigue", n: 1 }],
    upgrades: [
      {
        frontText: "무작위 피해 (F)",
        front: [{ op: "damageEnemyByPlayerFatigue", target: "random", mult: 1 }],
        backText: "드로우 2, S +2, F +1",
        back: [{ op: "draw", n: 2 }, { op: "supplies", n: 2 }, { op: "fatigue", n: 1 }],
      },
    ],
  },

  {
    id: "mad_insight",
    name: "금단의 통찰",
    rarity: "MADNESS",
    exhaustWhen: "BOTH",
    frontText: "방어 +8, 드로우 1, F +1, 소모",
    backText: "드로우 3, S +2, F +2, 소모",
    front: [{ op: "block", n: 8 }, { op: "draw", n: 1 }, { op: "fatigue", n: 1 }],
    back: [{ op: "draw", n: 3 }, { op: "supplies", n: 2 }, { op: "fatigue", n: 2 }],
    upgrades: [
      {
        frontText: "방어 +10, 드로우 2, F +1, 소모",
        front: [{ op: "block", n: 10 }, { op: "draw", n: 2 }, { op: "fatigue", n: 1 }],
        backText: "드로우 4, S +3, F +2, 소모",
        back: [{ op: "draw", n: 4 }, { op: "supplies", n: 3 }, { op: "fatigue", n: 2 }],
      },
    ],
  },

  {
    id: "mad_bargain",
    name: "거래의 잔재",
    rarity: "MADNESS",
    exhaustWhen: "BOTH",
    frontText: "지정 12 피해, S -1, F +1, 소모",
    backText: "HP +5, F +2, 소모",
    front: [{ op: "damageEnemy", target: "select", n: 12 }, { op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
    back: [{ op: "heal", n: 5 }, { op: "fatigue", n: 2 }],
    upgrades: [
      {
        frontText: "지정 20 피해, S -1, F +2, 소모",
        front: [{ op: "damageEnemy", target: "select", n: 20 }, { op: "supplies", n: -1 }, { op: "fatigue", n: 2 }],
        backText: "HP +7, F +2, 소모",
        back: [{ op: "heal", n: 7 }, { op: "fatigue", n: 2 }],
      },
    ],
  },



];

export const cardsById: Record<string, CardData> = Object.fromEntries(CARDS.map((c) => [c.id, c]));