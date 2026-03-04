import type { ChoiceOption, ChoiceState, GameState, ShopState, ShopCardOffer, ShopRelicOffer } from "./types";
import { addCardToDeck, offerRewardN, removeCardByUid, REWARD_POOL } from "../content/rewards";
import { closeChoice, enqueueChoice } from "./choice";
import { logMsg, pushUiToast } from "./rules";
import { getCardDefByIdWithUpgrade } from "../content/cards";
import { offerRelicSingleContent } from "../content/relicRewards";
import { ITEMS, getItemDefById } from "../content/items";
import { RELICS_BY_ID } from "../content/relicsContent";
import { grantRelic, isEventRelicId } from "./relics";
import { displayCardTextPair, displayCardNameWithUpgrade } from "./cardText";
import { addItemToInventory } from "./items";
import { GOD_LINES, faithCardRewardCount, getPatronGodOrNull, isHostile, shopPriceGold } from "./faith";

export function openBattleCardRewardChoice(g: GameState, opts?: { itemOfferId?: string; itemSource?: string }) {
  const ctx: any = (g.run as any).lastBattleWasBoss ? "BOSS" : g.run.lastBattleWasElite ? "ELITE" : "BATTLE";
  const n = faithCardRewardCount(g);
  const offers = offerRewardN(g, ctx, n);
  if (!offers || offers.length === 0) return;

  // 첫 번째 인간: 보상 화면 토스트
  if (getPatronGodOrNull(g) === "first_human") {
    pushUiToast(g, "INFO", GOD_LINES.first_human.reward, 1800);
    logMsg(g, GOD_LINES.first_human.reward);
  } else if (isHostile(g, "first_human")) {
    pushUiToast(g, "WARN", GOD_LINES.first_human.hostileReward, 1800);
    logMsg(g, GOD_LINES.first_human.hostileReward);
  }

  const options: ChoiceOption[] = offers.map((o) => {
    const def = getCardDefByIdWithUpgrade(g.content, o.defId, o.upgrade);
    const t = displayCardTextPair(g, def.frontText, def.backText);
    const label = displayCardNameWithUpgrade(g, def.name, o.upgrade);
    return {
      key: `pick:${o.defId}:${o.upgrade}`,
      label,
      detail: `전열: ${t.frontText} / 후열: ${t.backText}`,
    };
  });
  options.push({ key: "skip", label: "생략", detail: "" });

  const choice: ChoiceState = {
    kind: "REWARD",
    title: "전투 보상",
    prompt: "카드 1장을 선택하거나 생략합니다.",
    options,
  };

  const itemOfferId = opts?.itemOfferId;
  const itemSource = opts?.itemSource ?? "BATTLE";

  enqueueChoice(g, choice, {
    kind: "BATTLE_REWARD",
    offers: offers as any,
    itemOfferId,
    itemSource,
    cardDecision: undefined,
    itemDecision: undefined,
  } as any);
}

export function openEliteRelicOfferChoice(g: GameState) {
  if (!g.run.lastBattleWasElite) return;
  if (g.run.eliteRelicOfferedThisBattle) return;

  const roll = offerRelicSingleContent(g, 1);
  if (!roll) return;

  g.run.eliteRelicOfferedThisBattle = true;

  const r = roll.choices[0];
  if (!r) return;
  const rid = r.id;
  const def: any = RELICS_BY_ID[rid];

  const isLocked = !!def?.unlock;

  const displayName = isLocked
    ? (def?.dormantName ?? def?.name ?? rid)
    : (def?.name ?? rid);

  const displayDesc = isLocked
    ? [def?.dormantText, def?.unlockHint].filter(Boolean).join("\n \n")
    : (def?.text ?? "");

  const options = [
    { key: "take", label: "받기", detail: `${displayName}\n\n${displayDesc}` },
    { key: "skip", label: "생략", detail: "" },
  ];


  const choice: ChoiceState = {
    kind: "REWARD", 
    title: "정예 보상: 유물",
    prompt: "유물을 받거나 생략합니다.",
    options,
  };

  (choice as any).art = def?.art ?? undefined;


  enqueueChoice(g, choice, { kind: "ELITE_RELIC", offerIds: [rid] });
}

export function openBattleItemRewardChoice(g: GameState, itemId: string, source: string = "BATTLE") {
  const def = getItemDefById(itemId);
  if (!def) return;

  const choice: ChoiceState = {
    kind: "REWARD",
    title: "전투 보상: 아이템",
    prompt: "아이템을 받거나 생략합니다.",
    options: [
      { key: "take", label: "받기", detail: `${def.name}\n\n${def.text}` },
      { key: "skip", label: "생략", detail: "" },
    ],
  };

  (choice as any).art = def.art;
  enqueueChoice(g, choice, { kind: "ITEM_REWARD", offerId: itemId, source } as any);
}


export function applyRewardChoiceKey(g: GameState, key: string): boolean {
  const choice = g.choice;
  if (!choice) return false;

  {
    const ctx: any = g.choiceCtx as any;
    if (ctx?.kind === "BATTLE_REWARD" || ctx?.kind === "BATTLE_CARD_REWARD") {
      const offerId = String(ctx.itemOfferId ?? "");
      if (key === "take_item") {
        if (!offerId) return true;
        if (ctx.itemDecision) return true;
        const ok = addItemToInventory(g, offerId, String(ctx.itemSource ?? "BATTLE"));
        if (!ok) return true;
        ctx.itemDecision = "TAKEN";
        if (ctx.cardDecision) closeChoice(g);
        return true;
      }
      if (key === "skip_item") {
        if (!offerId) return true;
        if (ctx.itemDecision) return true;
        logMsg(g, "아이템 보상을 생략했습니다.");
        ctx.itemDecision = "SKIPPED";
        if (ctx.cardDecision) closeChoice(g);
        return true;
      }
    }
  }

  if (key === "take") {
    const ctx: any = g.choiceCtx as any;

    if (ctx?.kind === "ELITE_RELIC") {
      const id = ctx.offerIds?.[0];
      if (!id) return false;

      g.run.relics ??= [];
      if (!g.run.relics.includes(id)) grantRelic(g, id);

      logMsg(g, `유물 획득: ${RELICS_BY_ID[id]?.name ?? id}`);
      closeChoice(g);
      return true;
    }

    if (ctx?.kind === "ITEM_REWARD") {
      const id = String(ctx.offerId ?? "");
      if (!id) return false;

      const ok = addItemToInventory(g, id, String(ctx.source ?? "BATTLE"));
      if (!ok) return true;
      closeChoice(g);
      return true;
    }

    return false;
  }

  if (key === "skip") {
    const ctx: any = g.choiceCtx as any;
    const isBattleReward = ctx?.kind === "BATTLE_REWARD" || ctx?.kind === "BATTLE_CARD_REWARD";
    const itemId = String(ctx?.itemOfferId ?? "");

    if (isBattleReward && itemId) {
      if (ctx.cardDecision) return true;
      logMsg(g, "카드 보상을 생략했습니다.");
      ctx.cardDecision = "SKIPPED";
      if (ctx.itemDecision) closeChoice(g);
      return true;
    }

    logMsg(g, "보상을 생략했습니다.");
    closeChoice(g);
   return true;
  }

  if (key.startsWith("pick:")) {
    const parts = key.split(":");
    const defId = parts[1] ?? "";
    const upgrade = Number(parts[2] ?? 0);

    if (!defId) return false;
    const ctx: any = g.choiceCtx as any;
    const isBattleReward = ctx?.kind === "BATTLE_REWARD" || ctx?.kind === "BATTLE_CARD_REWARD";
    const itemId = String(ctx?.itemOfferId ?? "");

    // 아이템 보상이 같이 걸려있으면, 카드부터 집어도 화면을 닫지 않게
    if (isBattleReward && itemId) {
      if (ctx.cardDecision) return true;
      addCardToDeck(g, defId, { upgrade: Number.isFinite(upgrade) ? upgrade : 0 });
      logMsg(g, "카드 획득: " + defId + (upgrade > 0 ? " +" + upgrade : ""));
      ctx.cardDecision = key;
      if (ctx.itemDecision) closeChoice(g);
     return true;
    }

    addCardToDeck(g, defId, { upgrade: Number.isFinite(upgrade) ? upgrade : 0 });
    logMsg(g, "카드 획득: " + defId + (upgrade > 0 ? " +" + upgrade : ""));
    closeChoice(g);
    return true;
  }

  if (key.startsWith("up:")) {
    const uid = key.slice("up:".length);
    if (!uid) return false;

    const card = g.cards[uid];
    if (!card) return false;

    const base = g.content.cardsById[card.defId];
    const ups = base?.upgrades ?? [];
    const curU = card.upgrade ?? 0;

    if (curU >= ups.length) {
      logMsg(g, "이미 최대 강화입니다.");
      closeChoice(g);
      return true;
    }

    card.upgrade = curU + 1;
    const defNow = getCardDefByIdWithUpgrade(g.content, card.defId, card.upgrade);
    logMsg(g, `카드 강화: ${displayCardNameWithUpgrade(g, defNow.name, card.upgrade)}`);
    closeChoice(g);
    return true;
  }

  if (key.startsWith("remove:")) {
    const uid = key.slice("remove:".length);
    if (!uid) return false;

    const ok = removeCardByUid(g, uid);
    if (!ok) return false;
    closeChoice(g);
    return true;
  }

  if (key.startsWith("relic:")) {
   const id = key.slice("relic:".length);
    if (!id) return false;

    const offerIds = (g.choiceCtx as any)?.offerIds as string[] | undefined;
    if (offerIds && offerIds.length > 0 && !offerIds.includes(id)) return false;

    g.run.relics ??= [];
   if (!g.run.relics.includes(id)) grantRelic(g, id);

    logMsg(g, `유물 획득: ${RELICS_BY_ID[id]?.name ?? id}`);
    closeChoice(g);
    return true;
  }


  if (key.startsWith("slot:")) {
    const ctx: any = g.choiceCtx as any;
    if (ctx?.kind !== "BOSS_SLOT_UPGRADE") return false;
    const side = key.slice("slot:".length);
    const runAny: any = g.run as any;
    runAny.slotCapFront = Math.max(3, Math.min(4, Math.floor(Number(runAny.slotCapFront ?? 3))));
    runAny.slotCapBack  = Math.max(3, Math.min(4, Math.floor(Number(runAny.slotCapBack  ?? 3))));

    if (side === "front") {
      if (runAny.slotCapFront < 4) runAny.slotCapFront += 1;
      runAny.bossSlotFirstPick = "front";
      pushUiToast(g, "INFO", "보스 보상: 전열 슬롯 +1", 2000);
     logMsg(g, "보스 보상: 전열 슬롯 +1");
      closeChoice(g);
      return true;
    }

    if (side === "back") {
      if (runAny.slotCapBack < 4) runAny.slotCapBack += 1;
      runAny.bossSlotFirstPick = "back";
      pushUiToast(g, "INFO", "보스 보상: 후열 슬롯 +1", 2000);
      logMsg(g, "보스 보상: 후열 슬롯 +1");
      closeChoice(g);
      return true;
    }

    return false;
  }

  return false;
}

export function openRelicOfferChoice(
  g: GameState,
  opt: {
    count: number;
    title: string;
    prompt: string;
    allowSkip?: boolean;
    source?: "BOSS" | "ELITE" | "PAID" | string;
    artKeyOrPath?: string;
  }
) {
  const roll = offerRelicSingleContent(g, opt.count);
  if (!roll || roll.choices.length === 0) return null;

  const offerIds = roll.choices.map((x) => x.id);

  const options = roll.choices.map((r) => {
    const def: any = RELICS_BY_ID[r.id];
    const isLocked = !!def?.unlock;

    const displayName = isLocked
      ? (def?.dormantName ?? def?.name ?? r.id)
      : (def?.name ?? r.id);

    const displayDesc = isLocked
      ? [def?.dormantText, def?.unlockHint].filter(Boolean).join("\n \n")
      : (def?.text ?? "");

    return {
      key: `relic:${r.id}`,
      label: displayName,
     detail: `${displayName}\n\n${displayDesc}`,
    };
  });

  if (opt.allowSkip) options.push({ key: "skip", label: "생략", detail: "" });

  const choice: ChoiceState = {
    kind: "REWARD",
    title: opt.title,
    prompt: opt.prompt,
    options,
  };

  if (opt.artKeyOrPath) {
    const k = String(opt.artKeyOrPath);
    const art = (k.includes("/") || k.includes("\\") || k.includes(".")) ? k : `assets/ui/${k}.png`;
    (choice as any).art = art;
  }

  enqueueChoice(g, choice, { kind: "RELIC_OFFER", offerIds, source: opt.source });
 return offerIds;
}


export function openBossSlotUpgradeChoice(g: GameState) {
  const runAny: any = g.run as any;
  const frontCap = Math.max(3, Math.min(4, Math.floor(Number(runAny.slotCapFront ?? 3))));
  const backCap  = Math.max(3, Math.min(4, Math.floor(Number(runAny.slotCapBack  ?? 3))));

  // 이미 둘 다 4면 스킵
 if (frontCap >= 4 && backCap >= 4) return;

  const options: ChoiceOption[] = [
    {
      key: "slot:front",
      label: "전열 슬롯 +1",
      detail: "전열 슬롯이 1칸 증가합니다. (최대 4) 전열은 유지비(S)를 소모합니다.",
    },
    {
      key: "slot:back",
      label: "후열 슬롯 +1",
      detail: "후열 슬롯이 1칸 증가합니다. (최대 4) 후열은 교란(disrupt)의 영향을 받습니다.",
    },
  ];

  const choice: ChoiceState = {
    kind: "REWARD",
    title: "보스 보상: 진형 확장",
    prompt: "전열 또는 후열 슬롯을 1칸 확장합니다.",
    options,
  };
  (choice as any).art = "assets/ui/choice/slot_pick.png";

  enqueueChoice(g, choice, { kind: "BOSS_SLOT_UPGRADE" });
}
export function openBossRelicOfferChoice(g: GameState) {
  return openRelicOfferChoice(g, {
    count: 3,
    title: "보스 보상: 유물",
    prompt: "유물 1개를 선택합니다.",
    allowSkip: false,
    source: "BOSS",
    artKeyOrPath: "what_to_do",
  });
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

const cardBasePrice = (rarity: string) => {
  switch (rarity) {
    case "SPECIAL": return 20;
    case "RARE": return 30;
    case "COMMON":
    default: return 10;
  }
};

function ensureShopState(g: GameState, nodeId: string): ShopState {
  const runAny = g.run as any;
  runAny.shops ??= {};
  const existing = runAny.shops[nodeId] as ShopState | undefined;
  if (existing) return existing;

  // 상점 카드 풀: REWARD_POOL에서 weight>0 && 실제 카드 정의가 있는 항목만
  const weightedIds = REWARD_POOL
    .filter((e) => (e.weight ?? 0) > 0)
    .map((e) => e.id)
    .filter((id) => !!g.content.cardsById[id]);

  const byRarity = {
    COMMON: [] as string[],
    SPECIAL: [] as string[],
    RARE: [] as string[],
  };

  for (const id of weightedIds) {
    const base = g.content.cardsById[id];
    const r = String(base?.rarity ?? "");
    if (r === "COMMON") byRarity.COMMON.push(id);
    else if (r === "SPECIAL") byRarity.SPECIAL.push(id);
    else if (r === "RARE") byRarity.RARE.push(id);
  }

  const picks: string[] = [];
  const used = new Set<string>();
  const fallbackAny = weightedIds.slice();

  const pickFrom = (pool: string[], count: number) => {
    const available = pool.filter((id) => !used.has(id));
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = available[i];
      available[i] = available[j];
      available[j] = t;
    }

    // 1) 우선 중복 없이 채움
    const take = Math.min(count, available.length);
    for (let i = 0; i < take; i++) {
      const id = available[i];
      used.add(id);
      picks.push(id);
    }

    // 2) 부족분은 대체 규칙: 중복 허용으로 채움
    let remain = count - take;
    while (remain > 0) {
      if (pool.length > 0) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        if (id) {
          picks.push(id);
          remain -= 1;
          continue;
        }
      }

      if (fallbackAny.length > 0) {
        const id = fallbackAny[Math.floor(Math.random() * fallbackAny.length)];
        if (id) {
          picks.push(id);
          remain -= 1;
          continue;
        }
      }

      break;
    }
  };

  // 고정 구성: 일반 2장 / 특별 2장 / 희귀 2장 (중복 없음)
  pickFrom(byRarity.COMMON, 2);
  pickFrom(byRarity.SPECIAL, 2);
  pickFrom(byRarity.RARE, 2);

  const cards: ShopCardOffer[] = picks.map((defId) => {
    const base = g.content.cardsById[defId];
    const r = (base?.rarity ?? "COMMON");
    const price = Math.max(1, cardBasePrice(r) + randInt(-2, 2));
    return { defId, upgrade: 0, priceGold: price, sold: false };
  });

  const items = (() => {
    const ids = ITEMS.map((x) => x.id);
    const wantI = 2;
    const picksI: string[] = [];
    let triesI = 0;
    while (picksI.length < wantI && triesI++ < 80 && ids.length > 0) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (!id) continue;
      if (picksI.includes(id) && Math.random() < 0.85) continue;
      picksI.push(id);
    }

    return picksI.map((itemId) => {
      const def = getItemDefById(itemId);
      const base = Number(def?.priceGold ?? 18) || 18;
      const price = Math.max(1, base + randInt(-2, 2));
      return { itemId, priceGold: price, sold: false };
    });
  })();

  const relics = (() => {
    const owned = new Set<string>((g.run.relics ?? []) as string[]);
    const pool = Object.keys(RELICS_BY_ID).filter((id) => {
      if (owned.has(id)) return false;
      if (isEventRelicId(id)) return false;
      const def: any = RELICS_BY_ID[id];
      if (!def) return false;
      if (def.debugOnly) return false;
      return true;
    });

    if (pool.length <= 0) return [] as ShopRelicOffer[];

    const picks: string[] = [];
    const want = Math.min(2, pool.length);
    let tries = 0;
    while (picks.length < want && tries++ < 80) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (!id || picks.includes(id)) continue;
      picks.push(id);
    }

    return picks.map((relicId) => ({ relicId, priceGold: 60 + randInt(-10, 10), sold: false }));
  })();

  const st: ShopState = {
    nodeId,
    cards,
    items,
    relics,
    usedUpgrade: false,
    usedRemove: false,
    createdAtMove: Number((g.run as any).timeMove ?? 0) || 0,
    art: "assets/ui/background/shop_bg.png",
  };

  runAny.shops[nodeId] = st;
  return st;
}

export function openShopChoice(g: GameState, nodeId: string) {
  const shop = ensureShopState(g, nodeId);

  if (getPatronGodOrNull(g) === "first_human" && !(shop as any)._firstHumanShopToastShown) {
    (shop as any)._firstHumanShopToastShown = true;
    pushUiToast(g, "WARN", GOD_LINES.first_human.shop, 2200);
    logMsg(g, GOD_LINES.first_human.shop);
  }

  const options: ChoiceOption[] = [];
  let sep = 0;

  // 카드 판매
  for (let i = 0; i < shop.cards.length; i++) {
    const o = shop.cards[i];
    const base = g.content.cardsById[o.defId];
    const name = base?.name ?? o.defId;

    if (o.sold) {
      options.push({ key: `shop:card:${i}`, label: `${displayCardNameWithUpgrade(g, name, o.upgrade ?? 0)} (품절)`, detail: "" });
      continue;
    }

    const priceGold = shopPriceGold(g, o.priceGold);
    const def = getCardDefByIdWithUpgrade(g.content, o.defId, o.upgrade ?? 0);
    const t = displayCardTextPair(g, def.frontText, def.backText);
    const detail = `가격: 🪙${priceGold}

  전열: ${t.frontText}
  후열: ${t.backText}`;
    options.push({ key: `shop:card:${i}`, label: `${displayCardNameWithUpgrade(g, name, o.upgrade ?? 0)} (🪙${priceGold})`, detail });
  }

  options.push({ key: `shop:sep:${sep++}`, label: "—", detail: "" });

  // 아이템 판매
  if (shop.items && shop.items.length > 0) {
    for (let i = 0; i < shop.items.length; i++) {
      const it = shop.items[i];
      const def = getItemDefById(it.itemId);
      const name = def?.name ?? it.itemId;

      if (it.sold) {
        options.push({ key: `shop:item:${i}`, label: `${name} (품절)`, detail: "" });
        continue;
      }

      const priceGold = shopPriceGold(g, it.priceGold);
      const detail = `가격: 🪙${priceGold}\n\n${def?.text ?? ""}`;
      options.push({ key: `shop:item:${i}`, label: `${name} (🪙${priceGold})`, detail });
    }

    options.push({ key: `shop:sep:${sep++}`, label: "—", detail: "" });
  }

  // 유물 판매(이벤트 유물 제외, 해금 상태로 표시)
  if (shop.relics && shop.relics.length > 0) {
    for (let i = 0; i < shop.relics.length; i++) {
      const r = shop.relics[i];
      const def: any = RELICS_BY_ID[r.relicId];
      const name = def?.name ?? r.relicId;

      if (r.sold) {
        options.push({ key: `shop:relic:${i}`, label: `${name} (품절)`, detail: "" });
        continue;
      }

      const priceGold = shopPriceGold(g, r.priceGold);
      const detail = `가격: 🪙${priceGold}\n\n${def?.text ?? ""}`;
      options.push({ key: `shop:relic:${i}`, label: `${name} (🪙${priceGold})`, detail });
    }

    options.push({ key: `shop:sep:${sep++}`, label: "—", detail: "" });
  }

  // 서비스/보급
  const upLabel = shop.usedUpgrade ? "카드 강화 (사용 완료)" : "카드 강화";
  const rmLabel = shop.usedRemove ? "카드 제거 (사용 완료)" : "카드 제거";

  const upPrice = shopPriceGold(g, 25);
  const rmPrice = shopPriceGold(g, 25);
  const buySPrice = shopPriceGold(g, 6);

  options.push({ key: "shop:service:upgrade", label: upLabel, detail: shop.usedUpgrade ? "" : `가격: 🪙${upPrice} 카드 1장을 강화합니다.` });
  options.push({ key: "shop:service:remove", label: rmLabel, detail: shop.usedRemove ? "" : `가격: 🪙${rmPrice} 덱에서 카드 1장을 제거합니다.` });
  options.push({ key: "shop:supply:buy", label: "보급 구매", detail: `-🪙${buySPrice}, 다음 전투 보급 🍞 +3` });
  options.push({ key: "shop:supply:sell", label: "보급 판매", detail: "다음 전투 보급 🍞 -3, +🪙4" });

  options.push({ key: "shop:leave", label: "나가기", detail: "" });

  {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const o of options) {
      if (seen.has(o.key)) dups.push(o.key);
      seen.add(o.key);
    }
    if (dups.length) {
      logMsg(g, `경고: 상점 선택키 중복: ${dups.join(", ")}`);
    }
  }

  const choice: ChoiceState = {
    kind: "EVENT",
    title: "고블린의 상점",
    prompt: "온건파 고블린의 상점입니다.",
    options,
  };

  if (shop.art) (choice as any).art = shop.art;

  g.choiceQueue = [];
  g.choiceStack = [];
  g.choice = choice;
  g.choiceCtx = { kind: "SHOP", nodeId } as any;
  if (shop.art) (choice as any).art = shop.art;
}
