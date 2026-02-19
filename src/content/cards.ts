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
    exhaustWhen: "BOTH",
    frontText: "전체 피해 10, S -2 소모",
    backText: "드로우 2, S +2, F +1, 소모",
    front: [
      { op: "damageEnemy", target: "all", n: 10 },
      { op: "supplies", n: -2 },
    ],
    back: [{ op: "draw", n: 2 }, { op: "supplies", n: 2 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "전체 피해 13, S -2, 소모",
        front: [{ op: "damageEnemy", target: "all", n: 13 },
        { op: "supplies", n: -2 },],

        backText: "드로우 3, S +3, F +2, 소모",
        back: [{ op: "draw", n: 3 }, { op: "supplies", n: 3 }, { op: "fatigue", n: 2 }],
      },
    ]

  },

  {
    id: "smoke",
    name: "연막",
    vanishWhen: "FRONT",
    frontText: "이번 턴 적 공격 피해 무효, 소실",
    backText: "F +1",
    front: [{ op: "nullifyDamageThisTurn" }],
    back: [{ op: "fatigue", n: 1 }],
 
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
    exhaustWhen: "BOTH",
    frontText: "무작위 피해 (F의 2배), 소모",
    backText: "전체 취약 +3 및 약화 +3, 소모",
    front: [{ op: "damageEnemyByPlayerFatigue", target: "random", mult: 2 }],
    back: [
      { op: "statusEnemy", target: "all", key: "vuln", n: 3 },
      { op: "statusEnemy", target: "all", key: "weak", n: 3 },
    ],

    upgrades: [
      {
        exhaustWhen: "FRONT",
        frontText: "지정 피해 (F의 2배), 소모",
        front: [{ op: "damageEnemyByPlayerFatigue", target: "select", mult: 2 }],

        backText: "전체 취약 +4 및 약화 +4",
        back: [{ op: "statusEnemy", target: "all", key: "vuln", n: 4 },
        { op: "statusEnemy", target: "all", key: "weak", n: 4 },],
      },
    ]

  },

  // 2) 화염 두루마리
  {
    id: "fire_scroll",
    name: "화염 두루마리",
    exhaustWhen: "FRONT",
    vanishWhen: "BACK",
    frontText: "전체 피해 6, 소모",
    backText: "전체 피해 12, 소실",
    front: [{ op: "damageEnemy", target: "all", n: 6 }],
    back: [{ op: "damageEnemy", target: "all", n: 12 }],

    upgrades: [
      {
        frontText: "전체 피해 8, 소모",
        front: [{ op: "damageEnemy", target: "all", n: 8 }],

        backText: "전체 피해 15, 소실",
        back: [{ op: "damageEnemy", target: "all", n: 15 }],
      },
    ]
  },

  // 3) 마름쇠
  {
    id: "caltrops",
    name: "마름쇠",
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
    exhaustWhen: "FRONT",
    vanishWhen: "BACK",
    frontText: "HP -8, F -3, 소모",
    backText: "HP +8, F +1, 소실",
    front: [{ op: "hp", n: -8 }, { op: "fatigue", n: -3 }],
    back: [{ op: "hp", n: 8 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "HP -6, F -3, 소모",
        backText: "HP +10, F +1, 소실",
        front: [{ op: "hp", n: -6 }, { op: "fatigue", n: -3 }],
        back: [{ op: "hp", n: 10 }, { op: "fatigue", n: 1 }],
      },
    ]

  },

  // 6) 실전 경험
  {
    id: "field_experience",
    name: "실전 경험",
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
    frontText: "지정 피해 12, HP -3",
    backText: "S +3, F +1",
    front: [{ op: "damageEnemy", target: "select", n: 12 }, { op: "hp", n: -3 }],
    back: [{ op: "supplies", n: 3 }, { op: "fatigue", n: 1 }],

    upgrades: [
      {
        frontText: "지정 피해 15, HP -3",
        backText: "S +4, F +1",
        front: [{ op: "damageEnemy", target: "select", n: 15 }, { op: "hp", n: -3 }],
        back: [{ op: "supplies", n: 4 }, { op: "fatigue", n: 1 }],
      },
    ]
  },

  // 12) 천 조각 갑옷
  {
    id: "cloth_scrap_armor",
    name: "천 조각 갑옷",
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

// 광기 카드
  {
    id: "mad_echo",
    name: "메아리",
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
    exhaustWhen: "BOTH",
    frontText: "지정 12 피해, S -1, F +1, 소모",
    backText: "HP +6, F +2, 소모",
    front: [{ op: "damageEnemy", target: "select", n: 12 }, { op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
    back: [{ op: "heal", n: 6 }, { op: "fatigue", n: 2 }],
    upgrades: [
      {
        frontText: "지정 20 피해, S -1, F +1, 소모",
        front: [{ op: "damageEnemy", target: "select", n: 20 }, { op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
        backText: "HP +8, F +2, 소모",
        back: [{ op: "heal", n: 8 }, { op: "fatigue", n: 2 }],
      },
    ],
  },



];

export const cardsById: Record<string, CardData> = Object.fromEntries(CARDS.map((c) => [c.id, c]));