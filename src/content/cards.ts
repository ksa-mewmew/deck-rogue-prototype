// =======================================================
// cards.ts  ✅ (전체 수정본)
// - DrewThisTurn 같은 가짜 op 제거
// - 연속 사격: ifDrewThisTurnThen 사용
// - 급소 사격 문법 오류(콤마/브라켓) 수정
// =======================================================

import type { CardData } from "../engine/types";

export const CARDS: CardData[] = [
  // 기본 카드
  {
    id: "field_ration",
    name: "야전 식량",
    frontText: "방어 +3",
    backText: "S +2",
    front: [{ op: "block", n: 3 }],
    back: [{ op: "supplies", n: 2 }],
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
  },
  {
    id: "scout",
    name: "정찰",
    frontText: "선택한 적에게 3 피해, 방어 +2",
    backText: "손패 크기 +1, S +2",
    front: [
      { op: "damageEnemy", target: "select", n: 3 },
      { op: "block", n: 2 },
    ],
    back: [{ op: "draw", n: 1 }, { op: "supplies", n: 2 }],
  },
  {
    id: "shield",
    name: "방패",
    frontText: "방어 +6",
    backText: "방어 +3",
    front: [{ op: "block", n: 6 }],
    back: [{ op: "block", n: 3 }],
  },
  {
    id: "power_arrow",
    name: "강력한 화살",
    frontText: "무작위 적에게 10 피해 S -1",
    backText: "무작위 적에게 전열 한 장당 2 피해, S -1",
    front: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "random", n: 10 }],
    back: [{ op: "supplies", n: -1 }, { op: "damageEnemyBy", target: "random", nPer: 2, by: "frontCount" }],
  },
  {
    id: "arrow",
    name: "화살",
    frontText: "선택한 적에게 5 피해",
    backText: "선택한 적에게 5 피해, S -1",
    front: [{ op: "damageEnemy", target: "select", n: 5 }],
    back: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "select", n: 5 }],
  },

  // 목표한 보물
  {
    id: "goal_treasure",
    name: "저주받은 보물",
    tags: ["EXHAUST"],
    exhaustWhen: "FRONT",
    frontText: "F +1, 소모",
    backText: "S -1, F +1, 소모",
    front: [{ op: "fatigue", n: 1 }],
    back: [{ op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
  },

  // 파밍 카드
  {
    id: "berserk",
    name: "광폭화",
    frontText: "무작위 적에게 15 피해, F +1",
    backText: "S +4, F +1",
    front: [{ op: "damageEnemy", target: "random", n: 15 }, { op: "fatigue", n: 1 }],
    back: [{ op: "supplies", n: 4 }, { op: "fatigue", n: 1 }],
  },
  {
    id: "bandage",
    name: "붕대",
    frontText: "HP +4",
    backText: "HP +4, S -1",
    front: [{ op: "heal", n: 4 }],
    back: [{ op: "supplies", n: -1 }, { op: "heal", n: 4 }],
  },
  {
    id: "arrow_rain",
    name: "화살의 비",
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "모든 적에게 10 피해, S -1, F +1, 소모",
    backText: "손패 크기 +2, S +2, F +1, 소모",
    front: [
      { op: "damageEnemy", target: "all", n: 10 },
      { op: "supplies", n: -1 },
      { op: "fatigue", n: 1 },
    ],
    back: [{ op: "draw", n: 2 }, { op: "supplies", n: 2 }, { op: "fatigue", n: 1 }],
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
  },

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
  },

  // 3) 마름쇠
  {
    id: "caltrops",
    name: "마름쇠",
    frontText: "모든 적에게 출혈 4 부여",
    backText: "이번 턴에 자신을 공격하려는 적에게 출혈 3 부여",
    front: [{ op: "statusEnemy", target: "all", key: "bleed", n: 4 }],
    back: [{ op: "statusEnemiesAttackingThisTurn", key: "bleed", n: 3 }],
  },

  // 4) 비상식량
  {
    id: "emergency_rations",
    name: "비상식량",
    tags: ["VANISH"],
    vanishWhen: "BACK", // ✅ 후열일 때만 소실
    frontText: "S +2",
    backText: "S를 10으로 만듦. 소실",
    front: [{ op: "supplies", n: 2 }],
    back: [{ op: "setSupplies", n: 10 }],
  },

  // 5) 진통제
  {
    id: "painkiller",
    name: "진통제",
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "HP -5, F -2, 소모",
    backText: "HP +10, F +2, 소모",
    front: [{ op: "hp", n: -5 }, { op: "fatigue", n: -2 }],
    back: [{ op: "hp", n: 10 }, { op: "fatigue", n: 2 }],
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
  },

  // 7) 야영 준비
  {
    id: "camp_prep",
    name: "야영 준비",
    frontText: "방어 +4, S +1",
    backText: "S +3",
    front: [{ op: "block", n: 4 }, { op: "supplies", n: 1 }],
    back: [{ op: "supplies", n: 3 }],
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
  },

  // 9) 독설
  {
    id: "taunt",
    name: "독설",
    frontText: "선택한 적에게 약화 +3",
    backText: "모든 적에게 취약 +2 및 약화 +2",
    front: [{ op: "statusEnemy", target: "select", key: "weak", n: 3 }],
    back: [
      { op: "statusEnemy", target: "all", key: "vuln", n: 2 },
      { op: "statusEnemy", target: "all", key: "weak", n: 2 },
    ],
  },

  // 10) 연속 사격
  {
    id: "rapid_fire",
    name: "연속 사격",
    frontText: "선택한 적에게 3 피해, 3번 발동",
    backText: "이번 턴에 카드를 뽑았으면 무작위 적에게 8 피해",
    front: [
      { op: "damageEnemy", target: "select", n: 3 },
      { op: "damageEnemy", target: "select", n: 3 },
      { op: "damageEnemy", target: "select", n: 3 },
    ],
    back: [{ op: "ifDrewThisTurn", then: [{ op: "damageEnemy", target: "random", n: 8 }] }],
  },
];

export const cardsById: Record<string, CardData> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
