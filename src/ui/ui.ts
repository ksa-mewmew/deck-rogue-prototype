const RULEBOOK_TEXT = `# Deck Rogue Prototype — 룰북 (플레이어용)

이 문서는 스포일러를 최소화합니다.

[1] 개요
노드를 선택하며 진행하고, 전투에서 살아남아 성장합니다. 목표는 무엇일까요?
모든 카드는 전열과 후열이 있습니다. 배치에 따라 역할이 달라집니다.

[2] 보급과 피로도

보급(S): 전열 카드 및 일부 효과의 발동에 사용됩니다. 보통 10으로 시작합니다.
보급이 부족한 상태로 턴 종료 시, 이번 전투에서 보급 없이 종료한 턴의 횟수만큼 피해를 받습니다.

피로도(F): 덱을 섞을 때 피로도가 1 올라가며, 일부 카드의 효과로도 변합니다.
덱을 섞을 때 피로도만큼 피해를 입습니다. 피로도는 전투가 끝나도 유지됩니다.

보급이 부족한 채로 턴을 마칠 때, 사용한 전열 카드 한 장 당 피해를 3 받으며, F가 1 증가합니다.
이 효과는 보급 자체에 의한 HP 손실과 별개입니다!

[3] 전투 흐름
배치 → 후열 발동 → 전열 발동 → 적 행동 → 정리 → 드로우
※ “대상 선택 필요”가 뜨면 살아있는 적을 클릭해 대상을 정하세요.
※ 후열 발동을 누르면 턴이 진행되어, 카드의 배치를 변경할 수 없습니다.
보급 및 그에 따른 변화는 정리 단계에서 처리합니다.

손패는 턴이 종료되어도 유지됩니다.
카드는 매 턴마다 사용한 만큼 뽑습니다. 즉, 카드로 인한 드로우는 패의 매수 자체를 늘리는 효과가 있습니다.

[4] 용어
- 소모: 이번 전투에서 사용할 수 없게 되는 것입니다.
- 소실: 런 전체에서 해당 카드가 사라지는 것입니다.
- 취약: 받는 피해가 (취약)만큼 증가합니다.
- 약화: 주는 피해가 (약화)만큼 감소합니다.
- 출혈: 턴 종료 시 (출혈)만큼 피해를 입습니다.
- 교란: 당신을 방해합니다. 무엇일까요?

[5] 조작
- 4: 선택 해제
- Tab: 손패 선택 이동
- 1~3: 전열 배치 / Shift+1~3: 후열 배치
- 드래그: 손패→슬롯 배치, 슬롯↔슬롯 스왑, 슬롯→손패 회수
`;

import type { GameState, PileKind, NodeOffer, Side } from "../engine/types";
import {
  spawnEncounter,
  startCombat,
  placeCard,
  revealIntentsAndDisrupt,
  resolveTargetSelection,
  resolveBack,
  resolveFront,
  resolveEnemy,
  upkeepEndTurn,
  drawStepStartNextTurn,
} from "../engine/combat";
import { logMsg, rollBranchOffer, advanceBranchOffer } from "../engine/rules";
import { createInitialState } from "../engine/state";

import type { EventOutcome } from "../content/events";
import { pickRandomEvent } from "../content/events";
import { removeCardByUid, addCardToDeck, offerRewardPair, canUpgradeUid, upgradeCardByUid } from "../content/rewards";
import { getCardDefByIdWithUpgrade } from "../content/cards";

let lastMainPanelScrollTop = 0;
let lastMainPanelScrollLeft = 0;
let currentG: GameState | null = null;

// UI Actions

export type UIActions = ReturnType<typeof makeUIActions>;

type DragState =
  | null
  | {
      kind: "hand" | "slot";
      cardUid: string;

      fromHandIndex?: number;
      fromSide?: Side;
      fromIdx?: number;

      pointerId: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      dragging: boolean;

      sourceEl?: HTMLElement | null;
      previewEl?: HTMLElement;
      previewW?: number;
      previewH?: number;
      grabDX?: number;
      grabDY?: number;
    };

type SlotDrop = { side: Side; idx: number };

type Overlay =
  | { kind: "RULEBOOK" }
  | { kind: "PILE"; pile: PileKind };

let overlay: Overlay | null = null;
let uiMounted = false;
let drag: DragState = null;
let hoverSlot: SlotDrop | null = null;


// 카드 렌더

function renderCardPreviewByUid(g: GameState, cardUid: string) {

  const c = g.cards[cardUid];
  const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);

  const d = div("card");
  d.classList.add("choiceCard");

  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  d.appendChild(divText("cardTitle", displayNameForUid(g, cardUid)));

  const meta = div("cardMeta");
  if (def.tags?.includes("EXHAUST")) meta.appendChild(badge("소모"));
  if (def.tags?.includes("VANISH")) meta.appendChild(badge("소실"));
  d.appendChild(meta);

  const sec1 = div("cardSection");
  sec1.appendChild(divText("cardSectionTitle", "⚔ 전열"));
  sec1.appendChild(divText("cardText", def.frontText));
  d.appendChild(sec1);

  const sec2 = div("cardSection");
  sec2.appendChild(divText("cardSectionTitle", "🕯 후열"));
  sec2.appendChild(divText("cardText", def.backText));
  d.appendChild(sec2);

  return d;
}

function renderCardPreviewByDef(g: GameState, defId: string, upgrade: number) {
  const def = getCardDefByIdWithUpgrade(g.content, defId, upgrade);
  const baseName = g.content.cardsById[defId]?.name ?? defId;

  const d = div("card");
  d.classList.add("choiceCard");
  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  d.appendChild(divText("cardTitle", formatName(baseName, upgrade)));

  const meta = div("cardMeta");
  if (def.tags?.includes("EXHAUST")) meta.appendChild(badge("소모"));
  if (def.tags?.includes("VANISH")) meta.appendChild(badge("소실"));
  d.appendChild(meta);

  const sec1 = div("cardSection");
  sec1.appendChild(divText("cardSectionTitle", "⚔ 전열"));
  sec1.appendChild(divText("cardText", def.frontText));
  d.appendChild(sec1);

  const sec2 = div("cardSection");
  sec2.appendChild(divText("cardSectionTitle", "🕯 후열"));
  sec2.appendChild(divText("cardText", def.backText));
  d.appendChild(sec2);

  return d;
}

// 길


function nodeLabel(t: "BATTLE" | "REST" | "EVENT" | "TREASURE", isBoss: boolean) {
  if (t === "BATTLE") return isBoss ? "☠️" : "⚔️";
  if (t === "REST") return "⛺";
  if (t === "EVENT") return "❔";
  return "🌑";
}
function labelList(
  offers: Array<{ type: "BATTLE" | "REST" | "EVENT" | "TREASURE" }>,
  isBoss: boolean
) {
  if (isBoss) return "보스";
  return offers.map((o) => nodeLabel(o.type, false)).join(" / ");
}



function renderNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {
  const parts: string[] = [`[선택 ${g.run.nodePickCount}회]`];
  if (g.run.treasureObtained) parts.push(`[보물 후 ${g.run.afterTreasureNodePicks}/10]`);
  root.appendChild(p(parts.join(" ")));

  const nextIndex = g.run.nodePickCount + 1;
  const isBossNode = nextIndex % 30 === 0;
  const isBossNextAfterPick = (g.run.nodePickCount + 2) % 30 === 0;

  const offers = actions.getNodeOffers();   // A/B
  const br = g.run.branchOffer;

  if (br) {
    const preview = div("nodePreviewBox");
    preview.style.cssText =
      "margin-top:10px; padding:12px; border:1px solid rgba(255,255,255,.10); border-radius:16px; background:rgba(0,0,0,.18);";

    const rowA = div("nodePreviewRow");
    rowA.style.cssText =
      "display:flex; gap:10px; align-items:center; padding:10px; border-radius:14px; cursor:pointer;";
    rowA.onmouseenter = () => (rowA.style.background = "rgba(255,255,255,.06)");
    rowA.onmouseleave = () => (rowA.style.background = "transparent");
    rowA.onclick = () => actions.onChooseNode("A");

    const nowA = nodeLabel(offers[0]?.type ?? "BATTLE", isBossNode);
    const pillNowA = document.createElement("div");
    pillNowA.className = "nodePill primary";
    pillNowA.textContent = nowA;
    rowA.appendChild(pillNowA);

    rowA.appendChild(divText("", "→"));

    const nextA = labelList(br.nextIfA, isBossNextAfterPick);
    const nextAText = divText("", nextA);
    nextAText.style.cssText = "opacity:.85;";
    rowA.appendChild(nextAText);

    const rowB = div("nodePreviewRow");
    rowB.style.cssText =
      "display:flex; gap:10px; align-items:center; padding:10px; border-radius:14px; cursor:pointer;";
    rowB.onmouseenter = () => (rowB.style.background = "rgba(255,255,255,.06)");
    rowB.onmouseleave = () => (rowB.style.background = "transparent");
    rowB.onclick = () => actions.onChooseNode("B");

    const nowB = nodeLabel(offers[1]?.type ?? "BATTLE", isBossNode);
    const pillNowB = document.createElement("div");
    pillNowB.className = "nodePill primary";
    pillNowB.textContent = nowB;
    rowB.appendChild(pillNowB);

    rowB.appendChild(divText("", "→"));

    const nextB = labelList(br.nextIfB, isBossNextAfterPick);
    const nextBText = divText("", nextB);
    nextBText.style.cssText = "opacity:.85;";
    rowB.appendChild(nextBText);

    pillNowA.onclick = (e) => {
      e.stopPropagation();
      actions.onChooseNode("A");
    };

    pillNowB.onclick = (e) => {
      e.stopPropagation();
      actions.onChooseNode("B");
    };

    preview.appendChild(rowA);
    preview.appendChild(rowB);

    root.appendChild(preview);
    root.appendChild(hr());
  }


}




function hr() {
  return document.createElement("hr");
}



// Choice types

type ChoiceKind = "EVENT" | "REWARD" | "PICK_CARD" | "VIEW_PILE" | "UPGRADE_PICK";

export function makeUIActions(g0: GameState, setGame: (next: GameState) => void) {
  let choiceHandler: ((key: string) => void) | null = null;
  let nodePickLock = false;

  type ChoiceFrame = {
    choice: GameState["choice"];
    handler: ((key: string) => void) | null;
  };

  const choiceStack: ChoiceFrame[] = [];

  function pushChoice(g: GameState) {
    choiceStack.push({ choice: g.choice, handler: choiceHandler });
  }

  function popChoice(g: GameState) {
    const prev = choiceStack.pop();
    if (!prev) {
      closeChoiceUI(g);
      choiceHandler = null;
      return;
    }
    g.choice = prev.choice;
    choiceHandler = prev.handler;
  }


  const getG = () => {
    if (!currentG) return g0;
    return currentG;
  };
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

      // 손패 <-> 슬롯 스왑

      slots[idx] = null;

      g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
      if (side === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);

      g.hand.push(uidHere);
      g.cards[uidHere].zone = "hand";

      placeCard(g, selected, side, idx);
      g.selectedHandCardUid = null;

      logMsg(
        g,
        `[${cardDisplayNameByUid(g, selected)}] ↔ [${cardDisplayNameByUid(g, uidHere)}] 스왑: 손패 ↔ ${side}${idx + 1}`
      );

      render(g, actions);
    },


    rerender: () => { const g = getG(); render(g, actions); },

    onCloseOverlay: () => {
      const g = getG();
      overlay = null;        
      render(g, actions);
    },

    onNewRun: () => {
      const g = getG();
      hoverSlot = null;
      overlay = null;
      drag = null;
      choiceHandler = null;
      closeChoiceUI(g);              
      setGame(createInitialState(g.content));
    },

    onViewRulebook: () => {
      const g = getG()
      overlay = { kind: "RULEBOOK" };
      render(g, actions);
    },

    onViewPile: (pile: PileKind) => {
      const g = getG()
      overlay = { kind: "PILE", pile };
      render(g, actions);
    },

    onReturnSlotToHand: (fromSide: Side, fromIdx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      const slots = fromSide === "front" ? g.frontSlots : g.backSlots;
      const uid = slots[fromIdx];
      if (!uid) return;

      slots[fromIdx] = null;

      g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
      if (fromSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);

      g.hand.push(uid);
      g.cards[uid].zone = "hand";

      logMsg(g, `[${cardDisplayNameByUid(g, uid)}] 회수: ${fromSide}${fromIdx + 1} → 손패`);
      render(g, actions);
    },

    onClearSelected: () => {
      const g = getG()
      g.selectedHandCardUid = null;
      render(g, actions);
    },

    onSelectHandCard: (uid: string) => {
      const g = getG()
      if (isTargeting(g)) return;
      g.selectedHandCardUid = g.selectedHandCardUid === uid ? null : uid;
      render(g, actions);
    },

    // Node 선택
    getNodeOffers: (): NodeOffer[] => {
      const g = getG()
      if (!g.run.branchOffer) g.run.branchOffer = rollBranchOffer(g);

      const nextIndex = g.run.nodePickCount + 1;
      const isBossNode = nextIndex % 30 === 0;

      if (isBossNode) {
        return [
          { id: "A", type: "BATTLE" },
          { id: "B", type: "BATTLE" },
        ];
      }
      return g.run.branchOffer.root;
    },

    onChooseNode: (id: "A" | "B") => {
      const g = getG();
      if (nodePickLock) return;
      nodePickLock = true;
      queueMicrotask(() => (nodePickLock = false)); // 또는 setTimeout(() => nodePickLock=false, 0);

      if (g.run.finished) return;
      if (g.phase !== "NODE") return;

      if (!g.run.branchOffer) g.run.branchOffer = rollBranchOffer(g);

      const nextIndex = g.run.nodePickCount + 1;
      const forceBossNow = nextIndex % 30 === 0;

      const pickedType = forceBossNow
        ? "BATTLE"
        : id === "A"
        ? g.run.branchOffer.root[0].type
        : g.run.branchOffer.root[1].type;

      const actual = pickedType;

      g.run.nodePickCount = nextIndex;
      g.run.nodePickByType[actual] = (g.run.nodePickByType[actual] ?? 0) + 1;

      advanceBranchOffer(g, id);

      // 승리 조건
      if (g.run.treasureObtained && actual !== "TREASURE") {
        g.run.afterTreasureNodePicks += 1;
        if (g.run.afterTreasureNodePicks >= 10) {
          g.run.finished = true;
          logMsg(g, "승리! 저주받은 보물을 얻은 후 10번의 탐험을 버텼습니다.");
          render(g, actions);
          return;
        }
      }

      if (actual === "BATTLE") {
        if (forceBossNow) logMsg(g, `=== ${nextIndex}번째 노드: 보스 전투 ===`);
        spawnEncounter(g, { forceBoss: forceBossNow });
        startCombat(g);
        render(g, actions);
        return;
      }

      if (actual === "REST") {
        const openRestMenu = () => {
          g.choice = {
            kind: "EVENT",
            title: "휴식",
            prompt: "무엇을 하시겠습니까?",
            options: [
              { key: "rest:heal", label: "HP +15" },
              { key: "rest:clear_f", label: "F -3" },
              { key: "rest:upgrade", label: "강화" },
              { key: "rest:skip", label: "생략" },
            ],
          };

          choiceHandler = (key: string) => {
            if (key === "rest:heal") {
              g.player.hp = Math.min(g.player.maxHp, g.player.hp + 15);
              logMsg(g, "휴식: HP +15");
              closeChoiceUI(g);
              choiceHandler = null;
              g.phase = "NODE";
              render(g, actions);
              return;
            }

            if (key === "rest:clear_f") {
              g.player.fatigue = Math.max(0, g.player.fatigue - 3);
              logMsg(g, "휴식: 피로 F-=3");
              closeChoiceUI(g);
              choiceHandler = null;
              g.phase = "NODE";
              render(g, actions);
              return;
            }

            if (key === "rest:upgrade") {
              openUpgradePick(g, actions, "강화", "강화할 카드 1장을 선택하세요.", {
                onDone: () => {
                  g.phase = "NODE";
                  render(g, actions);
                },
                onSkip: () => {
                  openRestMenu();
                  render(g, actions);
                },
              });
              return;
            }

            logMsg(g, "휴식: 생략");
            closeChoiceUI(g);
            choiceHandler = null;
            g.phase = "NODE";
            render(g, actions);
            return;
          };
        };

        openRestMenu();
        render(g, actions);
        return;
      }




      if (actual === "TREASURE") {
        g.run.treasureObtained = true;
        g.run.afterTreasureNodePicks = 0;
        logMsg(g, "저주받은 보물을 얻었습니다! 이제부터 10번의 탐험을 버티면 승리합니다.");
        render(g, actions);
        return;
      }

      if (actual === "EVENT") {
        const ev = pickRandomEvent();
        const opts = ev.options(g);

        g.choice = {
          kind: "EVENT",
          title: ev.name,
          prompt: ev.prompt,
          options: opts.map((o) => ({ key: o.key, label: o.label, detail: o.detail })),
        };

        choiceHandler = (key: string) => {
          const picked = opts.find((o) => o.key === key);
          if (!picked) return;

          const outcome: EventOutcome = picked.apply(g);

          if (typeof outcome === "object" && outcome.kind === "UPGRADE_PICK") {
            openUpgradePick(g, actions, outcome.title ?? "강화", outcome.prompt ?? "강화할 카드 1장을 선택하세요.");
            return;
          }

          if (typeof outcome === "object" && outcome.kind === "REMOVE_PICK") {
            pushChoice(g);
            const candidates = Object.values(g.cards)
              .filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard")
              .map((c) => c.uid);

            g.choice = {
              kind: "PICK_CARD",
              title: outcome.title,
              prompt: outcome.prompt ?? "제거할 카드 1장을 선택하세요.",
              options: [
                ...candidates.map((uid) => {
                  const def = getCardDefByUid(g, uid);
                  return {
                    key: `remove:${uid}`,
                    label: cardDisplayNameByUid(g, uid),
                    detail: `전열: ${def.frontText} / 후열: ${def.backText}`,
                    cardUid: uid,
                  };
                }),
                { key: "cancel", label: "취소" },
              ],
            };

            choiceHandler = (k: string) => {
              if (k === "cancel") {
                logMsg(g, "제거 취소");
                popChoice(g);
                render(g, actions);
                return;
              }

              if (!k.startsWith("remove:")) {
                render(g, actions);
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
                closeChoiceUI(g);
                choiceHandler = null;
                spawnEncounter(g);
                startCombat(g);
                render(g, actions);
                return;
              }


              if (then === "REWARD_PICK") {
                closeChoiceUI(g);
                choiceHandler = null;
                openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
                return;
              }

              closeChoiceUI(g);
              choiceHandler = null;
              g.phase = "NODE";
              render(g, actions);
              return;

            };


            render(g, actions);
            return;
          }

          if (typeof outcome === "object" && outcome.kind === "BATTLE_SPECIAL") {
            g.choice = null;
            choiceHandler = null;
            logMsg(g, outcome.title ? `이벤트 전투: ${outcome.title}` : "이벤트 전투 발생!");
            spawnEncounter(g, { forcePatternIds: outcome.enemyIds });
            startCombat(g);
            render(g, actions);
            return;
          }

          if (outcome === "BATTLE") {
            g.choice = null;
            choiceHandler = null;
            spawnEncounter(g);
            startCombat(g);
            render(g, actions);
            return;
          }

          if (outcome === "REWARD") {
            openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
            return;
          }

          g.choice = null;
          closeChoiceUI(g);
          choiceHandler = null;
          render(g, actions);
          return;
        };

        render(g, actions);
        return;
      }
    },

    onChooseChoice: (key: string) => {
      const g = getG();
      if (!g.choice) return;

      if (choiceHandler) {
        choiceHandler(key);
        return;
      }

      const kind = g.choice.kind;

      if (kind === "REWARD" || kind === ("REWARD_PICK" as any)) {
        if (key === "skip") {
          logMsg(g, "카드 보상 생략");
          closeChoiceUI(g);
          render(g, actions);
          return;
        }

        if (key.startsWith("pick:")) {
          const payload = key.slice("pick:".length);
          const [defId, upStr] = payload.split(":");
          const upgrade = Number(upStr ?? "0") || 0;

          addCardToDeck(g, defId, { upgrade });
          logMsg(g, `카드 획득: ${cardDisplayNameByDefId(g, defId, upgrade)}`);

          closeChoiceUI(g);
          render(g, actions);
          return;
        }
      }

      logMsg(g, `선택 처리 불가: handler 없음 (kind=${kind}, key=${key})`);
    },


    onRevealIntents: () => {
      const g = getG()
      if (g.run.finished) return;
      if (g.enemies.length === 0) return;
      revealIntentsAndDisrupt(g);
      render(g, actions);
    },

    onSelectEnemy: (enemyIndex: number) => {
      const g = getG()
      resolveTargetSelection(g, enemyIndex);
      render(g, actions);
    },

    onPlaceHandUidToSlot: (cardUid: string, side: Side, idx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (side === "back" && g.backSlotDisabled?.[idx]) return;

      placeCard(g, cardUid, side, idx);
      g.selectedHandCardUid = null;
      render(g, actions);
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

      const b = toSlots[toIdx];

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
      render(g, actions);
    },

    onResolveBack: () => {
      const g = getG();
      if (g.phase === "PLACE") normalizePlacementCounters(g);

      resolveBack(g);
      render(g, actions);
    },
    onResolveFront: () => {
      const g = getG()
      resolveFront(g);
      render(g, actions);
    },
    onResolveEnemy: () => {
      const g = getG()
      resolveEnemy(g);
      render(g, actions);
    },
    onUpkeep: () => {
      const g = getG()
      upkeepEndTurn(g);
      render(g, actions);
    },
    onDrawNextTurn: () => {
      const g = getG()
      drawStepStartNextTurn(g);
      render(g, actions);
    },
  };

  // 보상/강화 창 열기
  function openRewardPick(g: GameState, actions: any, title: string, prompt: string) {
    const [a, b] = offerRewardPair(); // a,b: {defId, upgrade}

    const da = getCardDefByIdWithUpgrade(g.content, a.defId, a.upgrade);
    const db = getCardDefByIdWithUpgrade(g.content, b.defId, b.upgrade);

    const la = displayNameForOffer(g, a);
    const lb = displayNameForOffer(g, b);

    g.choice = {
      kind: "REWARD",
      title,
      prompt,
      options: [
        { key: `pick:${a.defId}:${a.upgrade}`, label: la, detail: `전열: ${da.frontText} / 후열: ${da.backText}` },
        { key: `pick:${b.defId}:${b.upgrade}`, label: lb, detail: `전열: ${db.frontText} / 후열: ${db.backText}` },
        { key: "skip", label: "생략" },
      ],
    };

    choiceHandler = (kk: string) => {
      if (kk.startsWith("pick:")) {
        const payload = kk.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        addCardToDeck(g, defId, { upgrade });
      } else {
        logMsg(g, "카드 보상 생략");
      }

      closeChoiceUI(g);
      choiceHandler = null;
      render(g, actions);
      return;
    };


    render(g, actions);
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
    const candidates = Object.values(g.cards)
      .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && canUpgradeUid(g, c.uid))
      .map((c) => c.uid);

    if (candidates.length === 0) {
      logMsg(g, "강화할 수 있는 카드가 없습니다.");
      g.choice = null;
      choiceHandler = null;

      if (opts?.onSkip) opts.onSkip();
      else render(g, actions);
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

          const label = cardDisplayNameByUid(g, uid);
          const detail =
            `현재: 전열 ${curDef.frontText} / 후열 ${curDef.backText}\n` +
            `강화: 전열 ${nextDef.frontText} / 후열 ${nextDef.backText}`;

          return { key: `up:${uid}`, label, detail, cardUid: uid };
        }),
        { key: "skip", label: "취소" },
      ],
    };

    choiceHandler = (k: string) => {
      // 취소
      if (k === "skip") {
        logMsg(g, "강화 취소");
        closeChoiceUI(g);
        choiceHandler = null;

        if (opts?.onSkip) opts.onSkip();
        else render(g, actions);
        return;
      }

      // 강화 선택
      if (k.startsWith("up:")) {
        const uid = k.slice("up:".length);
        const ok = upgradeCardByUid(g, uid);
        logMsg(g, ok ? `강화: [${cardDisplayNameByUid(g, uid)}]` : "강화 실패");

        closeChoiceUI(g);
        choiceHandler = null;

        if (opts?.onDone) opts.onDone();
        else render(g, actions);
        return;
      }

      // 예상 못한 키: 그냥 닫기
      closeChoiceUI(g);
      choiceHandler = null;
      render(g, actions);
    };


    render(g, actions);
  }


  return actions;
}

function normalizePlacementCounters(g: GameState) {
  const front = g.frontSlots.filter((x) => x != null).length;
  const back  = g.backSlots.filter((x) => x != null).length;

  g.frontPlacedThisTurn = front;
  g.usedThisTurn = front + back;
}

export function mountRoot(): HTMLDivElement {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";
  return app;
}

function mkButton(label: string, onClick: () => void, className = "") {
  const b = document.createElement("button");
  if (className) b.className = className;
  b.type = "button";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

export function render(g: GameState, actions: UIActions) {
  currentG = g;
  const prevMain = document.querySelector<HTMLElement>(".mainPanel");
  if (prevMain) {
    lastMainPanelScrollTop = prevMain.scrollTop;
    lastMainPanelScrollLeft = prevMain.scrollLeft;
  }

  const app = mountRoot();

  if (!uiMounted) {
    bindGlobalInput(() => currentG ?? g, actions);
    uiMounted = true;
  }

  app.appendChild(renderTopHud(g, actions));

  const mainRow = div("mainRow");

  const stage = div("stage");
  const stageInner = div("stageInner");
  const main = div("panel mainPanel");

  main.scrollTop = lastMainPanelScrollTop;
  main.scrollLeft = lastMainPanelScrollLeft;

  main.appendChild(renderBattleTitleRow(g));

  if (g.run.finished) main.appendChild(p("런 종료"));
  else if (g.phase === "NODE") renderNodeSelect(main, g, actions);
  else renderCombat(main, g, actions);

  stageInner.appendChild(main);
  stage.appendChild(stageInner);

  const logPanel = div("panel logPanel");
  logPanel.appendChild(renderLogHeaderRow());
  const lb = logBox(g.log.join("\n"));
  (lb as HTMLElement).classList.add("log");
  logPanel.appendChild(lb);

  mainRow.appendChild(stage);
  mainRow.appendChild(logPanel);
  app.appendChild(mainRow);

  renderHandDock(g, actions, isTargeting(g));
  renderDragOverlay(app, g);

  renderOverlayLayer(g, actions);
  renderChoiceLayer(g, actions);

  if (g.fx) {
    g.fx.enemyShake = [];
    g.fx.playerShake = false;
  }
}

function renderOverlayLayer(
  g: GameState,
  actions: UIActions & { onCloseOverlay: () => void }
) {
  document.querySelector(".overlay-layer")?.remove();

  if (!overlay) return;

  const layer = div("overlay-layer");
  layer.style.cssText =
    "position:fixed; inset:0; z-index:2500; background:rgba(0,0,0,.55); display:flex; justify-content:center; align-items:center;";

  layer.onclick = (e) => {
    if (e.target === layer) actions.onCloseOverlay();
  };

  const panel = div("overlay-panel");
  panel.style.cssText =
    "width:min(980px, 92vw); max-height:80vh; overflow:auto; padding:16px; border:1px solid rgba(255,255,255,.12); border-radius:16px; background:rgba(15,18,22,.92); box-shadow:0 18px 60px rgba(0,0,0,.45);";

  panel.onclick = (e) => e.stopPropagation();

  const title =
    overlay.kind === "RULEBOOK"
      ? "룰북"
      : overlay.pile === "deck"
      ? "덱"
      : overlay.pile === "discard"
      ? "버림 더미"
      : overlay.pile === "exhausted"
      ? "소모(이번 전투)"
      : overlay.pile === "vanished"
      ? "소실(영구)"
      : "손패";

  const header = div("overlayHeader");
  header.style.cssText =
    "display:flex; align-items:center; justify-content:space-between; gap:12px; position:sticky; top:0; padding-bottom:12px; margin-bottom:12px; background:rgba(15,18,22,.92);";

  const h = h3(title);
  h.classList.add("overlayTitle");

  const closeBtn = button("닫기", actions.onCloseOverlay, false);
  closeBtn.classList.add("overlayClose");
  closeBtn.style.cssText =
    "padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";

  header.appendChild(h);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (overlay.kind === "RULEBOOK") {
    const pre = document.createElement("pre");
    pre.className = "rulebook";
    pre.textContent = RULEBOOK_TEXT;
    pre.style.cssText =
      "white-space:pre-wrap; line-height:1.45; font-size:13px; margin:0; padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:rgba(0,0,0,.18);";
    panel.appendChild(pre);
  } else {

    const uids =
      overlay.pile === "deck"
        ? g.deck
        : overlay.pile === "discard"
        ? g.discard
        : overlay.pile === "exhausted"
        ? g.exhausted
        : overlay.pile === "vanished"
        ? g.vanished
        : g.hand;

    const sortedUids = [...uids].sort((a, b) => {
      const ca = g.cards[a];
      const cb = g.cards[b];
      const na = baseCardName(g, ca.defId);
      const nb = baseCardName(g, cb.defId);
      const nameCmp = na.localeCompare(nb, "ko");
      if (nameCmp !== 0) return nameCmp;
      return (ca.upgrade ?? 0) - (cb.upgrade ?? 0);
    });

    const list = div("overlayList");
    list.style.cssText = "display:flex; flex-direction:column; gap:10px;";

    if (sortedUids.length === 0) {
      const empty = div("overlayEmpty");
      empty.textContent = "비어 있습니다.";
      empty.style.cssText =
        "padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.03);";
      list.appendChild(empty);
    } else {
      for (const uid of sortedUids) {
        const def = getCardDefByUid(g, uid);
        const name = displayNameForUid(g, uid);

        const item = div("overlayItem");
        item.style.cssText =
          "border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:10px; background:rgba(255,255,255,.03);";

        const top = div("overlayItemTop");
        top.style.cssText =
          "display:flex; align-items:center; justify-content:space-between; gap:10px;";

        const titleEl = div("overlayItemTitle");
        titleEl.textContent = name;
        titleEl.style.cssText = "font-weight:700;";

        const zoneEl = div("overlayItemMeta");
        zoneEl.textContent = `(${g.cards[uid].zone})`;
        zoneEl.style.cssText = "opacity:.7; font-size:12px; white-space:nowrap;";

        top.appendChild(titleEl);
        top.appendChild(zoneEl);
        item.appendChild(top);

        const pre = document.createElement("pre");
        pre.className = "overlayItemDetail";
        pre.textContent = `전열: ${def.frontText}\n후열: ${def.backText}`;
        pre.style.cssText =
          "margin:10px 0 0 0; padding:10px; white-space:pre-wrap; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:rgba(0,0,0,.20); font-size:12px; line-height:1.45;";
        item.appendChild(pre);

        list.appendChild(item);
      }
    }

    panel.appendChild(list);
  }

  layer.appendChild(panel);
  document.body.appendChild(layer);
}


function renderChoiceLayer(g: GameState, actions: UIActions) {
  document.querySelector(".choice-overlay")?.remove();

  const c = g.choice;
  if (!c) return;

  const overlayEl = div("choice-overlay");
  overlayEl.style.cssText =
    "position:fixed; inset:0; z-index:3000; background:rgba(0,0,0,0.82); display:flex; justify-content:center; align-items:center;";

  const panel = div("choice-panel");
  panel.style.cssText =
    "width:min(980px, 92vw); max-height:80vh; overflow:auto; padding:16px; border:1px solid rgba(255,255,255,.12); border-radius:16px; background:rgba(15,18,22,.92);";

  panel.appendChild(h2(c.title));
  if (c.prompt) panel.appendChild(p(c.prompt));

  const list = div("choice-list");
  list.style.cssText = "display:flex; flex-direction:column; gap:10px; margin-top:12px;";

  c.options.forEach((opt) => {
    const item = div("choice-item");
    item.style.cssText =
      "display:flex; gap:12px; align-items:flex-start;" +
      "border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:12px;" +
      "background:rgba(255,255,255,.03);";

    const left = div("choice-left");
    left.style.cssText = "flex:0 0 auto;";

    const uid = (opt as any).cardUid as string | undefined;
    if (uid) {
      left.appendChild(renderCardPreviewByUid(g, uid));
    } else {

      if (typeof opt.key === "string" && opt.key.startsWith("pick:")) {
        const payload = opt.key.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        left.appendChild(renderCardPreviewByDef(g, defId, upgrade));
      }
    }


    const right = div("choice-right");
    right.style.cssText = "flex:1 1 auto; min-width:260px;";

    const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
    b.classList.add("primary");
    right.appendChild(b);

    if ((opt as any).detail) {
      const pre = document.createElement("pre");
      pre.className = "choice-detail";
      pre.textContent = String((opt as any).detail);
      pre.style.cssText =
        "margin:10px 0 0 0; padding:10px; white-space:pre-wrap;" +
        "border-radius:12px; border:1px solid rgba(255,255,255,.10);" +
        "background:rgba(0,0,0,.22); font-size:12px; line-height:1.45;" +
        "max-height:220px; overflow:auto;";
      right.appendChild(pre);
    }

    item.appendChild(left);
    item.appendChild(right);
    list.appendChild(item);
  });


  panel.appendChild(list);
  overlayEl.appendChild(panel);
  document.body.appendChild(overlayEl);
}

// Top HUD (Player left + Enemies center + Top-right controls)

function renderTopHud(g: GameState, actions: UIActions) {

  
  const top = div("topHud");

  top.appendChild(div("topHudLeftSpacer"));

  // (1) LEFT: player

  const left = div("playerHudLeft");

  const titleRow = div("playerTitleRow");
  titleRow.appendChild(divText("playerHudTitle", "플레이어"));

  const piles = div("pileButtons");
  piles.appendChild(mkButton("덱", () => actions.onViewPile("deck")));
  piles.appendChild(mkButton("버림", () => actions.onViewPile("discard")));
  piles.appendChild(mkButton("손패", () => actions.onViewPile("hand")));
  piles.appendChild(mkButton("소모", () => actions.onViewPile("exhausted")));
  piles.appendChild(mkButton("소실", () => actions.onViewPile("vanished")));

  titleRow.appendChild(piles);
  left.appendChild(titleRow);

  const pbox = div("enemyChip"); // 재사용
  pbox.classList.add("playerHudBox");
  if (g.fx?.playerShake) pbox.classList.add("shake");

  const hpTop = div("enemyChipTop");
  hpTop.appendChild(divText("", "HP"));
  hpTop.appendChild(divText("", `${g.player.hp}/${g.player.maxHp}`));
  pbox.appendChild(hpTop);

  const hpOuter = div("enemyHPOuter");
  const hpFill = div("enemyHPFill");
  hpFill.style.width = `${Math.max(0, Math.min(100, (g.player.hp / Math.max(1, g.player.maxHp)) * 100))}%`;
  hpOuter.appendChild(hpFill);
  pbox.appendChild(hpOuter);

  const blTop = div("enemyChipTop");
  blTop.appendChild(divText("", "블록"));
  blTop.appendChild(divText("", `${g.player.block}`));
  pbox.appendChild(blTop);

  const blOuter = div("enemyHPOuter");
  const blFill = div("enemyHPFill");
  blFill.style.background = "linear-gradient(90deg, #64b5ff, #2a7cff)";
  blFill.style.width = `${Math.max(0, Math.min(100, (g.player.block / Math.max(1, g.player.maxHp)) * 100))}%`;
  blOuter.appendChild(blFill);
  pbox.appendChild(blOuter);

  const pst = g.player.status;
  const pBadges = div("enemyBadges");
  if ((pst.vuln ?? 0) > 0) pBadges.appendChild(badge(`취약 ${pst.vuln}`));
  if ((pst.weak ?? 0) > 0) pBadges.appendChild(badge(`약화 ${pst.weak}`));
  if ((pst.bleed ?? 0) > 0) pBadges.appendChild(badge(`출혈 ${pst.bleed}`));
  if ((pst.disrupt ?? 0) > 0) pBadges.appendChild(badge(`교란 ${pst.disrupt}`));
  if (pBadges.childNodes.length) pbox.appendChild(pBadges);

  left.appendChild(pbox);
  const res = div("resourceRow inline");

  const inCombat = g.enemies.length > 0 && g.phase !== "NODE";
  const bonusS = g.run.nextBattleSuppliesBonus ?? 0;

  if (inCombat) {
    res.appendChild(chipEl(`S ${g.player.supplies}`, g.player.supplies === 0 ? "warn" : ""));
  } else {
    if (bonusS > 0) {
      res.appendChild(chipEl(`보너스 S +${bonusS}`, "bonus"));
    }
  }

  res.appendChild(chipEl(`F ${g.player.fatigue}`));
  res.appendChild(chipEl(`탐험 ${Math.max(1, g.run.nodePickCount)}`));
  res.appendChild(chipEl(`덱 ${g.deck.length}`));



  left.appendChild(res);


  // (2) CENTER: enemies in a centered box
  const center = div("enemyHudCenter");
  const enemiesWrap = div("enemyHud");


  const shaken = g.fx?.enemyShake ?? [];

  if (g.enemies.length === 0) {
    enemiesWrap.appendChild(divText("enemyNone", ""));
  } else {
    const targeting = isTargeting(g);

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      const chipBox = div("enemyChip");

      if (shaken.includes(i)) chipBox.classList.add("shake");
      if (targeting && e.hp > 0) chipBox.classList.add("targetable");


      const topRow = div("enemyChipTop");
      topRow.appendChild(divText("", `${i + 1}. ${e.name}`));
      topRow.appendChild(divText("", `${e.hp}/${e.maxHp}`));
      chipBox.appendChild(topRow);

      // hp bar
      const outer = div("enemyHPOuter");
      const fill = div("enemyHPFill");
      fill.style.width = `${Math.max(0, Math.min(100, (e.hp / Math.max(1, e.maxHp)) * 100))}%`;
      outer.appendChild(fill);
      chipBox.appendChild(outer);

      // status badges
      const st = e.status;
      const badges = div("enemyBadges");
      if ((st.vuln ?? 0) > 0) badges.appendChild(badge(`취약 ${st.vuln}`));
      if ((st.weak ?? 0) > 0) badges.appendChild(badge(`약화 ${st.weak}`));
      if ((st.bleed ?? 0) > 0) badges.appendChild(badge(`출혈 ${st.bleed}`));
      if ((st.disrupt ?? 0) > 0) badges.appendChild(badge(`교란 ${st.disrupt}`));
      if (e.immuneThisTurn) badges.appendChild(badge("면역"));
      if (badges.childNodes.length) chipBox.appendChild(badges);

      // intent
      const def = g.content.enemiesById[e.id];
      const intent = def.intents[e.intentIndex % def.intents.length];
      chipBox.appendChild(
        divText("enemyIntent", g.intentsRevealedThisTurn ? `의도: ${intent.label}` : "의도: (미공개)")
      );

      chipBox.onclick = () => actions.onSelectEnemy(i);
      enemiesWrap.appendChild(chipBox);
    }
  }


  center.appendChild(enemiesWrap);

  // (3) RIGHT: top-right controls
  const right = div("topHudRight");
  const controls = div("topRightControls");
  controls.appendChild(mkButton("새로운 런", actions.onNewRun));
  controls.appendChild(mkButton("룰북", actions.onViewRulebook));
  right.appendChild(controls);

  top.appendChild(left);
  top.appendChild(center);
  top.appendChild(right);


  if (g.fx?.enemyShake?.length) g.fx.enemyShake = [];

  return top;
}



function chipEl(text: string, extraClass = "") {
  const s = document.createElement("span");
  s.className = "chip" + (extraClass ? ` ${extraClass}` : "");
  s.textContent = text;
  return s;
}


function renderBattleTitleRow(g: GameState) {
  const row = div("battleTitleRow");

  const title = document.createElement("h2");
  title.textContent = "전장";
  row.appendChild(title);


  return row;
}




function renderLogHeaderRow() {
  const row = div("logHeaderRow");
  const title = document.createElement("h2");
  title.textContent = "로그";
  row.appendChild(title);
  return row;
}


function renderCombat(root: HTMLElement, g: GameState, actions: UIActions) {


  const wrap = div("combatRoot");
  const board = div("boardArea");

  if (isTargeting(g) && (g as any).selectedEnemyIndex == null) {
    const hint = div("targetHint");
    hint.textContent = "대상 선택 필요: 위의 적 박스를 클릭하세요.";
    wrap.appendChild(hint);
  }

  board.appendChild(renderSlotsGrid(g, actions, "front"));

  board.appendChild(renderSlotsGrid(g, actions, "back"));

  wrap.appendChild(board);
  root.appendChild(wrap);
}




let lastEnterAction: (() => void) | null = null;
let lastEnterDisabled = true;

function setEnterAction(fn: (() => void) | null, disabled: boolean) {
  lastEnterAction = fn;
  lastEnterDisabled = disabled;
}


function renderHandDock(g: GameState, actions: UIActions, targeting: boolean) {
  const old = document.querySelector(".handDock");
  if (old) old.remove();

  const dock = div("handDock");

  const controls = div("controlsDock");
  controls.appendChild(
    stepButton("정찰", actions.onRevealIntents, g.enemies.length === 0 || g.intentsRevealedThisTurn || g.phase !== "PLACE" || targeting, g.phase === "PLACE")
  );
  controls.appendChild(
    stepButton("후열", actions.onResolveBack, !(g.phase === "PLACE" || g.phase === "BACK") || targeting, g.phase === "BACK")
  );
  controls.appendChild(
    stepButton("전열", actions.onResolveFront, g.phase !== "FRONT" || targeting, g.phase === "FRONT")
  );
  controls.appendChild(
    stepButton("적", actions.onResolveEnemy, g.phase !== "ENEMY" || targeting, g.phase === "ENEMY")
  );
  controls.appendChild(
    stepButton("정리", actions.onUpkeep, g.phase !== "UPKEEP" || targeting, g.phase === "UPKEEP")
  );
  controls.appendChild(
    stepButton("드로우", actions.onDrawNextTurn, g.phase !== "DRAW" || targeting, g.phase === "DRAW")
  );

  const clear = document.createElement("button");
  clear.textContent = "선택 해제";
  clear.disabled = !g.selectedHandCardUid;
  clear.onclick = actions.onClearSelected;
  controls.appendChild(clear);

  dock.appendChild(controls);

  const hand = div("hand");
  hand.dataset.dropHand = "1";
  const row = div("handCardsRow");
  hand.appendChild(row);

  if (g.hand.length === 0) {
    const hint = div("handEmptyHint");
    hint.textContent = "손패가 비었습니다.";
    row.appendChild(hint);
  } else {
    for (const uid of g.hand) row.appendChild(renderCard(g, uid, true, actions.onSelectHandCard));
  }

  (() => {
    if (g.run.finished) return setEnterAction(null, true);

    if (targeting) return setEnterAction(null, true);

    if (g.phase === "PLACE") {
      const scoutDisabled = g.enemies.length === 0 || g.intentsRevealedThisTurn;
      if (!scoutDisabled) return setEnterAction(actions.onRevealIntents, false);
      return setEnterAction(actions.onResolveBack, false);
    }

    if (g.phase === "BACK") return setEnterAction(actions.onResolveBack, false);
    if (g.phase === "FRONT") return setEnterAction(actions.onResolveFront, false);
    if (g.phase === "ENEMY") return setEnterAction(actions.onResolveEnemy, false);
    if (g.phase === "UPKEEP") return setEnterAction(actions.onUpkeep, false);
    if (g.phase === "DRAW") return setEnterAction(actions.onDrawNextTurn, false);

    return setEnterAction(null, true);
  })();




  dock.appendChild(hand);
  document.body.appendChild(dock);
}

function stepButton(label: string, onClick: () => void, disabled: boolean, active: boolean) {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = onClick;
  b.className = "stepBtn";
  if (active) b.classList.add("stepOn");
  return b;
}



function renderSlotsGrid(g: GameState, actions: UIActions, side: Side) {
  const grid = div("grid6");
  const hasSelected = !!g.selectedHandCardUid;
  const slots = side === "front" ? g.frontSlots : g.backSlots;

  for (let i = 0; i < 3; i++) {
    const disabled = side === "back" ? !!g.backSlotDisabled?.[i] : false;

    const s = div("slot" + (disabled ? " disabled" : ""));
    s.dataset.slotSide = side;
    s.dataset.slotIndex = String(i);

    if (hoverSlot && hoverSlot.side === side && hoverSlot.idx === i) s.classList.add("dropHover");
    if (hasSelected && !disabled) s.classList.add("placeable");

    s.appendChild(small(`${side === "front" ? "전열" : "후열"} ${i + 1}`));

    const uid = slots[i];
    if (uid) {
      const cardEl = renderCard(g, uid, false) as HTMLElement;
      cardEl.classList.add("inSlot");
      s.appendChild(cardEl);

      cardEl.onpointerdown = (ev) => {
        if ((ev as any).button !== 0 && (ev as any).pointerType === "mouse") return;
        if (isTargeting(g)) return;
        if (g.phase !== "PLACE") return;
        beginDrag(ev as any, { kind: "slot", cardUid: uid, fromSide: side, fromIdx: i });
      };
      cardEl.ondblclick = () => actions.onReturnSlotToHand(side, i);
    }

    s.onclick = () => {
      if (disabled) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      const uidHere = slots[i];
      if (!g.selectedHandCardUid && uidHere) {
        actions.onReturnSlotToHand(side, i);
        return;
      }
      actions.onPlaceSelected(side, i);
    };

    grid.appendChild(s);
  }

  return grid;
}


// Drag + Keyboard


function updateSlotHoverUI() {

  document.querySelectorAll(".slot.dropHover").forEach((el) => el.classList.remove("dropHover"));

  if (!hoverSlot) return;
  const sel = `.slot[data-slot-side="${hoverSlot.side}"][data-slot-index="${hoverSlot.idx}"]`;
  const el = document.querySelector<HTMLElement>(sel);
  if (el) el.classList.add("dropHover");
}

function bindGlobalInput(getG: () => GameState, actions: UIActions) {
  window.onpointermove = (ev) => {
    const g = getG();
    if (g.choice || overlay) return;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    drag.x = ev.clientX;
    drag.y = ev.clientY;

    const dx = drag.x - drag.startX;
    const dy = drag.y - drag.startY;
    if (!drag.dragging && dx * dx + dy * dy > 36) drag.dragging = true;

    hoverSlot = drag.dragging ? hitTestSlot(ev.clientX, ev.clientY, g) : null;


    renderDragOverlay(document.querySelector("#app") as HTMLElement, g);
    updateSlotHoverUI();

  };

  window.onpointerup = (ev) => {
    const g = getG();
    if (g.choice || overlay) return;
    if (!drag || ev.pointerId !== drag.pointerId) return;

    if (drag.dragging) {
      const dropHand = hitTestHand(ev.clientX, ev.clientY);
      const dropSlot = hitTestSlot(ev.clientX, ev.clientY, g);

      if (dropHand && drag.kind === "slot" && drag.fromSide != null && drag.fromIdx != null) {
        if (!g.run.finished && !isTargeting(g) && g.phase === "PLACE") {
          actions.onReturnSlotToHand(drag.fromSide, drag.fromIdx);
        }
        drag = null;
        hoverSlot = null;
        render(g, actions);
        return;
      }


      if (dropSlot) {
        if (drag.kind === "hand") {
          const g = getG();
          if (g.run.finished || isTargeting(g) || g.phase !== "PLACE") {
          } else {
            const side = dropSlot.side;
            const idx = dropSlot.idx;
            if (side === "back" && g.backSlotDisabled?.[idx]) {
            } else {
              const slots = side === "front" ? g.frontSlots : g.backSlots;
              const uidHere = slots[idx];

              if (!uidHere) {
                actions.onPlaceHandUidToSlot(drag.cardUid, side, idx);
              } else {
                const handIdx =
                  drag.fromHandIndex != null && drag.fromHandIndex >= 0 ? drag.fromHandIndex : g.hand.indexOf(drag.cardUid);

                const realIdx = g.hand.indexOf(drag.cardUid);
                if (realIdx >= 0) g.hand.splice(realIdx, 1);

                slots[idx] = drag.cardUid;
                g.cards[drag.cardUid].zone = side;

                const insertAt = handIdx != null && handIdx >= 0 && handIdx <= g.hand.length ? handIdx : g.hand.length;
                g.hand.splice(insertAt, 0, uidHere);
                g.cards[uidHere].zone = "hand";

                g.selectedHandCardUid = null;

                normalizePlacementCounters(g);

                logMsg(g, `[${cardDisplayNameByUid(g, drag.cardUid)}] ↔ [${cardDisplayNameByUid(g, uidHere)}] 스왑: 손패 ↔ ${side}${idx + 1}`);
                render(g, actions);
              }
            }
          }
        } else if (drag.kind === "slot") {
          if (drag.fromSide != null && drag.fromIdx != null) {
            if (!(drag.fromSide === dropSlot.side && drag.fromIdx === dropSlot.idx)) {
              actions.onMoveSlotCard(drag.fromSide, drag.fromIdx, dropSlot.side, dropSlot.idx);
            }
          }
        }
      }

    }

    if (drag?.sourceEl) drag.sourceEl.classList.remove("isDraggingSource");

    drag = null;
    hoverSlot = null;
    render(g, actions);
  };

  window.addEventListener("keydown", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

    const g = getG();
    // 취소: 4
    if (ev.code === "Digit4") {
      ev.preventDefault();

      // 타겟 선택 중이면 타겟 선택 자체 취소
      if (isTargeting(g)) {
        g.pendingTarget = null;
        g.pendingTargetQueue = [];
        logMsg(g, "대상 선택 취소");
        render(g, actions);
        return;
      }

      // 그냥 선택 해제
      actions.onClearSelected();
      return;
    }

    // 카드 교체: Tab
    if (ev.key === "Tab") {
      ev.preventDefault();
      if (g.hand.length === 0) return;

      const cur = g.selectedHandCardUid;
      const idx = cur ? g.hand.indexOf(cur) : -1;
      const dir = ev.shiftKey ? -1 : 1;
      const next = ((idx + dir) % g.hand.length + g.hand.length) % g.hand.length;
      g.selectedHandCardUid = g.hand[next];
      render(g, actions);
      return;
    }

    // 턴 넘기기: Space (가능한 다음 단계로)
    if (ev.code === "Space") {
      ev.preventDefault();
      if (g.run.finished) return;

      // 선택창 떠있으면 진행 금지
      if (g.choice) return;

      // 타겟 선택 필요면 진행 금지
      if (isTargeting(g)) return;

      if (g.phase === "PLACE") {
        actions.onResolveBack();
        return;
      }
      if (g.phase === "BACK") return actions.onResolveBack();
      if (g.phase === "FRONT") return actions.onResolveFront();
      if (g.phase === "ENEMY") return actions.onResolveEnemy();
      if (g.phase === "UPKEEP") return actions.onUpkeep();
      if (g.phase === "DRAW") return actions.onDrawNextTurn();

      return;
    }


    // 전열 배치(또는 타겟 선택): 1,2,3
    if (ev.code === "Digit1" || ev.code === "Digit2" || ev.code === "Digit3") {
      ev.preventDefault();
      const idx = ev.code === "Digit1" ? 0 : ev.code === "Digit2" ? 1 : 2;

      // 1) 타겟 선택 상태면: 적 선택(1~3)
      if (isTargeting(g)) {
        // 살아있는 적만 선택 허용
        const e = g.enemies[idx];
        if (!e || e.hp <= 0) {
          logMsg(g, `대상 선택 실패: ${idx + 1}번 적이 없습니다.`);
          render(g, actions);
          return;
        }

        actions.onSelectEnemy(idx);
        return;
      }

      // 2) 전열 핫키
      actions.onHotkeySlot("front", idx);
      return;
    }

    // 후열 배치: Q,W,E
    if (ev.code === "KeyQ" || ev.code === "KeyW" || ev.code === "KeyE") {
      ev.preventDefault();
      const idx = ev.code === "KeyQ" ? 0 : ev.code === "KeyW" ? 1 : 2;
      actions.onHotkeySlot("back", idx);
      return;
    }

    if (ev.code === "Enter") {
      ev.preventDefault();
      if (!lastEnterDisabled && lastEnterAction) lastEnterAction();
      return;
    }
  });

}

function beginDrag(
  ev: PointerEvent,
  init: { kind: "hand" | "slot"; cardUid: string; fromHandIndex?: number; fromSide?: Side; fromIdx?: number }
) {
  const target = ev.currentTarget as HTMLElement;
  try { target.setPointerCapture(ev.pointerId); } catch {}

  const cardEl = target.closest(".card") as HTMLElement | null;

  if (cardEl) cardEl.classList.add("isDraggingSource");

  const r = cardEl?.getBoundingClientRect();

  const grabDX = r ? (ev.clientX - r.left) : 20;
  const grabDY = r ? (ev.clientY - r.top) : 20;

  drag = {
    kind: init.kind,
    cardUid: init.cardUid,
    fromHandIndex: init.fromHandIndex,
    fromSide: init.fromSide,
    fromIdx: init.fromIdx,
    pointerId: ev.pointerId,
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    dragging: false,

    previewEl: undefined,
    previewW: r?.width,
    previewH: r?.height,
    grabDX,
    grabDY,
  };

  if (cardEl) {
    const clone = cardEl.cloneNode(true) as HTMLElement;

    clone.classList.remove("inSlot");
    clone.classList.remove("selected");
    clone.classList.remove("isDraggingSource");

    clone.style.position = "static";
    clone.style.inset = "";
    clone.style.width = "100%";
    clone.style.height = "100%";
    clone.style.margin = "0";

    drag.previewEl = clone;
  }
}


function hitTestHand(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return false;

  let cur: HTMLElement | null = el;
  while (cur) {
    if ((cur as any).dataset?.dropHand === "1") return true;
    cur = cur.parentElement;
  }
  return false;
}

function hitTestSlot(x: number, y: number, g: GameState): SlotDrop | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;

  const slot = closestWithDatasetKeys(el, ["slotSide", "slotIndex"]);
  if (!slot) return null;

  const side = slot.dataset.slotSide as Side;
  const idx = Number(slot.dataset.slotIndex);

  if (side === "back" && g.backSlotDisabled?.[idx]) return null;
  return { side, idx };
}


function closestWithDatasetKeys(el: HTMLElement, keys: string[]): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    const ds = cur.dataset as Record<string, string | undefined>;
    let ok = true;
    for (const k of keys) {
      if (ds[k] == null) {
        ok = false;
        break;
      }
    }
    if (ok) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function renderDragOverlay(_app: HTMLElement, g: GameState) {
  if (!drag || !drag.dragging) {
    document.querySelector(".dragLayer")?.remove();
    return;
  }

  let layer = document.querySelector<HTMLElement>(".dragLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "dragLayer";
    layer.style.position = "fixed";
    layer.style.inset = "0";
    layer.style.zIndex = "5000";
    layer.style.pointerEvents = "none";
    document.body.appendChild(layer);
  }
  layer.innerHTML = "";

  if (!drag.previewEl) return;

  const wrap = document.createElement("div");
  wrap.className = "dragCardPreview";
  wrap.style.position = "fixed";
  wrap.style.left = `${drag.x - (drag.grabDX ?? 20)}px`;
  wrap.style.top  = `${drag.y - (drag.grabDY ?? 20)}px`;

  wrap.appendChild(drag.previewEl);
  layer.appendChild(wrap);
}





// Choice / Node / Overlay

function closeChoiceUI(g: GameState) {
  g.choice = null;       // ✅ choice만
  document.querySelector(".choice-overlay")?.remove();
}

// Helpers / UI primitives

function isTargeting(g: GameState) {
  return g.pendingTarget != null || (g.pendingTargetQueue?.length ?? 0) > 0;
}


function getCardDefByUid(g: GameState, uid: string) {
  const c = g.cards[uid];
  return getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
}


function baseCardName(g: GameState, defId: string) {
  const base = g.content.cardsById[defId];
  return base?.name ?? defId;
}

function cardDisplayNameByDefId(g: GameState, defId: string, upgrade: number) {
  const u = upgrade ?? 0;
  const baseName = g.content.cardsById[defId]?.name ?? defId;
  return u > 0 ? `${baseName} +${u}` : baseName;
}

function cardDisplayNameByUid(g: GameState, uid: string) {
  const c = g.cards[uid];
  return cardDisplayNameByDefId(g, c.defId, c.upgrade ?? 0);
}


// Cards

function renderCard(g: GameState, cardUid: string, clickable: boolean, onClick?: (uid: string) => void) {
  const c = g.cards[cardUid];
  const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);

  const d = div("card");
  if (g.selectedHandCardUid === cardUid) d.classList.add("selected");
  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  const title = displayNameForUid(g, cardUid);
  d.appendChild(divText("cardTitle", title));

  const meta = div("cardMeta");
  if (def.tags?.includes("EXHAUST")) meta.appendChild(badge("소모"));
  if (def.tags?.includes("VANISH")) meta.appendChild(badge("소실"));
  d.appendChild(meta);

  const sec1 = div("cardSection");
  sec1.appendChild(divText("cardSectionTitle", "⚔ 전열"));
  sec1.appendChild(divText("cardText", def.frontText));
  d.appendChild(sec1);

  const sec2 = div("cardSection");
  sec2.appendChild(divText("cardSectionTitle", "🕯 후열"));
  sec2.appendChild(divText("cardText", def.backText));
  d.appendChild(sec2);


  if (clickable && onClick) {
    d.onclick = () => onClick(cardUid);
  }

  if (clickable) {
    d.onpointerdown = (ev) => {
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      const idx = g.hand.indexOf(cardUid);
      beginDrag(ev, { kind: "hand", cardUid, fromHandIndex: idx });
    };
  }


  return d;
}


// Small UI primitives

function div(cls: string) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
function divText(cls: string, text: string) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}
function h2(text: string) {
  const e = document.createElement("h2");
  e.textContent = text;
  return e;
}
function h3(text: string) {
  const e = document.createElement("h3");
  e.textContent = text;
  return e;
}
function p(text: string) {
  const e = document.createElement("p");
  e.textContent = text;
  return e;
}
function small(text: string) {
  const e = document.createElement("small");
  e.textContent = text;
  return e;
}
function badge(text: string) {
  const s = document.createElement("span");
  s.className = "badge";
  s.textContent = text;
  return s;
}

function button(label: string, onClick: () => void, disabled: boolean) {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}
function logBox(text: string) {
  const pre = document.createElement("pre");
  pre.className = "log";
  pre.textContent = text;
  return pre;
}

function formatName(baseName: string, upgrade: number | undefined) {
  const u = upgrade ?? 0;
  return u > 0 ? `${baseName} +${u}` : baseName;
}

function displayNameForUid(g: GameState, uid: string) {
  const inst = g.cards[uid];
  const base = g.content.cardsById[inst.defId].name;
  return formatName(base, inst.upgrade);
}

function displayNameForOffer(g: GameState, offer: { defId: any; upgrade: number }) {
  const base = g.content.cardsById[offer.defId].name;
  return formatName(base, offer.upgrade);
}

