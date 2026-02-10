import type { GameState } from "../engine/types";
import { logMsg } from "../engine/rules";
import { addFatigue } from "../engine/effects";

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
  options: (g: GameState) => EventOption[];
};

export function pickRandomEvent(): EventDef {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

export const EVENTS: EventDef[] = [
  {
    id: "drop_bag",
    name: "짐 버리기",
    prompt: "짐을 줄여 피로를 낮추자.",
    options: () => [
      {
        key: "drop",
        label: "카드 1장 제거, F -= 1",
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
        label: "카드 1장 제거 후 F += 1",
        apply: (g) => {
          addFatigue(g, 1);
          logMsg(g, "이벤트: 몬스터로부터 숨기 → 카드 제거 후 F+1");
            return { kind: "REMOVE_PICK", title: "숨기", prompt: "제거할 카드 1장을 선택하세요.", then: "NONE" };
          }
      },
    ],
  },

  {
    id: "overweight",
    name: "과중량",
    prompt: "너무 많은 짐이 피로를 부른다!",
    options: (g) => {
      const deckSize = Object.values(g.cards).filter((c) =>
        ["deck", "hand", "discard"].includes(c.zone)
      ).length;

      const add = Math.floor(deckSize / 5);

      return [
        {
          key: "accept",
          label: `F +${add} (버림)`,
          apply: (g2) => {
            addFatigue(g2, add);
            logMsg(g2, `이벤트: 과중량 (덱 ${deckSize}장 → F +${add})`);
            return "NONE";
          },
        },
      ];
    },
  },


  {
    id: "goblin_ambush_low_supplies",
    name: "매복한 약탈자들",
    prompt:
      "고블린들이 보급을 약탈했다.\n" +
      "이번 전투는 보급(S) 5로 시작합니다.",
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
    options: () => [
      {
        key: "eat",
        label: "F -= 2, 다음 전투 시작 S +5",
        apply: (g) => {
          g.player.fatigue = Math.max(0, g.player.fatigue - 2);
          g.run.nextBattleSuppliesBonus += 5;
          logMsg(g, "식용 버섯: F -2, 다음 전투 시작 S +5");
          return "NONE";
        },
      },
    ],
  },
];