import type { EnemyData } from "../engine/types";

export const ENEMIES: EnemyData[] = [

  {
    id: "other_adventurer",
    name: "보물을 노리는 다른 모험가",
    maxHp: 40,
    intents: [
      { label: "5 피해, 3번 발동", acts:
        [{ op: "damagePlayer", n: 5 }, { op: "damagePlayer", n: 5 }, { op: "damagePlayer", n: 5 }] },
      { label: "출혈4, 취약4, 약화4", acts: [
          { op: "statusPlayer", key: "bleed", n: 4 },
          { op: "statusPlayer", key: "vuln", n: 4 },
          { op: "statusPlayer", key: "weak", n: 4 },
        ],
      },
    ],
  }, 

  {
    id: "goblin_raider",
    name: "고블린 약탈자",
    maxHp: 15,
    intents: [
      {
        label: "(12-이번 턴에 사용한 카드의 수) 피해",
        acts: [{ op: "damagePlayerFormula", kind: "goblin_raider" }],
      },
      {
        label: "S -4",
        acts: [{ op: "supplies", n: -4 }],
      },
    ],
  },
  {
    id: "watching_statue",
    name: "감시하는 석상",
    maxHp: 25,
    intents: [
      {
        label: "4+(이번 턴에 사용한 카드의 수) 피해",
        acts: [{ op: "damagePlayerFormula", kind: "watching_statue" }],
      },
    ],
  },
  {
    id: "pebble_golem",
    name: "조약돌 골렘",
    maxHp: 25,
    intents: [
      { label: "6 피해", acts: [{ op: "damagePlayer", n: 6 }] },
      { label: "자신 HP 6 회복", acts: [{ op: "enemyHealSelf", n: 6 }] },
    ],
  },

  {
    id: "rock_golem",
    name: "바위 골렘",
    maxHp: 50,
    intents: [
      { label: "7 피해", acts: [{ op: "damagePlayer", n: 7 }] },
      { label: "자신 HP 10 회복", acts: [{ op: "enemyHealSelf", n: 10 }] },
    ],
  },
  {
    id: "slime",
    name: "슬라임",
    maxHp: 30,
    intents: [
      { label: "다음 턴 동안 피해를 입지 않음", acts: [{ op: "enemyImmuneNextTurn" }] },
      {
        label: "약화 3 부여 후 자신 HP 3 회복",
        acts: [{ op: "statusPlayer", key: "weak", n: 3 }, { op: "enemyHealSelf", n: 3 }],
      },
      { label: "6 피해", acts: [{ op: "damagePlayer", n: 6 }] },
    ],
  },

  {
    id: "poison_spider",
    name: "독거미",
    maxHp: 28,
    intents: [
      {
        label: "출혈 4 부여",
        acts: [{ op: "statusPlayer", key: "bleed", n: 4 }],
      },
      {
        label: "7 피해",
        acts: [{ op: "damagePlayer", n: 7 }],
      },
      {
        label: "출혈 2 부여, 6 피해)",
        acts: [
          { op: "statusPlayer", key: "bleed", n: 2 },
          { op: "damagePlayer", n: 6 },
        ],
      },

    ],
  },




  
  {
    id: "boss_cursed_wall",
    name: "저주받은 벽",
    maxHp: 100,
    intents: [
      { label: "F += 1", acts: [{ op: "fatiguePlayer", n: 1 }] },
      { label: "아무 행동도 하지 않음", acts: [] },
    ],
  },

  {
    id: "boss_giant_orc",
    name: "거대한 오크",
    maxHp: 70,
    intents: [
      { label: "15 피해", acts: [{ op: "damagePlayer", n: 15 }] },
      { label: "다음 턴 동안 피해를 입지 않음", acts: [{ op: "enemyImmuneNextTurn" }] },
      { label: "자신 HP 15 회복", acts: [{ op: "enemyHealSelf", n: 15 }]}
    ],
  },

  {
    id: "boss_soul_stealer",
    name: "영혼 강탈자",
    maxHp: 50,
    intents: [
      { label: "7 피해, S -2", acts: [{ op: "damagePlayer", n: 7 }, { op: "supplies", n: -2 }] },
      { label: "7 피해, F +1", acts: [{ op: "damagePlayer", n: 7 }, { op: "fatiguePlayer", n: 1 }] },
      { label: "카운트 진행", acts: [] },
    ],
  },

];

export const enemiesById: Record<string, EnemyData> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
