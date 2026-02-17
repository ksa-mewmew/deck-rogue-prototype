import type { ChoiceState, GameState } from "./types";
import { addCardToDeck, offerRewardPair } from "../content/rewards";
import { closeChoice, enqueueChoice } from "./choice";
import { logMsg } from "./rules";
import { getCardDefByIdWithUpgrade } from "../content/cards";
import { offerRelicSingleContent } from "../content/relicRewards";
import { RELICS_BY_ID } from "../content/relicsContent";
import { grantRelic } from "./relics";

export function openBattleCardRewardChoice(g: GameState) {
  const offers = offerRewardPair(g);
  if (!offers) return;

  const [a, b] = offers;

  const da = getCardDefByIdWithUpgrade(g.content, a.defId, a.upgrade);
  const db = getCardDefByIdWithUpgrade(g.content, b.defId, b.upgrade);

  const la = `${da.name}${a.upgrade > 0 ? ` +${a.upgrade}` : ""}`;
  const lb = `${db.name}${b.upgrade > 0 ? ` +${b.upgrade}` : ""}`;

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
      { key: "skip", label: "생략", detail: "" },
    ],
  };

  enqueueChoice(g, choice, { kind: "BATTLE_CARD_REWARD", offers: [a, b] });
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
    ? [def?.dormantText, def?.unlockHint].filter(Boolean).join("\n")
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

export function applyRewardChoiceKey(g: GameState, key: string): boolean {
  const choice = g.choice;
  if (!choice) return false;

  if (key === "take") {
    if (g.choiceCtx?.kind !== "ELITE_RELIC") return false;
    const id = g.choiceCtx.offerIds?.[0];
    if (!id) return false;

    g.run.relics ??= [];
    if (!g.run.relics.includes(id)) g.run.relics.push(id);

    logMsg(g, `유물 획득: ${RELICS_BY_ID[id]?.name ?? id}`);
    closeChoice(g);
    return true;
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

    const idxDeck = g.deck.indexOf(uid);
    if (idxDeck >= 0) g.deck.splice(idxDeck, 1);

    const idxHand = g.hand.indexOf(uid);
    if (idxHand >= 0) g.hand.splice(idxHand, 1);

    const idxDis = g.discard.indexOf(uid);
    if (idxDis >= 0) g.discard.splice(idxDis, 1);

    delete g.cards[uid];

    logMsg(g, "카드를 제거했습니다.");
    closeChoice(g);
    return true;
  }

  if (key.startsWith("relic:")) {
    const id = key.slice("relic:".length);
    if (!id) return false;

    if (g.choiceCtx?.kind === "ELITE_RELIC" && !g.choiceCtx.offerIds.includes(id)) return false;

    g.run.relics ??= [];
    if (!g.run.relics.includes(id)) grantRelic(g, id);

    logMsg(g, `유물 획득: ${RELICS_BY_ID[id]?.name ?? id}`);
    closeChoice(g);
    return true;
  }

  return false;
}