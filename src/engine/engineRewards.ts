import type { ChoiceOption, ChoiceState, GameState, ShopState, ShopCardOffer } from "./types";
import { addCardToDeck, offerRewardTrio, removeCardByUid, REWARD_POOL } from "../content/rewards";
import { closeChoice, enqueueChoice } from "./choice";
import { logMsg } from "./rules";
import { getCardDefByIdWithUpgrade } from "../content/cards";
import { offerRelicSingleContent } from "../content/relicRewards";
import { ITEMS, getItemDefById } from "../content/items";
import { RELICS_BY_ID } from "../content/relicsContent";
import { grantRelic } from "./relics";
import { addItemToInventory } from "./items";

export function openBattleCardRewardChoice(g: GameState, opts?: { itemOfferId?: string; itemSource?: string }) {
  const ctx: any = (g.run as any).lastBattleWasBoss ? "BOSS" : g.run.lastBattleWasElite ? "ELITE" : "BATTLE";
  const offers = offerRewardTrio(g, ctx);
  if (!offers) return;

  const [a, b, c] = offers;

  const da = getCardDefByIdWithUpgrade(g.content, a.defId, a.upgrade);
  const db = getCardDefByIdWithUpgrade(g.content, b.defId, b.upgrade);
  const dc = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade);

  const la = `${da.name}${a.upgrade > 0 ? ` +${a.upgrade}` : ""}`;
  const lb = `${db.name}${b.upgrade > 0 ? ` +${b.upgrade}` : ""}`;
  const lc = `${dc.name}${c.upgrade > 0 ? ` +${c.upgrade}` : ""}`;

  const choice: ChoiceState = {
    kind: "REWARD",
    title: "전투 보상",
    prompt: "카드 1장을 선택하거나 생략합니다.",
    options: [
      {
        key: `pick:${a.defId}:${a.upgrade}`,
        label: la,
        detail: `전열: ${da.frontText} / 후열: ${da.backText}`,
      },
      {
        key: `pick:${b.defId}:${b.upgrade}`,
        label: lb,
        detail: `전열: ${db.frontText} / 후열: ${db.backText}`,
      },
      {
        key: `pick:${c.defId}:${c.upgrade}`,
        label: lc,
        detail: `전열: ${dc.frontText} / 후열: ${dc.backText}`,
      },
      { key: "skip", label: "생략", detail: "" },
    ],
  };

  const itemOfferId = opts?.itemOfferId;
  const itemSource = opts?.itemSource ?? "BATTLE";

  enqueueChoice(g, choice, {
    kind: "BATTLE_REWARD",
    offers: [a, b, c],
    itemOfferId,
    itemSource,
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

  // Combined battle reward: allow taking/skipping item without closing the choice.
  {
    const ctx: any = g.choiceCtx as any;
    if (ctx?.kind === "BATTLE_REWARD") {
      const offerId = String(ctx.itemOfferId ?? "");
      if (key === "take_item") {
        if (!offerId) return true;
        if (ctx.itemDecision) return true;
        addItemToInventory(g, offerId, String(ctx.itemSource ?? "BATTLE"));
        ctx.itemDecision = "TAKEN";
        return true;
      }
      if (key === "skip_item") {
        if (!offerId) return true;
        if (ctx.itemDecision) return true;
        logMsg(g, "아이템 보상을 생략했습니다.");
        ctx.itemDecision = "SKIPPED";
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

      addItemToInventory(g, id, "BATTLE");
      closeChoice(g);
      return true;
    }

    return false;
  }


  if (key === "skip") {
    logMsg(g, "보상을 생략했습니다.");
    closeChoice(g);
    return true;
  }

  if (key.startsWith("pick:")) {
    const parts = key.split(":");
    const defId = parts[1] ?? "";
    const upgrade = Number(parts[2] ?? 0);

    if (!defId) return false;

    addCardToDeck(g, defId, { upgrade: Number.isFinite(upgrade) ? upgrade : 0 });
    logMsg(g, `카드 획득: ${defId}${upgrade > 0 ? ` +${upgrade}` : ""}`);
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
    logMsg(g, `카드 강화: ${defNow.name} +${card.upgrade}`);
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

  // 선택 화면 일러스트 (예: 보스 유물 선택)
  if (opt.artKeyOrPath) {
    const k = String(opt.artKeyOrPath);
    const art = (k.includes("/") || k.includes("\\") || k.includes(".")) ? k : `assets/ui/${k}.png`;
    (choice as any).art = art;
  }

  enqueueChoice(g, choice, { kind: "RELIC_OFFER", offerIds, source: opt.source });
  return offerIds;
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

// =========================
// Shop
// =========================

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

    // 상점 카드 풀: REWARD_POOL에서 weight>0인 카드만 (저주/미사용 카드 방지)
  const weightedIds = REWARD_POOL.filter((e) => (e.weight ?? 0) > 0).map((e) => e.id);

  const allCardIds = (weightedIds.length > 0 ? weightedIds : Object.keys(g.content.cardsById))
    .filter((id) => {
      const base = g.content.cardsById[id];
      const r = (base?.rarity ?? "COMMON");
      return r !== "BASIC" && r !== "MADNESS";
    });
  const picks: string[] = [];

  const want = 6;
  let tries = 0;
  while (picks.length < want && tries++ < 200) {
    const id = allCardIds[Math.floor(Math.random() * allCardIds.length)];
    if (!id) continue;
    if (picks.includes(id) && Math.random() < 0.8) continue;
    picks.push(id);
  }

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

  const st: ShopState = {
    nodeId,
    cards,
    items,
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

  const options: ChoiceOption[] = [];
  let sep = 0;

  // 카드 판매
  for (let i = 0; i < shop.cards.length; i++) {
    const o = shop.cards[i];
    const base = g.content.cardsById[o.defId];
    const name = base?.name ?? o.defId;
    const upTxt = (o.upgrade ?? 0) > 0 ? ` +${o.upgrade}` : "";

    if (o.sold) {
      options.push({ key: `shop:card:${i}`, label: `${name}${upTxt} (품절)`, detail: "" });
      continue;
    }

    const def = getCardDefByIdWithUpgrade(g.content, o.defId, o.upgrade ?? 0);
    const detail = `가격: 🪙${o.priceGold}

전열: ${def.frontText}
후열: ${def.backText}`;
    options.push({ key: `shop:card:${i}`, label: `${name}${upTxt} (🪙${o.priceGold})`, detail });
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

      const detail = `가격: 🪙${it.priceGold}\n\n${def?.text ?? ""}`;
      options.push({ key: `shop:item:${i}`, label: `${name} (🪙${it.priceGold})`, detail });
    }

    options.push({ key: `shop:sep:${sep++}`, label: "—", detail: "" });
  }

  // 서비스/보급
  const upLabel = shop.usedUpgrade ? "카드 강화 (사용 완료)" : "카드 강화";
  const rmLabel = shop.usedRemove ? "카드 제거 (사용 완료)" : "카드 제거";

  options.push({ key: "shop:service:upgrade", label: upLabel, detail: shop.usedUpgrade ? "" : "가격: 🪙25 카드 1장을 강화합니다." });
  options.push({ key: "shop:service:remove", label: rmLabel, detail: shop.usedRemove ? "" : "가격: 🪙25 덱에서 카드 1장을 제거합니다." });
  options.push({ key: "shop:supply:buy", label: "보급 구매", detail: "-🪙6, 다음 전투 보급 🌾 +3" });
  options.push({ key: "shop:supply:sell", label: "보급 판매", detail: "다음 전투 보급 🌾 -3, +🪙4" });

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
