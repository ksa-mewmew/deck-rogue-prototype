import type { EnemyData, EnemyIntentData, IntentMeta } from "../engine/types";

export const ENEMIES = [

  {
    id: "other_adventurer",
    name: "보물을 노리는 다른 모험가",
    maxHp: 60,
    intents: [
      { label: "창 찌르기: 5 피해, 3번 발동", acts:
        [{ op: "damagePlayer", n: 5 }, { op: "damagePlayer", n: 5 }, { op: "damagePlayer", n: 5 }] },
      { label: "독약 뿌리기: 출혈 +4, 취약 +4, 약화 +4 부여", acts: [
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
        label: "기습: 12 - 이번 턴에 사용한 카드의 수만큼 피해",
        acts: [{ op: "damagePlayerFormula", kind: "goblin_raider" }],
      },
      {
        label: "훔치기: 출혈 +2 부여, S -3",
        acts: [{ op: "supplies", n: -3 }, { op: "statusPlayer", key: "bleed", n: 2 }],
      },
    ],
  },
  {
    id: "watching_statue",
    name: "감시하는 석상",
    maxHp: 25,
    passives: [
      { id: "ramp_atk_1", icon: "👁️", name: "감시의 축적", text: "매 턴 공격력이 +1 증가합니다." },
    ],
    intents: [
      {
        label: "감시: 4 + 이번 턴에 사용한 카드의 수만큼 피해",
        acts: [{ op: "damagePlayerFormula", kind: "watching_statue" }],
      },
    ],
  },
  {
    id: "pebble_golem",
    name: "조약돌 골렘",
    maxHp: 30,
    passives: [
      { id: "ramp_atk_1", icon: "🪨", name: "돌의 경화", text: "매 턴 공격력이 +1 증가합니다." },
    ],
    intents: [
      { label: "조약돌 던지기: 8 피해", acts: [{ op: "damagePlayer", n: 8 }] },
      { label: "모래 모으기: 자신 HP 6 회복", acts: [{ op: "enemyHealSelf", n: 6 }] },
    ],
  },

  {
    id: "rock_golem",
    name: "바위 골렘",
    maxHp: 50,
    passives: [
      { id: "ramp_atk_2", icon: "⛰️", name: "거대화", text: "매 턴 공격력이 +2 증가합니다." },
    ],
    intents: [
      { label: "바위 던지기: 10 피해", acts: [{ op: "damagePlayer", n: 10 }] },
      { label: "땅 모으기: 자신 HP 8 회복", acts: [{ op: "enemyHealSelf", n: 8 }] },
    ],
  },
  {
    id: "slime",
    name: "슬라임",
    maxHp: 30,
    intents: [
      {label: "산성액: 출혈 +3 부여",
        acts: [{ op: "statusPlayer", key: "bleed", n: 3 }]},
      {
        label: "점액: 약화 +3 부여 후 자신 HP 3 회복",
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
        label: "독니로 물기: 출혈 +4 부여",
        acts: [{ op: "statusPlayer", key: "bleed", n: 4 }],
      },
      {
        label: "송곳니로 물기: 7 피해",
        acts: [{ op: "damagePlayer", n: 7 }],
      },
      {
        label: "단번에 물기: 출혈 +2 부여, 6 피해",
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
    maxHp: 35,
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
    id: "rat_swarm",
    name: "쥐떼",
    maxHp: 20,
    intents: [
      {
        label: "뜯기: 4 피해, 2번 발동",
        acts: [{ op: "damagePlayer", n: 4 }, { op: "damagePlayer", n: 4 }],
      },
      {
        label: "기습하기: 취약 +2 부여",
        acts: [{ op: "statusPlayer", key: "vuln", n: 2 }],
      },
      {
        label: "광란: 2 피해 (타수가 증가합니다!) ",
        acts: [{ op: "damagePlayerRampHits", n: 2, baseHits: 1, everyTurns: 1, capHits: 6 }],
      },
    ],
  },
  {
    id: "goblin_commander",
    name: "고블린 지휘관",
    maxHp: 30,
    intents: [
      {
        label: "호령: 취약 +2 부여",
        acts: [{ op: "statusPlayer", key: "vuln", n: 2 }],
      },
      {
        label: "발로 차기: 7 피해",
        acts: [{ op: "damagePlayer", n: 7 }],
      },
      {
        label: "전술 지시: 약화 +2 부여",
        acts: [{ op: "statusPlayer", key: "weak", n: 2 }],
      },
    ],
  },

  {
    id: "goblin_archer",
    name: "고블린 궁수",
    maxHp: 15,
    intents: [
      {
        label: "조준: 2 피해, 3번",
        acts: [
          { op: "damagePlayer", n: 2 },
          { op: "damagePlayer", n: 2 },
          { op: "damagePlayer", n: 2 },
        ],
      },
      {
        label: "연사: 1 피해 (타수가 증가합니다!)",
        acts: [{ op: "damagePlayerRampHits", n: 1, baseHits: 1, everyTurns: 1, capHits: 10 }],
      },
    ],
  },



  {
    id: "goblin_assassin",
    name: "고블린 암살자",
    maxHp: 22,
    passives: [
      {
        id: "shadow_veil",
        icon: "👥",
        name: "그림자 장막",
        text: "왼쪽에 적이 있을 때, 공격(대상 지정)으로 때릴 수 없습니다.",
      },
    ],
    intents: [
      {
        label: "조준: 암살 수치 +1",
        acts: [{ op: "enemySetAssassinAim", n: 1 }],
      },
      {
        label: "암살: 8 + 암살 수치×2 피해",
        acts: [{ op: "damagePlayerFormula", kind: "goblin_assassin" }],
      },
      {
        label: "재정비: 자신 HP 5 회복",
        acts: [{ op: "enemyHealSelf", n: 5 }],
      },
    ],
  },

  {
    id: "old_monster_corpse",
    name: "오래된 괴물 사체",
    maxHp: 30,
    passives: [
      {
        id: "rotten_rage",
        icon: "☠️",
        name: "썩은 분노",
        text: "다른 적이 죽을 때마다 분노 +1 (분노당 공격 +4).",
      },
    ],
    intents: [
      {
        label: "투척: 9 + 분노×4 피해",
        acts: [{ op: "damagePlayerFormula", kind: "old_monster_corpse" }],
      },
      {
        label: "질척임: 자신 HP 6 회복",
        acts: [{ op: "enemyHealSelf", n: 6 }],
      },
    ],
  },

  {
    id: "punishing_one",
    name: "징벌하는 자",
    maxHp: 60,
    passives: [
      {
        id: "punish_hand",
        icon: "⚖️",
        name: "징벌",
        text: "플레이어 손패 1장당 공격 피해 +2.",
      },
    ],
    intents: [
      {
        label: "심판: 6 + 손패×2 피해",
        acts: [{ op: "damagePlayerFormula", kind: "punishing_one" }],
      },
      {
        label: "추궁: 약화 +2 부여",
        acts: [{ op: "statusPlayer", key: "weak", n: 2 }],
      },
    ],
  },

  {
    id: "gloved_hunter",
    name: "장갑 낀 사냥꾼",
    maxHp: 52,
    intents: [
      {
        label: "가늠: 취약 +3 부여",
        acts: [{ op: "statusPlayer", key: "vuln", n: 3 }],
      },
      {
        label: "사냥: 6 피해, 방어가 4 이상이면 대신 12 피해",
        acts: [{ op: "damagePlayerFormula", kind: "gloved_hunter" }],
      },
      {
        label: "사살: 9 피해",
        acts: [{ op: "damagePlayer", n: 9 }],
      },
    ],
  },

  {
    id: "debt_collector",
    name: "장부 수금관",
    maxHp: 55,
    intents: [
      { label: "수금: S -3", acts: [{ op: "supplies", n: -4 }] },
      { label: "압류: (S가 0이면) 15 피해", acts: [{ op: "damagePlayerIfSuppliesZero", n: 15 }] },
      { label: "재점검: 아무 행동도 하지 않음", acts: [] },
    ],
  },

  {
    id: "supply_hound",
    name: "보급 사냥개",
    maxHp: 26,
    intents: [
      { label: "냄새 맡기: 취약 +2 부여", acts: [{ op: "statusPlayer", key: "vuln", n: 2 }] },
      { label: "덮치기: (S가 0이 아니면) 7 피해", acts: [{ op: "damagePlayerIfSuppliesPositive", n: 7 }] },
      { label: "뜯어내기: S -2", acts: [{ op: "supplies", n: -2 }] },
    ],
  },

  {
    id: "archive_censor",
    name: "서고의 검열관",
    maxHp: 34,
    intents: [
      {
        label: "검열 주문: 교란 +2 부여",
        acts: [{ op: "statusPlayer", key: "disrupt", n: 2 }],
      },
      {
        label: "압수: S -2",
        acts: [{ op: "supplies", n: -2 }],
      },
      {
        label: "깃펜 찌르기: 7 피해, 약화 +2 부여",
        acts: [{ op: "damagePlayer", n: 7 }, { op: "statusPlayer", key: "weak", n: 2 }],
      },
    ],
  },



  {
    id: "boss_gravity_master",
    name: "중력 통달자",
    omen: "몸이 점점 무겁다. 짐을 비워라.",
    maxHp: 90,
    intents: [
      { label: "중력 수축: 약화 +3 부여", acts: [{ op: "statusPlayer", key: "weak", n: 3 }] },
      { label: "특이점 생성", acts: [{ op: "damagePlayerByDeckSize", base: 8, per: 3, div: 5, cap: 30 }] },
      { label: "천장 붕괴: 11 피해", acts: [{ op: "damagePlayer", n: 11 },] },
    ],
  },


  {
    id: "boss_cursed_wall",
    name: "저주받은 벽",
    omen: "움직이지 않는다. 닳아간다.",
    maxHp: 160,
    intents: [
      { label: "저주의 기운: 출혈 +3 부여", acts: [{ op: "statusPlayer", key: "bleed", n: 3 }] },
      { label: "저주의 기운: F +1", acts: [{ op: "fatiguePlayer", n: 1 }] },
      { label: "아무 행동도 하지 않음", acts: [] },
    ],
  },

  {
    id: "boss_giant_orc",
    name: "거대한 오크",
    omen: "거대한 짐승이 기다린다. 힘을 깎아야 한다.",
    maxHp: 95,
    intents: [
      { label: "내려치기: 취약 +2 부여, 10 피해", acts: [{ op: "statusPlayer", key: "vuln", n: 2 }, { op: "damagePlayer", n: 15 }] },
      { label: "단단한 피부: 다음 턴 동안 피해를 입지 않음", acts: [{ op: "enemyImmuneNextTurn" }] },
      { label: "타고난 회복: 자신 HP 15 회복", acts: [{ op: "enemyHealSelf", n: 15 }]},
      {
        label: "광분: 6 피해 (타수가 증가합니다!)",
        acts: [
          { op: "damagePlayerRampHits", n: 6, baseHits: 1, everyTurns: 1, capHits: 6 },
        ],
        meta: { cat: "ATTACK" },
      }
    ],
  },

  {
    id: "boss_soul_stealer",
    name: "영혼 강탈자",
    omen: "행동하지 않으면 종말이 온다.",
    maxHp: 80,
    intents: [
      { label: "허기: 7 피해, S -2", acts: [{ op: "damagePlayer", n: 7 }, { op: "supplies", n: -2 }] },
      { label: "나태: 7 피해, F +1", acts: [{ op: "damagePlayer", n: 7 }, { op: "fatiguePlayer", n: 1 }] },
      { label: "예언: 카운트 진행", acts: [] },
    ],
  },

] satisfies EnemyData[];

export const enemiesById: Record<string, EnemyData> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));