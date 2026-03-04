
import type { ChoiceOption, ChoiceState, GameState, GodId, FaithState } from "./types";
import { setChoice } from "./choice";
import { applyStatusTo, logMsg, pickOne, pushUiToast } from "./rules";
import { healPlayer, applyDamageToPlayer } from "./effects";
import {
  canUpgradeUid,
  addCardToDeck,
  removeRandomCardFromDeck,
  upgradeCardByUid,
} from "../content/rewards";


type GodDisplay = {
  id: Exclude<GodId, "madness">;
  name: string;
  art: string;
  patronPlus: string;
  patronMinus: string;
  temptation: string;
  hostile: string;
};

//신 능력

export const GODS: GodDisplay[] = [
  {
    id: "dream_shadow",
    name: "꿈그림자",
    art: "assets/gods/dream_shadow.png",
    patronPlus: "휴식-회복: 피로도 +3 대신 항상 최대 체력이 됨",
    patronMinus: "휴식-강화: 피로도만큼 피해",
    temptation: "체력 10 회복, 피로도 +3",
    hostile: "휴식-회복: 회복량 0 / 휴식-강화: 피로도만큼 피해",
  },
  {
    id: "wing_artery",
    name: "날개의 동맥",
    art: "assets/gods/wing_artery.png",
    patronPlus: "이동: 50% 확률로 시간이 흐르지 않음 / 시작 S 10",
    patronMinus: "전투: 5턴마다 피로도 +1",
    temptation: "시간 -7, 피로도 +2",
    hostile: "이동에 걸리는 시간이 1 늘어남",
  },
  {
    id: "master_spear",
    name: "달인의 창",
    art: "assets/gods/master_spear.png",
    patronPlus: "전투: 선두 적에게 피해를 줄 때 피해 +25%",
    patronMinus: "대상 지정: 선두 적만 대상으로 지정 가능",
    temptation: "다음 정예/보스 전투 시작: 모든 적 취약 3",
    hostile: "정예/보스 전투 시작 시 자신 취약/약화/교란 2",
  },
  {
    id: "retort_fusion",
    name: "레토르트 퓨전",
    art: "assets/gods/retort_fusion.png",
    patronPlus: "휴식: 합성 선택 가능",
    patronMinus: "휴식-합성: 효과별 비용 지불",
    temptation: "다음 휴식에서 합성 선택 가능",
    hostile: "무작위 7장 소모 부여 / 카드가 소모될 때마다 HP -1",
  },
  {
    id: "nameless_vow",
    name: "무명의 서약",
    art: "assets/gods/nameless_vow.png",
    patronPlus: "빚 문서 1장당 첫 턴 드로우 +1, 방어도 +3",
    patronMinus: "전투 종료: 20% 확률로 빚 문서 1장 추가",
    temptation: "덱에 빚 문서 1장 추가, 다음 3전투 드로우 +2",
    hostile: "빚 문서 2장 추가 / 전투 시작 시 빚 문서 1장당 HP -1",
  },
  {
    id: "bright_darkness",
    name: "밝은 어둠",
    art: "assets/gods/bright_darkness.png",
    patronPlus: "지도: 모든 노드의 정보가 표시됨",
    patronMinus: "전투 시작: 자신 취약 1",
    temptation: "다음 노드 4개 내용 즉시 공개, 피로도 -2",
    hostile: "지도: 노드 정보가 전부 ? / 전투 시작 시 자신 취약 2",
  },
  {
    id: "twin_heart",
    name: "쌍둥이 심장",
    art: "assets/gods/twin_heart.png",
    patronPlus: "전열 단계 마지막: 사용한 카드 중 무작위 1장의 반대쪽 열 효과가 발동 (대상은 무작위)",
    patronMinus: "턴 시작: S -1",
    temptation: "카드 보상 1회",
    hostile: "전투 시작 시 교란 5",
  },
  {
    id: "indifferent_one",
    name: "아무렇지 않은 자",
    art: "assets/gods/indifferent_one.png",
    patronPlus: "턴 종료: 카드 1장 이하 사용 시 HP +2, 방어 +6",
    patronMinus: "카드 5장 이상 사용 시 피로도 +1 (전투 당 1회)",
    temptation: "즉시 피로도 0",
    hostile: "카드 4장 이상 사용 시 피로도 +1, HP -3 (전투 당 3회)",
  },
  {
    id: "armored_tiger",
    name: "중갑 입은 호랑이",
    art: "assets/gods/armored_tiger.png",
    patronPlus: "전투 시작: 첫 턴에 방어 10, 그 다음 턴에 방어 5",
    patronMinus: "턴 종료: 방어를 얻지 못했으면 HP -2",
    temptation: "최대 체력 +5, 피로도 +2",
    hostile: "전투 시작 시 취약 2, 드로우 -1",
  },
  {
    id: "first_human",
    name: "첫 번째 인간",
    art: "assets/gods/first_human.png",
    patronPlus: "전투 카드 보상 제시 +1",
    patronMinus: "상점: 비용 +50%",
    temptation: "카드 1장 선택 복제, 피로도 +3",
    hostile: "전투 카드 보상 제시 -1 / 상점: 비용 +50%",
  },
  {
    id: "card_dealer",
    name: "카드 딜러",
    art: "assets/gods/card_dealer.png",
    patronPlus: "전투 시작: 드로우 +2",
    patronMinus: "전투 종료: 50% 확률로 골드 10 잃음",
    temptation: "골드 +40, 덱에 빚 문서(저주) 1장 추가",
    hostile: "전투 골드 보상 없음",
  },
  {
    id: "rabbit_hunt",
    name: "토끼 사냥",
    art: "assets/gods/rabbit_hunt.png",
    patronPlus: "전투 시작: 모든 적 취약 3",
    patronMinus: "방어도 획득량 -10%",
    temptation: "다음 3전투 동안 전투 시작 드로우 +1",
    hostile: "전투 시작 시 자신 취약 3",
  },
  {
    id: "wave_breath",
    name: "파도의 숨결",
    art: "assets/gods/wave_breath.png",
    patronPlus: "처음 사용하는 대상 지정 카드가 모든 적 대상",
    patronMinus: "그 외 대상 지정 카드는 무작위 적 대상",
    temptation: "다음 전투: 처음 사용하는 대상을 선택하는 카드가 모든 적 대상",
    hostile: "모든 대상 지정 카드가 무작위 적 대상",
  },
  {
    id: "forge_master",
    name: "화로의 주인",
    art: "assets/gods/forge_master.png",
    patronPlus: "시작: 화살/강력한 화살/방패가 강화된 채로 시작",
    patronMinus: "시작 S 6",
    temptation: "무작위 카드 1장 제거 후 2장 강화",
    hostile: "휴식-강화 불가 / 휴식 시 카드 1장 무작위 제거",
  },
];

export const GOD_LINES = {
  dream_shadow: {
    restHeal: "악몽을 꾸었습니까?",
    restUpgrade: "망치가 이상합니다. 아주 이상합니다.",
    tempt: "낮잠에도 악몽은 있습니다.",
    hostileRest: "꿈그림자가 당신의 휴식을 방해합니다.",
  },
  wing_artery: {
    moveNoTime: "당신은 떨어지는 핏방울보다 빠릅니다.",
    every5Turns: "날개가 시들고 있습니다.",
    tempt: "정신을 차려보니 이곳입니다.",
    hostileStart: "새가 제 날개를 꺾습니다.",
  },
  master_spear: {
    tempt: "창끝이 마음을 꿰뚫습니다.",
    targetOnlyFront: "맨 앞의 적만 지정할 수 있습니다.",
  },
  retort_fusion: {
    tempt: "다음 휴식이 기대되지 않습니까?",
    hostileStart: "당신을 밀봉합니다.",
  },
  nameless_vow: {
    tempt: "서약이 빚으로 남습니다.",
    victoryDebt: "서약은 공짜가 아닙니다.",
    hostileStart: "빚이 당신을 짓누릅니다.",
  },
  bright_darkness: {
    choice: "어둠이 당신을 인도합니다.",
    combatStart: "너무 밝아 숨을 곳이 없습니다.",
    tempt: "어둠이 보입니다. 그곳은 편안합니다.",
    hostileStart: "빛이 당신의 눈을 잡아먹었습니다.",
  },
  twin_heart: {
    tempt: "무언가 발견하자 심장이 미치도록 뜁니다. 반대일까요?",
    hostileCombatStart: "몸의 박자가 어긋납니다.",
  },
  indifferent_one: {
    endTurnZero: "아무 일도 없었습니까?",
    at5Cards: "침착하십시오.",
    tempt: "모든 것은 가만히 있어도 굴러갑니다.",
    hostileFirstUse: "침착하십시오.",
    hostileStart: "이제 움직일 때군요.",
  },
  armored_tiger: {
    combatStart: "이빨은 벼려졌고, 갑옷은 닫혔습니다.",
    endTurnNoBlock: "호랑이는 당신을 대신 잡아먹습니다.",
    tempt: "무거운 것이 살아남습니다.",
    hostileCombat: "갑옷의 틈이 보입니다.",
  },
  first_human: {
    reward: "배웁니다. 따라합니다.",
    shop: "지식은 살 수 없습니다.",
    tempt: "두 번째로 첫 번째가 되었습니다.",
    hostileReward: "지식은 잊힙니다.",
  },
  card_dealer: {
    combatStart: "판을 깔아드리죠.",
    victoryFee: "수수료는 받습니다.",
    tempt: "오늘만 외상입니다.",
    hostileStart: "황금이 모두 돌이 되었습니다. 이런 걸 바랐습니까?",
  },
  rabbit_hunt: {
    combatStart: "먼저 잡습니다.",
    tempt: "더 빨리, 더 깊이.",
    hostileCombatStart: "이제 당신이 쫓깁니다.",
  },
  wave_breath: {
    combatStart: "파도가 다가옵니다.",
    tempt: "파도가 당신의 손을 잡습니다.",
    hostileStart: "파도를 읽을 수 없습니다.",
  },
  forge_master: {
    choice: "당신의 철은 누구보다도 단단합니다.",
    tempt: "화마가 철을 굽기도 합니다.",
    hostileRestEnter: "불이 당신을 따르지 않습니다.",
  },
  madness: {
    accept: "당신은 그 힘을 받아들이기로 했습니다.",
    reject: "당신에게 주어져 마땅한 힘이 던전 곳곳에 흩어졌습니다.",
  },
} as const;

export function createDefaultOfferedGods(): [GodId, GodId, GodId] {
  const pool: Exclude<GodId, "madness">[] = [
    "dream_shadow",
    "wing_artery",
    "master_spear",
    "retort_fusion",
    "nameless_vow",
    "bright_darkness",
    "twin_heart",
    "indifferent_one",
    "armored_tiger",
    "first_human",
    "card_dealer",
    "rabbit_hunt",
    "wave_breath",
    "forge_master",
  ];
  const picks: Exclude<GodId, "madness">[] = [];
  const src = [...pool];
  while (picks.length < 3 && src.length > 0) {
    const i = (Math.random() * src.length) | 0;
    picks.push(src.splice(i, 1)[0]);
  }
  while (picks.length < 3) picks.push("dream_shadow");
  return [picks[0], picks[1], picks[2]] as any;
}

function displayById(id: Exclude<GodId, "madness">): GodDisplay {
  const d = GODS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown god ${id}`);
  return d;
}

export function godName(id: GodId): string {
  if (id === "madness") return "광기";
  return displayById(id).name;
}

export function godArt(id: GodId) {
  if (id === "madness") return "assets/gods/madness.png";
  return displayById(id as any).art;
}

export function godAbilityBlock(id: Exclude<GodId, "madness">): string {
  const d = displayById(id);
  return [
    `후원(+)  ${d.patronPlus}`,
    `후원(-)  ${d.patronMinus}`,
    `유혹     ${d.temptation}`,
    `배교/적대 ${d.hostile}`,
  ].join("\n");
}


export function createFaithState(offered?: [GodId, GodId, GodId]): FaithState {
  const off = offered ?? createDefaultOfferedGods();
  const points: Record<GodId, number> = {
    dream_shadow: 0,
    wing_artery: 0,
    master_spear: 0,
    retort_fusion: 0,
    nameless_vow: 0,
    bright_darkness: 0,
    twin_heart: 0,
    indifferent_one: 0,
    armored_tiger: 0,
    first_human: 0,
    card_dealer: 0,
    rabbit_hunt: 0,
    wave_breath: 0,
    forge_master: 0,
  
    madness: 0,
  };
  const focus = off[0];
  return {
    offered: off,
    points,
    focus,
    lastFocus: focus,
    chosen: false,
    hostile: {},
  };
}

export function ensureFaith(g: GameState): FaithState {
  const runAny = g.run as any;
  if (!runAny.faith) runAny.faith = createFaithState();
  const f = runAny.faith as FaithState;

  f.offered ??= createDefaultOfferedGods();
  f.points ??= {
    dream_shadow: 0,
    wing_artery: 0,
    master_spear: 0,
    retort_fusion: 0,
    nameless_vow: 0,
    bright_darkness: 0,
    twin_heart: 0,
    indifferent_one: 0,
    armored_tiger: 0,
    first_human: 0,
    card_dealer: 0,
    rabbit_hunt: 0,
    wave_breath: 0,
    forge_master: 0,
    madness: 0,
  } as any;

  const ensure0 = (id: GodId) => {
    const v = Number((f.points as any)[id]);
    if (!Number.isFinite(v)) (f.points as any)[id] = 0;
  };
  for (const id of [
    "dream_shadow",
    "wing_artery",
    "master_spear",
    "retort_fusion",
    "nameless_vow",
    "bright_darkness",
    "twin_heart",
    "indifferent_one",
    "armored_tiger",
    "first_human",
    "card_dealer",
    "rabbit_hunt",
    "wave_breath",
    "forge_master",
    "madness",
  ] as GodId[]) {
    ensure0(id);
  }
  f.hostile ??= {};
  f.focus ??= f.offered?.[0] ?? "dream_shadow";
  f.lastFocus ??= f.focus;
  f.chosen ??= false;

  f.madnessAwakened ??= false;
  f.madnessTemptUsed ??= false;

  recalcFocus(f);

  return f;
}

export function isHostile(g: GameState, id: GodId): boolean {
  const f = ensureFaith(g);
  return !!f.hostile?.[id];
}

function applyRetortFusionHostileOnce(g: GameState) {
  const runAny = g.run as any;
  if (runAny._retortFusionHostileApplied) return;
  runAny._retortFusionHostileApplied = true;

  const pool = Object.values(g.cards)
    .filter((c) => c && (c.zone === "deck" || c.zone === "hand" || c.zone === "discard"))
    .map((c) => c.uid)
    .filter((uid) => g.cards[uid]?.defId !== "goal_treasure");

  const picks: string[] = [];
  const src = [...pool];
  while (picks.length < 7 && src.length > 0) {
    const i = (Math.random() * src.length) | 0;
    picks.push(src.splice(i, 1)[0]);
  }

  for (const uid of picks) {
    const inst: any = g.cards[uid] as any;
    inst.synth ??= {};
    inst.synth.addTags ??= [];
    if (!inst.synth.addTags.includes("EXHAUST")) inst.synth.addTags.push("EXHAUST");
  }

  logMsg(g, `레토르트 퓨전(적대): 무작위 ${picks.length}장에 소모 부여`);
}

export function setHostile(g: GameState, id: GodId, msg?: string) {
  const f = ensureFaith(g);
  f.hostile ??= {};
  if (f.hostile[id]) {
    if (msg) {
      pushUiToast(g, "WARN", msg, 2200);
      logMsg(g, msg);
    }
    recalcFocus(f);
    return;
  }
  f.hostile[id] = true;
  if (id === "retort_fusion") {
    applyRetortFusionHostileOnce(g);
  }
  if (id === "nameless_vow") {
    addCardToDeck(g, "debt_paper", { upgrade: 0 });
    addCardToDeck(g, "debt_paper", { upgrade: 0 });
    logMsg(g, "무명의 서약(배교): 빚 문서 2장 추가");
  }

  const hostileStart = String(((GOD_LINES as any)[id] as any)?.hostileStart ?? "");
  if (hostileStart) {
    pushUiToast(g, "WARN", hostileStart, 2200);
    logMsg(g, hostileStart);
  }
  if (msg) {
    pushUiToast(g, "WARN", msg, 2200);
    logMsg(g, msg);
  }
  recalcFocus(f);
}

export function getFocusGod(g: GameState): GodId {
  return ensureFaith(g).focus;
}

export function getPatronGodOrNull(g: GameState): Exclude<GodId, "madness"> | null {
  const f = ensureFaith(g);
  const focus = f.focus;
  if (focus === "madness") return null;
  if (f.hostile?.[focus]) return null;
  return (f.points?.[focus] ?? 0) >= 3 ? (focus as Exclude<GodId, "madness">) : null;
}

export function getFaithPoints(g: GameState): Record<GodId, number> {
  return ensureFaith(g).points;
}

function recalcFocus(f: FaithState, rising?: GodId) {
  const offered = f.offered;
  const pts = f.points;
  const hostile = f.hostile ?? {};

  const candidates = offered.filter((id) => !hostile[id]);
  const pool = candidates.length > 0 ? candidates : offered;

  let best = -1;
  let bestIds: GodId[] = [];
  for (const id of pool) {
    const v = Number(pts[id] ?? 0) || 0;
    if (v > best) {
      best = v;
      bestIds = [id];
    } else if (v === best) {
      bestIds.push(id);
    }
  }

  if (bestIds.length === 1) {
    f.focus = bestIds[0];
    f.lastFocus = f.focus;
    return;
  }

  if (bestIds.includes(f.lastFocus)) {
    f.focus = f.lastFocus;
    return;
  }
  if (rising && bestIds.includes(rising)) {
    f.focus = rising;
    f.lastFocus = rising;
    return;
  }
  f.focus = bestIds[0];
  f.lastFocus = f.focus;
}

function clamp0to5(n: number) {
  if (n < 0) return 0;
  if (n > 5) return 5;
  return n;
}

export function scoreStr(g: GameState): string {
  const f = ensureFaith(g);
  return f.offered.map((id) => `${godName(id)}:${f.points[id] ?? 0}`).join(", ");
}


export function chooseStartingGod(g: GameState, god: GodId) {
  const f = ensureFaith(g);
  if (!f.offered.includes(god)) return;

  for (const id of f.offered) f.points[id] = 0;
  f.points[god] = 5;
  f.focus = god;
  f.lastFocus = god;
  f.chosen = true;

  f.hostile = {};

  if (god === "bright_darkness") {
    pushUiToast(g, "INFO", (GOD_LINES as any).bright_darkness.choice, 2200);
    logMsg(g, (GOD_LINES as any).bright_darkness.choice);
  }

  if (god === "forge_master") {
    pushUiToast(g, "INFO", (GOD_LINES as any).forge_master.choice, 2200);
    logMsg(g, (GOD_LINES as any).forge_master.choice);
  }

  if (god === "forge_master") {
    const ids = Object.values(g.cards)
      .filter((c) => c.zone === "deck" && (g.content.cardsById[c.defId]?.tags ?? []).includes("FORGE_START"))
      .map((c) => c.uid);
    for (const uid of ids) upgradeCardByUid(g, uid);
    logMsg(g, `화로의 주인: 시작 카드 강화 (${ids.length}장)`);
  }

  logMsg(g, `신앙 선택: ${godName(god)} (5점)`);
}

export function openFaithStartChoice(g: GameState) {
  const f = ensureFaith(g);
  const off = f.offered;

  const options: ChoiceOption[] = off.map((id) => {
    const ex = id as Exclude<GodId, "madness">;
    return {
      key: `faith:choose:${id}`,
      label: godName(id),
      detail: godAbilityBlock(ex),
    };
  });

  const choice: ChoiceState = {
    kind: "FAITH",
    title: "신앙 선택",
    prompt: "",
    options,
  };

  setChoice(g, choice, { kind: "FAITH_START", offered: off });
}


export function pickTemptingGod(g: GameState): Exclude<GodId, "madness"> | null {
  const f = ensureFaith(g);
  if (!f.chosen) return null;
  if (f.madnessAccepted) return null;

  const focus = f.focus;
  const hostile = f.hostile ?? {};

  const candidates = f.offered.filter((id) => id !== focus && !hostile[id]) as Exclude<GodId, "madness">[];
  if (candidates.length === 0) return null;

  let pool = candidates;
  if (f.lastTempter && candidates.length >= 2) {
    pool = candidates.filter((id) => id !== f.lastTempter);
    if (pool.length === 0) pool = candidates;
  }

  return pickOne(pool, "pickTemptingGod");
}

export function acceptTemptation(g: GameState, tempter: Exclude<GodId, "madness">) {
  const f = ensureFaith(g);
  if (!f.chosen) return;
  if (!f.offered.includes(tempter)) return;

  const focusBefore = f.focus;
  if (tempter === focusBefore) return;

  f.points[tempter] = clamp0to5((f.points[tempter] ?? 0) + 1);
  f.points[focusBefore] = clamp0to5((f.points[focusBefore] ?? 0) - 1);

  recalcFocus(f, tempter);

  logMsg(
    g,
    `유혹 수락: ${godName(tempter)} +1 / ${godName(focusBefore)} -1  ->  (${scoreStr(g)}) / 포커스=${godName(f.focus)}`
  );
}

export function openGodTemptChoice(g: GameState, tempter: Exclude<GodId, "madness">) {
  const f = ensureFaith(g);
  if (!f.chosen) return;
  if (f.madnessAccepted) return;
  if (!f.offered.includes(tempter)) return;
  if (tempter === f.focus) return;
  if (f.hostile?.[tempter]) return;

  f.lastTempter = tempter;

  const title = `유혹: ${godName(tempter)}`;
  const prompt = String(((GOD_LINES as any)[tempter] as any)?.tempt ?? "");

  const detail = temptationDetail(tempter);

  const choice: ChoiceState = {
    kind: "GOD_TEMPT",
    title,
    prompt,
    art: godArt(tempter),
    options: [
      { key: "tempt:accept", label: "받아들인다", detail },
      { key: "tempt:reject", label: "거부한다" },
    ],
  };

  if (prompt) {
    pushUiToast(g, "INFO", prompt, 1800);
    logMsg(g, prompt);
  }

  setChoice(g, choice, { kind: "GOD_TEMPT", tempter });
}

function temptationDetail(id: Exclude<GodId, "madness">): string {
  if (id === "dream_shadow") return "체력 10 회복, 피로도 +3";
  if (id === "wing_artery") return "시간 -7, 피로도 +2";
  if (id === "master_spear") return "다음 정예/보스 전투 시작: 모든 적 취약 3";
  if (id === "retort_fusion") return "다음 휴식에서 합성 가능";
  if (id === "nameless_vow") return "덱에 빚 문서 1장 추가, 다음 3전투 드로우 +2";
  if (id === "bright_darkness") return "다음 노드 4개 내용 즉시 공개, 피로도 -2";
  if (id === "twin_heart") return "카드 보상 1회";
  if (id === "indifferent_one") return "즉시 피로도 0";
  if (id === "armored_tiger") return "최대 체력 +5, 피로도 +2";
  if (id === "first_human") return "카드 1장 선택 복제, 피로도 +3";
  if (id === "card_dealer") return "골드 +40, 덱에 ‘빚 문서’(저주) 1장 추가";
  if (id === "rabbit_hunt") return "다음 3전투 동안 전투 시작 드로우 +1";
  if (id === "wave_breath") return "다음 전투에서 처음 사용하는 대상 지정 카드가 모든 적을 대상으로 함";
  if (id === "forge_master") return "무작위 카드 1장 제거 후 2장 강화";
  return "";
}

export function applyTemptationEffect(g: GameState, tempter: Exclude<GodId, "madness">) {
  if (tempter === "dream_shadow") {
    healPlayer(g, 10);
    g.player.fatigue = (g.player.fatigue ?? 0) + 3;
    logMsg(g, "유혹: HP +10, 피로 +3");
    return;
  }
  if (tempter === "wing_artery") {
    g.time = Math.max(0, (g.time ?? 0) - 7);
    g.player.fatigue = (g.player.fatigue ?? 0) + 2;
    logMsg(g, "유혹: 시간 -7, 피로 +2");
    return;
  }

  if (tempter === "master_spear") {
    const runAny = g.run as any;
    runAny.masterSpearVulnNextEliteBoss = true;
    logMsg(g, "유혹: 다음 정예/보스 전투 시작 시 모든 적 취약 3");
    return;
  }

  if (tempter === "retort_fusion") {
    const runAny = g.run as any;
    runAny.retortFusionNextRestSynth = true;
    logMsg(g, "유혹: 다음 휴식에서 합성 가능");
    return;
  }

  if (tempter === "nameless_vow") {
    addCardToDeck(g, "debt_paper", { upgrade: 0 });
    const runAny = g.run as any;
    runAny.namelessVowDrawBoostBattles = Math.max(0, Number(runAny.namelessVowDrawBoostBattles ?? 0) || 0) + 3;
    logMsg(g, "유혹: 빚 문서 1장 추가, 다음 3전투 드로우 +2");
    return;
  }

  if (tempter === "bright_darkness") {
    const map: any = (g.run as any).map as any;
    const pos = String(map?.pos ?? "");
    const edges: Record<string, string[]> = (map?.edges ?? {}) as any;
    const seen: Record<string, 0 | 1 | 2 | 3> = map ? (map.seen ?? (map.seen = {})) : {};

    const MAX_REVEAL = 4;
    const revealed: string[] = [];
    const visited: Record<string, true> = {};
    const q: string[] = [];

    if (pos) {
      q.push(pos);
      visited[pos] = true;
    }

    while (q.length > 0 && revealed.length < MAX_REVEAL) {
      const cur = q.shift()!;
      for (const nx of edges[cur] ?? []) {
        if (visited[nx]) continue;
        visited[nx] = true;
        q.push(nx);

        if ((seen[nx] ?? 0) < 3) {
          seen[nx] = 3;
          revealed.push(nx);
          if (revealed.length >= MAX_REVEAL) break;
        }
      }
    }

    g.player.fatigue = Math.max(0, (g.player.fatigue ?? 0) - 2);
    logMsg(g, `유혹: 다음 노드 ${revealed.length}개 공개, 피로 -2`);
    return;
  }

  if (tempter === "indifferent_one") {
    g.player.fatigue = 0;
    logMsg(g, "유혹: 피로 0");
    return;
  }

  if (tempter === "armored_tiger") {
    g.player.maxHp += 5;
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + 5);
    g.player.fatigue = (g.player.fatigue ?? 0) + 2;
    logMsg(g, "유혹: 최대 HP +5, 피로 +2");
    return;
  }


  if (tempter === "card_dealer") {
    const runAny = g.run as any;
    const cur = Number(runAny.gold ?? 0) || 0;
    runAny.gold = cur + 40;
    addCardToDeck(g, "debt_paper", { upgrade: 0 });
    logMsg(g, "유혹: 🪙 +40, 빚 문서 1장 추가");
    return;
  }

  if (tempter === "rabbit_hunt") {
    const runAny = g.run as any;
    runAny.rabbitHuntDrawBoostBattles = Math.max(0, Number(runAny.rabbitHuntDrawBoostBattles ?? 0) || 0) + 3;
    logMsg(g, "유혹: 다음 3전투 전투 시작 드로우 +1");
    return;
  }

  if (tempter === "wave_breath") {
    const runAny = g.run as any;
    runAny.waveBreathNextCombatAll = true;
    logMsg(g, "유혹: 다음 전투 첫 대상 지정 카드가 전체 대상");
    return;
  }

  if (tempter === "forge_master") {
    removeRandomCardFromDeck(g);
    const candidates = Object.values(g.cards)
      .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && canUpgradeUid(g, c.uid))
      .map((c) => c.uid);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    const picks = candidates.slice(0, 2);
    for (const uid of picks) upgradeCardByUid(g, uid);
    logMsg(g, `유혹: 카드 1장 제거, ${picks.length}장 강화`);
    return;
  }
}


function madnessBoonText(i: 1 | 2 | 3) {
  if (i === 1) return "즉시 체력 전부 회복, 전투 돌입 시 30% 확률로 첫번째 적 즉사 (보스 제외)";
  if (i === 2) return "앞으로의 전투에서 첫번째 적이 취약/약화 4";
  return "50% 확률로 전투 노드에 들어가도 전투가 발생하지 않습니다. (보스 제외)";
}

function madnessBaneText(i: 1 | 2 | 3) {
  if (i === 1) return "모든 적의 체력이 10 증가";
  if (i === 2) return "전투 시작 시 자신은 취약/약화/출혈 2";
  return "50% 확률로 전투가 아닌 노드에 들어가도 전투가 발생합니다.";
}

export function shouldOfferMadnessTempt(g: GameState): boolean {
  const f = ensureFaith(g);
  return !!f.chosen && !!f.madnessAwakened && !f.madnessTemptUsed;
}

export function awakenMadness(g: GameState) {
  const f = ensureFaith(g);
  f.madnessAwakened = true;
}

export function openMadnessTemptChoice(g: GameState) {
  const f = ensureFaith(g);
  if (!f.chosen) return;
  if (!f.madnessAwakened) f.madnessAwakened = true;
  if (f.madnessTemptUsed) return;

  const offerBoon = pickOne([1, 2, 3] as const, "madness boon");
  const offerBane = pickOne([1, 2, 3] as const, "madness bane");

  const title = "광기의 신 0";
  const prompt =
    `광기의 신이 깨어났습니다.\n\n` +
    `수락 시(배교): ${madnessBoonText(offerBoon)}\n` +
    `  - 단, 즉시 F +10\n` +
    `거부 시(적대): ${madnessBaneText(offerBane)}`;

  const choice: ChoiceState = {
    kind: "MADNESS_TEMPT",
    title,
    prompt,
    art: "assets/gods/madness.png",
    options: [
      { key: "madness:accept", label: "힘을 받아들인다", detail: `배교\n${madnessBoonText(offerBoon)}\n(즉시 F+10)` },
      { key: "madness:reject", label: "거부한다", detail: `적대\n${madnessBaneText(offerBane)}` },
    ],
  };

  setChoice(g, choice, { kind: "MADNESS_TEMPT", offerBoon, offerBane });
}

export function acceptMadness(g: GameState, offerBoon: 1 | 2 | 3) {
  const f = ensureFaith(g);
  if (f.madnessTemptUsed) return;

  f.madnessTemptUsed = true;
  f.madnessAccepted = true;
  f.madnessBoon = offerBoon;

  g.player.fatigue = (g.player.fatigue ?? 0) + 10;

  if (offerBoon === 1) {
    g.player.hp = g.player.maxHp;
    logMsg(g, "광기: 즉시 체력 전부 회복");
  }

  pushUiToast(g, "INFO", GOD_LINES.madness.accept, 2200);
  logMsg(g, GOD_LINES.madness.accept);

  const betrayed = f.focus;
  setHostile(g, betrayed);

  logMsg(g, `배교: ${godName(betrayed)} 적대`);
}

export function rejectMadness(g: GameState, offerBane: 1 | 2 | 3) {
  const f = ensureFaith(g);
  if (f.madnessTemptUsed) return;

  f.madnessTemptUsed = true;
  f.madnessAccepted = false;
  f.madnessBane = offerBane;
  setHostile(g, "madness");

  pushUiToast(g, "WARN", GOD_LINES.madness.reject, 2200);
  logMsg(g, GOD_LINES.madness.reject);
}

export function getMadnessBoon(g: GameState): 1 | 2 | 3 | null {
  const f = ensureFaith(g);
  if (!f.madnessAccepted) return null;
  return f.madnessBoon ?? null;
}

export function getMadnessBane(g: GameState): 1 | 2 | 3 | null {
  const f = ensureFaith(g);
  if (!f.hostile?.madness) return null;
  return f.madnessBane ?? null;
}

export function applyMadnessCombatStartHooks(g: GameState) {
  const boon = getMadnessBoon(g);
  const bane = getMadnessBane(g);

  if (bane === 2) {
    applyStatusTo(g.player as any, "vuln", 2, g, "SYSTEM");
    applyStatusTo(g.player as any, "weak", 2, g, "SYSTEM");
    applyStatusTo(g.player as any, "bleed", 2, g, "SYSTEM");
    logMsg(g, "광기(적대): 취약/약화/출혈 2");
  }

  if (boon === 2) {
    const first = g.enemies?.[0];
    if (first && first.hp > 0 && !g.content.enemiesById[first.id]?.isBoss) {
      applyStatusTo(first as any, "vuln", 4, g, "SYSTEM");
      applyStatusTo(first as any, "weak", 4, g, "SYSTEM");
      logMsg(g, "광기: 첫번째 적 취약/약화 4");
    }
  }

  if (boon === 1) {
    const first = g.enemies?.[0];
    if (first && first.hp > 0 && !g.content.enemiesById[first.id]?.isBoss) {
      if (Math.random() < 0.3) {
        first.hp = 0;
        logMsg(g, "광기: 첫번째 적 즉사!");
        pushUiToast(g, "INFO", "광기의 힘이 적을 삼켰습니다.", 1600);
      }
    }
  }
}


export function wingArteryMoveDelta(g: GameState): number {
  const patron = getPatronGodOrNull(g);
  const hostile = isHostile(g, "wing_artery");

  let delta = 1;
  if (patron === "wing_artery") {
    if (Math.random() < 0.5) {
      delta = 0;
      pushUiToast(g, "INFO", GOD_LINES.wing_artery.moveNoTime, 1800);
      logMsg(g, GOD_LINES.wing_artery.moveNoTime);
    }
  }
  if (hostile) delta += 1;
  return delta;
}

export function wingArteryBaseSuppliesBonus(g: GameState): number {
  const patron = getPatronGodOrNull(g);
  if (patron === "wing_artery") return 3;
  if (patron === "forge_master") return -1;
  return 0;
}

export function applyWingArteryEvery5Turns(g: GameState) {
  const patron = getPatronGodOrNull(g);
  if (patron !== "wing_artery") return;
  const t = g.combatTurn ?? 0;
  if (t > 0 && t % 5 === 0) {
    g.player.fatigue = (g.player.fatigue ?? 0) + 1;
    pushUiToast(g, "WARN", GOD_LINES.wing_artery.every5Turns, 1800);
    logMsg(g, GOD_LINES.wing_artery.every5Turns);
  }
}

export function applyDreamShadowRestHeal(g: GameState): { healed: boolean } {
  const patron = getPatronGodOrNull(g);
  const hostile = isHostile(g, "dream_shadow");

  if (hostile) {
    pushUiToast(g, "WARN", GOD_LINES.dream_shadow.hostileRest, 1800);
    logMsg(g, GOD_LINES.dream_shadow.hostileRest);
    return { healed: true };
  }

  if (patron === "dream_shadow") {
    g.player.hp = g.player.maxHp;
    g.player.fatigue = (g.player.fatigue ?? 0) + 3;
    pushUiToast(g, "INFO", GOD_LINES.dream_shadow.restHeal, 1800);
    logMsg(g, GOD_LINES.dream_shadow.restHeal);
    logMsg(g, "휴식: 최대 체력 회복 (F +3)");
    return { healed: true };
  }

  return { healed: false };
}

export function applyDreamShadowRestUpgradePenalty(g: GameState) {
  const patron = getPatronGodOrNull(g);
  const hostile = isHostile(g, "dream_shadow");
  if (patron !== "dream_shadow" && !hostile) return;

  const f = g.player.fatigue ?? 0;
  if (f > 0) {
    applyDamageToPlayer(g, f, "OTHER", "꿈그림자");
    pushUiToast(g, "WARN", GOD_LINES.dream_shadow.restUpgrade, 1800);
    logMsg(g, GOD_LINES.dream_shadow.restUpgrade);
    logMsg(g, `휴식: 강화 대가로 피해 ${f}`);
  } else {
    pushUiToast(g, "WARN", GOD_LINES.dream_shadow.restUpgrade, 1400);
    logMsg(g, GOD_LINES.dream_shadow.restUpgrade);
  }
}

export function isForgeHostile(g: GameState): boolean {
  return isHostile(g, "forge_master");
}

export function onEnterRestExplorationHooks(g: GameState) {
  if (isForgeHostile(g)) {
    pushUiToast(g, "WARN", GOD_LINES.forge_master.hostileRestEnter, 2200);
    logMsg(g, GOD_LINES.forge_master.hostileRestEnter);
    removeRandomCardFromDeck(g);
  }

  if (isHostile(g, "dream_shadow")) {
    pushUiToast(g, "WARN", GOD_LINES.dream_shadow.hostileRest, 2200);
    logMsg(g, GOD_LINES.dream_shadow.hostileRest);
  }
}

export function canRetortFusionSynthAtRest(g: GameState): boolean {
  if (isHostile(g, "retort_fusion")) return false;
  const patron = getPatronGodOrNull(g);
  if (patron === "retort_fusion") return true;
  const runAny = g.run as any;
  return !!runAny.retortFusionNextRestSynth;
}

export function consumeRetortFusionRestCoupon(g: GameState) {
  const runAny = g.run as any;
  if (runAny.retortFusionNextRestSynth) runAny.retortFusionNextRestSynth = false;
}


export function faithCardRewardCount(g: GameState): number {
  let n = 3;
  if (getPatronGodOrNull(g) === "first_human") n += 1;
  if (isHostile(g, "first_human")) n -= 1;
  return Math.max(1, Math.min(6, n));
}

export function shopPriceMultiplier(g: GameState): number {
  return (getPatronGodOrNull(g) === "first_human" || isHostile(g, "first_human")) ? 1.5 : 1;
}

export function shopPriceGold(g: GameState, basePrice: number): number {
  const base = Math.max(0, Number(basePrice) || 0);
  const m = shopPriceMultiplier(g);
  const out = m === 1 ? base : Math.ceil(base * m);
  return Math.max(1, out);
}

export function combatStartDrawDeltaFromFaith(g: GameState): number {
  let d = 0;
  const patron = getPatronGodOrNull(g);
  if (patron === "card_dealer") d += 2;
  if (isHostile(g, "armored_tiger")) d -= 1;
  return d;
}

export function applyFaithCombatStartHooks(g: GameState) {
  const patron = getPatronGodOrNull(g);

  {
    const runAny = g.run as any;
    const isEliteOrBoss = !!g.run.lastBattleWasElite || !!(runAny.lastBattleWasBoss);

    if (runAny.masterSpearVulnNextEliteBoss && isEliteOrBoss) {
      runAny.masterSpearVulnNextEliteBoss = false;
      for (const en of (g.enemies ?? [])) {
        if (!en || en.hp <= 0) continue;
        applyStatusTo(en as any, "vuln", 3, g, "SYSTEM");
      }
      pushUiToast(g, "INFO", (GOD_LINES as any).master_spear.tempt, 1800);
      logMsg(g, "달인의 창(유혹): 정예/보스 시작 취약 3");
    }

    if (isHostile(g, "master_spear") && isEliteOrBoss) {
      applyStatusTo(g.player as any, "vuln", 3, g, "SYSTEM");
      applyStatusTo(g.player as any, "weak", 3, g, "SYSTEM");
      applyStatusTo(g.player as any, "disrupt", 3, g, "SYSTEM");
      logMsg(g, "달인의 창(적대): 정예/보스 시작 취약/약화/교란 3");
    }

    if (patron === "nameless_vow" || isHostile(g, "nameless_vow")) {
      const debtCount =
        g.deck.filter((uid) => g.cards[uid]?.defId === "debt_paper").length +
        g.discard.filter((uid) => g.cards[uid]?.defId === "debt_paper").length +
        g.hand.filter((uid) => g.cards[uid]?.defId === "debt_paper").length;

      if (patron === "nameless_vow") {
        runAny.nextCombatDrawDelta = (Number(runAny.nextCombatDrawDelta ?? 0) || 0) + debtCount;
        if (debtCount > 0) {
          g.player.block = (g.player.block ?? 0) + debtCount * 3;
          (g as any)._gainedBlockThisTurn = true;
          logMsg(g, `무명의 서약: 빚 문서 ${debtCount}장 → 시작 드로우 +${debtCount}, 방어 +${debtCount * 3}`);
        }
      }

      if (isHostile(g, "nameless_vow") && debtCount > 0) {
        applyDamageToPlayer(g, debtCount, "OTHER", "무명의 서약");
        logMsg(g, `무명의 서약(적대): 빚 문서 ${debtCount}장 → 전투 시작 HP -${debtCount}`);
      }
    }
  }

  if (patron === "wave_breath") {
    pushUiToast(g, "INFO", (GOD_LINES as any).wave_breath.combatStart, 1800);
    logMsg(g, (GOD_LINES as any).wave_breath.combatStart);
  }

  if (patron === "bright_darkness") {
    applyStatusTo(g.player as any, "vuln", 1, g, "SYSTEM");
    pushUiToast(g, "WARN", GOD_LINES.bright_darkness.combatStart, 1800);
    logMsg(g, GOD_LINES.bright_darkness.combatStart);
  }
  if (isHostile(g, "bright_darkness")) {
    applyStatusTo(g.player as any, "vuln", 2, g, "SYSTEM");
    logMsg(g, "밝은 어둠(적대): 전투 시작 취약 2");
  }
  if (isHostile(g, "twin_heart")) {
    applyStatusTo(g.player as any, "disrupt", 5, g, "SYSTEM");
    pushUiToast(g, "WARN", (GOD_LINES as any).twin_heart.hostileCombatStart, 1800);
    logMsg(g, (GOD_LINES as any).twin_heart.hostileCombatStart);
    logMsg(g, "쌍둥이 심장(적대): 전투 시작 교란 5");
  }
  if (patron === "twin_heart") {
    pushUiToast(g, "INFO", "두 심장이 같은 박자를 냅니다.", 1400);
  }
  if (patron === "armored_tiger") {
    g.player.block = (g.player.block ?? 0) + 10;
    (g as any)._gainedBlockThisTurn = true;
    pushUiToast(g, "INFO", GOD_LINES.armored_tiger.combatStart, 1800);
    logMsg(g, GOD_LINES.armored_tiger.combatStart);
    logMsg(g, "중갑 입은 호랑이: 전투 시작 방어 +10");
  }
  if (isHostile(g, "armored_tiger")) {
    applyStatusTo(g.player as any, "vuln", 2, g, "SYSTEM");
    pushUiToast(g, "WARN", GOD_LINES.armored_tiger.hostileCombat, 1800);
    logMsg(g, GOD_LINES.armored_tiger.hostileCombat);
    logMsg(g, "중갑 입은 호랑이(적대): 전투 시작 취약 2 / 드로우 -1");
  }

  if (patron === "card_dealer") {
    pushUiToast(g, "INFO", GOD_LINES.card_dealer.combatStart, 1800);
    logMsg(g, GOD_LINES.card_dealer.combatStart);
  }

  if (patron === "rabbit_hunt") {
    for (const en of (g.enemies ?? [])) {
      if (en && en.hp > 0) applyStatusTo(en as any, "vuln", 3, g, "SYSTEM");
    }
    pushUiToast(g, "INFO", GOD_LINES.rabbit_hunt.combatStart, 1800);
    logMsg(g, GOD_LINES.rabbit_hunt.combatStart);
    logMsg(g, "토끼 사냥: 모든 적 취약 3");
  }
  if (isHostile(g, "rabbit_hunt")) {
    applyStatusTo(g.player as any, "vuln", 3, g, "SYSTEM");
    pushUiToast(g, "WARN", GOD_LINES.rabbit_hunt.hostileCombatStart, 1800);
    logMsg(g, GOD_LINES.rabbit_hunt.hostileCombatStart);
    logMsg(g, "토끼 사냥(적대): 전투 시작 취약 3");
  }
  {
    const runAny = g.run as any;
    const wbHostile = isHostile(g, "wave_breath");
    const wbPatron = patron === "wave_breath";

    let all = 0;
    if (wbPatron) all += 1;

    if (wbHostile) {
      all = 0;
      runAny.waveBreathNextCombatAll = false;
    } else if (runAny.waveBreathNextCombatAll) {
      all += 1;
      runAny.waveBreathNextCombatAll = false;
    }

    (g as any)._waveBreathAllRemainingThisCombat = all;
    (g as any)._waveBreathForceRandomThisCombat = wbPatron || wbHostile;
    (g as any)._waveBreathNoAllThisCombat = wbHostile;
  }

}

export function applyFaithOnCardUsedHooks(g: GameState) {
  const patron = getPatronGodOrNull(g);
  const used = Number(g.usedThisTurn ?? 0) || 0;

  if (
    patron === "indifferent_one" &&
    used >= 5 &&
    !(g as any)._indifferentPatronPenaltyAppliedThisCombat
  ) {
    (g as any)._indifferentPatronPenaltyAppliedThisCombat = true;
    g.player.fatigue = (g.player.fatigue ?? 0) + 1;
    pushUiToast(g, "WARN", GOD_LINES.indifferent_one.at5Cards, 1800);
    logMsg(g, GOD_LINES.indifferent_one.at5Cards);
    logMsg(g, "아무렇지 않은 자: 5장 이상 사용(전투당 1회) → 피로 +1");
  }

  if (isHostile(g, "indifferent_one")) {
    const hostilePenaltyCount = Number((g as any)._indifferentHostilePenaltyAppliedThisCombat ?? 0) || 0;
    if (used >= 4 && hostilePenaltyCount < 3) {
      (g as any)._indifferentHostilePenaltyAppliedThisCombat = hostilePenaltyCount + 1;
      g.player.fatigue = (g.player.fatigue ?? 0) + 1;
      applyDamageToPlayer(g, 3, "OTHER", "아무렇지 않은 자");
      pushUiToast(g, "WARN", GOD_LINES.indifferent_one.hostileFirstUse, 1800);
      logMsg(g, GOD_LINES.indifferent_one.hostileFirstUse);
      logMsg(g, `아무렇지 않은 자(적대): 4장 이상 사용(전투당 ${(g as any)._indifferentHostilePenaltyAppliedThisCombat}/3회) → 피로 +1, HP -3`);
    }
  }
}

export function applyFaithUpkeepEndTurnHooks(g: GameState) {
  const patron = getPatronGodOrNull(g);

  if (patron === "indifferent_one" && (Number(g.usedThisTurn ?? 0) || 0) <= 1) {
    healPlayer(g, 2);
    g.player.block = (g.player.block ?? 0) + 6;
    (g as any)._gainedBlockThisTurn = true;
    pushUiToast(g, "INFO", GOD_LINES.indifferent_one.endTurnZero, 1800);
    logMsg(g, GOD_LINES.indifferent_one.endTurnZero);
    logMsg(g, "아무렇지 않은 자: 1장 이하 사용 → HP +2, 방어 +6");
  }

  if (patron === "armored_tiger") {
    const gained = !!(g as any)._gainedBlockThisTurn;
    if (!gained) {
      applyDamageToPlayer(g, 2, "OTHER", "중갑 입은 호랑이");
      pushUiToast(g, "WARN", GOD_LINES.armored_tiger.endTurnNoBlock, 1800);
      logMsg(g, GOD_LINES.armored_tiger.endTurnNoBlock);
    }
  }
}
