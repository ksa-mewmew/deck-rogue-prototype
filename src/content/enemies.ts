import type { EnemyData } from "../engine/types";

export const ENEMIES: EnemyData[] = [

  {
    id: "other_adventurer",
    name: "보물을 노리는 다른 모험가",
    maxHp: 40,
    intents: [
      { label: "10 피해", acts: [{ op: "damagePlayer", n: 10 }] },
      { label: "교란/출혈2/취약2/약화2", acts: [
          { op: "statusPlayer", key: "disrupt", n: 1 },
          { op: "statusPlayer", key: "bleed", n: 2 },
          { op: "statusPlayer", key: "vuln", n: 2 },
          { op: "statusPlayer", key: "weak", n: 2 },
        ],
      },
    ],
  }, 

  // 10회 이하에만 등장
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

  // 11회 이상부터 등장
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
        label: "약화 4 부여 후 자신 HP 3 회복",
        acts: [{ op: "statusPlayer", key: "weak", n: 4 }, { op: "enemyHealSelf", n: 3 }],
      },
      { label: "6 피해", acts: [{ op: "damagePlayer", n: 6 }] },
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
      { label: "피해 15", acts: [{ op: "damagePlayer", n: 15 }] },
      { label: "다음 턴 동안 피해를 입지 않음", acts: [{ op: "enemyImmuneNextTurn" }] },
      { label: "자신 HP 15 회복", acts: [{ op: "enemyHealSelf", n: 15 }]}
    ],
  },

  {
    id: "boss_soul_stealer",
    name: "영혼 강탈자",
    maxHp: 50,
    intents: [
      { label: "피해 7, S -2", acts: [{ op: "damagePlayer", n: 7 }, { op: "supplies", n: -2 }] },
      { label: "피해 7, F +1", acts: [{ op: "damagePlayer", n: 7 }, { op: "fatiguePlayer", n: 1 }] },
      { label: "준비(카운트 진행)", acts: [] },
      // ✅ 50 피해는 엔진(combat.ts)에서 카운트 조건으로 강제 발동하므로,
      // 콘텐츠에는 굳이 op를 두지 않아도 됩니다(분리 유지하면서도 안정적).
    ],
  },

];

export const enemiesById: Record<string, EnemyData> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
