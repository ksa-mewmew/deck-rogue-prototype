import type { ChoiceState, GameState } from "./types";
import { addCardToDeck, offerRewardPair, removeCardByUid } from "../content/rewards";
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
    if (!g.run.relics.includes(id)) grantRelic(g, id);

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
      ? [def?.dormantText, def?.unlockHint].filter(Boolean).join("\n")
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