import type { GameState } from "../engine/types";
import { logMsg, pickOne } from "../engine/rules";
import { addFatigue } from "../engine/effects";

export type EventOptionOutcome =
  | "NONE"
  | "BATTLE"
  | "REWARD_PICK"
  | { kind: "REMOVE_PICK"; title: string; prompt?: string; then: "NONE" | "REWARD_PICK" | "BATTLE"; };

export type EventOption = {
  key: string;
  label: string;
  detail?: string;
  apply: (g: GameState) => EventOptionOutcome;
};

export type EventDef = {
  id: string;
  name: string;
  prompt?: string;
  options: (g: GameState) => EventOption[];
};

export const EVENTS: EventDef[] = [
  {
    id: "drop_bag",
    name: "짐 버리기",
    prompt: "짐을 줄여 피로를 낮춥니다.",
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
    prompt: "전투를 피하거나, 대가를 치르고 숨을 수 있습니다.",
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
            return { kind: "REMOVE_PICK", title: "짐 버리기", prompt: "제거할 카드 1장을 선택하세요.", then: "NONE" };
          }
      },
    ],
  },

  {
    id: "overweight",
    name: "과중량",
    prompt: "너무 많은 짐이 피로를 부릅니다.",
    options: () => [
      {
        key: "accept",
        label: "F += (덱 매수)/10 (버림)",
        apply: (g) => {
          const deckSize = Object.values(g.cards).filter((c) => ["deck", "hand", "discard"].includes(c.zone)).length;
          const add = Math.floor(deckSize / 10);
          addFatigue(g, add);
          logMsg(g, `이벤트: 과중량 (덱 ${deckSize}장 → F +${add})`);
          return "NONE";
        },
      },
    ],
  },

  {
    id: "find_adventurer",
    name: "다른 모험가 발견",
    prompt: "거래를 하거나, 보물을 가진 상태라면 싸움을 피하기 어렵습니다.",
    options: (g) => {
      if (g.run.treasureObtained) {
        return [
          {
            key: "forced_battle",
            label: "보물을 노린다! → 전투 돌입",
            apply: (gg) => {
              logMsg(gg, "이벤트: 다른 모험가 발견(보물 보유) → 전투 강제");
              return "BATTLE";
            },
          },
        ];
      }

      return [
        {
          key: "trade",
          label: "카드 1장 제거 후 카드 보상(2장 중 1장)",
          apply: (gg) => {
            logMsg(gg, "이벤트: 다른 모험가 발견 → 제거할 카드 선택 후 보상");
            return { kind: "REMOVE_PICK", title: "다른 모험가 발견", prompt: "제거할 카드 1장을 선택하세요.", then: "REWARD_PICK" };
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
          // 현재는 '다음 전투 시작' 버프 시스템이 없으니 임시로 즉시 S+5
          g.player.fatigue = Math.max(0, g.player.fatigue - 2);
          g.run.nextBattleSuppliesBonus += 5; // ✅ 다음 전투 시작 S +5
          logMsg(g, "식용 버섯: F -2, 다음 전투 시작 S +5");
          return "NONE";
        },
      },
    ],
  },
];

export function pickRandomEvent(): EventDef {
  return pickOne(EVENTS);
}
