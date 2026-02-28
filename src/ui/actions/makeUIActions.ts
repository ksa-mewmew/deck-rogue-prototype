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



  let choiceHandler: ((key: string) => void) | null = null;
  let nodePickLock = false;


  let targetPickLock = false;

  type ChoiceFrame = {
    choice: GameState["choice"];
    handler: ((key: string) => void) | null;
  };

  const choiceStack: ChoiceFrame[] = [];

  function clearChoiceStack(g: GameState) {
    choiceStack.length = 0;
    g.choice = null;
    choiceHandler = null;
    document.querySelector(".choice-overlay")?.remove();
  }

  function pushChoice(g: GameState) {
    choiceStack.push({ choice: g.choice, handler: choiceHandler });
  }

  function popChoice(g: GameState) {
    const prev = choiceStack.pop();
    if (!prev) {
      closeChoiceOrPop(g);
      return;
    }
    g.choice = prev.choice;
    choiceHandler = prev.handler;
  }

  function closeChoiceOrPop(g: GameState) {
    if (choiceStack.length > 0) {
      popChoice(g);
      return;
    }
    g.choice = null;
    choiceHandler = null;
    document.querySelector(".choice-overlay")?.remove();
  }

  function openChoice(
    g: GameState,
    next: GameState["choice"],
    handler: (key: string) => void
  ) {
    if (g.choice) pushChoice(g);
    g.choice = next;
    choiceHandler = handler;
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
      if (g.choice) return;
      if (g.phase !== "NODE") return;

      if (nodePickLock) return;
      nodePickLock = true;
      setTimeout(() => (nodePickLock = false), 180);

      const runAny = g.run as any;
      const { map } = ensureGraphRuntime(g);

      const from = map.pos;
      const neigh = map.edges[from] ?? [];
      if (!neigh.includes(toId)) return;


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

      if (actualKind === "REST") {
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
        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).lastClearedMove = tmNow;
        const runAny2: any = g.run;
        runAny2.ominousProphecySeen ??= false;

        {
          const f = ensureFaith(g);
          if (f.chosen) {
            const tempter = pickTemptingGod(g);
            const P_TEMPT = 0.25;
            if (tempter && Math.random() < P_TEMPT) {
              openGodTemptChoice(g, tempter);
              renderUI(g, actions);
              return;
            }
          }
        }

        const OMEN_CHANCE = 0.3;
        let ev = pickEventByMadness(g);

        if (runAny2.ominousProphecySeen === true) {
          for (let i = 0; i < 50 && (ev as any).id === "ominous_prophecy"; i++) {
            ev = pickEventByMadness(g);
          }
        } else {
          if (Math.random() < OMEN_CHANCE) {
            ev = getEventById("ominous_prophecy") ?? ev;
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
              if (cid !== lastEventId) {
                ev = cand;
                break;
              }
            }
          }
        }

        if ((ev as any)?.id === "ominous_prophecy") {
          runAny2.ominousProphecySeen = true;
        }

        if (!ev) {
          renderUI(g, actions);
          return;
        }

        {
          const runAnyEv = g.run as any;
          runAnyEv.eventsSeen ??= {};
          const cur = Number(runAnyEv.eventsSeen[ev.id] ?? 0) || 0;
          runAnyEv.eventsSeen[ev.id] = cur + 1;
          runAnyEv.lastEventId = ev.id;
        }

        let opts = ev.options(g);


        /*const { tier } = madnessP(g);
        if (tier >= 2 && !opts.some((o) => o.key === "mad:whisper")) {
          opts = [
            ...opts,
            {
              key: "mad:whisper",
              label: "속삭임에 귀 기울인다.",
              detail: "무언가를 얻는다. 그리고 무언가를 잃는다.",
              apply: (gg: GameState) => {
                const r = Math.random();
                if (r < 0.34) {
                  gg.player.hp = Math.min(gg.player.maxHp, gg.player.hp + 10);
                  logMsg(gg, "속삭임: HP +10");
                } else if (r < 0.67) {
                  gg.player.fatigue += 1;
                  logMsg(gg, "속삭임: F +1 (대가)");
                } else {
                  addCardToDeck(gg, "mad_echo", { upgrade: 0 });
                  logMsg(gg, "속삭임: [메아리]를 얻었다.");
                }
                return "NONE" as any;
              },
            } as any,
          ];
        }*/

        g.choice = {
          kind: "EVENT",
          title: ev.name,
          prompt: ev.prompt,
          art: (ev as any).art ?? null,
          options: opts.map((o) => ({ key: o.key, label: o.label, detail: o.detail })),
        };

        choiceHandler = (key: string) => {
          const picked = opts.find((o) => o.key === key);
          if (!picked) return;


          const up = getUnlockProgress(g);
          up.eventPicks += 1;
          checkRelicUnlocks(g);

          const outcome: EventOutcome = picked.apply(g);

          if (typeof outcome === "object" && outcome.kind === "UPGRADE_PICK") {
            openUpgradePick(g, actions, outcome.title ?? "강화", outcome.prompt ?? "강화할 카드 1장을 선택하세요.");
            return;
          }

          if (typeof outcome === "object" && outcome.kind === "REMOVE_PICK") {
            const candidates = Object.values(g.cards)
              .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && c.defId !== "goal_treasure")
              .map((c) => c.uid);

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
              if (k === "cancel") {
                logMsg(g, "제거 취소");
                closeChoiceOrPop(g);
                renderUI(g, actions);
                return;
              }

              if (!k.startsWith("remove:")) {
                renderUI(g, actions);
                return;
              }

              const uid = k.slice("remove:".length);
              removeCardByUid(g, uid);

              const thenRaw = (outcome as any).then as string | undefined;
              const then =
                thenRaw === "REWARD" ? "REWARD_PICK" :
                thenRaw === "REWARD_PICK" ? "REWARD_PICK" :
                thenRaw === "BATTLE" ? "BATTLE" :
                thenRaw === "NONE" ? "NONE" :
                undefined;

              if (then === "BATTLE") {
                clearChoiceStack(g);
                g.phase = "NODE";
                spawnEncounter(g);
                startCombat(g);
                renderUI(g, actions);
                return;
              }

              if (then === "REWARD_PICK") {
                clearChoiceStack(g);
                openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
                renderUI(g, actions);
                return;
              }

              clearChoiceStack(g);
              g.phase = "NODE";
              renderUI(g, actions);
              return;
            });

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
          return;
        };

        renderUI(g, actions);
        return;
      }


      if (actualKind === "BATTLE" || actualKind === "ELITE") {
        // 광기(수락) 3: 50% 확률로 전투 노드에서도 전투가 발생하지 않음 (보스 제외)
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

      renderUI(g, actions);
    },


    onChooseChoice: (key: string) => {
      const g = getG();
      if (!g.choice) return;

      const kind = g.choice.kind;

      if (applyChoiceKey(g, key)) {
        const justEnteredCombat = kind === "EVENT" && key === "startBattle";

        renderUI(g, actions);

        if (!justEnteredCombat) actions.onAutoAdvance();
        return;
      }

      if (choiceHandler) {
        choiceHandler(key);

        const justEnteredCombat = kind === "EVENT" && key === "startBattle";

        renderUI(g, actions);

        if (!justEnteredCombat) actions.onAutoAdvance();
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

    choiceHandler = (kk: string) => {
      choiceHandler = null;
      if (kk.startsWith("pick:")) {
        const payload = kk.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        addCardToDeck(g, defId, { upgrade });
      } else {
        logMsg(g, "카드 보상 생략");
      }

      closeChoiceOrPop(g);
      g.choice = null;
      if (!g.run.finished) g.phase = "NODE";
      renderUI(g, actions);
      return;
    };


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
      choiceHandler = null;

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

    choiceHandler = (k: string) => {

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
    };


    renderUI(g, actions);
  }
  return actions;
}
