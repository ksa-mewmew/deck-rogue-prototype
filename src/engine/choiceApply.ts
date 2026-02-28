import type { ChoiceOption, ChoiceState, GameState, GodId, TemptGodId } from "./types";
import { applyRewardChoiceKey, openBattleCardRewardChoice, openShopChoice } from "./engineRewards";
import { clearAllChoices, setChoice } from "./choice";
import { logMsg, pushUiToast } from "./rules";
import { applyPendingRelicActivations, checkRelicUnlocks, getUnlockProgress, grantRelic } from "./relics";
import { displayCardTextPair, displayCardNameForUid, displayCardNameWithUpgrade } from "./cardText";
import { getEventById } from "../content/events";
import { getCardDefByIdWithUpgrade } from "../content/cards";
import { canUpgradeUid, upgradeCardByUid, removeCardByUid, addCardToDeck } from "../content/rewards";
import { healPlayer, applyDamageToPlayer } from "./effects";
import { addItemToInventory, isItemInventoryFull } from "./items";
import { getItemDefById } from "../content/items";
import { RELICS_BY_ID } from "../content/relicsContent";
import {
  acceptMadness,
  acceptTemptation,
  applyDreamShadowRestHeal,
  applyDreamShadowRestUpgradePenalty,
  applyTemptationEffect,
  chooseStartingGod,
  ensureFaith,
  godName,
  isForgeHostile,
  rejectMadness,
  shopPriceGold,
  wingArteryBaseSuppliesBonus,
  consumeRetortFusionRestCoupon,
} from "./faith";

function getGold(g: GameState): number {
  return Number((g.run as any).gold ?? 0) || 0;
}

function addGold(g: GameState, delta: number) {
  const d = Number(delta) || 0;
  if (d === 0) return;

  const cur = getGold(g);
  (g.run as any).gold = cur + d;

  const sign = d > 0 ? "+" : "";
  pushUiToast(g, "GOLD", "🪙 " + sign + d, 1400);
}

function getNextBattleSuppliesBonus(g: GameState): number {
  return Number((g.run as any).nextBattleSuppliesBonus ?? 0) || 0;
}

function addNextBattleSuppliesBonus(g: GameState, delta: number) {
  const cur = getNextBattleSuppliesBonus(g);
  let next = cur + (Number(delta) || 0);
  // 다음 전투 보급은 최소 0이어야 하므로(기본 7), 보너스 하한은 -7
  if (next < -7) next = -7;
  (g.run as any).nextBattleSuppliesBonus = next;
}

function nextBattleSupplies(g: GameState): number {
  return Math.max(0, 7 + getNextBattleSuppliesBonus(g) + wingArteryBaseSuppliesBonus(g));
}


function applyRestHighF(g: GameState, highF: boolean) {
  if (!highF) return;
  const f = g.player.fatigue ?? 0;
  if (f < 10) return;

  g.player.fatigue = Math.max(0, f - 2);
  g.time = (g.time ?? 0) + 1;
  logMsg(g, "피로가 너무 높아 휴식이 더 오래 걸립니다. (F -2, 시간 +1)");
}

const SYNTH_TAG_SPECS = [
  { id: "overrun", label: "폭주", detail: "모든 수 +1", costHp: 10, costF: 2, overrun: true },
  { id: "install", label: "설치", detail: "설치 부여", costHp: 5, costF: 0, addTag: "INSTALL" as const },
  { id: "innate", label: "선천성", detail: "선천성 부여", costHp: 5, costF: 0, addTag: "INNATE" as const },
  { id: "flip", label: "뒤집기", detail: "발동 후 자동 뒤집기", costHp: 0, costF: 1, autoFlip: true },
  { id: "remove_exhaust", label: "소모 제거", detail: "소모 제거", costHp: 8, costF: 1, removeExhaust: true },
] as const;

type SynthTagSpec = (typeof SYNTH_TAG_SPECS)[number];

function synthGuideText() {
  return SYNTH_TAG_SPECS
    .map((s) => `- ${s.label}: ${s.detail} (HP -${s.costHp}${s.costF ? `, F +${s.costF}` : ""})`)
    .join("\n");
}

function buildUpgradePickChoice(g: GameState): ChoiceState | null {
  let candidates = Object.values(g.cards)
    .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && canUpgradeUid(g, c.uid))
    .map((c) => c.uid);

  const f = g.player.fatigue ?? 0;
  let limit = Infinity;
  if (f >= 8) limit = 4;
  else if (f >= 5) limit = 8;

  if (limit !== Infinity && candidates.length > limit) {
    candidates = [...candidates].sort(() => Math.random() - 0.5).slice(0, limit);
  }

  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((ua, ub) => {
    const a = g.cards[ua];
    const b = g.cards[ub];
    const na = (g.content.cardsById[a.defId]?.name ?? a.defId);
    const nb = (g.content.cardsById[b.defId]?.name ?? b.defId);
    const nc = na.localeCompare(nb, "ko");
    if (nc !== 0) return nc;
    return (a.upgrade ?? 0) - (b.upgrade ?? 0);
  });

  const options: ChoiceOption[] = [
    ...sorted.map((uid) => {
      const c = g.cards[uid];
      const curDef = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
      const nextDef = getCardDefByIdWithUpgrade(g.content, c.defId, (c.upgrade ?? 0) + 1);

      const label = displayCardNameForUid(g, uid);
      const curText = displayCardTextPair(g, curDef.frontText, curDef.backText, uid);
      const nextText = displayCardTextPair(g, nextDef.frontText, nextDef.backText, uid);
      const detail =
        `현재: 전열 ${curText.frontText} / 후열 ${curText.backText}\n` +
        `강화: 전열 ${nextText.frontText} / 후열 ${nextText.backText}`;

      return { key: `up:${uid}`, label, detail, cardUid: uid };
    }),
    { key: "skip", label: "취소" },
  ];

  return {
    kind: "UPGRADE_PICK" as any,
    title: "강화",
    prompt: "강화할 카드 1장을 선택하세요.",
    options,
  };
}


function buildRemovePickChoice(g: GameState, title: string, prompt: string): ChoiceState | null {
  // NOTE: "저주받은 보물"(goal_treasure)은 런의 핵심 목표 카드라 제거 선택지에서 제외
  const CURSED_TREASURE_ID = "goal_treasure";
  const candidates = Object.values(g.cards)
    .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && c.defId !== CURSED_TREASURE_ID)
    .map((c) => c.uid);

  if (candidates.length === 0) return null;

  const options: ChoiceOption[] = [
    ...candidates.map((uid) => {
      const c = g.cards[uid];
      const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
      const label = displayCardNameForUid(g, uid);
      const t = displayCardTextPair(g, def.frontText, def.backText, uid);
      return { key: `remove:${uid}`, label, detail: `전열: ${t.frontText} / 후열: ${t.backText}`, cardUid: uid };
    }),
    { key: "skip", label: "취소" },
  ];

  return { kind: "REMOVE_PICK" as any, title, prompt, options };
}

function buildSynthPickChoice(g: GameState): ChoiceState | null {
  const CURSED_TREASURE_ID = "goal_treasure";
  const candidates = Object.values(g.cards)
    .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && c.defId !== CURSED_TREASURE_ID)
    .filter((c) => !Boolean((c as any).synth?.done))
    .map((c) => c.uid);

  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((ua, ub) => {
    const a = g.cards[ua];
    const b = g.cards[ub];
    const na = (g.content.cardsById[a.defId]?.name ?? a.defId);
    const nb = (g.content.cardsById[b.defId]?.name ?? b.defId);
    const nc = na.localeCompare(nb, "ko");
    if (nc !== 0) return nc;
    return (a.upgrade ?? 0) - (b.upgrade ?? 0);
  });

  const options: ChoiceOption[] = [
    ...sorted.map((uid) => {
      const c = g.cards[uid];
      const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
      const label = displayCardNameForUid(g, uid);
      const t = displayCardTextPair(g, def.frontText, def.backText, uid);
      return { key: `synth:pick:${uid}`, label, detail: `전열: ${t.frontText} / 후열: ${t.backText}`, cardUid: uid };
    }),
    { key: "skip", label: "취소" },
  ];

  return {
    kind: "EVENT",
    title: "합성",
    art: "assets/events/event_retort_fusion_synth.png",
    prompt: "합성할 카드 1장을 선택하세요.",
    options,
  } as any;
}

function buildSynthTagChoice(g: GameState, uid: string): ChoiceState | null {
  const inst: any = g.cards[uid];
  if (!inst) return null;
  if (inst.synth?.done) return null;

  const label = displayCardNameForUid(g, uid);

  const options: ChoiceOption[] = [
    ...SYNTH_TAG_SPECS.map((s) => {
      const cost = `HP -${s.costHp}${s.costF ? `, F +${s.costF}` : ""}`;
      return { key: `synth:tag:${s.id}`, label: `${s.label}`, detail: `${s.detail}\n(${cost})` };
    }),
    { key: "skip", label: "취소" },
  ];

  return {
    kind: "EVENT",
    title: `합성: ${label}`,
    art: "assets/events/event_retort_fusion_synth.png",
    prompt: "부여할 합성 효과를 선택하세요.",
    options,
  } as any;
}

function applyRestChoiceKey(g: GameState, key: string): boolean {
  const highF =
    g.choiceCtx && g.choiceCtx.kind === "REST" && typeof g.choiceCtx.highF === "boolean"
      ? g.choiceCtx.highF
      : (g.player.fatigue ?? 0) >= 10;

  if (key.startsWith("rest:") && key !== "rest:synth") consumeRetortFusionRestCoupon(g);

  // 유물 해금 진행도: 휴식 1회
  if (key.startsWith("rest:")) {
    const up = getUnlockProgress(g);
    up.rest += 1;
    checkRelicUnlocks(g);
  }

  if (key === "rest:heal") {
    applyRestHighF(g, highF);
    const handled = applyDreamShadowRestHeal(g);
    if (!handled.healed) {
      healPlayer(g, 15);
      logMsg(g, "휴식: HP +15");
    }
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  if (key === "rest:clear_f") {
    applyRestHighF(g, highF);
    g.player.fatigue = Math.max(0, (g.player.fatigue ?? 0) - 3);
    logMsg(g, "휴식: 피로 F-=3");
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  if (key === "rest:upgrade") {
    if (isForgeHostile(g)) {
      logMsg(g, "강화할 수 없습니다.");
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }

    // 꿈그림자: 강화 선택 시 피로만큼 피해 (후원(-) / 적대)
    applyDreamShadowRestUpgradePenalty(g);

    const all = Object.values(g.cards).filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard");
    const candidates = all.filter((c) => canUpgradeUid(g, c.uid));

    const options: ChoiceOption[] = [
      ...candidates.map((c) => {
        const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
        const label = displayCardNameForUid(g, c.uid);
        const t = displayCardTextPair(g, def.frontText, def.backText, c.uid);
        return { key: `up:${c.uid}`, label, detail: `전열: ${t.frontText} / 후열: ${t.backText}`, cardUid: c.uid };
      }),
      { key: "skip", label: "취소" },
    ];

    const returnChoice = g.choice;
    const returnCtx = g.choiceCtx;

    setChoice(
      g,
      { kind: "UPGRADE_PICK" as any, title: "강화", prompt: "강화할 카드 1장을 선택하세요.", options },
      { kind: "UPGRADE_PICK" as any, returnChoice, returnCtx } as any
    );
    return true;
  }

  if (key === "rest:synth") {
    applyRestHighF(g, highF);

    const next = buildSynthPickChoice(g);
    if (!next) {
      logMsg(g, "합성할 카드가 없습니다.");
      return true;
    }

    const returnChoice = g.choice;
    const returnCtx = g.choiceCtx;

    setChoice(g, next, { kind: "SYNTH_PICK" as any, returnChoice, returnCtx } as any);
    return true;
  }

  if (key === "rest:skip") {
    applyRestHighF(g, highF);
    logMsg(g, "휴식: 생략");
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  return false;
}

function applySynthPickChoiceKey(g: GameState, key: string): boolean {
  const anyCtx = g.choiceCtx as any;
  if (!anyCtx || anyCtx.kind !== "SYNTH_PICK") return false;

  if (key === "skip") {
    if (anyCtx.returnChoice) {
      setChoice(g, anyCtx.returnChoice, anyCtx.returnCtx ?? null);
      return true;
    }
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  if (!key.startsWith("synth:pick:")) return false;
  const uid = key.slice("synth:pick:".length);

  const next = buildSynthTagChoice(g, uid);
  if (!next) {
    logMsg(g, "합성할 수 없는 카드입니다.");
    if (anyCtx.returnChoice) {
      setChoice(g, anyCtx.returnChoice, anyCtx.returnCtx ?? null);
      return true;
    }
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  setChoice(g, next, { kind: "SYNTH_TAG" as any, cardUid: uid, returnChoice: anyCtx.returnChoice, returnCtx: anyCtx.returnCtx } as any);
  return true;
}

function applySynthTagChoiceKey(g: GameState, key: string): boolean {
  const anyCtx = g.choiceCtx as any;
  if (!anyCtx || anyCtx.kind !== "SYNTH_TAG") return false;

  const uid = String(anyCtx.cardUid ?? "");
  const inst: any = g.cards[uid];
  if (!inst) {
    logMsg(g, "합성 실패: 카드를 찾을 수 없습니다.");
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  if (key === "skip") {
    const back = buildSynthPickChoice(g);
    if (back) {
      setChoice(g, back, { kind: "SYNTH_PICK" as any, returnChoice: anyCtx.returnChoice, returnCtx: anyCtx.returnCtx } as any);
      return true;
    }
    if (anyCtx.returnChoice) {
      setChoice(g, anyCtx.returnChoice, anyCtx.returnCtx ?? null);
      return true;
    }
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  if (!key.startsWith("synth:tag:")) return false;
  const id = key.slice("synth:tag:".length);
  const spec = SYNTH_TAG_SPECS.find((s) => s.id === id) as SynthTagSpec | undefined;
  if (!spec) {
    logMsg(g, "합성 실패: 알 수 없는 태그");
    return true;
  }

  if (inst.synth?.done) {
    logMsg(g, "이미 합성된 카드입니다.");
    return true;
  }

  inst.synth ??= {};
  inst.synth.done = true;

  if ("overrun" in spec && spec.overrun) inst.synth.overrun = true;
  if ("autoFlip" in spec && spec.autoFlip) inst.synth.autoFlip = true;
  if ("removeExhaust" in spec && spec.removeExhaust) inst.synth.removeExhaust = true;

  if ("addTag" in spec && spec.addTag) {
    inst.synth.addTags ??= [];
    if (!inst.synth.addTags.includes(spec.addTag)) inst.synth.addTags.push(spec.addTag);
  }

  if (spec.costHp > 0) applyDamageToPlayer(g, spec.costHp, "OTHER", "합성");
  if (spec.costF > 0) g.player.fatigue = (g.player.fatigue ?? 0) + spec.costF;

  logMsg(g, `합성 완료: ${spec.label} (HP -${spec.costHp}${spec.costF ? `, F +${spec.costF}` : ""})`);

  consumeRetortFusionRestCoupon(g);

  clearAllChoices(g);
  g.phase = "NODE";
  applyPendingRelicActivations(g);
  return true;
}


function applyShopChoiceKey(g: GameState, key: string): boolean {
  if (!g.choiceCtx || (g.choiceCtx as any).kind !== "SHOP") return false;

  const nodeId = String((g.choiceCtx as any).nodeId ?? "");
  if (!nodeId) return false;

  const runAny = g.run as any;
  runAny.shops ??= {};
  const shop = runAny.shops[nodeId];
  if (!shop) {
    openShopChoice(g, nodeId);
    return true;
  }

  // 나가기
  if (key === "shop:leave") {
    logMsg(g, "상점: 떠난다.");
    clearAllChoices(g);
    g.phase = "NODE";
    return true;
  }

  if (key === "shop:sep" || key.startsWith("shop:sep:")) {
    openShopChoice(g, nodeId);
    return true;
  }

  // 카드 구매
  if (key.startsWith("shop:card:")) {
    const idx = Number(key.slice("shop:card:".length));
    const offer = shop.cards?.[idx];
    if (!offer) {
      logMsg(g, "상점: 알 수 없는 카드 선택입니다.");
      openShopChoice(g, nodeId);
      return true;
    }
    if (offer.sold) {
      logMsg(g, "상점: 품절되었습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    const price = shopPriceGold(g, Number(offer.priceGold ?? 0) || 0);
    if (getGold(g) < price) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    addGold(g, -price);
    addCardToDeck(g, offer.defId, { upgrade: Number(offer.upgrade ?? 0) || 0 });
    offer.sold = true;

    logMsg(g, `상점: 카드 구매 (-🪙${price})`);
    openShopChoice(g, nodeId);
    return true;
  }

  // 아이템 구매
  if (key.startsWith("shop:item:")) {
    const idx = Number(key.slice("shop:item:".length));
    const offer = shop.items?.[idx];
    if (!offer) {
      logMsg(g, "상점: 알 수 없는 아이템 선택입니다.");
      openShopChoice(g, nodeId);
      return true;
    }
    if (offer.sold) {
      logMsg(g, "상점: 품절되었습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    if (isItemInventoryFull(g)) {
      logMsg(g, "아이템 가방이 가득 찼습니다. 먼저 버리거나(우클릭) 사용하세요.");
      pushUiToast(g, "WARN", "아이템 가방이 가득 찼습니다.", 1600);
      openShopChoice(g, nodeId);
      return true;
    }

    if (isItemInventoryFull(g)) {
      logMsg(g, "아이템 가방이 가득 찼습니다. 먼저 버리거나(우클릭) 사용하세요.");
      pushUiToast(g, "WARN", "아이템 가방이 가득 찼습니다.", 1600);
      openShopChoice(g, nodeId);
      return true;
    }

    const price = shopPriceGold(g, Number(offer.priceGold ?? 0) || 0);
    if (getGold(g) < price) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    addGold(g, -price);
    const ok = addItemToInventory(g, String(offer.itemId), "SHOP");
    if (!ok) {
      addGold(g, price);
      logMsg(g, "상점: 아이템 구매 실패(환불)");
      openShopChoice(g, nodeId);
      return true;
    }
    offer.sold = true;

    const nm = getItemDefById(String(offer.itemId))?.name ?? String(offer.itemId);
    logMsg(g, `상점: 아이템 구매 (${nm}) (-🪙${price})`);
    openShopChoice(g, nodeId);
    return true;
  }

  // 유물 구매
  if (key.startsWith("shop:relic:")) {
    const idx = Number(key.slice("shop:relic:".length));
    const offer = shop.relics?.[idx];
    if (!offer) {
      logMsg(g, "상점: 알 수 없는 유물 선택입니다.");
      openShopChoice(g, nodeId);
      return true;
    }
    if (offer.sold) {
      logMsg(g, "상점: 품절되었습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    const price = shopPriceGold(g, Number(offer.priceGold ?? 0) || 0);
    if (getGold(g) < price) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    addGold(g, -price);
    grantRelic(g, String(offer.relicId), "NORMAL");

    const rid = String(offer.relicId);
    g.run.relicUnlocked ??= {};
    g.run.relicUnlocked[rid as any] = true as any;

    (g.run as any).relicRuntime ??= {};
    const prev = ((g.run as any).relicRuntime[rid] ?? {}) as any;
    const wasActive = !!prev.active;
    (g.run as any).relicRuntime[rid] = {
      ...prev,
      active: true,
      pending: false,
      obtainedAtNode: prev.obtainedAtNode ?? g.run.nodePickCount,
      activatedAtNode: g.run.nodePickCount,
    };

    if (!wasActive) {
      const def: any = (RELICS_BY_ID as any)[rid];
      def?.onActivate?.(g);
    }

    offer.sold = true;

    const name = (RELICS_BY_ID as any)?.[rid]?.name ?? rid;
    logMsg(g, `상점: 유물 구매 (${name}) (-🪙${price})`);
    openShopChoice(g, nodeId);
    return true;
  }

  // 보급
  if (key === "shop:supply:buy") {
    const priceG = shopPriceGold(g, 6);
    const gainS = 3;
    if (getGold(g) < priceG) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    addGold(g, -priceG);
    addNextBattleSuppliesBonus(g, gainS);
    logMsg(g, `상점: 보급 구매 (-🪙${priceG}, 다음 전투 S +${gainS})`);
    openShopChoice(g, nodeId);
    return true;
  }

  if (key === "shop:supply:sell") {
    const costS = 3;
    const gainG = 4;
    if (nextBattleSupplies(g) < costS) {
      logMsg(g, "다음 전투 보급이 부족하여 판매할 수 없습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    addNextBattleSuppliesBonus(g, -costS);
    addGold(g, gainG);
    logMsg(g, `상점: 보급 판매 (다음 전투 S -${costS}, 🪙 +${gainG})`);
    openShopChoice(g, nodeId);
    return true;
  }

  // 서비스: 강화/제거
  if (key === "shop:service:upgrade") {
    if (shop.usedUpgrade) {
      logMsg(g, "상점: 강화는 이 상점에서 이미 사용했습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    const price = shopPriceGold(g, 25);
    if (getGold(g) < price) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    const next = buildUpgradePickChoice(g);
    if (!next) {
      logMsg(g, "강화할 수 있는 카드가 없습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    setChoice(g, next, { kind: "UPGRADE_PICK" as any, returnTo: { kind: "SHOP", nodeId }, priceGold: price } as any);
    return true;
  }

  if (key === "shop:service:remove") {
    if (shop.usedRemove) {
      logMsg(g, "상점: 제거는 이 상점에서 이미 사용했습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    const price = shopPriceGold(g, 25);
    if (getGold(g) < price) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    const next = buildRemovePickChoice(g, "상점: 카드 제거", "제거할 카드 1장을 선택하세요.");
    if (!next) {
      logMsg(g, "제거할 카드가 없습니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    setChoice(g, next, { kind: "REMOVE_PICK" as any, returnTo: { kind: "SHOP", nodeId }, priceGold: price } as any);
    return true;
  }

  if (key.startsWith("shop:")) {
    logMsg(g, `상점: 알 수 없는 선택 (${key})`);
    openShopChoice(g, nodeId);
    return true;
  }

  return false;
}


function applyEventChoiceKey(g: GameState, key: string): boolean {
  if (!g.choiceCtx || g.choiceCtx.kind !== "EVENT") return false;

  const ev = getEventById(g.choiceCtx.eventId);
  if (!ev) return false;

  const opts = ev.options(g);
  const picked = opts.find((o) => o.key === key);
  if (!picked) return false;
  
  // 유물 해금 진행도: 이벤트 선택 1회
  const up = getUnlockProgress(g);
  up.eventPicks += 1;
  checkRelicUnlocks(g);
  
  const outcome = picked.apply(g) as any;




  if (outcome && typeof outcome === "object" && outcome.kind === "UPGRADE_PICK") {
    const next = buildUpgradePickChoice(g);
    if (!next) {
      logMsg(g, "강화할 수 있는 카드가 없습니다.");
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }
    setChoice(g, next, null);
    return true;
  }

  if (outcome && typeof outcome === "object" && outcome.kind === "REMOVE_PICK") {
    const candidates = Object.values(g.cards)
      .filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard")
      .map((c) => c.uid);

    const options: ChoiceOption[] = [
      ...candidates.map((uid) => {
        const c = g.cards[uid];
        const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
        const label = displayCardNameForUid(g, uid);
        const t = displayCardTextPair(g, def.frontText, def.backText, uid);
        return { key: `remove:${uid}`, label, detail: `전열: ${t.frontText} / 후열: ${t.backText}`, cardUid: uid };
      }),
      { key: "skip", label: "취소" },
    ];

    setChoice(g, { kind: "REMOVE_PICK" as any, title: outcome.title ?? "제거", prompt: outcome.prompt ?? "제거할 카드 1장을 선택하세요.", options }, null);
    return true;
  }

  clearAllChoices(g);
  g.phase = "NODE";
  applyPendingRelicActivations(g);
  return true;
}

export function applyChoiceKey(g: GameState, key: string): boolean {
  const c = g.choice;
  if (!c) return false;

  if (key === "close") {
    clearAllChoices(g);
    return true;
  }

  if (c.kind === "REWARD") return applyRewardChoiceKey(g, key);


  if (c.kind === "FAITH") {
    if (!g.choiceCtx || g.choiceCtx.kind !== "FAITH_START") return false;
    if (!key.startsWith("faith:choose:")) return false;
    const id = key.slice("faith:choose:".length) as any;
    chooseStartingGod(g, id);
    ensureFaith(g);
    clearAllChoices(g);
    g.phase = "NODE";
    applyPendingRelicActivations(g);
    return true;
  }

  if (c.kind === "GOD_TEMPT") {
    const ctx = g.choiceCtx;
    if (!ctx || ctx.kind !== "GOD_TEMPT") return false;
    const tempter = ctx.tempter;

    if (key === "tempt:reject") {
      logMsg(g, `유혹 거부: ${godName(tempter)}`);
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }

    if (key === "tempt:accept") {
      const tempter = (ctx as any).tempter as TemptGodId;

      if (tempter === ("first_human" as any)) {
        // first_human: 비용/신앙 이동은 수락 시점에 확정
        g.player.fatigue = (g.player.fatigue ?? 0) + 3;
        logMsg(g, "유혹: 피로 +3");

        acceptTemptation(g, tempter);

        const candidates = Object.values(g.cards)
          .filter((cc) => (cc.zone === "deck" || cc.zone === "hand" || cc.zone === "discard") && cc.defId !== "goal_treasure")
          .map((cc) => cc.uid);

        const options: ChoiceOption[] = [
          ...candidates.map((uid) => {
            const card = g.cards[uid];
            const def = getCardDefByIdWithUpgrade(g.content, card.defId, card.upgrade ?? 0);
            const label = displayCardNameForUid(g, uid);
            const t = displayCardTextPair(g, def.frontText, def.backText, uid);
            return { key: `dup:${uid}`, label, detail: `전열: ${t.frontText} / 후열: ${t.backText}`, cardUid: uid };
          }),
          { key: "skip", label: "복제하지 않는다" },
        ];

        setChoice(
          g,
          {
            kind: "PICK_CARD",
            title: "복제",
            prompt: "복제할 카드 1장을 선택하세요.",
            options,
          },
          { kind: "FIRST_HUMAN_DUP" } as any
        );
        return true;
      }



      if (tempter === ("twin_heart" as any)) {
        acceptTemptation(g, tempter);

        clearAllChoices(g);
        g.phase = "NODE";
        openBattleCardRewardChoice(g);
        applyPendingRelicActivations(g);
        return true;
      }
      // 일반 유혹
      acceptTemptation(g, tempter);
      applyTemptationEffect(g, tempter);

      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }
    return false;
  }

  const anyCtx = g.choiceCtx as any;
  if (anyCtx?.kind === "PICK_VANISHED_TO_HAND") {
    if (key === "cancel") {
      clearAllChoices(g);
      return true;
    }

    if (key.startsWith("pickVanished:")) {
      const uid = key.slice("pickVanished:".length);
      const inst = g.cards[uid];
      if (inst && inst.zone === "vanished") {
        inst.zone = "hand";
        if (!g.hand.includes(uid)) g.hand.push(uid);
        g.vanished = g.vanished.filter((x) => x !== uid);
        const def = g.content.cardsById[inst.defId];
        const nm = def?.name ?? inst.defId;
        logMsg(g, `소실 카드 회수: ${nm}`);
      }
      clearAllChoices(g);
      return true;
    }

    return false;
  }

  if (c.kind === "PICK_CARD") {
    const anyCtx = g.choiceCtx as any;
    if (anyCtx?.kind !== "FIRST_HUMAN_DUP") return false;

    if (key === "skip") {
      logMsg(g, "복제 취소");
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }

    if (key.startsWith("dup:")) {
      const uid = key.slice("dup:".length);
      const card = g.cards[uid];
      if (!card) {
        logMsg(g, "복제 실패: 카드를 찾을 수 없습니다.");
      } else {
        addCardToDeck(g, card.defId, { upgrade: Number(card.upgrade ?? 0) || 0 });
        const nm = (g.content.cardsById[card.defId]?.name ?? card.defId);
        const label = (card.upgrade ?? 0) > 0 ? `${nm} +${card.upgrade}` : nm;
        logMsg(g, `유혹: 카드 복제 (${label})`);
      }
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }

    return false;
  }

  if (c.kind === "MADNESS_TEMPT") {
    const ctx = g.choiceCtx as any;
    if (!ctx || ctx.kind !== "MADNESS_TEMPT") return false;

    if (key === "madness:accept") {
      acceptMadness(g, ctx.offerBoon);
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }

    if (key === "madness:reject") {
      rejectMadness(g, ctx.offerBane);
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }
    return false;
  }

  if (c.kind === ("UPGRADE_PICK" as any)) {
    if (key === "skip") {
      const anyCtx = g.choiceCtx as any;
      if (anyCtx?.returnTo?.kind === "SHOP" && anyCtx?.returnTo?.nodeId) {
        logMsg(g, "상점: 강화 취소");
        openShopChoice(g, String(anyCtx.returnTo.nodeId));
        return true;
      }
      if (anyCtx?.returnChoice) {
        logMsg(g, "강화 취소");
        setChoice(g, anyCtx.returnChoice, anyCtx.returnCtx ?? null);
        return true;
      }

      logMsg(g, "강화 취소");
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }

    if (key.startsWith("up:")) {
      const uid = key.slice("up:".length);
      const anyCtx = g.choiceCtx as any;

      if (anyCtx?.returnTo?.kind === "SHOP" && anyCtx?.returnTo?.nodeId) {
        const nodeId = String(anyCtx.returnTo.nodeId);
        const price = Number(anyCtx?.priceGold ?? 0) || 0;
        if (price > 0) {
          if (getGold(g) < price) {
            logMsg(g, "골드가 부족합니다.");
            openShopChoice(g, nodeId);
            return true;
          }
          addGold(g, -price);
        }

        const ok = upgradeCardByUid(g, uid);
        const runAny = g.run as any;
        const shop = runAny.shops?.[nodeId];
        if (ok && shop) shop.usedUpgrade = true;

        logMsg(g, ok ? "상점: 강화 완료" : "상점: 강화 실패");
        openShopChoice(g, nodeId);
        return true;
      }

      const ok = upgradeCardByUid(g, uid);
      logMsg(g, ok ? "강화 완료" : "강화 실패");
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }
    return false;
  }

  if (c.kind === ("REMOVE_PICK" as any)) {
    if (key === "skip") {
      const anyCtx = g.choiceCtx as any;
      if (anyCtx?.returnTo?.kind === "SHOP" && anyCtx?.returnTo?.nodeId) {
        logMsg(g, "상점: 제거 취소");
        openShopChoice(g, String(anyCtx.returnTo.nodeId));
        return true;
      }
      logMsg(g, "제거 취소");
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }
    if (key.startsWith("remove:")) {
      const uid = key.slice("remove:".length);
      const anyCtx = g.choiceCtx as any;

      if (anyCtx?.returnTo?.kind === "SHOP" && anyCtx?.returnTo?.nodeId) {
        const nodeId = String(anyCtx.returnTo.nodeId);
        const price = Number(anyCtx?.priceGold ?? 0) || 0;
        if (price > 0) {
          if (getGold(g) < price) {
            logMsg(g, "골드가 부족합니다.");
            openShopChoice(g, nodeId);
            return true;
          }
          addGold(g, -price);
        }

        removeCardByUid(g, uid);
        const runAny = g.run as any;
        const shop = runAny.shops?.[nodeId];
        if (shop) shop.usedRemove = true;

        logMsg(g, "상점: 카드를 제거했습니다.");
        openShopChoice(g, nodeId);
        return true;
      }

      removeCardByUid(g, uid);
      logMsg(g, "카드를 제거했습니다.");
      clearAllChoices(g);
      g.phase = "NODE";
      applyPendingRelicActivations(g);
      return true;
    }
    return false;
  }

  if (c.kind === "EVENT") {
    if ((g.choiceCtx as any)?.kind === "SYNTH_PICK") return applySynthPickChoiceKey(g, key);
    if ((g.choiceCtx as any)?.kind === "SYNTH_TAG") return applySynthTagChoiceKey(g, key);
    if (g.choiceCtx?.kind === "REST") return applyRestChoiceKey(g, key);
    if (g.choiceCtx?.kind === "EVENT") return applyEventChoiceKey(g, key);
    if ((g.choiceCtx as any)?.kind === "SHOP") return applyShopChoiceKey(g, key);
  }

  if (key === "skip") {
    clearAllChoices(g);
    return true;
  }

  return false;
}