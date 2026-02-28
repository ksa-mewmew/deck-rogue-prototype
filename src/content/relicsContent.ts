import type { RelicDef } from "../engine/relics";
import { healPlayer, applyDamageToEnemy, addBlock, addSupplies } from "../engine/effects";
import { logMsg, aliveEnemies, applyStatusTo, pickOne } from "../engine/rules";
import { addItemCap } from "../engine/items";


export function listAllRelicIds(): string[] {
  return Object.keys(RELICS_BY_ID).sort((a, b) => a.localeCompare(b));
}

export const EVENT_RELIC_POOL: RelicDef[] = [
  {
    id: "relic_ratskin_charm",
    name: "쥐가죽 부적",
    text: "취약을 받을 때 1 덜 받음",
    unlockFlavor: "살가죽. 얇게, 아주 얇게.",
    tags: ["EVENT_ONLY"],

    art: "assets/relics/relic_ratskin_charm.png",
  },
  {
    id: "relic_wrong_dice",
    name: "잘못된 주사위",
    text: "카드에 적힌 모든 수가 1 증가",
    unlockFlavor: "눈금이 하나씩 어긋나 있다.",
    tags: ["EVENT_ONLY"],

    art: "assets/relics/relic_wrong_dice.png",
  },
]

export const RELICS_BY_ID: Record<string, RelicDef> = {
  relic_unknown_square: {
    id: "relic_unknown_square",
    dormantName: "젖은 사각형",
    dormantText: "곰팡이일까? 먹을 수 있을까?",
    unlockHint: "조건: 휴식 1회",

    art: "assets/relics/relic_unknown_square.png",

    unlock: (g, base) => (g.run.unlock?.rest ?? 0) >= ((base.unlock?.rest ?? 0) + 1),

    name: "먹을 수 있는 사각형",
    text: "전투 시작 시 🍞 S +2",
    unlockFlavor: "먹을 수는 있다. 일단은.",
    onCombatStart(g) {
      g.player.supplies += 2;
      logMsg(g, "유물[먹을 수 있는 사각형]: 🍞 S +2");
    },
  },

  relic_wrong_dice: {
    id: "relic_wrong_dice",
    name: "잘못된 주사위",
    text: "카드에 적힌 모든 수가 1 증가",
    unlockFlavor: "눈금이 하나씩 어긋나 있다.",
    tags: ["EVENT_ONLY"],
    art: "assets/relics/relic_wrong_dice.png",
  },

  relic_monster_leather_helm: {
    id: "relic_monster_leather_helm",
    dormantName: "들러붙는 가죽",
    dormantText: "털과 피가 뒤섞인 가죽이 손에 들러붙는다.",
    unlockHint: "조건: 엘리트 전투 승리 1회",

    art: "assets/relics/relic_monster_leather_helm.png",

    unlock: (g, base) => (g.run.unlock?.eliteWins ?? 0) >= ((base.unlock?.eliteWins ?? 0) + 1),

    name: "몬스터 가죽 투구",
    text: "첫 턴에 🛡️ 방어 +4",
    unlockFlavor: "머리에 들러붙어 떨어지지 않지만 당장의 문제는 아니다.",
    onCombatStart(g) {
      g.player.block += 4;
      logMsg(g, "유물[몬스터 가죽 투구]: 🛡️ 방어 +4");
    },
  },

  relic_smoke_bomb: {
    id: "relic_smoke_bomb",
    dormantName: "속이 비어 있는 탄환",
    dormantText: "흔들면 작은 알갱이가 굴러다닌다. 연기가 조금씩 샌다.",
    unlockHint: "조건: 한 번에 10 이상의 🗡️ 피해 1회 받기",

    art: "assets/relics/relic_smoke_bomb.png",

    unlock: (g, base) => (g.run.unlock?.tookBigHit10 ?? 0) >= (base.unlock.tookBigHit10 + 1),

    name: "연막탄",
    text: "활성화 시 연막 카드(소실) 1장 획득",
    unlockFlavor: "비상 탈출!",
    onActivate(g) {
      const SMOKE_DEF_ID = "smoke";

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
    unlock: (g, base) => {
      const runAny = g.run as any;
      const moves = Number(runAny.timeMove ?? g.run?.nodePickCount ?? 0) || 0;
      return moves >= (base.moves + 5);
    },

    name: "뼈가 만든 나침반",
    text: "전투 시작 시 🃏 드로우 +1",
    unlockFlavor: "어디를 가리키는 것이지?",
    onCombatStart(g) {

      (g as any)._combatStartExtraDraw = ((g as any)._combatStartExtraDraw ?? 0) + 1;
      logMsg(g, "유물[뼈가 만든 나침반]: 전투 시작 🃏 드로우 +1");
    },
  },

  relic_flesh_whetstone: {
    id: "relic_flesh_whetstone",
    dormantName: "이가 빠진 칼날",
    dormantText: "어디에 쓰라고 있는지 모르겠다.",
    unlockHint: "조건: 적 처치 3회",

    art: "assets/relics/relic_flesh_whetstone.png",

    unlock: (g, base) => (g.run.unlock?.kills ?? 0) >= (base.unlock.kills + 3),

    name: "속살을 찾는 숫돌",
    text: "전투에서 첫 공격이 주는 🗡️ 피해 +3",
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
          return ctx.current + 3;
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

    unlock: (g, base) => (g.run.unlock?.endedTurnWeak ?? 0) >= (base.unlock.endedTurnWeak + 1),

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

    unlock: (g, base) => (g.run.unlock?.eventPicks ?? 0) >= (base.unlock.eventPicks + 2),

    name: "돌아온 길의 기억",
    text: "전투 승리 시 HP +3",
    unlockFlavor: "왔기에 갈 수 없다.",
    onVictory(g) {
      healPlayer(g, 3);
      logMsg(g, "유물[돌아온 길의 기억]: 승리 시 HP +3");
    },
  },

  relic_wound_vial: {
    id: "relic_wound_vial",
    dormantName: "반이나 남은 붉은 액체",
    dormantText: "마개를 열지 않았는데도 피 냄새가 난다.",
    unlockHint: "조건: HP가 15 이하로 떨어진 적 1회",

    art: "assets/relics/relic_wound_vial.png",

    unlock: (g, base) => (g.run.unlock?.hpLeq15 ?? 0) >= (base.unlock.hpLeq15 + 1),

    name: "상처로 기어가는 약병",
    text: "전투 시작 시 HP +3",
    unlockFlavor: "씨앗이 있었나?",
    onCombatStart(g) {
      healPlayer(g, 3);
      logMsg(g, "유물[상처로 기어가는 약병]: 전투 시작 시 HP +3");
    },
  },

  relic_counting_needle: {
    id: "relic_counting_needle",
    dormantName: "멈춘 바늘",
    dormantText: "시계일까? 시계가 아닐까? 둘 다 아니다.",
    unlockHint: "조건: 아무 행동도 하지 않고 턴 종료 1회",

    art: "assets/relics/relic_counting_needle.png",

    unlock: (g, base) => (g.run.unlock?.skippedTurn ?? 0) >= (base.unlock.skippedTurn + 1),

    name: "숨을 세는 바늘",
    text: "턴 종료 시 다음 턴 🃏 드로우 +1",
    unlockFlavor: "바늘이 돈다. 아무것도 없이.",
    onUpkeepEnd(g) {
      (g as any)._extraDrawNextTurn = Number((g as any)._extraDrawNextTurn ?? 0) + 1;
      logMsg(g, "유물[숨을 세는 바늘]: 다음 턴 🃏 드로우 +1");
    },
  },

  relic_deeper_needle: {
    id: "relic_deeper_needle",
    dormantName: "뼈로 만든 바늘",
    dormantText: "따끔함에 익숙한 지 오래다.",
    unlockHint: "조건: 적에게 🩸 출혈 부여 3회",

    art: "assets/relics/relic_deeper_needle.png",

    unlock: (g, base) => (g.run.unlock?.bleedApplied ?? 0) >= (base.unlock.bleedApplied + 3),

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

  relic_broken_millstone: {
    id: "relic_broken_millstone",
    dormantName: "금 간 맷돌",
    dormantText: "갈고 있으면 시간 가는 줄 모르겠다.",
    unlockHint: "조건: 시간 10 지나기",

    art: "assets/relics/relic_broken_millstone.png",
    unlock: (g, base) => {
      const runAny = g.run as any;
      const tm = Number(runAny.timeMove ?? 0) || 0;
      const ta = Number(g.time ?? 0) || 0;
      return (tm + ta) >= (base.timeTotal + 10);
    },

    name: "깨진 맷돌",
    text: "매 턴 모든 적에게 🗡️ 2 피해",
    unlockFlavor: "돌이 닳는다. 적도 닳는다.",

    onUpkeepEnd(g) {
      const targets: any[] = aliveEnemies(g) as any;
      if (!targets?.length) return;

      for (const e of targets) {
        let dmg = 2;
        const blk = Number((e as any).block ?? 0);
        if (blk > 0) {
          const used = Math.min(blk, dmg);
          (e as any).block = blk - used;
          dmg -= used;
        }
        if (dmg > 0) {
          const hp = Number((e as any).hp ?? 0);
          (e as any).hp = Math.max(0, hp - dmg);
        }
      }

      logMsg(g, "유물[깨진 맷돌]: 모든 적에게 2 피해");
    },
  },

  relic_torn_pouch: {
    id: "relic_torn_pouch",
    dormantName: "찢어진 주머니",
    dormantText: "비우는 것이 채우는 것.",
    unlockHint: "조건: 아이템 버리기 1회",

    name: "수선한 주머니",
    text: "활성화 시 아이템 보유 한도 +2",
    unlockFlavor: "비워낸 자리에 더 많이 들어간다.",

    unlock: (g, base) => (g.run.unlock?.itemDiscards ?? 0) >= ((base.unlock?.itemDiscards ?? 0) + 1),

    onActivate(g) {
      addItemCap(g, 2, "수선한 주머니");
      logMsg(g, "유물[수선한 주머니]: 아이템 보유 한도 +2");
    },
  },
  
  relic_bloody_spoon: {
    id: "relic_bloody_spoon",
    dormantName: "붉은 숟가락",
    dormantText: "쇠 냄새가 진하다.",
    unlockHint: "조건: 💤 F 10 이상",

    art: "assets/relics/relic_bloody_spoon.png",
    unlock: (g, base) => {
      const f = Number(g.player.fatigue ?? 0) || 0;
      const target = Math.max(10, (Number(base.fatigue ?? 0) || 0) + 1);
      return f >= target;
    },

    name: "피 묻은 숟가락",
    text: "회복량 +1",
    unlockFlavor: "이런, 피였다.",

  },

  relic_black_ledger_shard: {
    id: "relic_black_ledger_shard",
    dormantName: "검댕 묻은 종이",
    dormantText: "검은 종이다. 타고 남은 조각일지도 모르겠다.",
    unlockHint: "조건: 🍞 S = 0으로 턴 종료 1회",

    art: "assets/relics/relic_black_ledger_shard.png",
    unlock: (g, base) => {
      const cur = g.run.unlock?.endedTurnSupplyZero ?? 0;
      return cur >= (base.unlock.endedTurnSupplyZero + 1);
    },

    name: "검은 장부 조각",
    text: "🍞 S = 0으로 턴을 종료하면, 🍞 S +2, 💤 F +1",
    unlockFlavor: "장부. 무엇의?",
    onUpkeepEnd(g) {
      const targets: any[] = aliveEnemies(g) as any;
      if (!targets?.length) return;

      for (const e of targets) {
        let dmg = 2;
        const blk = Number((e as any).block ?? 0);
        if (blk > 0) {
          const used = Math.min(blk, dmg);
          (e as any).block = blk - used;
          dmg -= used;
        }
        if (dmg > 0) {
          const hp = Number((e as any).hp ?? 0);
          (e as any).hp = Math.max(0, hp - dmg);
        }
      }

      logMsg(g, "유물[검은 장부 조각]: 🍞 S +2, 💤 F +1");
    },
  },

  relic_ink_bottle: {
    id: "relic_ink_bottle",
    dormantName: "검은 잉크 얼룩",
    dormantText: "손가락 끝이 검게 물든다. 씻어도 지워지지 않는다.",
    unlockHint: "조건: 🍞 S = 0으로 턴 종료 1회",

    art: "assets/relics/relic_ink_bottle.png",

    unlock: (g, base) => {
      const cur = g.run.unlock?.endedTurnSupplyZero ?? 0;
      return cur >= (base.unlock.endedTurnSupplyZero + 1);
    },

    name: "검은 잉크병",
    text: "전투 시작 시 달빛 두루마리 1장을 손패에 추가",
    unlockFlavor: "글자는 마치 벌레처럼 기어다닌다.",

    onCombatStart(g) {

      const DEF_ID = "token_moon_scroll";
      g.uidSeq += 1;
      const uid = String(g.uidSeq);
      g.cards[uid] = { uid, defId: DEF_ID, zone: "hand", upgrade: 0 } as any;
      g.hand.push(uid);

      logMsg(g, "유물[검은 잉크병]: 달빛 두루마리 +1");
    },

  },

  relic_moon_scroll_chisel: {
    id: "relic_moon_scroll_chisel",
    dormantName: "달빛 부스러기",
    dormantText: "차가운 빛이 손끝에 묻어 있다.",
    unlockHint: "조건: 달빛 두루마리 3회 사용",

    art: "assets/relics/relic_moon_scroll_chisel.png",

    unlock: (g, base) => {
      const cur = g.run.unlock?.moonScrollUses ?? 0;
      const prev = base.unlock.moonScrollUses ?? 0;
      return cur >= (prev + 3);
    },

    name: "달빛 깎개",
    text: "달빛 두루마리를 사용하면 무작위 🗡️ 피해 3",
    unlockFlavor: "문장 사이로 빛이 새어 나온다.",

    onPlaceCard(g, ctx) {
      const uid = ctx.cardUid;
      const inst = g.cards[uid];
      if (!inst) return;
      if (inst.defId !== "token_moon_scroll") return;
      const alive = aliveEnemies(g);
      if (alive.length === 0) return;
      applyDamageToEnemy(g, pickOne(alive), 3);
      logMsg(g, "유물[달빛 깎개]: 무작위 적에게 3 피해");
    },
  },

  relic_order_whistle: {
    id: "relic_order_whistle",
    dormantName: "닳아빠진 호루라기",
    dormantText: "불면 소리가 나지 않는다. 그래도 목에 건다.",
    unlockHint: "조건: 적이 3명인 전투 승리",

    art: "assets/relics/relic_order_whistle.png",

    unlock: (g, base) => (g.run.unlock?.threeEnemyWins ?? 0) >= (base.unlock.threeEnemyWins + 1),

    name: "대열 정리의 호루라기",
    text: "적이 죽을 때마다 🛡️ 방어 +6",
    unlockFlavor: "호루라기 소리는 대열을 다시 세운다.",

    onCombatStart(g) {
      (g as any)._orderWhistleKillSet = new Set<string>();
    },

    onDamageApplied(g, ctx) {
      if (ctx.target !== "ENEMY") return;
      const idx = ctx.enemyIndex;
      if (idx == null || idx < 0) return;
      const en = g.enemies[idx];
      if (!en) return;
      if (en.hp !== 0) return;

      const key = `${idx}:${ctx.enemyId ?? "?"}`;
      const maybe = (g as any)._orderWhistleKillSet;
      const set: Set<string> = maybe instanceof Set ? maybe : new Set<string>();
      if (set.has(key)) return;
      set.add(key);
      (g as any)._orderWhistleKillSet = set;

      addBlock(g, 6);
      logMsg(g, "유물[대열 정리의 호루라기]: 적 처치 → 🛡️ 방어 +6");
    },
  },

  relic_field_mechanic_glove: {
    id: "relic_field_mechanic_glove",
    dormantName: "기름 냄새 나는 장갑",
    dormantText: "손바닥에 낡은 가죽이 들러붙는다.",
    unlockHint: "조건: 설치물이 3개 이상인 채로 턴 종료",

    art: "assets/relics/relic_field_mechanic_glove.png",

    unlock: (g, base) => (g.run.unlock?.endedTurnWith3Installs ?? 0) >= (base.unlock.endedTurnWith3Installs + 1),

    name: "현장 정비공의 장갑",
    text: "턴 종료 시 설치물이 있으면 🍞 S +1",
    unlockFlavor: "정비는 곧 보급이다.",

    onUpkeepEnd(g) {
      const installs = (g.frontSlots.filter(Boolean).length + g.backSlots.filter(Boolean).length) | 0;
      if (installs <= 0) return;
      addSupplies(g, 1);
      logMsg(g, "유물[현장 정비공의 장갑]: 턴 종료 설치물 보유 → 🍞 S +1");
    },
  },

  relic_castle_sight: {
    id: "relic_castle_sight",
    dormantName: "흐린 조준기",
    dormantText: "벽 너머를 보려면, 먼저 초점을 맞춰야 한다.",
    unlockHint: "조건: 설치물로 준 피해 도합 15",

    art: "assets/relics/relic_castle_sight.png",

    unlock: (g, base) => (g.run.unlock?.installDamageDealt ?? 0) >= (base.unlock.installDamageDealt + 15),

    name: "성곽 조준기",
    text: "설치물이 주는 🗡️ 피해 +1",
    unlockFlavor: "가까운 적부터 정확히.",

    modifyDamage(g, ctx) {
      if (ctx.phase !== "PRE_STATUS") return ctx.current;
      if (ctx.target !== "ENEMY") return ctx.current;
      if (ctx.reason !== "INSTALL") return ctx.current;
      return ctx.current + 1;
    },
  },

  // 이하 이벤트 유물

  relic_ratskin_charm: {
    id: "relic_ratskin_charm",
    name: "쥐가죽 부적",
    text: "취약을 받을 때 1 덜 받음",
    unlockFlavor: "살가죽. 얇게, 아주 얇게.",
    tags: ["EVENT_ONLY"],

    art: "assets/relics/relic_ratskin_charm.png",
  },

};