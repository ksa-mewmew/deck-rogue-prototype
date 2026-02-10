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
    tags: ["EXHAUST"],
    exhaustWhen: "BACK",
    frontText: "방어 +3",
    backText: "F -1, 소모",
    front: [{ op: "block", n: 3 }],
    back: [{ op: "fatigue", n: -1 }],

    upgrades: [
      {
        frontText: "방어 +5",
        front: [{ op: "block", n: 5 }],
        backText: "F -1, S +1, 소모",
        back: [{ op: "fatigue", n: -1 }, { op: "supplies", n: 1 }],
      },
    ]    
  

  },
  {
    id: "scout",
    name: "정찰",
    frontText: "선택한 적에게 3 피해, 방어 +2",
    backText: "드로우 1, 손패 크기 +1, S +2",
    front: [
      { op: "damageEnemy", target: "select", n: 3 },
      { op: "block", n: 2 },
    ],
    back: [{ op: "draw", n: 1 }, { op: "supplies", n: 2 }],

    upgrades: [
      {
        frontText: "선택한 적에게 4 피해, 방어 +3",
        front: [{ op: "damageEnemy", target: "select", n: 3 },
          { op: "block", n: 2 },
        ],
        backText: "드로우 2, 손패 크기 +2, S +2",
        back: [{ op: "draw", n: 2 }, { op: "supplies", n: 2 }]
      },
    ]    

  },
  {
    id: "shield",
    name: "방패",
    frontText: "방어 +6",
    backText: "방어 +3",
    front: [{ op: "block", n: 6 }],
    back: [{ op: "block", n: 3 }],

    upgrades: [
      {
        frontText: "방어 +8",
        front: [{ op: "block", n: 8 },
        ],
        backText: "방어 +4",
        back: [{ op: "block", n: 4 }]
      },
    ]    

  },
  {
    id: "power_arrow",
    name: "강력한 화살",
    frontText: "무작위 적에게 10 피해, S -1",
    backText: "무작위 적에게 전열 한 장당 2 피해, S -1",
    front: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "random", n: 10 }],
    back: [{ op: "supplies", n: -1 }, { op: "damageEnemyBy", target: "random", nPer: 2, by: "frontCount" }],

    upgrades: [
      {
        frontText: "무작위 적에게 13 피해, S -1",
        front: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "random", n: 13 }],
        backText: "무작위 적에게 전열 한 장당 2 피해",
        back: [{ op: "damageEnemyBy", target: "random", nPer: 2, by: "frontCount" }]
      },
    ]    


  },
  {
    id: "arrow",
    name: "화살",
    frontText: "선택한 적에게 5 피해",
    backText: "선택한 적에게 5 피해, S -1",
    front: [{ op: "damageEnemy", target: "select", n: 5 }],
    back: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "select", n: 5 }],
    upgrades: [
      {
        frontText: "선택한 적에게 7 피해",
        front: [{ op: "damageEnemy", target: "select", n: 7 }],
        backText: "선택한 적에게 7 피해, S -1",
        back: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "select", n: 7 }],
      },
    ]
  },

  // 목표한 보물
  {
    id: "goal_treasure",
    name: "저주받은 보물",
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "F +1, 소모",
    backText: "S -1, F +1, 소모",
    front: [{ op: "fatigue", n: 1 }],
    back: [{ op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
  },

  // 파밍 카드 0.1.0 5장
  {
    id: "berserk",
    name: "광폭화",
    frontText: "무작위 적에게 15 피해, F +1",
    backText: "S +4, F +1",
    front: [{ op: "damageEnemy", target: "random", n: 15 }, { op: "fatigue", n: 1 }],
    back: [{ op: "supplies", n: 4 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "무작위 적에게 20 피해, F +2",
        front: [{ op: "damageEnemy", target: "random", n: 20 }, { op: "fatigue", n: 2 }],
        backText: "S +6, F +2",
        back: [{ op: "supplies", n: 6 }, { op: "fatigue", n: 2 }],
      },
    ]

  },
  {
    id: "bandage",
    name: "붕대",
    frontText: "HP +4",
    backText: "HP +4, S -1",
    front: [{ op: "heal", n: 4 }],
    back: [{ op: "supplies", n: -1 }, { op: "heal", n: 4 }],

    upgrades: [
      {
        frontText: "HP +4, 출혈 제거",
        front: [{ op: "heal", n: 4 }, { op: "clearStatusSelf", key: "bleed" }],
        backText: "HP +4, 출혈 제거, S -1",
        back: [{ op: "supplies", n: -1 }, { op: "heal", n: 4 }, { op: "clearStatusSelf", key: "bleed" }],
      },
    ]
  },

  {
    id: "arrow_rain",
    name: "화살의 비",
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "모든 적에게 10 피해, S -1, F +1, 소모",
    backText: "드로우 2, 손패 크기 +2, S +2, F +1, 소모",
    front: [
      { op: "damageEnemy", target: "all", n: 10 },
      { op: "supplies", n: -1 },
      { op: "fatigue", n: 1 },
    ],
    back: [{ op: "draw", n: 2 }, { op: "supplies", n: 2 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "모든 적에게 13 피해, S -2, F +1, 소모",
        front: [{ op: "damageEnemy", target: "all", n: 13 },
      { op: "supplies", n: -2 },
      { op: "fatigue", n: 1 },],

        backText: "드로우 3, 손패 크기 +3, S +3, F +2, 소모",
        back: [{ op: "draw", n: 3 }, { op: "supplies", n: 3 }, { op: "fatigue", n: 2 }],
      },
    ]

  },

  {
    id: "smoke",
    name: "연막",
    tags: ["EXHAUST"],
    exhaustWhen: "FRONT",
    frontText: "이번 턴 피해 무효, 소모",
    backText: "자신은 교란 당하지 않음",
    front: [{ op: "nullifyDamageThisTurn" }],
    back: [{ op: "immuneDisruptThisTurn" }],
  },



  {
    id: "redeploy",
    name: "재배치",
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
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "무작위 적에게 자신의 F의 3배 피해, 소모",
    backText: "모든 적에게 취약 +4 및 약화 +4, 소모",
    front: [{ op: "damageEnemyByPlayerFatigue", target: "random", mult: 3 }],
    back: [
      { op: "statusEnemy", target: "all", key: "vuln", n: 4 },
      { op: "statusEnemy", target: "all", key: "weak", n: 4 },
    ],

    upgrades: [
      {
        tags: ["EXHAUST"],
        exhaustWhen: "FRONT",
        frontText: "선택한 적에게 자신의 F의 3배 피해, 소모",
        front: [{ op: "damageEnemyByPlayerFatigue", target: "select", mult: 3 }],

        backText: "모든 적에게 취약 +4 및 약화 +4",
        back: [{ op: "statusEnemy", target: "all", key: "vuln", n: 4 },
        { op: "statusEnemy", target: "all", key: "weak", n: 4 },],
      },
    ]

  },

  // 2) 화염 두루마리
  {
    id: "fire_scroll",
    name: "화염 두루마리",
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "방어 +7, 소모",
    backText: "모든 적에게 12 피해, 소모",
    front: [{ op: "block", n: 7 }],
    back: [{ op: "damageEnemy", target: "all", n: 12 }],

    upgrades: [
      {
        frontText: "방어 +8, 소모",
        front: [{ op: "block", n: 8 }],

        backText: "모든 적에게 14 피해, 소모",
        back: [{ op: "damageEnemy", target: "all", n: 14 }],
      },
    ]
  },

  // 3) 마름쇠
  {
    id: "caltrops",
    name: "마름쇠",
    frontText: "모든 적에게 출혈 4 부여",
    backText: "이번 턴에 자신을 공격하려는 적에게 출혈 3 부여",
    front: [{ op: "statusEnemy", target: "all", key: "bleed", n: 4 }],
    back: [{ op: "statusEnemiesAttackingThisTurn", key: "bleed", n: 3 }],

    upgrades: [
      {
        frontText: "모든 적에게 출혈 5 부여",
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
    tags: ["VANISH"],
    vanishWhen: "BACK",
    frontText: "S +2",
    backText: "S를 10으로 만듦. 소실",
    front: [{ op: "supplies", n: 2 }],
    back: [{ op: "setSupplies", n: 10 }],

    upgrades: [
      {
        frontText: "S +3",
        backText: "S를 15으로 만듦. 소실",
        front: [{ op: "supplies", n: 3 }],
        back: [{ op: "setSupplies", n: 15 }],

      },
    ]

  },

  // 5) 진통제
  {
    id: "painkiller",
    name: "진통제",
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "HP -8, F -2, 소모",
    backText: "HP +10, F +2, 소모",
    front: [{ op: "hp", n: -8 }, { op: "fatigue", n: -2 }],
    back: [{ op: "hp", n: 10 }, { op: "fatigue", n: 2 }],

    upgrades: [
      {
        frontText: "HP -5, F -2, 소모",
        backText: "HP +10, F +1, 소모",
        front: [{ op: "hp", n: -5 }, { op: "fatigue", n: -2 }],
        back: [{ op: "hp", n: 10 }, { op: "fatigue", n: 1 }],
      },
    ]

  },

  // 6) 실전 경험
  {
    id: "field_experience",
    name: "실전 경험",
    tags: ["EXHAUST"],
    exhaustWhen: "BACK",
    frontText: "모든 적에게 3 피해",
    backText: "이 카드가 후열에 있는 턴에 승리하면 최대 체력 +2, 소모",
    front: [{ op: "damageEnemy", target: "all", n: 3 }],
    back: [],
    onWinWhileInBack: [{ op: "maxHp", n: 2 }],

    upgrades: [
      {
        frontText: "모든 적에게 4 피해",
        backText: "이 카드가 후열에 있는 턴에 승리하면 최대 체력 +3, 소모",
        front: [{ op: "damageEnemy", target: "all", n: 4 }],
        onWinWhileInBack: [{ op: "maxHp", n: 3 }],
      },
//      {
//        frontText: "모든 적에게 5 피해",
//        backText: "이 카드가 후열에 있는 턴에 승리하면 최대 체력 +4, 소모",
//        front: [{ op: "damageEnemy", target: "all", n: 5 }],
//        onWinWhileInBack: [{ op: "maxHp", n: 4 }],
//      }, 강화는 우선 하나만.
    ],
  },

  // 7) 야영 준비
  {
    id: "camp_prep",
    name: "야영 준비",
    frontText: "방어 +4, S +1",
    backText: "S +3",
    front: [{ op: "block", n: 4 }, { op: "supplies", n: 1 }],
    back: [{ op: "supplies", n: 3 }],

    upgrades: [
      {
        frontText: "방어 +5, S +2",
        backText: "S +5",
        front: [{ op: "block", n: 5 }, { op: "supplies", n: 2 }],
        back: [{ op: "supplies", n: 5 }],
      },
    ]


  },

  // 8) 급소 사격
  {
    id: "vital_shot",
    name: "급소 사격",
    frontText: "선택한 적에게 8 피해",
    backText: "선택한 적에게 5 피해, 출혈 2 부여, S -1",
    front: [{ op: "damageEnemy", target: "select", n: 8 }],
    back: [
      { op: "supplies", n: -1 },
      { op: "damageEnemy", target: "select", n: 5 },
      { op: "statusEnemy", target: "select", key: "bleed", n: 2 },
    ],

    upgrades: [
      {
        frontText: "선택한 적에게 11 피해",
        backText: "선택한 적에게 6 피해, 출혈 3 부여, S -1",
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
    frontText: "선택한 적에게 약화 +4",
    backText: "모든 적에게 취약 +2 및 약화 +2",
    front: [{ op: "statusEnemy", target: "select", key: "weak", n: 4 }],
    back: [
      { op: "statusEnemy", target: "all", key: "vuln", n: 2 },
      { op: "statusEnemy", target: "all", key: "weak", n: 2 },
    ],

    upgrades: [
      {
        frontText: "선택한 적에게 약화 +5",
        backText: "모든 적에게 취약 +2 및 약화 +3",
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
    frontText: "선택한 적에게 2 피해, 3번 발동",
    backText: "이번 턴에 카드를 뽑았으면 무작위 적에게 8 피해",
    front: [
      { op: "damageEnemy", target: "select", n: 2 },
      { op: "damageEnemy", target: "select", n: 2 },
      { op: "damageEnemy", target: "select", n: 2 },
    ],
    back: [{ op: "ifDrewThisTurn", then: [{ op: "damageEnemy", target: "random", n: 8 }] }],

    upgrades: [
      {
        frontText: "선택한 적에게 2 피해, 4번 발동",
        backText: "이번 턴에 카드를 뽑았으면 무작위 적에게 10 피해",
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
];

export const cardsById: Record<string, CardData> = Object.fromEntries(CARDS.map((c) => [c.id, c]));