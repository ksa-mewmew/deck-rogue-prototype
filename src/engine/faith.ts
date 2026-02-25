
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
    patronPlus: "이동: 30% 확률로 시간이 흐르지 않음 / 시작 보급 10",
    patronMinus: "전투: 5턴마다 피로도 +1",
    temptation: "시간 -7, 피로도 +2",
    hostile: "이동에 걸리는 시간이 1 늘어남",
  },
  {
    id: "bright_darkness",
    name: "밝은 어둠",
    art: "assets/gods/bright_darkness.png",
    patronPlus: "지도: 이웃 노드 정보가 더 멀리 표시(시야 3)",
    patronMinus: "전투 시작: 자신 취약 1",
    temptation: "다음 3개 노드 내용 즉시 공개, 피로도 +1",
    hostile: "지도: 노드 정보가 전부 ? / 전투 시작: 자신 취약 2",
  },
  {
    id: "indifferent_one",
    name: "아무렇지 않은 자",
    art: "assets/gods/indifferent_one.png",
    patronPlus: "턴 종료: 카드 0장 사용 시 HP +2, 방어 +6",
    patronMinus: "턴: 5장 이상 사용 시 피로도 +1(1회)",
    temptation: "즉시 피로도 -5, 다음 전투 드로우 -1",
    hostile: "턴: 4장 이상 사용 시 피로도 +1(1회)",
  },
  {
    id: "armored_tiger",
    name: "중갑 입은 호랑이",
    art: "assets/gods/armored_tiger.png",
    patronPlus: "전투 시작: 방어 10",
    patronMinus: "턴 종료: 방어를 얻지 못했으면 HP -2",
    temptation: "최대 체력 +5, 피로도 +2",
    hostile: "전투 시작: 취약 2, 드로우 -1",
  },
  {
    id: "first_human",
    name: "첫 번째 인간",
    art: "assets/gods/first_human.png",
    patronPlus: "전투 보상: 카드 제시 +1",
    patronMinus: "상점: 비용 +50%",
    temptation: "카드 1장 선택 복제, 피로도 +3",
    hostile: "전투 보상: 카드 제시 -1 / 상점: 비용 +50%",
  },
  {
    id: "card_dealer",
    name: "카드 딜러",
    art: "assets/gods/card_dealer.png",
    patronPlus: "전투 시작: 드로우 +1",
    patronMinus: "전투 종료: 30% 확률로 골드 10 잃음",
    temptation: "골드 +40, 덱에 빚 문서(저주) 1장 추가",
    hostile: "전투 골드 보상 없음",
  },
  {
    id: "rabbit_hunt",
    name: "토끼 사냥",
    art: "assets/gods/rabbit_hunt.png",
    patronPlus: "전투 시작: 모든 적 취약 2",
    patronMinus: "방어도 획득량 -25%",
    temptation: "다음 3전투 동안 전투 시작 드로우 +1",
    hostile: "매 전투 첫 턴: 자신 취약 3",
  },
  {
    id: "forge_master",
    name: "화로의 주인",
    art: "assets/gods/forge_master.png",
    patronPlus: "시작: 화살/강력한 화살/방패가 강화된 채로 시작",
    patronMinus: "없음",
    temptation: "무작위 카드 1장 제거 후 2장 강화",
    hostile: "강화 불가 / 휴식 시 카드 1장 무작위 제거",
  },
];

export const GOD_LINES = {
  dream_shadow: {
    restHeal: "악몽을 꾸었습니까?",
    restUpgrade: "망치를 들 기운이 나지 않는군요.",
    tempt: "낮잠에서도 악몽은 찾아옵니다.",
    hostileRest: "꿈그림자가 당신의 휴식을 방해합니다.",
  },
  wing_artery: {
    moveNoTime: "당신은 떨어지는 핏방울보다 빠릅니다.",
    every5Turns: "날개가 시들고 있습니다.",
    tempt: "정신을 차려보니 이곳입니다.",
    apostasy: "새가 날개를 잃었군요.",
  },
  forge_master: {
    firstBattle: "당신의 철은 누구보다 단단합니다.",
    tempt: "화마가 철을 굽습니다.",
    hostileRestEnter: "불이 붙지 않습니다. 당신을 따르지 않습니다.",
  },
  bright_darkness: {
    nodeSelect: "빛이 당신을 인도합니다.",
    combatStart: "너무 밝아 숨을 곳이 없습니다.",
    tempt: "보이게 해주마. 대신 눈을 내어라.",
    hostileMap: "어둠이 당신의 눈을 먹었습니다.",
  },
  indifferent_one: {
    endTurnZero: "아무 일도 없었습니다.",
    at5Cards: "움직임이 과합니다.",
    tempt: "가만히 있어도, 굴러갑니다.",
    hostileFirstUse: "괜히 움직였군요.",
  },
  armored_tiger: {
    combatStart: "이빨은 벼려졌고, 갑옷은 닫혔습니다.",
    endTurnNoBlock: "호랑이는 당신을 대신 잡아먹습니다.",
    tempt: "무거워져라. 살아남아라.",
    hostileCombat: "틈이 보입니다.",
  },
  first_human: {
    reward: "배웁니다. 따라합니다.",
    shop: "순수주의자인 당신은 고블린이 달갑지 않습니다.",
    tempt: "첫 번째는 항상, 다시 태어납니다.",
    hostileReward: "지식은 잊힙니다.",
  },
  card_dealer: {
    combatStart: "판을 깔아드리죠.",
    victoryFee: "수수료는 당연히 받습니다.",
    tempt: "오늘만 외상입니다.",
    hostileShop: "딜러를 배신하고도 돈이 남아있군요?.",
  },
  rabbit_hunt: {
    combatStart: "먼저 잡습니다.",
    blockGain: "가벼운 방패는 잘 부러집니다.",
    tempt: "더 빨리. 더 깊이.",
    hostileCombatStart: "이번엔 당신이 쫓깁니다.",
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
    "forge_master",
    "bright_darkness",
    "indifferent_one",
    "armored_tiger",
    "first_human",
    "card_dealer",
    "rabbit_hunt",
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
    forge_master: 0,
    bright_darkness: 0,
    indifferent_one: 0,
    armored_tiger: 0,
    first_human: 0,
    card_dealer: 0,
    rabbit_hunt: 0,
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
    forge_master: 0,
    bright_darkness: 0,
    indifferent_one: 0,
    armored_tiger: 0,
    first_human: 0,
    card_dealer: 0,
    rabbit_hunt: 0,
    madness: 0,
  } as any;

  const ensure0 = (id: GodId) => {
    const v = Number((f.points as any)[id]);
    if (!Number.isFinite(v)) (f.points as any)[id] = 0;
  };
  for (const id of [
    "dream_shadow",
    "wing_artery",
    "forge_master",
    "bright_darkness",
    "indifferent_one",
    "armored_tiger",
    "first_human",
    "card_dealer",
    "rabbit_hunt",
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

export function setHostile(g: GameState, id: GodId, msg?: string) {
  const f = ensureFaith(g);
  f.hostile ??= {};
  f.hostile[id] = true;
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

  if (god === "forge_master") {
    const ids = Object.values(g.cards)
      .filter((c) => c.zone === "deck" && ["arrow", "power_arrow", "shield"].includes(c.defId))
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
    prompt: "세 신 중 하나를 선택합니다. (점수 총합 5, 유혹 수락 시 +1/-1, 후원 유지 기준: 포커스 ≥3)",
    options,
  };

  setChoice(g, choice, { kind: "FAITH_START", offered: off });
}


export function pickTemptingGod(g: GameState): Exclude<GodId, "madness"> | null {
  const f = ensureFaith(g);
  if (!f.chosen) return null;

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
  if (id === "forge_master") return "무작위 카드 1장 제거 후 2장 강화";
  if (id === "bright_darkness") return "다음 3개 노드의 내용이 즉시 공개, 피로도 +1";
  if (id === "indifferent_one") return "즉시 피로도 -5, 대신 다음 전투 드로우 -1";
  if (id === "armored_tiger") return "최대 체력 +5, 피로도 +2";
  if (id === "first_human") return "카드 1장 선택 복제, 피로도 +3";
  if (id === "card_dealer") return "골드 +40, 덱에 ‘빚 문서’(저주) 1장 추가";
  if (id === "rabbit_hunt") return "다음 3전투 동안 전투 시작 드로우 +1";
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

  if (tempter === "bright_darkness") {
    const map: any = (g.run as any).map as any;
    const pos = String(map?.pos ?? "");
    const edges: Record<string, string[]> = (map?.edges ?? {}) as any;
    const seen: Record<string, 0 | 1 | 2 | 3> = (map.seen ??= {});

    const MAX_D = 3;
    const dist: Record<string, number> = {};
    const q: string[] = [];
    if (pos) {
      dist[pos] = 0;
      q.push(pos);
    }
    while (q.length) {
      const cur = q.shift()!;
      const d = dist[cur] ?? 0;
      if (d >= MAX_D) continue;
      for (const nx of edges[cur] ?? []) {
        if (dist[nx] != null) continue;
        dist[nx] = d + 1;
        q.push(nx);
      }
    }

    let revealed = 0;
    for (const id of Object.keys(dist)) {
      if (id === pos) continue;
      if ((dist[id] ?? 999) > MAX_D) continue;
      if ((seen[id] ?? 0) >= 3) continue;
      seen[id] = 3;
      revealed += 1;
    }

    g.player.fatigue = (g.player.fatigue ?? 0) + 1;
    logMsg(g, `유혹: 거리 ${MAX_D}까지 노드 ${revealed}개 공개, 피로 +1`);
    return;
  }

  if (tempter === "indifferent_one") {
    g.player.fatigue = Math.max(0, (g.player.fatigue ?? 0) - 5);
    const runAny = g.run as any;
    runAny.nextCombatDrawDelta = (Number(runAny.nextCombatDrawDelta ?? 0) || 0) - 1;
    logMsg(g, "유혹: 피로 -5, 다음 전투 드로우 -1");
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

  if (betrayed === "wing_artery") {
    pushUiToast(g, "WARN", GOD_LINES.wing_artery.apostasy, 2200);
    logMsg(g, GOD_LINES.wing_artery.apostasy);
  }

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
    if (first && first.hp > 0 && !String(first.id ?? "").startsWith("boss_")) {
      applyStatusTo(first as any, "vuln", 4, g, "SYSTEM");
      applyStatusTo(first as any, "weak", 4, g, "SYSTEM");
      logMsg(g, "광기: 첫번째 적 취약/약화 4");
    }
  }

  if (boon === 1) {
    const first = g.enemies?.[0];
    if (first && first.hp > 0 && !String(first.id ?? "").startsWith("boss_")) {
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
    if (Math.random() < 0.3) {
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
  return patron === "wing_artery" ? 3 : 0;
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
  if (patron === "card_dealer") d += 1;
  if (isHostile(g, "armored_tiger")) d -= 1;
  return d;
}

export function applyFaithCombatStartHooks(g: GameState) {
  const patron = getPatronGodOrNull(g);

  if (patron === "bright_darkness") {
    applyStatusTo(g.player as any, "vuln", 1, g, "SYSTEM");
    pushUiToast(g, "WARN", GOD_LINES.bright_darkness.combatStart, 1800);
    logMsg(g, GOD_LINES.bright_darkness.combatStart);
  }
  if (isHostile(g, "bright_darkness")) {
    applyStatusTo(g.player as any, "vuln", 2, g, "SYSTEM");
    logMsg(g, "밝은 어둠(적대): 전투 시작 취약 2");
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
      if (en && en.hp > 0) applyStatusTo(en as any, "vuln", 2, g, "SYSTEM");
    }
    pushUiToast(g, "INFO", GOD_LINES.rabbit_hunt.combatStart, 1800);
    logMsg(g, GOD_LINES.rabbit_hunt.combatStart);
    logMsg(g, "토끼 사냥: 모든 적 취약 2");
  }
  if (isHostile(g, "rabbit_hunt")) {
    applyStatusTo(g.player as any, "vuln", 3, g, "SYSTEM");
    pushUiToast(g, "WARN", GOD_LINES.rabbit_hunt.hostileCombatStart, 1800);
    logMsg(g, GOD_LINES.rabbit_hunt.hostileCombatStart);
    logMsg(g, "토끼 사냥(적대): 전투 시작 취약 3");
  }
}

export function applyFaithOnCardUsedHooks(g: GameState) {
  const patron = getPatronGodOrNull(g);
  const used = Number(g.usedThisTurn ?? 0) || 0;

  if (patron === "indifferent_one" && used === 5) {
    g.player.fatigue = (g.player.fatigue ?? 0) + 1;
    pushUiToast(g, "WARN", GOD_LINES.indifferent_one.at5Cards, 1800);
    logMsg(g, GOD_LINES.indifferent_one.at5Cards);
    logMsg(g, "아무렇지 않은 자: 5장째 사용 → 피로 +1");
  }

  if (isHostile(g, "indifferent_one")) {
    if (used === 1 && !(g as any)._indifferentHostileWarnedThisTurn) {
      (g as any)._indifferentHostileWarnedThisTurn = true;
      pushUiToast(g, "WARN", GOD_LINES.indifferent_one.hostileFirstUse, 1800);
      logMsg(g, GOD_LINES.indifferent_one.hostileFirstUse);
    }
    if (used === 4) {
      g.player.fatigue = (g.player.fatigue ?? 0) + 1;
      logMsg(g, "아무렇지 않은 자(적대): 4장째 사용 → 피로 +1");
    }
  }
}

export function applyFaithUpkeepEndTurnHooks(g: GameState) {
  const patron = getPatronGodOrNull(g);

  if (patron === "indifferent_one" && (Number(g.usedThisTurn ?? 0) || 0) === 0) {
    healPlayer(g, 2);
    g.player.block = (g.player.block ?? 0) + 6;
    (g as any)._gainedBlockThisTurn = true;
    pushUiToast(g, "INFO", GOD_LINES.indifferent_one.endTurnZero, 1800);
    logMsg(g, GOD_LINES.indifferent_one.endTurnZero);
    logMsg(g, "아무렇지 않은 자: 0장 사용 → HP +2, 방어 +6");
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
