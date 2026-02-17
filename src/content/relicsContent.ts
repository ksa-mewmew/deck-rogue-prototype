import type { GameState } from "../engine/types";
import type { DamageContext } from "../engine/relics";
import { healPlayer } from "../engine/effects";
import { logMsg, aliveEnemies, applyStatusTo } from "../engine/rules";

export type RelicDef = {
  id: string;
  name: string;
  text: string;

  art?: string;

  dormantName?: string;
  dormantText?: string;
  unlockHint?: string;

  unlockFlavor?: string | ((g: GameState) => string);

  unlock?: (g: GameState) => boolean;
  onActivate?: (g: GameState) => void;

  onCombatStart?: (g: GameState) => void;
  onVictory?: (g: GameState) => void;

  modifyDamage?: (g: GameState, ctx: DamageContext) => number;
  onUpkeepEnd?: (g: GameState) => void;
};

export function listAllRelicIds(): string[] {
  return Object.keys(RELICS_BY_ID).sort((a, b) => a.localeCompare(b));
}

export const RELICS_BY_ID: Record<string, RelicDef> = {
  relic_unknown_square: {
    id: "relic_unknown_square",
    dormantName: "젖은 사각형",
    dormantText: "곰팡이일까? 먹을 수 있을까?",
    unlockHint: "조건: 휴식 1회",

    art: "assets/relics/relic_unknown_square.png",

    unlock: (g) => (g.run as any).unlock?.rest >= 1,

    name: "먹을 수 있는 사각형",
    text: "전투 시작 시 🌾 S +1",
    unlockFlavor: "먹을 수는 있다. 일단은.",
    onCombatStart(g) {
      g.player.supplies += 1;
      logMsg(g, "유물[먹을 수 있는 사각형]: S +1");
    },
  },

  relic_monster_leather_helm: {
    id: "relic_monster_leather_helm",
    dormantName: "들러붙는 가죽",
    dormantText: "털과 피가 뒤섞인 가죽이 손에 들러붙는다.",
    unlockHint: "조건: 엘리트 전투 승리 1회",

    art: "assets/relics/relic_monster_leather_helm.png",

    unlock: (g) => (g.run as any).unlock?.eliteWins >= 1,

    name: "몬스터 가죽 투구",
    text: "첫 턴에 🛡️ 방어 +4",
    unlockFlavor: "머리에 들러붙어 떨어지지 않지만 당장의 문제는 아니다.",
    onCombatStart(g) {
      g.player.block += 4;
      logMsg(g, "유물[몬스터 가죽 투구]: 방어 +4");
    },
  },

  relic_smoke_bomb: {
    id: "relic_smoke_bomb",
    dormantName: "속이 비어 있는 탄환",
    dormantText: "흔들면 작은 알갱이가 굴러다닌다. 연기가 조금씩 샌다.",
    unlockHint: "조건: 한 번에 10 이상의 🗡️ 피해 1회 받기",

    art: "assets/relics/relic_smoke_bomb.png",

    unlock: (g) => !!(g.run as any).unlock?.tookBigHit10,

    name: "연막탄",
    text: "활성화 시 연막 카드(소실) 1장 획득",
    unlockFlavor: "비상 탈출 버튼!",
    onActivate(g) {
      const SMOKE_DEF_ID = "smoke_vanish";

      g.uidSeq += 1;
      const uid = String(g.uidSeq);
      g.cards[uid] = { uid, defId: SMOKE_DEF_ID, zone: "deck", upgrade: 0 } as any;
      g.deck.push(uid);
      logMsg(g, "유물[연막탄]: 연막 카드 1장 획득");
    },
  },

  relic_bone_compass: {
    id: "relic_bone_compass",
    dormantName: "길을 잃는 바늘",
    dormantText: "방향을 가리키지 못하는 바늘이 주머니 바깥으로 나온다.",
    unlockHint: "조건: 탐험 5회",

    art: "assets/relics/relic_bone_compass.png",

    unlock: (g) => (g.run?.nodePickCount ?? 0) >= 5,

    name: "뼈가 만든 나침반",
    text: "전투 시작 시 🃏 드로우 +1",
    unlockFlavor: "어디를 가리키는 것이지?",
    onCombatStart(g) {

      (g as any)._combatStartExtraDraw = ((g as any)._combatStartExtraDraw ?? 0) + 1;
      logMsg(g, "유물[뼈가 만든 나침반]: 전투 시작 드로우 +1");
    },
  },

  relic_flesh_whetstone: {
    id: "relic_flesh_whetstone",
    dormantName: "이가 빠진 칼날",
    dormantText: "어디에 쓰라고 있는지 모르겠다.",
    unlockHint: "조건: 적 처치 3회",

    art: "assets/relics/relic_flesh_whetstone.png",

    unlock: (g) => ((g.run as any).unlock?.kills ?? 0) >= 3,

    name: "속살을 찾는 숫돌",
    text: "전투에서 첫 공격이 주는 🗡️ 피해 +2",
    unlockFlavor: "밤마다 무언가 갈고 있다.",
    onCombatStart(g) {
      (g as any)._firstPlayerAttackDoneThisCombat = false;
    },
    modifyDamage(g, ctx) {
      if (ctx.phase !== "PRE_STATUS") return ctx.current;
      if (ctx.target === "ENEMY" && ctx.source === "PLAYER_ATTACK") {
        const anyG = g as any;
        if (!anyG._firstPlayerAttackDoneThisCombat) {
          anyG._firstPlayerAttackDoneThisCombat = true;
          return ctx.current + 2;
        }
      }
      return ctx.current;
    },
  },

  relic_weak_bell: {
    id: "relic_weak_bell",
    dormantName: "새까만 종",
    dormantText: "만지면 손끝이 무겁다. 당장엔 아무 일도 없다.",
    unlockHint: "조건: 🥀 약화를 받은 상태로 턴 종료 1회",

    art: "assets/relics/relic_weak_bell.png",

    unlock: (g) => !!(g.run as any).unlock?.endedTurnWeak,

    name: "허약의 종소리",
    text: "전투 시작 시 모든 적에게 🥀 약화 +2",
    unlockFlavor: "왠지 들으면 마음이 평온해진다.",
    onCombatStart(g) {
      const targets = aliveEnemies(g);
      for (const e of targets) applyStatusTo(e, "weak", 2, g, "SYSTEM");
      if (targets.length) logMsg(g, "유물[허약의 종소리]: 모든 적 약화 +2");
    },
  },


  relic_return_path_memory: {
    id: "relic_return_path_memory",
    dormantName: "찢어진 지도 조각",
    dormantText: "읽을 수 없는 길이 그려져 있다. 가보고 싶다.",
    unlockHint: "조건: 이벤트 2회 선택",

    art: "assets/relics/relic_return_path_memory.png",

    unlock: (g) => ((g.run as any).unlock?.eventPicks ?? 0) >= 2,

    name: "돌아온 길의 기억",
    text: "전투 승리 시 HP +2",
    unlockFlavor: "왔기에 갈 수 없다.",
    onVictory(g) {
      healPlayer(g, 2);
      logMsg(g, "유물[돌아온 길의 기억]: 승리 회복 +2");
    },
  },

  relic_wound_vial: {
    id: "relic_wound_vial",
    dormantName: "반이나 남은 붉은 액체",
    dormantText: "마개를 열지 않았는데도 피 냄새가 난다.",
    unlockHint: "조건: HP가 15 이하로 떨어진 적 1회",

    art: "assets/relics/relic_wound_vial.png",

    unlock: (g) => !!(g.run as any).unlock?.hpLeq15,

    name: "상처로 기어가는 약병",
    text: "전투 시작 시 HP +2",
    unlockFlavor: "씨앗이 있었나?",
    onCombatStart(g) {
      healPlayer(g, 2);
      logMsg(g, "유물[상처로 기어가는 약병]: 전투 시작 회복 +2");
    },
  },

  relic_counting_needle: {
    id: "relic_counting_needle",
    dormantName: "멈춘 바늘",
    dormantText: "시계일까? 시계가 아닐까? 둘 다 아니다.",
    unlockHint: "조건: 아무 행동도 하지 않고 턴 종료 1회",

    art: "assets/relics/relic_counting_needle.png",

    unlock: (g) => !!(g.run as any).unlock?.skippedTurn,

    name: "숨을 세는 바늘",
    text: "턴 종료 시 다음 턴 🃏 드로우 +1",
    unlockFlavor: "바늘이 돈다. 아무것도 없이.",
    onUpkeepEnd(g) {
      (g as any)._extraDrawNextTurn = Number((g as any)._extraDrawNextTurn ?? 0) + 1;
      logMsg(g, "유물[숨을 세는 바늘]: 다음 턴 드로우 +1");
    },
  },

  relic_deeper_needle: {
    id: "relic_deeper_needle",
    dormantName: "뼈로 만든 바늘",
    dormantText: "따끔함에 익숙한 지 오래다.",
    unlockHint: "조건: 적에게 🩸 출혈 부여 3회",

    art: "assets/relics/relic_deeper_needle.png",

    unlock: (g) => ((g.run as any).unlock?.bleedApplied ?? 0) >= 3,

    name: "더 깊은 바늘",
    text: "🩸 출혈을 부여할 때마다 +1 추가",
    unlockFlavor: "바늘이 피를 먹고 길어진 것 같다.",

    onCombatStart(g) {
      (g as any)._bleedBonusPerApply = 1;
    },
    onVictory(g) {
      delete (g as any)._bleedBonusPerApply;
    },
  },
};