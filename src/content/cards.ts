import type { CardData } from "../engine/types";

export const CARDS: CardData[] = [
  // 기본 카드
  {
    id: "field_ration",
    name: "야전 식량",
    frontText: "방어 +3",
    backText: "S += 2",
    front: [{ op: "block", n: 3 }],
    back: [{ op: "supplies", n: 2 }],
  },
  {
    id: "maintenance",
    name: "정비 도구",
    tags: ["EXHAUST"],
    exhaustWhen: "BACK",
    frontText: "방어 +3",
    backText: "F -= 1, 이후 소모",
    front: [{ op: "block", n: 3 }],
    back: [{ op: "fatigue", n: -1 }],
  },
  {
    id: "scout",
    name: "정찰",
    frontText: "선택한 적에게 3 피해, 방어 +1",
    backText: "드로우 1, S += 1",
    front: [{ op: "damageEnemy", target: "select", n: 3 }, { op: "block", n: 1 }],
    back: [{ op: "draw", n: 1 }, { op: "supplies", n: 1 }],
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
    frontText: "S -= 1, 무작위 적에게 10 피해",
    backText: "S -= 1, 무작위 적에게 전열 한 장당 2 피해",
    front: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "random", n: 10 }],
    back: [{ op: "supplies", n: -1 }, { op: "damageEnemyBy", target: "random", nPer: 2, by: "frontCount" }],
  },
  {
    id: "arrow",
    name: "화살",
    frontText: "선택한 적에게 5 피해",
    backText: "S -= 1, 선택한 적에게 5 피해",
    front: [{ op: "damageEnemy", target: "select", n: 5 }],
    back: [{ op: "supplies", n: -1 }, { op: "damageEnemy", target: "select", n: 5 }],
  },

  // 목표한 보물
  {
    id: "goal_treasure",
    name: "저주받은 보물",
    tags: ["EXHAUST"],
    exhaustWhen: "FRONT",
    frontText: "F += 1, 소모",
    backText: "S -= 1, F += 1, 소모",
    front: [{ op: "fatigue", n: 1 }],
    back: [{ op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
  },

  // 파밍 카드
  {
    id: "berserk",
    name: "광폭화",
    frontText: "무작위 적에게 15 피해, F += 1",
    backText: "S += 2, F += 1",
    front: [{ op: "damageEnemy", target: "random", n: 15 }, { op: "fatigue", n: 1 }],
    back: [{ op: "supplies", n: 2 }, { op: "fatigue", n: 1 }],
  },
  {
    id: "bandage",
    name: "붕대",
    frontText: "HP +3",
    backText: "S -= 1, HP +3",
    front: [{ op: "heal", n: 3 }],
    back: [{ op: "supplies", n: -1 }, { op: "heal", n: 3 }],
  },
  {
    id: "arrow_rain",
    name: "화살의 비",
    tags: ["EXHAUST"],
    exhaustWhen: "BOTH",
    frontText: "모든 적에게 10 피해, S -= 1, F += 1, 소모",
    backText: "드로우 2, S += 1, F += 1, 소모",
    front: [{ op: "damageEnemy", target: "all", n: 10 }, { op: "supplies", n: -1 }, { op: "fatigue", n: 1 }],
    back: [{ op: "draw", n: 2 }, { op: "supplies", n: 1 }, { op: "fatigue", n: 1 }],
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
    frontText: "S += 2",
    backText: "0번 슬롯에 있는 후열 카드의 전열 효과 발동",
    front: [{ op: "supplies", n: 2 }],
    back: [{ op: "triggerFrontOfBackSlot", index: 0 }],
  },
];

export const cardsById: Record<string, CardData> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
