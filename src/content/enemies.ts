import type { EnemyData } from "../engine/types";

export const ENEMIES: EnemyData[] = [

  {
    id: "other_adventurer",
    name: "보물을 노리는 다른 모험가",
    maxHp: 40,
    intents: [
      { label: "창 찌르기: 5 피해, 3번 발동", acts:
        [{ op: "damagePlayer", n: 5 }, { op: "damagePlayer", n: 5 }, { op: "damagePlayer", n: 5 }] },
      { label: "독약 뿌리기: 출혈4, 취약4, 약화4", acts: [
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
        label: "기습: (12-이번 턴에 사용한 카드의 수) 피해",
        acts: [{ op: "damagePlayerFormula", kind: "goblin_raider" }],
      },
      {
        label: "훔치기: S -3",
        acts: [{ op: "supplies", n: -3 }],
      },
    ],
  },
  {
    id: "watching_statue",
    name: "감시하는 석상",
    maxHp: 25,
    intents: [
      {
        label: "감시: 4+(이번 턴에 사용한 카드의 수) 피해",
        acts: [{ op: "damagePlayerFormula", kind: "watching_statue" }],
      },
    ],
  },
  {
    id: "pebble_golem",
    name: "조약돌 골렘",
    maxHp: 25,
    intents: [
      { label: "조약돌 던지기: 7 피해", acts: [{ op: "damagePlayer", n: 7 }] },
      { label: "모래 모으기: 자신 HP 6 회복", acts: [{ op: "enemyHealSelf", n: 6 }] },
    ],
  },

  {
    id: "rock_golem",
    name: "바위 골렘",
    maxHp: 50,
    intents: [
      { label: "바위 던지기: 9 피해", acts: [{ op: "damagePlayer", n: 9 }] },
      { label: "땅 모으기: 자신 HP 10 회복", acts: [{ op: "enemyHealSelf", n: 10 }] },
    ],
  },
  {
    id: "slime",
    name: "슬라임",
    maxHp: 30,
    intents: [
      { label: "유연한 몸: 다음 턴 동안 피해를 입지 않음", acts: [{ op: "enemyImmuneNextTurn" }] },
      {
        label: "산성액: 약화 3 부여 후 자신 HP 3 회복",
        acts: [{ op: "statusPlayer", key: "weak", n: 3 }, { op: "enemyHealSelf", n: 3 }],
      },
      { label: "때리기: 6 피해", acts: [{ op: "damagePlayer", n: 6 }] },
    ],
  },

  {
    id: "poison_spider",
    name: "독거미",
    maxHp: 28,
    intents: [
      {
        label: "독니로 물기: 출혈 4 부여",
        acts: [{ op: "statusPlayer", key: "bleed", n: 4 }],
      },
      {
        label: "송곳니로 물기: 7 피해",
        acts: [{ op: "damagePlayer", n: 7 }],
      },
      {
        label: "단번에 물기: 출혈 2 부여, 6 피해)",
        acts: [
          { op: "statusPlayer", key: "bleed", n: 2 },
          { op: "damagePlayer", n: 6 },
        ],
      },

    ],
  },

  {
    id: "gravity_echo",
    name: "중력의 잔향",
    maxHp: 26,
    intents: [
      {
        label: "하중 인장",
        acts: [{ op: "damagePlayerByDeckSize", base: 5, per: 2, div: 6, cap: 18 }],
      },
      {
        label: "압축: 7 피해",
        acts: [{ op: "damagePlayer", n: 7 }],
      },
      {
        label: "놓치게 만들기: S -3",
        acts: [{ op: "supplies", n: -3 }],
      },
    ],
  },





  {
    id: "boss_gravity_master",
    name: "중력 통달자",
    omen: "몸이 점점 무겁다. 몸을 가볍게 하라.",
    maxHp: 70,
    intents: [
      { label: "중력 수축: 약화 3 부여", acts: [{ op: "statusPlayer", key: "weak", n: 3 }] },
      { label: "특이점 생성", acts: [{ op: "damagePlayerByDeckSize", base: 8, per: 3, div: 5, cap: 30 }] },
      { label: "천장 붕괴: 11 피해", acts: [{ op: "damagePlayer", n: 11 },] },
    ],
  },

  
  {
    id: "boss_cursed_wall",
    name: "저주받은 벽",
    omen: "움직이지 않는다. 당신이 닳아간다.",
    maxHp: 120,
    intents: [
      { label: "저주의 기운: F +1", acts: [{ op: "fatiguePlayer", n: 1 }] },
      { label: "아무 행동도 하지 않음", acts: [] },
    ],
  },

  {
    id: "boss_giant_orc",
    name: "거대한 오크",
    omen: "거대한 무언가가 기다린다.",
    maxHp: 80,
    intents: [
      { label: "내려치기: 15 피해", acts: [{ op: "damagePlayer", n: 15 }] },
      { label: "단단한 피부: 다음 턴 동안 피해를 입지 않음", acts: [{ op: "enemyImmuneNextTurn" }] },
      { label: "타고난 회복: 자신 HP 15 회복", acts: [{ op: "enemyHealSelf", n: 15 }]}
    ],
  },

  {
    id: "boss_soul_stealer",
    name: "영혼 강탈자",
    omen: "행동하지 않으면 종말이 온다.",
    maxHp: 60,
    intents: [
      { label: "허기: 7 피해, S -2", acts: [{ op: "damagePlayer", n: 7 }, { op: "supplies", n: -2 }] },
      { label: "나태: 7 피해, F +1", acts: [{ op: "damagePlayer", n: 7 }, { op: "fatiguePlayer", n: 1 }] },
      { label: "예언: 카운트 진행", acts: [] },
    ],
  },

];

export const enemiesById: Record<string, EnemyData> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
