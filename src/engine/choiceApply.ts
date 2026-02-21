import type { ChoiceOption, ChoiceState, GameState } from "./types";
import { applyRewardChoiceKey, openShopChoice } from "./engineRewards";
import { clearAllChoices, setChoice } from "./choice";
import { logMsg, pushUiToast } from "./rules";
import { applyPendingRelicActivations, checkRelicUnlocks, getUnlockProgress } from "./relics";
import { getEventById } from "../content/events";
import { getCardDefByIdWithUpgrade } from "../content/cards";
import { canUpgradeUid, upgradeCardByUid, removeCardByUid, addCardToDeck } from "../content/rewards";
import { healPlayer } from "./effects";
import { addItemToInventory } from "./items";
import { getItemDefById } from "../content/items";

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
  return Math.max(0, 7 + getNextBattleSuppliesBonus(g));
}


function applyRestHighF(g: GameState, highF: boolean) {
  if (!highF) return;
  const f = g.player.fatigue ?? 0;
  if (f < 10) return;

  g.player.fatigue = Math.max(0, f - 2);
  g.time = (g.time ?? 0) + 1;
  logMsg(g, "피로가 너무 높아 휴식이 더 오래 걸립니다. (F -2, 시간 +1)");
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

      const name = (g.content.cardsById[c.defId]?.name ?? c.defId);
      const label = (c.upgrade ?? 0) > 0 ? `${name} +${c.upgrade}` : name;
      const detail =
        `현재: 전열 ${curDef.frontText} / 후열 ${curDef.backText}\n` +
        `강화: 전열 ${nextDef.frontText} / 후열 ${nextDef.backText}`;

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
  const candidates = Object.values(g.cards)
    .filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard")
    .map((c) => c.uid);

  if (candidates.length === 0) return null;

  const options: ChoiceOption[] = [
    ...candidates.map((uid) => {
      const c = g.cards[uid];
      const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
      const name = (g.content.cardsById[c.defId]?.name ?? c.defId);
      const label = (c.upgrade ?? 0) > 0 ? `${name} +${c.upgrade}` : name;
      return { key: `remove:${uid}`, label, detail: `전열: ${def.frontText} / 후열: ${def.backText}`, cardUid: uid };
    }),
    { key: "skip", label: "취소" },
  ];

  return { kind: "REMOVE_PICK" as any, title, prompt, options };
}

function applyRestChoiceKey(g: GameState, key: string): boolean {
  const highF =
    g.choiceCtx && g.choiceCtx.kind === "REST" && typeof g.choiceCtx.highF === "boolean"
      ? g.choiceCtx.highF
      : (g.player.fatigue ?? 0) >= 10;

  // 유물 해금 진행도: 휴식 1회
  if (key.startsWith("rest:")) {
    const up = getUnlockProgress(g);
    up.rest += 1;
    checkRelicUnlocks(g);
  }

  if (key === "rest:heal") {
    applyRestHighF(g, highF);
    healPlayer(g, 15)
    logMsg(g, "휴식: HP +15");
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
    const all = Object.values(g.cards).filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard");
    const candidates = all.filter((c) => canUpgradeUid(g, c.uid));

    const options: ChoiceOption[] = [
      ...candidates.map((c) => {
        const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
        const name = (g.content.cardsById[c.defId]?.name ?? c.defId);
        const label = (c.upgrade ?? 0) > 0 ? `${name} +${c.upgrade}` : name;
        return { key: `up:${c.uid}`, label, detail: `전열: ${def.frontText} / 후열: ${def.backText}`, cardUid: c.uid };
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

  // 구분선(클릭해도 그냥 새로고침)
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

    const price = Number(offer.priceGold ?? 0) || 0;
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

    const price = Number(offer.priceGold ?? 0) || 0;
    if (getGold(g) < price) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    addGold(g, -price);
    addItemToInventory(g, String(offer.itemId), "SHOP");
    offer.sold = true;

    const nm = getItemDefById(String(offer.itemId))?.name ?? String(offer.itemId);
    logMsg(g, `상점: 아이템 구매 (${nm}) (-🪙${price})`);
    openShopChoice(g, nodeId);
    return true;
  }

  // 보급
  if (key === "shop:supply:buy") {
    const priceG = 6;
    const gainS = 3;
    if (getGold(g) < priceG) {
      logMsg(g, "골드가 부족합니다.");
      openShopChoice(g, nodeId);
      return true;
    }

    addGold(g, -priceG);
    addNextBattleSuppliesBonus(g, gainS);
    logMsg(g, `상점: 보급 구매 (-🪙${priceG}, 다음 전투 🌾 +${gainS})`);
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
    logMsg(g, `상점: 보급 판매 (다음 전투 🌾 -${costS}, 🪙 +${gainG})`);
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

    const price = 25;
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

    const price = 25;
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
        const name = (g.content.cardsById[c.defId]?.name ?? c.defId);
        const label = (c.upgrade ?? 0) > 0 ? `${name} +${c.upgrade}` : name;
        return { key: `remove:${uid}`, label, detail: `전열: ${def.frontText} / 후열: ${def.backText}`, cardUid: uid };
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