import type { GameState } from "../engine/types";
import { logMsg, pickOne, madnessP, rollMad } from "../engine/rules";
import { addFatigue } from "../engine/effects";
import { addCardToDeck, removeRandomCardFromDeck } from "../content/rewards"; 


export type EventOutcome =
  | "NONE"
  | "BATTLE"
  | "REWARD"
  | { kind: "UPGRADE_PICK"; title?: string; prompt?: string }
  | { kind: "REMOVE_PICK"; title: string; prompt?: string; then: "NONE" | "REWARD" | "BATTLE" }
  | { kind: "BATTLE_SPECIAL"; enemyIds: string[]; title?: string };

export type EventOption = {
  key: string;
  label: string;
  detail?: string;
  apply: (g: GameState) => EventOutcome;
};

export type EventDef = {
  id: string;
  name: string;
  prompt: string;
  art?: string;
  options: (g: GameState) => EventOption[];
};

export function pickRandomEvent(): EventDef {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

export function pickEventByMadness(g: GameState) {
  const { tier } = madnessP(g);
  const pNightmare = tier === 0 ? 0 : tier === 1 ? 0.25 : tier === 2 ? 0.55 : 0.85;

  if (Math.random() < pNightmare) {
    // 악몽 풀 (따로 배열/함수로 관리)
    return pickRandomNightmareEvent(g);
  }
  return pickRandomEvent();
}

export const BOSS_OMEN_HINT: Record<string, string> = {
  boss_cursed_wall: "움직이지 않는다. 당신이 닳아간다.",
  boss_giant_orc: "거대한 무언가가 기다린다.",
  boss_soul_stealer: "행동하지 않으면 종말이 온다.",
  boss_gravity_master: "몸이 점점 무겁다. 몸을 가볍게 하라.",
};

// ===== 광기(악몽) 이벤트 풀 =====

const base = import.meta.env.BASE_URL;

export const MAD_EVENTS: EventDef[] = [
  {
    id: "mad_mirror",
    name: "거울에 잠긴 물",
    prompt: "물 속의 당신이 먼저 웃습니다.",
    art: `${base}assets/events/event_mad_mirror.png`,
    options: (g) => [
      {
        key: "mad_mirror:take",
        label: "손을 넣는다",
        detail: "카드 보상. F +2.",
        apply: (gg) => {
          addFatigue(gg, 2);
          logMsg(gg, "거울: 무언가를 건져 올렸다. (F +2)");
          return "REWARD";
        },
      },
      {
        key: "mad_mirror:leave",
        label: "외면한다",
        apply: (gg) => {
          logMsg(gg, "거울: 당신은 물러났다.");
          return "NONE";
        },
      },
    ],
  },

  {
    id: "mad_contract",
    name: "젖은 계약서",
    prompt: "곰팡이 냄새가 납니다.",
    art: `${base}assets/events/event_mad_contract.png`,
    options: (g) => [
      {
        key: "mad_contract:sign",
        label: "서명한다",
        detail: "최대 HP +2. 카드 1장 제거 후 보상.",
        apply: (gg) => {
          gg.player.maxHp += 2;
          gg.player.hp = Math.min(gg.player.maxHp, gg.player.hp + 2);
          logMsg(gg, "계약: 최대 HP +2");
          return { kind: "REMOVE_PICK", title: "대가", prompt: "제거할 카드 1장을 선택하세요.", then: "REWARD" };
        },
      },
      {
        key: "mad_contract:burn",
        label: "찢어버린다",
        detail: "F +1",
        apply: (gg) => {
          addFatigue(gg, 1);
          logMsg(gg, "불길함: F +1");
          return "NONE";
        },
      },
    ],
  },

  {
    id: "mad_lullaby",
    name: "자장가",
    prompt: "잠들면 회복하지만, 깨어나면 잊습니다.",
    art: `${base}assets/events/event_mad_lullaby.png`,
    options: (g) => [
      {
        key: "mad_lullaby:sleep",
        label: "잠든다",
        detail: "HP +12. 덱에서 무작위 1장 소실.",
        apply: (gg) => {
          gg.player.hp = Math.min(gg.player.maxHp, gg.player.hp + 12);
          removeRandomCardFromDeck(gg);
          logMsg(gg, "자장가: HP 회복, 그러나 잊었다… (무작위 1장 소실)");
          return "NONE";
        },
      },
      {
        key: "mad_lullaby:stay",
        label: "버틴다",
        detail: "F -1",
        apply: (gg) => {
          addFatigue(gg, -1);
          logMsg(gg, "버팀: F -1");
          return "NONE";
        },
      },
    ],
  },
];

export function pickRandomNightmareEvent(_g: GameState): EventDef {
  return MAD_EVENTS[Math.floor(Math.random() * MAD_EVENTS.length)];
}


export const EVENTS: EventDef[] = [
  {
    id: "drop_bag",
    name: "짐 버리기",
    prompt: "짐을 줄여 피로를 낮추자.",
    art: `${base}assets/events/event_drop_bag.png`,
    options: () => [
      {
        key: "drop",
        label: "카드 1장 제거, F -1",
        apply: (g) => {
          addFatigue(g, -1);
          logMsg(g, "이벤트: 짐 버리기 → 제거할 카드를 선택하세요.");
          return { kind: "REMOVE_PICK", title: "짐 버리기", prompt: "제거할 카드 1장을 선택하세요.", then: "NONE" };
        }
      },
      {
        key: "skip",
        label: "아무것도 하지 않는다",
        apply: (g) => {
          logMsg(g, "이벤트: 짐 버리기(생략)");
          return "NONE";
        },
      },
    ],
  },

  {
    id: "hide_from_monster",
    name: "몬스터로부터 숨기",
    prompt: "전투하거나, 대가를 치르고 숨을 수 있다.",
    art: `${base}assets/events/event_hide_from_monster.png`,
    options: () => [
      {
        key: "fight",
        label: "전투",
        apply: (g) => {
          logMsg(g, "이벤트: 몬스터로부터 숨기 → 전투 선택");
          return "BATTLE";
        },
      },
      {
        key: "remove_and_fatigue",
        label: "카드 1장 제거 후 F +1",
        apply: (g) => {
          addFatigue(g, 1);
          logMsg(g, "이벤트: 몬스터로부터 숨기 → 카드 제거 후 F+1");
            return { kind: "REMOVE_PICK", title: "숨기", prompt: "제거할 카드 1장을 선택하세요.", then: "NONE" };
          }
      },
    ],
  },

  {
    id: "goblin_ambush_low_supplies",
    name: "매복한 약탈자들",
    prompt:
      "고블린들이 보급을 약탈했다.\n" +
      "이번 전투는 보급(S) 5로 시작합니다.",
    art: `${base}assets/events/event_goblin_ambush_low_supplies.png`,
    options: () => [
      {
        key: "fight",
        label: "맞서 싸운다",
        detail: "고블린 약탈자 2마리 전투 (S=5 시작)",
        apply: (g: any) => {
          g.run.nextBattleSuppliesBonus = -5;
          return { kind: "BATTLE_SPECIAL", title: "고블린 매복", enemyIds: ["goblin_raider", "goblin_raider"] };
        },
      },
    ],
  },

  {
    id: "find_adventurer",
    name: "다른 모험가 발견",
    prompt: "거래한다.",
    art: `${base}assets/events/event_find_adventurer.png`,
    options: (g: GameState) => {

      if (g.run.treasureObtained) {
        return [
          {
            key: "adventurer:forced_battle",
            label: "대치한다",
            detail: "보물을 노리고 덤벼든다.",
            apply: (_g: GameState) => ({
              kind: "BATTLE_SPECIAL",
              enemyIds: ["other_adventurer"],
              title: "보물을 노리는 모험가",
            }),
          },
        ];
      }

      return [
        {
          key: "trade",
          label: "카드 1장 제거 후 카드 보상(2장 중 1장)",
          apply: (gg) => {
            logMsg(gg, "이벤트: 다른 모험가 발견 → 제거할 카드 선택 후 보상");
            return { kind: "REMOVE_PICK", title: "다른 모험가 발견", prompt: "제거할 카드 1장을 선택하세요.", then: "REWARD" };
          }
        },
        {
          key: "leave",
          label: "지나친다",
          apply: (gg) => {
            logMsg(gg, "이벤트: 다른 모험가 발견(생략)");
            return "NONE";
          },
        },
      ];
    },
  },

  {
    id: "edible_mushroom",
    name: "식용 버섯 발견",
    prompt: "기운이 난다. 다음 전투의 시작 보급이 늘어난다.",
    art: `${base}assets/events/event_edible_mushroom.png`,
    options: () => [
      {
        key: "eat",
        label: "F -2, 다음 전투 시작 S +5",
        apply: (g) => {
          g.player.fatigue = Math.max(0, g.player.fatigue - 2);
          g.run.nextBattleSuppliesBonus += 5;
          logMsg(g, "식용 버섯: F -2, 다음 전투 시작 S +5");
          return "NONE";
        },
      },
    ],
  },

  {
    id: "ominous_prophecy",
    name: "불길한 예언",
    prompt: "불길한 속삭임이 귓가를 맴돈다. 대가를 치르고 미래를 엿볼까?",
    art: `${base}assets/events/event_ominous_prophecy.png`,
    options: (g: GameState) => [
      {
        key: "omen:listen",
        label: "예언을 듣는다",
        detail: "F +1. 다음 보스를 확정하고 공개합니다.",
        apply: (g2) => {
          addFatigue(g2, 1);
          logMsg(g2, "불길한 예언: F +1");

          if (!g2.run.nextBossId) {
            if (g2.run.bossPool.length > 0) {
              g2.run.nextBossId = pickOne(g2.run.bossPool);
            } else {
              g2.run.nextBossId = null;
            }
          }

          if (!g2.run.nextBossId) {
            logMsg(g2, "예언: 미래가 흐릿하다. (보스가 남아있지 않음)");
            return "NONE";
          }

          const bossDef = g2.content.enemiesById[g2.run.nextBossId];
          const hint = BOSS_OMEN_HINT[g2.run.nextBossId] ?? "정체불명의 위협이 다가온다.";
          g2.run.bossOmenText = `${hint}`;
          logMsg(g2, `예언: ${hint}`);

          return "NONE";
        },
      },
      {
        key: "omen:ignore",
        label: "무시한다",
        detail: "아무 일도 일어나지 않습니다.",
        apply: (g2) => {
          logMsg(g2, "불길한 예언(무시)");
          return "NONE";
        },
      },
    ],
  },



] as const;

export function getEventById(id: string) {
  return EVENTS.find((e) => e.id === id) ?? null;
}


export function applyWhisperDeal(g: GameState) {
  const { tier: t } = madnessP(g);

  // 이득 테이블
  const gains = [
    () => {
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + (t >= 2 ? 14 : 10));
      logMsg(g, "속삭임: HP 회복");
    },
    () => {
      addCardToDeck(g, "mad_echo", { upgrade: 0 });
      logMsg(g, "속삭임: [메아리]를 얻었다");
    },
    () => {
      addCardToDeck(g, "mad_insight", { upgrade: 0 });
      logMsg(g, "속삭임: [금단의 통찰]을 얻었다");
    },
  ];

  // 대가 테이블
  const costs = [
    () => { addFatigue(g, 1); logMsg(g, "대가: F +1"); },
    () => { g.player.hp = Math.max(0, g.player.hp - 6); logMsg(g, "대가: HP -6"); },
    () => { removeRandomCardFromDeck(g); logMsg(g, "대가: 덱에서 카드 1장 소실"); },
  ];

  pickOne(gains)();
  pickOne(costs)();

  const pExtraCost = t === 1 ? 0.15 : t === 2 ? 0.35 : 0.55;
  if (Math.random() < pExtraCost) pickOne(costs)();

  if (t >= 2 && rollMad(g, 0.10)) {
    addCardToDeck(g, "mad_bargain", { upgrade: 0 });
    addFatigue(g, 1);
    logMsg(g, "속삭임: 거래가 확대되었다… (추가 카드, 추가 F)");
  }
}
