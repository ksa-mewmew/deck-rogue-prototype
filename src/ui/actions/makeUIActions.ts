import type { GameState, MapNodeKind, PileKind, Side } from "../../engine/types";
import { updateSlotHoverUI } from "../slots";
import { toggleLogOverlay } from "../overlays/log";
import { spawnEncounter, startCombat, placeCard, revealIntentsAndDisrupt, resolveTargetSelection, resolveBack, resolveFront, resolveEnemy, upkeepEndTurn, drawStepStartNextTurn, isTargeting } from "../../engine/combat";
import { logMsg, pushUiToast } from "../../engine/rules";
import { createInitialState } from "../../engine/state";
import { applyChoiceKey } from "../../engine/choiceApply";
import { openShopChoice } from "../../engine/engineRewards";
import { useItemAt, discardItemAt } from "../../engine/items";
import type { EventOutcome } from "../../content/events";
import { pickEventByMadness, getEventById } from "../../content/events";
import { removeCardByUid, addCardToDeck, offerRewardsByFatigue, canUpgradeUid, upgradeCardByUid, obtainTreasure } from "../../content/rewards";
import { getCardDefByIdWithUpgrade } from "../../content/cards";
import { clearSave } from "../../persist";
import { displayCardTextPair, displayCardNameForUid, displayCardNameWithUpgrade } from "../../engine/cardText";
import { getUnlockProgress, checkRelicUnlocks } from "../../engine/relics";
import { ensureFaith, getMadnessBane, getMadnessBoon, getPatronGodOrNull, isForgeHostile, isHostile, onEnterRestExplorationHooks, openGodTemptChoice, pickTemptingGod, wingArteryMoveDelta, canRetortFusionSynthAtRest } from "../../engine/faith";
import { assetUrl } from "../assets";
import { clearDrag } from "../interaction/bindings";
import { animMs } from "../settings/uiSettings";
import { runAutoAdvanceRAF } from "../flow/autoAdvance";
import { ensureBossSchedule, ensureGraphRuntime, maybeShiftTopology, totalTimeOnMap } from "../screens/nodeSelectScreen";

type ChoiceKind = "EVENT" | "REWARD" | "PICK_CARD" | "VIEW_PILE" | "UPGRADE_PICK" | "RELIC";

export function makeUIActionsImpl(
  g0: GameState,
  setGame: (next: GameState) => void,
  renderUI: (g: GameState, actions: any) => void,
  overlayApi: { getOverlay: () => any; setOverlay: (o: any) => void }
) {
  let localG = g0;

  const { getOverlay, setOverlay } = overlayApi;

  const commit = (next: GameState) => {
    localG = next;
    setGame(next);
  };

  const getG = () => localG;

  const cardDisplayNameByUid = (g: GameState, uid: string) => {
    return displayCardNameForUid(g, uid);
  };

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  const getCardDefByUid = (g: GameState, uid: string) => {
    const c = g.cards[uid];
    return getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
  };

  const baseCardName = (g: GameState, defId: string) => {
    const base = g.content.cardsById[defId];
    return base?.name ?? defId;
  };

  const displayNameForOffer = (g: GameState, offer: { defId: string; upgrade: number }) => {
    const base = g.content.cardsById[offer.defId]?.name ?? offer.defId;
    return displayCardNameWithUpgrade(g, base, offer.upgrade ?? 0);
  };

  const normalizePlacementCounters = (g: GameState) => {
    const placed = (g.placedUidsThisTurn ?? []).filter((uid) => {
      const inst = g.cards[uid];
      return !!inst && (inst.zone === "front" || inst.zone === "back");
    });

    g.usedThisTurn = placed.length;

    let frontPlaced = 0;
    for (const uid of placed) {
      if (g.cards[uid]?.zone === "front") frontPlaced += 1;
    }
    g.frontPlacedThisTurn = frontPlaced;
  };

  const isFrontSlotLockedByLivingChain = (g: GameState, idx: number) => {
    if (idx !== 1) return false;
    return (g.enemies ?? []).some((e: any) => e && e.hp > 0 && e.id === "living_chain");
  };



  let choiceHandler: ((key: string) => void) | null = null;
  type ChoiceHandlerSnapshot = {
    id: "EVENT_BY_ID" | "REMOVE_PICK" | "REWARD_PICK" | "UPGRADE_PICK";
    payload?: Record<string, any>;
  };
  let choiceHandlerSnapshot: ChoiceHandlerSnapshot | null = null;
  let nodePickLockedUntil = 0;


  let targetPickLock = false;

  type ChoiceFrame = {
    choice: GameState["choice"];
    ctx: GameState["choiceCtx"];
    handler: ((key: string) => void) | null;
    snapshot: ChoiceHandlerSnapshot | null;
  };

  const choiceStack: ChoiceFrame[] = [];

  const normalizeRemoveThen = (thenRaw: string | undefined): "NONE" | "REWARD_PICK" | "BATTLE" => {
    if (thenRaw === "REWARD" || thenRaw === "REWARD_PICK") return "REWARD_PICK";
    if (thenRaw === "BATTLE") return "BATTLE";
    return "NONE";
  };

  const clearChoiceMeta = (g: GameState) => {
    const runAny = g.run as any;
    runAny.pendingRemovePickThen = null;
    runAny.activeEventId = null;
    runAny.choiceHandlerSnapshot = null;
  };

  function setChoiceHandler(
    g: GameState,
    handler: ((key: string) => void) | null,
    snapshot: ChoiceHandlerSnapshot | null = null
  ) {
    choiceHandler = handler;
    choiceHandlerSnapshot = snapshot;
    (g.run as any).choiceHandlerSnapshot = snapshot;
  }

  function getChoiceSnapshot(g: GameState): ChoiceHandlerSnapshot | null {
    if (choiceHandlerSnapshot) return choiceHandlerSnapshot;
    return ((g.run as any).choiceHandlerSnapshot as ChoiceHandlerSnapshot | null) ?? null;
  };

  function isChoiceHandledByApplyChoiceKey(g: GameState): boolean {
    const ctxKind = String((g as any).choiceCtx?.kind ?? "");
    if (ctxKind.length > 0) return true;
    const kind = String(g.choice?.kind ?? "");
    return kind === "REWARD" || kind === "UPGRADE_PICK" || kind === "RELIC" || kind === "FAITH" || kind === "GOD_TEMPT" || kind === "MADNESS_TEMPT";
  }

  function reconcileOrphanChoiceState(g: GameState): boolean {
    if (!g.choice) return false;

    const hasRuntimeHandler = !!choiceHandler || !!getChoiceSnapshot(g);
    if (hasRuntimeHandler) return false;
    if (isChoiceHandledByApplyChoiceKey(g)) return false;

    logMsg(g, "선택 상태 복구: 처리 핸들러가 사라진 선택창을 정리합니다.");
    clearChoiceStack(g);
    return true;
  }

  function clearChoiceStack(g: GameState) {
    choiceStack.length = 0;
    g.choice = null;
    g.choiceCtx = null;
    setChoiceHandler(g, null, null);
    clearChoiceMeta(g);
    document.querySelector(".choice-overlay")?.remove();
  }

  function pushChoice(g: GameState) {
    choiceStack.push({ choice: g.choice, ctx: g.choiceCtx, handler: choiceHandler, snapshot: getChoiceSnapshot(g) });
  }

  function popChoice(g: GameState) {
    const prev = choiceStack.pop();
    if (!prev) {
      closeChoiceOrPop(g);
      return;
    }
    g.choice = prev.choice;
    g.choiceCtx = prev.ctx;
    setChoiceHandler(g, prev.handler, prev.snapshot);
  }

  function closeChoiceOrPop(g: GameState) {
    if (choiceStack.length > 0) {
      popChoice(g);
      return;
    }
    g.choice = null;
    g.choiceCtx = null;
    setChoiceHandler(g, null, null);
    clearChoiceMeta(g);
    document.querySelector(".choice-overlay")?.remove();
  }

  function openChoice(
    g: GameState,
    next: GameState["choice"],
    handler: (key: string) => void,
    snapshot?: ChoiceHandlerSnapshot
  ) {
    if (g.choice) pushChoice(g);
    g.choice = next;
    setChoiceHandler(g, handler, snapshot ?? null);
  }

  function handleRemovePickChoice(g: GameState, key: string, forcedThen?: "NONE" | "REWARD_PICK" | "BATTLE"): boolean {
    if (g.choice?.kind !== "PICK_CARD") return false;

    const runAny = g.run as any;
    const then = forcedThen ?? normalizeRemoveThen(String(runAny.pendingRemovePickThen ?? "NONE"));

    if (key === "cancel") {
      runAny.pendingRemovePickThen = null;
      logMsg(g, "제거 취소");
      closeChoiceOrPop(g);
      renderUI(g, actions);
      return true;
    }

    if (!key.startsWith("remove:")) return false;

    const uid = key.slice("remove:".length);
    removeCardByUid(g, uid);
    runAny.pendingRemovePickThen = null;

    if (then === "BATTLE") {
      clearChoiceStack(g);
      g.phase = "NODE";
      spawnEncounter(g);
      startCombat(g);
      renderUI(g, actions);
      return true;
    }

    if (then === "REWARD_PICK") {
      clearChoiceStack(g);
      openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
      renderUI(g, actions);
      return true;
    }

    clearChoiceStack(g);
    g.phase = "NODE";
    renderUI(g, actions);
    return true;
  }

  function handleRewardPickChoice(g: GameState, key: string): boolean {
    if (g.choice?.kind !== "REWARD") return false;

    if (key.startsWith("pick:")) {
      const payload = key.slice("pick:".length);
      const [defId, upStr] = payload.split(":");
      const upgrade = Number(upStr ?? "0") || 0;
      addCardToDeck(g, defId, { upgrade });
    } else {
      logMsg(g, "카드 보상 생략");
    }

    closeChoiceOrPop(g);
    if (!g.run.finished) g.phase = "NODE";
    renderUI(g, actions);
    return true;
  }

  function handleUpgradePickChoice(g: GameState, key: string): boolean {
    if (g.choice?.kind !== "UPGRADE_PICK") return false;

    if (key === "skip") {
      logMsg(g, "강화 취소");
      closeChoiceOrPop(g);
      renderUI(g, actions);
      return true;
    }

    if (key.startsWith("up:")) {
      const uid = key.slice("up:".length);
      const ok = upgradeCardByUid(g, uid);
      logMsg(g, ok ? `강화: [${cardDisplayNameByUid(g, uid)}]` : "강화 실패");
      closeChoiceOrPop(g);
      renderUI(g, actions);
      return true;
    }

    closeChoiceOrPop(g);
    renderUI(g, actions);
    return true;
  }

  function dispatchChoiceSnapshot(g: GameState, key: string, snap: ChoiceHandlerSnapshot): boolean {
    if (snap.id === "REMOVE_PICK") {
      const thenRaw = String(snap.payload?.then ?? "NONE");
      const then = normalizeRemoveThen(thenRaw);
      return handleRemovePickChoice(g, key, then);
    }

    if (snap.id === "REWARD_PICK") {
      return handleRewardPickChoice(g, key);
    }

    if (snap.id === "UPGRADE_PICK") {
      return handleUpgradePickChoice(g, key);
    }

    if (snap.id === "EVENT_BY_ID") {
      const eventId = String(snap.payload?.eventId ?? "");
      if (!eventId) return false;

      const ev = getEventById(eventId);
      const picked = ev?.options(g).find((o) => o.key === key);
      if (!picked) return false;

      const up = getUnlockProgress(g);
      up.eventPicks += 1;
      checkRelicUnlocks(g);

      const outcome: EventOutcome = picked.apply(g);
      handleEventOutcome(g, outcome);
      return true;
    }

    return false;
  }

  function handleEventOutcome(g: GameState, outcome: EventOutcome) {
    if (typeof outcome === "object" && outcome.kind === "UPGRADE_PICK") {
      openUpgradePick(g, actions, outcome.title ?? "강화", outcome.prompt ?? "강화할 카드 1장을 선택하세요.");
      return;
    }

    if (typeof outcome === "object" && outcome.kind === "REMOVE_PICK") {
      const candidates = Object.values(g.cards)
        .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && c.defId !== "goal_treasure")
        .map((c) => c.uid);

      const then = normalizeRemoveThen((outcome as any).then as string | undefined);
      (g.run as any).pendingRemovePickThen = then;

      openChoice(g, {
        kind: "PICK_CARD",
        title: outcome.title,
        prompt: outcome.prompt ?? "제거할 카드 1장을 선택하세요.",
        options: [
          ...candidates.map((uid) => {
            const def = getCardDefByUid(g, uid);
            const t = displayCardTextPair(g, def.frontText, def.backText);
            return {
              key: `remove:${uid}`,
              label: cardDisplayNameByUid(g, uid),
              detail: `전열: ${t.frontText} / 후열: ${t.backText}`,
              cardUid: uid,
            };
          }),
          { key: "cancel", label: "취소" },
        ],
      }, (k: string) => {
        if (handleRemovePickChoice(g, k)) return;
        renderUI(g, actions);
      }, { id: "REMOVE_PICK", payload: { then } });

      renderUI(g, actions);
      return;
    }

    if (typeof outcome === "object" && outcome.kind === "BATTLE_SPECIAL") {
      clearChoiceStack(g);

      (g.run as any).onWinGrantRelicId = outcome.onWinGrantRelicId ?? null;

      logMsg(g, outcome.title ? `이벤트 전투: ${outcome.title}` : "이벤트 전투 발생!");

      const runAny = g.run as any;
      runAny.pendingEventWinRelicId = outcome.onWinGrantRelicId ?? null;
      runAny.pendingEventWinGold = Number(outcome.onWinGrantGold ?? 0) || 0;

      g.phase = "NODE";
      spawnEncounter(g, { forcePatternIds: outcome.enemyIds });
      g._justStartedCombat = true;
      startCombat(g);
      renderUI(g, actions);
      return;
    }

    if (outcome === "BATTLE") {
      clearChoiceStack(g);
      g.phase = "NODE";
      spawnEncounter(g);
      g._justStartedCombat = true;
      startCombat(g);
      renderUI(g, actions);
      return;
    }

    if (outcome === "REWARD") {
      clearChoiceStack(g);
      openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
      renderUI(g, actions);
      return;
    }

    closeChoiceOrPop(g);
    renderUI(g, actions);
  }

  type PendingTemptNode = { kind: "REST" | "EVENT"; nodeId: string };

  function clearPendingTemptNode(g: GameState) {
    delete (g.run as any).pendingNodeAfterTempt;
  }

  function setPendingTemptNode(g: GameState, pending: PendingTemptNode) {
    (g.run as any).pendingNodeAfterTempt = pending;
  }

  function tryOpenPreNodeTempt(g: GameState, nodeId: string, kind: "REST" | "EVENT") {
    const f = ensureFaith(g);
    if (!f.chosen) return false;

    const tempter = pickTemptingGod(g);
    const P_TEMPT = 0.25;
    if (!tempter || Math.random() >= P_TEMPT) return false;

    setPendingTemptNode(g, { kind, nodeId });
    openGodTemptChoice(g, tempter);
    return true;
  }

  function openRestNodeChoice(g: GameState, node: any, nodeId: string, tmNow: number, allowTempt: boolean) {
    if (allowTempt && tryOpenPreNodeTempt(g, nodeId, "REST")) return true;

    node.cleared = true;
    node.kind = "EMPTY";
    (node as any).lastClearedMove = tmNow;
    const highF = (g.player.fatigue ?? 0) >= 10;

    onEnterRestExplorationHooks(g);

    const patron = getPatronGodOrNull(g);
    const dreamHostile = isHostile(g, "dream_shadow");
    const forgeHostile = isForgeHostile(g);

    const healDetail =
      dreamHostile ? "회복량 0" :
      patron === "dream_shadow" ? "항상 최대 체력 (F +3)" :
      "HP +15";

    const upgradeDetail =
      forgeHostile ? "(불가)" :
      (patron === "dream_shadow" || dreamHostile) ? "카드 1장 강화 (피로만큼 피해)" :
      "카드 1장 강화";

    const optionsBase = [
      { key: "rest:heal", label: "회복", detail: healDetail },
      { key: "rest:clear_f", label: "정비", detail: "F -3" },
      { key: "rest:upgrade", label: "강화", detail: upgradeDetail },
      { key: "rest:skip", label: "떠나기" },
    ];

    const canSynth = canRetortFusionSynthAtRest(g);
    if (canSynth) {
      optionsBase.splice(optionsBase.length - 1, 0, { key: "rest:synth", label: "합성", detail: "카드 1장에 효과 부여 (폭주/설치/선천성/뒤집기/소모 제거)" });
    }

    const options = forgeHostile ? optionsBase.filter((o) => o.key !== "rest:upgrade") : optionsBase;

    g.choice = {
      kind: "EVENT",
      title: "휴식",
      art: assetUrl("assets/events/event_rest.png"),
      prompt: highF ? "피로가 너무 높아 시간이 더 걸릴 수 있습니다." : "캠프에 잠시 머문다.",
      options,
    } as any;

    g.choiceCtx = { kind: "REST", highF } as any;
    return true;
  }

  function openEventNodeChoice(g: GameState, node: any, nodeId: string, tmNow: number, allowTempt: boolean) {
    if (allowTempt && tryOpenPreNodeTempt(g, nodeId, "EVENT")) return true;

    node.cleared = true;
    node.kind = "EMPTY";
    (node as any).lastClearedMove = tmNow;

    const runAny2: any = g.run;
    runAny2.ominousProphecySeen ??= false;

    const seen = (runAny2.eventsSeen ?? {}) as Record<string, number>;
    const blockedRunOnce = (id: string) => id === "impossible_plan" && (Number(seen[id] ?? 0) || 0) > 0;

    const OMEN_CHANCE = 0.3;
    let ev = pickEventByMadness(g);

    if (runAny2.ominousProphecySeen === true) {
      for (let i = 0; i < 50 && ((ev as any).id === "ominous_prophecy" || blockedRunOnce((ev as any).id)); i++) {
        ev = pickEventByMadness(g);
      }
    } else {
      if (Math.random() < OMEN_CHANCE) {
        ev = getEventById("ominous_prophecy") ?? ev;
      }
      if (blockedRunOnce((ev as any).id)) {
        for (let i = 0; i < 60 && blockedRunOnce((ev as any).id); i++) {
          ev = pickEventByMadness(g);
        }
      }
    }

    {
      const lastEventId: string | null | undefined = (runAny2.lastEventId as any) ?? null;
      if (lastEventId && (ev as any)?.id === lastEventId) {
        for (let i = 0; i < 60; i++) {
          const cand = pickEventByMadness(g);
          const cid = (cand as any)?.id;
          if (!cid) continue;
          if (runAny2.ominousProphecySeen === true && cid === "ominous_prophecy") continue;
          if (blockedRunOnce(cid)) continue;
          if (cid !== lastEventId) {
            ev = cand;
            break;
          }
        }
      }
    }

    if (blockedRunOnce((ev as any)?.id)) {
      for (let i = 0; i < 80; i++) {
        const cand = pickEventByMadness(g);
        const cid = (cand as any)?.id;
        if (!cid || blockedRunOnce(cid)) continue;
        if (runAny2.ominousProphecySeen === true && cid === "ominous_prophecy") continue;
        ev = cand;
        break;
      }
    }

    if ((ev as any)?.id === "ominous_prophecy") {
      runAny2.ominousProphecySeen = true;
    }

    if (!ev) return true;

    {
      const runAnyEv = g.run as any;
      runAnyEv.eventsSeen ??= {};
      const cur = Number(runAnyEv.eventsSeen[ev.id] ?? 0) || 0;
      runAnyEv.eventsSeen[ev.id] = cur + 1;
      runAnyEv.lastEventId = ev.id;
    }

    const opts = ev.options(g);

    g.choice = {
      kind: "EVENT",
      title: ev.name,
      prompt: ev.prompt,
      art: (ev as any).art ?? null,
      options: opts.map((o) => ({ key: o.key, label: o.label, detail: o.detail })),
    };

    (g.run as any).activeEventId = ev.id;

    setChoiceHandler(g, (key: string) => {
      const picked = opts.find((o) => o.key === key);
      if (!picked) return;

      const up = getUnlockProgress(g);
      up.eventPicks += 1;
      checkRelicUnlocks(g);

      const outcome: EventOutcome = picked.apply(g);
      handleEventOutcome(g, outcome);
      return;
    }, { id: "EVENT_BY_ID", payload: { eventId: ev.id } });

    return true;
  }

  function resumePendingNodeAfterTempt(g: GameState) {
    const pending = ((g.run as any).pendingNodeAfterTempt ?? null) as PendingTemptNode | null;
    if (!pending) return false;
    if (g.choice || g.phase !== "NODE") return false;

    const { map } = ensureGraphRuntime(g);
    if (map.pos !== pending.nodeId) {
      clearPendingTemptNode(g);
      return false;
    }

    const node = map.nodes[pending.nodeId] ?? (map.nodes[pending.nodeId] = { id: pending.nodeId, kind: pending.kind, visited: true } as any);
    const tmNow = Number((g.run as any).timeMove ?? 0) || 0;
    clearPendingTemptNode(g);

    if (pending.kind === "REST") return openRestNodeChoice(g, node, pending.nodeId, tmNow, false);
    if (pending.kind === "EVENT") return openEventNodeChoice(g, node, pending.nodeId, tmNow, false);
    return false;
  }

  
  const actions = {

    onHotkeySlot: (side: Side, idx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (side === "back" && g.backSlotDisabled?.[idx]) return;

      const slots = side === "front" ? g.frontSlots : g.backSlots;
      const uidHere = slots[idx];

      if (!g.selectedHandCardUid) {
        if (!uidHere) return;
        actions.onReturnSlotToHand(side, idx);
        return;
      }

      const selected = g.selectedHandCardUid;

      if (!uidHere) {
        actions.onPlaceHandUidToSlot(selected, side, idx);
        return;
      }

      {
        const instHere = g.cards[uidHere];
        const defHere = getCardDefByIdWithUpgrade(g.content, instHere.defId, instHere.upgrade ?? 0);
        if (defHere.tags?.includes("LOCKED")) {
          pushUiToast(g, "WARN", "이 카드는 회수하거나 이동할 수 없습니다.", 1600);
          return;
        }
      }


      slots[idx] = null;

      const placed = (g.placedUidsThisTurn ?? []).includes(uidHere);
      if (placed) {
        g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
        if (side === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
        g.placedUidsThisTurn = (g.placedUidsThisTurn ?? []).filter((u) => u !== uidHere);
        const sideMap = ((g as any)._placedSideThisTurn ??= {});
        delete sideMap[uidHere];
      }

      g.hand.push(uidHere);
      g.cards[uidHere].zone = "hand";

      placeCard(g, selected, side, idx);
      g.selectedHandCardUid = null;

      logMsg(
        g,
        `[${cardDisplayNameByUid(g, selected)}] ↔ [${cardDisplayNameByUid(g, uidHere)}] 스왑: 손패 ↔ ${side}${idx + 1}`
      );

      renderUI(g, actions);
    },


    rerender: () => { const g = getG(); renderUI(g, actions); },

    onToggleLogOverlay: () => {
      toggleLogOverlay();
      renderUI(getG(), actions);
    },

    onUseItem: (idx: number) => {
      const g = getG();
      if (g.run.finished) return;
      if (g.choice || getOverlay()) return;
      if (isTargeting(g)) return;

      const ok = useItemAt(g, idx);
      if (ok) renderUI(g, actions);
    },

    onDiscardItem: (idx: number) => {
      const g = getG();
      if (g.run.finished) return;
      if (getOverlay()) return;
      if (isTargeting(g)) return;

      const ok = discardItemAt(g, idx, "UI");
      if (ok) {
        checkRelicUnlocks(g);
        renderUI(g, actions);
      }
    },

    onCloseOverlay: () => {
      const g = getG();
      setOverlay(null);
      renderUI(g, actions);
    },

    onNewRun: () => {
      const g = getG();
      clearDrag();
      setOverlay(null);
      updateSlotHoverUI(null);
      closeChoiceOrPop(g);
      clearSave();
      commit(createInitialState(g.content));
      renderUI(getG(), actions);
    },

    onViewRulebook: () => {
      const g = getG()
      setOverlay({ kind: "RULEBOOK" });
      renderUI(g, actions);
    },

    onViewPile: (pile: PileKind) => {
      const g = getG()
      setOverlay({ kind: "PILE", pile });
      renderUI(g, actions);
    },

    onViewSettings: () => {
      const g = getG();
      setOverlay({ kind: "SETTINGS" });
      renderUI(g, actions);
    },

    onReturnSlotToHand: (fromSide: Side, fromIdx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      const slots = fromSide === "front" ? g.frontSlots : g.backSlots;
      const uid = slots[fromIdx];
      if (!uid) return;

      {
        const inst = g.cards[uid];
        const def = getCardDefByIdWithUpgrade(g.content, inst.defId, inst.upgrade ?? 0);
        if (def.tags?.includes("LOCKED")) {
          pushUiToast(g, "WARN", "이 카드는 회수할 수 없습니다.", 1600);
          return;
        }
      }

      slots[fromIdx] = null;

      const placed = (g.placedUidsThisTurn ?? []).includes(uid);
      if (placed) {
        g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
        if (fromSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
        g.placedUidsThisTurn = (g.placedUidsThisTurn ?? []).filter((u) => u !== uid);
        const sideMap = ((g as any)._placedSideThisTurn ??= {});
        delete sideMap[uid];
      }

      g.hand.push(uid);
      g.cards[uid].zone = "hand";

      logMsg(g, `[${cardDisplayNameByUid(g, uid)}] 회수: ${fromSide}${fromIdx + 1} → 손패`);
      renderUI(g, actions);
    },

    onClearSelected: () => {
      const g = getG()
      g.selectedHandCardUid = null;
      renderUI(g, actions);
    },

    onSelectEnemy: (enemyIndex: number) => {
      const g = getG();

      if (targetPickLock) return;
      targetPickLock = true;
      requestAnimationFrame(() => { targetPickLock = false; });

      const finishedTargeting = resolveTargetSelection(g, enemyIndex);

      renderUI(g, actions);

      if (finishedTargeting && !g.choice && !g.run.finished) {
        actions.onAutoAdvance();
      }
    },

    onSelectHandCard: (uid: string) => {
      const g = getG()
      if (isTargeting(g)) return;
      g.selectedHandCardUid = g.selectedHandCardUid === uid ? null : uid;
      renderUI(g, actions);
    },


    onMoveToNode: (toId: string) => {
      const g = getG();
      if (g.run.finished) return;

      if (reconcileOrphanChoiceState(g)) {
        renderUI(g, actions);
      }

      if (g.choice) {
        const choiceOverlayVisible = !!document.querySelector(".choice-overlay");
        if (!choiceOverlayVisible) {
          logMsg(g, "선택 상태 복구: 보이지 않는 선택창 데이터를 정리합니다.");
          clearChoiceStack(g);
        }
      }

      if (g.choice) {
        logMsg(g, "이동 불가: 선택 창이 열려 있습니다.");
        renderUI(g, actions);
        return;
      }
      if (g.phase !== "NODE") {
        logMsg(g, `이동 불가: 현재 페이즈가 NODE가 아닙니다. (${g.phase})`);
        renderUI(g, actions);
        return;
      }

      const now = Date.now();
      if (now < nodePickLockedUntil) {
        logMsg(g, "이동 불가: 입력 잠금 중입니다. 잠시 후 다시 시도하세요.");
        renderUI(g, actions);
        return;
      }
      nodePickLockedUntil = now + 180;

      const runAny = g.run as any;
      const { map } = ensureGraphRuntime(g);

      const from = map.pos;
      const neigh = map.edges[from] ?? [];
      if (!neigh.includes(toId)) {
        logMsg(g, `이동 불가: 인접 노드가 아닙니다. (${from} → ${toId})`);
        renderUI(g, actions);
        return;
      }


      runAny.timeMove = Number(runAny.timeMove ?? 0) + wingArteryMoveDelta(g);
      map.visionNonce = Number(map.visionNonce ?? 0) + 1;


      map.pos = toId;


      const node = map.nodes[toId] ?? (map.nodes[toId] = { id: toId, kind: "BATTLE" });
      const firstVisit = !node.visited;
      if (firstVisit) {
        node.visited = true;
        g.run.nodePickCount = (g.run.nodePickCount ?? 0) + 1;
      }


      if (g.run.treasureObtained) {
        maybeShiftTopology(g);

        if (map.pos === map.startId) {
          g.run.finished = true;
          logMsg(g, "보물을 들고 입구로 돌아왔다! 탈출에 성공했습니다!");
          renderUI(g, actions);
          return;
        }

        if (firstVisit && node.kind !== "TREASURE" && node.kind !== "START") {
          g.run.afterTreasureNodePicks = (g.run.afterTreasureNodePicks ?? 0) + 1;
        }
      }


      ensureBossSchedule(g);
      const T = totalTimeOnMap(g);
      if (Number(runAny.nextBossTime ?? 0) > 0 && T >= Number(runAny.nextBossTime ?? 0)) {
        const reachedAt = Number(runAny.nextBossTime ?? 0) || 0;
        pushUiToast(g, "WARN", `보스 임계치 도달 (${T}/${reachedAt})`, 2200);
        runAny.forcedNext = null;
        runAny.nextBossTime = Number(runAny.nextBossTime ?? 0) + 40;
        g.run.bossOmenText = null;

        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).noRespawn = true;
        (node as any).lastClearedMove = Number(runAny.timeMove ?? 0);

        logMsg(g, "시간이 다 되어 보스가 나타납니다. (시간 +1)");

        spawnEncounter(g, { forceBoss: true });
        startCombat(g);
        renderUI(g, actions);
        return;
      }


      const tmNow = Number(runAny.timeMove ?? 0) || 0;

      if (node.cleared && (node.kind === "BATTLE" || node.kind === "EVENT" || node.kind === "REST" || node.kind === "ELITE")) {
        if (node.kind === "ELITE") (node as any).noRespawn = true;
        node.kind = "EMPTY";
        (node as any).lastClearedMove = Number((node as any).lastClearedMove ?? tmNow);
      }

      let actualKind: MapNodeKind = node.kind;

      if (actualKind === "EMPTY") {
        const noRespawn = !!(node as any).noRespawn;
        const last = Number((node as any).lastClearedMove ?? -999);
        const cd = Number((runAny.respawnCooldownMoves ?? 2)) || 2;
        const inCooldown = tmNow - last <= cd;

        if (!noRespawn && !inCooldown) {
          const f = Math.max(0, Number(g.player.fatigue ?? 0) || 0);
          const fBoost = clamp01(f / 25) * 0.18;

          const base = g.run.treasureObtained ? 0.22 : 0.12;
          const p = clamp01(base + fBoost);

          if (Math.random() < p) {
            const r = Math.random();
            const pBattle = g.run.treasureObtained ? 0.72 : 0.55;
            const pEvent = g.run.treasureObtained ? 0.90 : 0.85;
            actualKind = r < pBattle ? "BATTLE" : r < pEvent ? "EVENT" : "REST";
            node.kind = actualKind;
            node.cleared = false;
            (node as any).respawnCount = Number((node as any).respawnCount ?? 0) + 1;
            logMsg(g, "재발동: 이곳에서 다시 무언가가 일어납니다...");
          }
        }
      }

      // 광기(적대) 3: 전투가 아닌 노드에서도 50% 확률로 전투 발생
      {
        const bane = getMadnessBane(g);
        if (bane === 3 && (actualKind === "EVENT" || actualKind === "REST" || actualKind === "SHOP")) {
          if (Math.random() < 0.5) {
            actualKind = "BATTLE";
            logMsg(g, "광기(적대): 던전이 뒤틀려 전투가 발생합니다...");
            pushUiToast(g, "WARN", "광기의 힘이 길을 막아섭니다.", 1800);
          }
        }
      }

      if (actualKind === "START") {
        renderUI(g, actions);
        return;
      }

      if (actualKind === "TREASURE") {
        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).noRespawn = true;
        (node as any).lastClearedMove = tmNow;
        obtainTreasure(g);
        renderUI(g, actions);
        return;
      }

      if (actualKind === "BATTLE" || actualKind === "ELITE") {
        {
          const boon = getMadnessBoon(g);
          if (boon === 3 && Math.random() < 0.5) {
            node.cleared = true;
            node.kind = "EMPTY";
            (node as any).lastClearedMove = tmNow;
            if (actualKind === "ELITE") (node as any).noRespawn = true;
            logMsg(g, "광기: 전투가 어딘가로 사라졌다...");
            pushUiToast(g, "INFO", "전투가 일어나지 않았습니다.", 1600);
            renderUI(g, actions);
            return;
          }
        }

        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).lastClearedMove = tmNow;
        if (actualKind === "ELITE") (node as any).noRespawn = true;

        logMsg(g, "이동 후 전투 시작 (시간 +1)");

        if (actualKind === "ELITE") {
          spawnEncounter(g, { forceBoss: false, forceElite: true });
        } else {
          spawnEncounter(g, { forceBoss: false });
        }
        startCombat(g);
        renderUI(g, actions);
        return;
      }

      if (actualKind === "REST") {
        openRestNodeChoice(g, node, toId, tmNow, true);
        renderUI(g, actions);
        return;
      }


      if (actualKind === "SHOP") {
        node.visited = true;
        node.cleared = true;
        (node as any).noRespawn = true;
        (node as any).lastClearedMove = tmNow;

        openShopChoice(g, toId);
        renderUI(g, actions);
        return;
      }

      if (actualKind === "EVENT") {
        openEventNodeChoice(g, node, toId, tmNow, true);
        renderUI(g, actions);
        return;
      }

      renderUI(g, actions);
      return;

    },


    onChooseChoice: (key: string) => {
      const g = getG();
      if (reconcileOrphanChoiceState(g)) {
        renderUI(g, actions);
      }
      if (!g.choice) return;

      const kind = g.choice.kind;

      if (applyChoiceKey(g, key)) {
        const justEnteredCombat = kind === "EVENT" && key === "startBattle";

        if (resumePendingNodeAfterTempt(g)) {
          renderUI(g, actions);
          return;
        }

        renderUI(g, actions);

        if (!justEnteredCombat) actions.onAutoAdvance();
        return;
      }

      if (choiceHandler) {
        choiceHandler(key);

        const justEnteredCombat = kind === "EVENT" && key === "startBattle";

        if (resumePendingNodeAfterTempt(g)) {
          renderUI(g, actions);
          return;
        }

        renderUI(g, actions);

        if (!justEnteredCombat) actions.onAutoAdvance();
        return;
      }

      const snap = getChoiceSnapshot(g);
      if (snap && dispatchChoiceSnapshot(g, key, snap)) {
        if (resumePendingNodeAfterTempt(g)) {
          renderUI(g, actions);
          return;
        }
        actions.onAutoAdvance();
        return;
      }

      logMsg(g, `선택 처리 불가: handler 없음 (kind=${kind}, key=${key})`);
    },
    onAutoAdvance: () => {
      const g = getG();
      runAutoAdvanceRAF({ g, actions, getOverlayActive: () => !!getOverlay(), render: renderUI, animMs });
    },


    onRevealIntents: () => {
      const g = getG()
      if (g.run.finished) return;
      if (g.enemies.length === 0) return;
      revealIntentsAndDisrupt(g);
      renderUI(g, actions);
    },

    onPlaceHandUidToSlot: (cardUid: string, side: Side, idx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (side === "back" && g.backSlotDisabled?.[idx]) return;
      if (side === "front" && isFrontSlotLockedByLivingChain(g, idx)) {
        pushUiToast(g, "WARN", "살아있는 사슬: 전열 2번 슬롯은 사용할 수 없습니다.", 1600);
        logMsg(g, "살아있는 사슬: 전열 2번 슬롯 봉인");
        renderUI(g, actions);
        return;
      }

      placeCard(g, cardUid, side, idx);
      g.selectedHandCardUid = null;
      renderUI(g, actions);
    },

    onPlaceSelected: (side: Side, idx: number) => {
      const g = getG()
      if (!g.selectedHandCardUid) return;
      actions.onPlaceHandUidToSlot(g.selectedHandCardUid, side, idx);
    },

    onMoveSlotCard: (fromSide: Side, fromIdx: number, toSide: Side, toIdx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (toSide === "back" && g.backSlotDisabled?.[toIdx]) return;
      if (toSide === "front" && isFrontSlotLockedByLivingChain(g, toIdx)) {
        pushUiToast(g, "WARN", "살아있는 사슬: 전열 2번 슬롯은 사용할 수 없습니다.", 1600);
        logMsg(g, "살아있는 사슬: 전열 2번 슬롯 봉인");
        renderUI(g, actions);
        return;
      }

      const fromSlots = fromSide === "front" ? g.frontSlots : g.backSlots;
      const toSlots = toSide === "front" ? g.frontSlots : g.backSlots;

      const a = fromSlots[fromIdx];
      if (!a) return;

      {
        const inst = g.cards[a];
        const def = getCardDefByIdWithUpgrade(g.content, inst.defId, inst.upgrade ?? 0);
        if (def.tags?.includes("LOCKED")) {
          pushUiToast(g, "WARN", "이 카드는 회수하거나 이동할 수 없습니다.", 1600);
          return;
        }
      }

      const b = toSlots[toIdx];

      if (b) {
        const instB = g.cards[b];
        const defB = getCardDefByIdWithUpgrade(g.content, instB.defId, instB.upgrade ?? 0);
        if (defB.tags?.includes("LOCKED")) {
          pushUiToast(g, "WARN", "이 카드는 회수하거나 이동할 수 없습니다.", 1600);
          return;
        }
      }

      fromSlots[fromIdx] = b ?? null;
      toSlots[toIdx] = a;

      g.cards[a].zone = toSide;
      if (b) g.cards[b].zone = fromSide;
      {
        const sideMap = ((g as any)._placedSideThisTurn ??= {});
        sideMap[a] = toSide;
        if (b) sideMap[b] = fromSide;
      }

      if (fromSide !== toSide) {
        if (fromSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
        if (toSide === "front") g.frontPlacedThisTurn += 1;

        if (b) {
          if (toSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
          if (fromSide === "front") g.frontPlacedThisTurn += 1;
        }
      }

      logMsg(
        g,
        b
          ? `[${cardDisplayNameByUid(g, a)}] ↔ [${cardDisplayNameByUid(g, b)}] 스왑: ${fromSide}${fromIdx + 1} ↔ ${toSide}${toIdx + 1}`
          : `[${cardDisplayNameByUid(g, a)}] 이동: ${fromSide}${fromIdx + 1} → ${toSide}${toIdx + 1}`
      );

      normalizePlacementCounters(g);
      renderUI(g, actions);
    },

    onResolveBack: () => {
      const g = getG();
      if (g.phase === "PLACE") normalizePlacementCounters(g);

      resolveBack(g);
      renderUI(g, actions);
    },
    onResolveFront: () => {
      const g = getG()
      resolveFront(g);
      renderUI(g, actions);
    },
    onResolveEnemy: () => {
      const g = getG()
      resolveEnemy(g);
      renderUI(g, actions);
    },
    onUpkeep: () => {
      const g = getG()
      upkeepEndTurn(g);
      renderUI(g, actions);
    },
    onDrawNextTurn: () => {
      const g = getG()
      drawStepStartNextTurn(g);
      renderUI(g, actions);
    },
  };

  {
    const bindKey = "__deckrogueUiResumeResyncBound";
    if (!(window as any)[bindKey]) {
      const onResume = () => {
        const g = getG();
        reconcileOrphanChoiceState(g);
        clearDrag();
        updateSlotHoverUI(null);
        renderUI(g, actions);
      };

      window.addEventListener("focus", onResume, { passive: true });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") onResume();
      }, { passive: true });

      (window as any)[bindKey] = true;
    }
  }


  function openRewardPick(g: GameState, actions: any, title: string, prompt: string) {


    const offers = offerRewardsByFatigue(g);
    const opts = offers.map((o) => {
      const d = getCardDefByIdWithUpgrade(g.content, o.defId, o.upgrade);
      const t = displayCardTextPair(g, d.frontText, d.backText);
      return {
        key: `pick:${o.defId}:${o.upgrade}`,
        label: displayNameForOffer(g, o),
        detail: `전열: ${t.frontText} / 후열: ${t.backText}`,
      };
    });


    g.choice = {
      kind: "REWARD",
      title,
      prompt,
      options: [
        ...opts,
        { key: "skip", label: "생략" },
      ],
    };
    g.choiceCtx = null;

    setChoiceHandler(g, (kk: string) => {
      handleRewardPickChoice(g, kk);
      return;
    }, { id: "REWARD_PICK" });


    renderUI(g, actions);
  }

  function openUpgradePick(
    g: GameState,
    actions: any,
    title: string,
    prompt: string,
    opts?: {
      onDone?: () => void;
      onSkip?: () => void;
    }
  ) {
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

    if (candidates.length === 0) {
      logMsg(g, "강화할 수 있는 카드가 없습니다.");
      g.choice = null;
      setChoiceHandler(g, null, null);

      if (opts?.onSkip) opts.onSkip();
      else renderUI(g, actions);
      return;
    }

    const sorted = [...candidates].sort((ua, ub) => {
      const a = g.cards[ua];
      const b = g.cards[ub];
      const na = baseCardName(g, a.defId);
      const nb = baseCardName(g, b.defId);
      const nc = na.localeCompare(nb, "ko");
      if (nc !== 0) return nc;
      return (a.upgrade ?? 0) - (b.upgrade ?? 0);
    });

    g.choice = {
      kind: "UPGRADE_PICK" as ChoiceKind,
      title,
      prompt,
      options: [
        ...sorted.map((uid) => {
          const c = g.cards[uid];
          const curDef = getCardDefByUid(g, uid);
          const nextDef = getCardDefByIdWithUpgrade(g.content, c.defId, (c.upgrade ?? 0) + 1);
          const curText = displayCardTextPair(g, curDef.frontText, curDef.backText);
          const nextText = displayCardTextPair(g, nextDef.frontText, nextDef.backText);

          const label = cardDisplayNameByUid(g, uid);
          const detail =
            `현재: 전열 ${curText.frontText} / 후열 ${curText.backText}\n` +
            `강화: 전열 ${nextText.frontText} / 후열 ${nextText.backText}`;

          return { key: `up:${uid}`, label, detail, cardUid: uid };
        }),
        { key: "skip", label: "취소" },
      ],
    };
    g.choiceCtx = null;

    setChoiceHandler(g, (k: string) => {

      if (k === "skip") {
        logMsg(g, "강화 취소");
        closeChoiceOrPop(g);

        if (opts?.onSkip) opts.onSkip();
        else renderUI(g, actions);
        return;
      }


      if (k.startsWith("up:")) {
        const uid = k.slice("up:".length);
        const ok = upgradeCardByUid(g, uid);
        logMsg(g, ok ? `강화: [${cardDisplayNameByUid(g, uid)}]` : "강화 실패");

        closeChoiceOrPop(g);

        if (opts?.onDone) opts.onDone();
        else renderUI(g, actions);
        return;
      }


      closeChoiceOrPop(g);
      renderUI(g, actions);
    }, { id: "UPGRADE_PICK" });


    renderUI(g, actions);
  }
  return actions;
}
