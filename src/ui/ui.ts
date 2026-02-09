// src/ui/ui.ts

const RULEBOOK_TEXT = `# Deck Rogue Prototype — 룰북 (플레이어용)

이 문서는 스포일러를 최소화합니다.

[1] 개요
노드를 선택하며 진행하고, 전투에서 살아남아 성장합니다. 목표는 무엇일까요?
모든 카드는 전열과 후열이 있습니다. 배치에 따라 역할이 달라집니다.

[2] 보급과 피로도

보급(S): 전열 카드 및 일부 효과의 발동에 사용됩니다. 보통 10으로 시작합니다.
보급이 부족한 상태로 턴 종료 시, HP를 보급 없이 종료한 턴의 횟수만큼 잃습니다.

피로도(F): 덱을 섞을 때 피로도가 1 올라가며, 일부 카드의 효과로도 변합니다.
덱을 섞을 때 피로도만큼 피해를 입습니다. 피로도는 전투가 끝나도 유지됩니다.

보급이 부족한 채로 턴을 마칠 때, 사용한 전열 카드 한 장 당 HP를 3 잃으며, F가 1 증가합니다.
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

[6] 조작
- Esc: 선택 해제
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
import { logMsg, rollBranchOffer, advanceBranchOffer} from "../engine/rules";
import { createInitialState } from "../engine/state";

import type { EventOutcome } from "../content/events";
import { pickRandomEvent } from "../content/events";
import { removeCardByUid, addCardToDeck, offerRewardPair, upgradeCardByUid, canUpgradeUid } from "../content/rewards";
import { getCardDefFor, getCardDefByIdWithUpgrade, cardNameWithUpgrade } from "../content/cards";

// =========================
// UI Actions
// =========================
export type UIActions = ReturnType<typeof makeUIActions>;

type DragState =
  | null
  | {
      kind: "hand" | "slot";
      cardUid: string;
      fromSide?: Side;
      fromIdx?: number;

      pointerId: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      dragging: boolean;
    };

type SlotDrop = { side: Side; idx: number };

type Overlay =
  | { kind: "RULEBOOK" }
  | { kind: "PILE"; pile: PileKind };

let logCollapsed = false;
  
let overlay: Overlay | null = null;
let overlayStack: Overlay[] = [];

let uiMounted = false;
let drag: DragState = null;
let hoverSlot: SlotDrop | null = null;

export function makeUIActions(g: GameState, setGame: (next: GameState) => void) {
  let choiceHandler: ((key: string) => void) | null = null;

  const actions = {
    rerender: () => render(g, actions),

    onToggleLog: () => {
      logCollapsed = !logCollapsed;
      render(g, actions);
    },


    onCloseOverlay: () => {
      overlay = overlayStack.pop() ?? null;
      render(g, actions);
    },

    onNewRun: () => {
      // ✅ createInitialState는 content 필요
      const next = createInitialState(g.content);
      setGame(next);
    },

    onViewRulebook: () => {
      if (overlay) overlayStack.push(overlay);
      overlay = { kind: "RULEBOOK" };
      render(g, actions);
    },


    onReturnSlotToHand: (fromSide: Side, fromIdx: number) => {
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      const slots = fromSide === "front" ? g.frontSlots : g.backSlots;
      const uid = slots[fromIdx];
      if (!uid) return;

      // 슬롯에서 제거
      slots[fromIdx] = null;

      // 손패로 이동
      g.hand.push(uid);
      g.cards[uid].zone = "hand";

      logMsg(g, `[${cardNameWithUpgrade(g, uid)}] 회수: ${fromSide}${fromIdx + 1} → 손패`);

      render(g, actions);
    },

    onClearSelected: () => {
      g.selectedHandCardUid = null;
      render(g, actions);
    },

    onSelectHandCard: (uid: string) => {
      if (isTargeting(g)) return;
      g.selectedHandCardUid = g.selectedHandCardUid === uid ? null : uid;
      render(g, actions);
    },

    onViewPile: (pile: PileKind) => {
      if (overlay) overlayStack.push(overlay);
      overlay = { kind: "PILE", pile };
      render(g, actions);
    },

    // ===== Node 선택 =====
    getNodeOffers: (): NodeOffer[] => {
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
      if (g.run.finished) return;
      if (g.phase !== "NODE") {
        logMsg(g, `무시: 전투/진행 중 노드 선택 시도 (phase=${g.phase})`);
        return;
      }

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

      // 보물 승리 조건
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
        g.choice = {
          kind: "EVENT",
          title: "휴식",
          prompt: "무엇을 하시겠습니까?",
          options: [
            { key: "rest:heal", label: "HP +15" },
            { key: "rest:clear_f", label: "F -3" },
            { key: "rest:upgrade", label: "카드 강화 (+1)" },
            { key: "rest:skip", label: "생략" },
          ],
        };

        choiceHandler = (key: string) => {
          if (key === "rest:heal") {
            g.player.hp = Math.min(g.player.maxHp, g.player.hp + 15);
            logMsg(g, "휴식: HP +15");
          } else if (key === "rest:clear_f") {
            g.player.fatigue = Math.max(0, g.player.fatigue - 3);
            logMsg(g, "휴식: 피로 F-=3");
          } else if (key === "rest:upgrade") {
            // ✅ 강화 카드 선택 UI
            const candidates = Object.values(g.cards)
              .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard"))
              .map((c) => c.uid)
              .filter((uid) => canUpgradeUid(g, uid));

            if (candidates.length === 0) {
              logMsg(g, "강화할 수 있는 카드가 없습니다.");
              g.choice = null;
              choiceHandler = null;
              render(g, actions);
              return;
            }

            g.choice = {
              kind: "PICK_CARD",
              title: "카드 강화",
              prompt: "강화할 카드 1장을 선택하세요.",
              options: [
                ...candidates.map((uid) => {
                  const def = getCardDefFor(g, uid);
                  return {
                    key: `upgrade:${uid}`,
                    label: cardNameWithUpgrade(g, uid),
                    detail: `전열: ${def.frontText} / 후열: ${def.backText}`,
                    cardUid: uid,
                  };
                }),
                { key: "cancel", label: "취소" },
              ],
            };

            // ✅ 여기서부터는 강화 선택 핸들러로 교체
            choiceHandler = (k: string) => {
              if (k === "cancel") {
                g.choice = null;
                choiceHandler = null;
                render(g, actions);
                return;
              }
              if (!k.startsWith("upgrade:")) return;

              const uid = k.slice("upgrade:".length);
              if (upgradeCardByUid(g, uid)) {
                logMsg(g, `강화 완료: ${cardNameWithUpgrade(g, uid)}`);
              } else {
                logMsg(g, "강화 실패(최대 강화/대상 없음)");
              }

              // 휴식 종료
              g.choice = null;
              choiceHandler = null;
              render(g, actions);
            };

            render(g, actions);
            return;
          } else {
            logMsg(g, "휴식: 생략");
          }

          g.choice = null;
          choiceHandler = null;
          render(g, actions);
        };

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

      // ✅ EVENT: outcome 분기 처리 포함
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

          // (1) REMOVE_PICK
          if (typeof outcome === "object" && outcome.kind === "REMOVE_PICK") {
            const candidates = Object.values(g.cards)
              .filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard")
              .map((c) => c.uid);

            g.choice = {
              kind: "PICK_CARD",
              title: outcome.title,
              prompt: outcome.prompt ?? "제거할 카드 1장을 선택하세요.",
              options: [
                ...candidates.map((uid) => {
                  const def = getCardDefFor(g, uid);
                  return {
                    key: `remove:${uid}`,
                    label: cardNameWithUpgrade(g, uid),
                    detail: `전열: ${def.frontText} / 후열: ${def.backText}`,
                    cardUid: uid,
                  };
                }),
                { key: "cancel", label: "취소" },
              ],
            };

            // 여기서부터는 "카드 제거 선택" 핸들러로 교체
            choiceHandler = (k: string) => {
              if (k === "cancel") {
                g.choice = null;
                choiceHandler = null;
                render(g, actions);
                return;
              }
              if (!k.startsWith("remove:")) {
                render(g, actions);
                return;
              }

              const uid = k.slice("remove:".length);
              removeCardByUid(g, uid);

              // then 처리
              if (outcome.then === "BATTLE") {
                g.choice = null;
                choiceHandler = null;
                spawnEncounter(g);
                startCombat(g);
                render(g, actions);
                return;
              }

              if (outcome.then === "REWARD_PICK") {
                const [a, b] = offerRewardPair();

                const da = getCardDefByIdWithUpgrade(g.content, a.defId, a.upgrade);
                const db = getCardDefByIdWithUpgrade(g.content, b.defId, b.upgrade);

                const la = a.upgrade > 0 ? `${da.name} +${a.upgrade}` : da.name;
                const lb = b.upgrade > 0 ? `${db.name} +${b.upgrade}` : db.name;

                g.choice = {
                  kind: "REWARD",
                  title: "카드 보상",
                  prompt: "두 장 중 한 장을 선택하거나 생략합니다.",
                  options: [
                    { key: `pick:${a.defId}:${a.upgrade}`, label: la, detail: `전열: ${da.frontText} / 후열: ${da.backText}` },
                    { key: `pick:${b.defId}:${b.upgrade}`, label: lb, detail: `전열: ${db.frontText} / 후열: ${db.backText}` },
                    { key: "skip", label: "생략" },
                  ],
                };

                choiceHandler = (kk: string) => {
                  if (kk.startsWith("pick:")) {
                    const [, defId, upStr] = kk.split(":");
                    const up = Number(upStr ?? "0") || 0;
                    addCardToDeck(g, defId, { upgrade: up });
                  } else {
                    logMsg(g, "카드 보상 생략");
                  }

                  g.choice = null;
                  choiceHandler = null;
                  render(g, actions);
                };

                render(g, actions);
                return;
              }

              // then === "NONE"
              g.choice = null;
              choiceHandler = null;
              render(g, actions);
            };

            render(g, actions);
            return;
          }

          // (2) BATTLE_SPECIAL
          if (typeof outcome === "object" && outcome.kind === "BATTLE_SPECIAL") {
            g.choice = null;
            choiceHandler = null;
            logMsg(g, outcome.title ? `이벤트 전투: ${outcome.title}` : "이벤트 전투 발생!");
            spawnEncounter(g, { forcePatternIds: outcome.enemyIds });
            startCombat(g);
            render(g, actions);
            return;
          }

          // (3) BATTLE
          if (outcome === "BATTLE") {
            g.choice = null;
            choiceHandler = null;
            spawnEncounter(g);
            startCombat(g);
            render(g, actions);
            return;
          }

          // (4) REWARD_PICK
          if (outcome === "REWARD_PICK") {
            const [a, b] = offerRewardPair(); // a,b: { defId, upgrade }

            const da = getCardDefByIdWithUpgrade(g.content, a.defId, a.upgrade);
            const db = getCardDefByIdWithUpgrade(g.content, b.defId, b.upgrade);

            const la = a.upgrade > 0 ? `${da.name} +${a.upgrade}` : da.name;
            const lb = b.upgrade > 0 ? `${db.name} +${b.upgrade}` : db.name;

            g.choice = {
              kind: "REWARD",
              title: "카드 보상",
              prompt: "두 장 중 한 장을 선택하거나 생략합니다.",
              options: [
                { key: `pick:${a.defId}:${a.upgrade}`, label: la, detail: `전열: ${da.frontText} / 후열: ${da.backText}` },
                { key: `pick:${b.defId}:${b.upgrade}`, label: lb, detail: `전열: ${db.frontText} / 후열: ${db.backText}` },
                { key: "skip", label: "생략" },
              ],
            };

            choiceHandler = (kk: string) => {
              if (kk.startsWith("pick:")) {
                const [, defId, upStr] = kk.split(":");
                const up = Number(upStr ?? "0") || 0;
                addCardToDeck(g, defId, { upgrade: up });
              } else {
                logMsg(g, "카드 보상 생략");
              }

              g.choice = null;
              choiceHandler = null;
              render(g, actions);
            };

            render(g, actions);
            return;
          }



          // (5) NONE
          g.choice = null;
          choiceHandler = null;
          render(g, actions);
        };

        render(g, actions);
        return;
      }
    },

    onChooseChoice: (key: string) => {
      if (!g.choice) return;
      if (!choiceHandler) return;
      choiceHandler(key);
    },

    // ===== Combat =====
    onRevealIntents: () => {
      if (g.run.finished) return;
      if (g.enemies.length === 0) return;
      revealIntentsAndDisrupt(g);
      render(g, actions);
    },

    onSelectEnemy: (enemyIndex: number) => {
      resolveTargetSelection(g, enemyIndex);
      render(g, actions);
    },

    onPlaceHandUidToSlot: (cardUid: string, side: Side, idx: number) => {
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      if (side === "back" && g.backSlotDisabled?.[idx]) return;

      placeCard(g, cardUid, side, idx);
      g.selectedHandCardUid = null;
      render(g, actions);
    },

    onPlaceSelected: (side: Side, idx: number) => {
      if (!g.selectedHandCardUid) return;
      actions.onPlaceHandUidToSlot(g.selectedHandCardUid, side, idx);
    },

    // ✅ 슬롯↔슬롯 스왑 지원
    onMoveSlotCard: (fromSide: Side, fromIdx: number, toSide: Side, toIdx: number) => {
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      if (toSide === "back" && g.backSlotDisabled?.[toIdx]) return;

      const fromSlots = fromSide === "front" ? g.frontSlots : g.backSlots;
      const toSlots = toSide === "front" ? g.frontSlots : g.backSlots;

      const a = fromSlots[fromIdx];
      if (!a) return;

      const b = toSlots[toIdx]; // null or uid

      // swap
      fromSlots[fromIdx] = b ?? null;
      toSlots[toIdx] = a;

      g.cards[a].zone = toSide;
      if (b) g.cards[b].zone = fromSide;

      const aName = cardNameWithUpgrade(g, a);
      const bName = b ? cardNameWithUpgrade(g, b) : null;

      logMsg(
        g,
        b
          ? `[${aName}] ↔ [${bName!}] 스왑: ${fromSide}${fromIdx + 1} ↔ ${toSide}${toIdx + 1}`
          : `[${aName}] 이동: ${fromSide}${fromIdx + 1} → ${toSide}${toIdx + 1}`
      );
      render(g, actions);
    },

    onResolveBack: () => {
      resolveBack(g);
      render(g, actions);
    },
    onResolveFront: () => {
      resolveFront(g);
      render(g, actions);
    },
    onResolveEnemy: () => {
      resolveEnemy(g);
      render(g, actions);
    },
    onUpkeep: () => {
      upkeepEndTurn(g);
      render(g, actions);
    },
    onDrawNextTurn: () => {
      drawStepStartNextTurn(g);
      render(g, actions);
    },
  };

  return actions;
}

// =========================
// Render
// =========================
export function mountRoot(): HTMLDivElement {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";
  return app;
}

export function render(g: GameState, actions: UIActions) {
  const app = mountRoot();

  // 1회 바인딩(키보드/포인터)
  if (!uiMounted) {
    bindGlobalInput(app, g, actions);
    uiMounted = true;
  }

  const top = div("row top");
  const left = div("panel");
  const right = div("panel");

  // ===== LEFT =====
  left.appendChild(h2("상태"));
  left.appendChild(statsRow(g));
  left.appendChild(hr());

  left.appendChild(h3("플레이어 상태"));
  left.appendChild(statusBadges(g.player.status));

  const pileControls = div("controls");
  pileControls.appendChild(button("덱", () => actions.onViewPile("deck"), false));
  pileControls.appendChild(button("버림", () => actions.onViewPile("discard"), false));
  pileControls.appendChild(button("소모", () => actions.onViewPile("exhausted"), false));
  pileControls.appendChild(button("소실", () => actions.onViewPile("vanished"), false));
  pileControls.appendChild(button("손패", () => actions.onViewPile("hand"), false));
  pileControls.appendChild(button("룰북", actions.onViewRulebook, false));
  pileControls.appendChild(button("새 런", actions.onNewRun, false));
  left.appendChild(pileControls);

  left.appendChild(hr());
  left.appendChild(h3("적"));

  const targeting = isTargeting(g);
  const remainingTargets = (g.pendingTarget ? 1 : 0) + (g.pendingTargetQueue?.length ?? 0);

  if (g.enemies.length === 0) {
    left.appendChild(p("현재 전투 없음"));
  } else {
    if (targeting) {
      const hint = div("banner banner-left");
      hint.textContent = `대상 선택이 필요합니다. (남은 선택 ${remainingTargets})`;
      left.appendChild(hint);
    }

    // 살아있는 적 먼저, 죽은 적 아래
    const aliveList = g.enemies.map((e, i) => ({ e, i })).filter(({ e }) => e.hp > 0);
    const deadList = g.enemies.map((e, i) => ({ e, i })).filter(({ e }) => e.hp <= 0);
    const ordered = [...aliveList, ...deadList];

    for (const { e, i } of ordered) {
      const box = div("enemyBox");
      box.dataset.enemyIndex = String(i);

      const alive = e.hp > 0;
      const canBeTargeted = targeting && alive;

      if (canBeTargeted) box.classList.add("targetable");
      if (!alive) box.classList.add("dead");

      const title = p(`${i + 1}. ${e.name} (HP ${e.hp}/${e.maxHp})`);
      title.className = "enemyTitle";
      box.appendChild(title);

      const badges = div("badgesRow");
      if (e.immuneThisTurn) badges.appendChild(badge("면역 ✨"));
      if (!alive) badges.appendChild(badge("DEAD"));

      const st = e.status;
      if ((st.vuln ?? 0) > 0) badges.appendChild(badge(`취약 ${st.vuln}`));
      if ((st.weak ?? 0) > 0) badges.appendChild(badge(`약화 ${st.weak}`));
      if ((st.bleed ?? 0) > 0) badges.appendChild(badge(`출혈 ${st.bleed}`));
      if ((st.disrupt ?? 0) > 0) badges.appendChild(badge(`교란 ${st.disrupt}`));
      if (badges.childNodes.length > 0) box.appendChild(badges);

      const def = g.content.enemiesById[e.id];
      const intent = def.intents[e.intentIndex % def.intents.length];
      const intentRow = p(g.intentsRevealedThisTurn ? `의도: ${intent.label}` : `의도: (미공개)`);
      intentRow.className = g.intentsRevealedThisTurn ? "intentOn" : "intentOff";
      box.appendChild(intentRow);

      const btn = document.createElement("button");
      btn.textContent = canBeTargeted ? "이 적을 선택" : "대상 선택";
      btn.disabled = !canBeTargeted;
      btn.onclick = () => actions.onSelectEnemy(i);
      box.appendChild(btn);

      left.appendChild(box);
    }
  }

  // ===== RIGHT =====
  right.appendChild(h2("진행"));

  if (targeting) {
    const banner = div("banner banner-target");
    banner.textContent = `⚠ 대상 선택 필요 (남은 선택 ${remainingTargets}) — 왼쪽에서 살아있는 적을 고르세요.`;
    right.appendChild(banner);
  }

  if (g.run.finished) {
    right.appendChild(p("런 종료"));
  } else if (overlay) {
    renderOverlay(right, g, actions, overlay);
  } else if (g.choice) {
    renderChoice(right, g, actions);
  } else if (g.phase === "NODE") {
    renderNodeSelect(right, g, actions);
  } else {
    renderCombat(right, g, actions, targeting);
  }

  top.appendChild(left);
  top.appendChild(right);

  const bottom = div("panel logPanel" + (logCollapsed ? " collapsed" : ""));

  const logHeader = div("row");
  logHeader.style.gridTemplateColumns = "1fr auto";
  logHeader.style.alignItems = "center";

  logHeader.appendChild(h2("로그"));

  const toggleLabel = logCollapsed ? "로그 펼치기" : "로그 접기";
  const toggleBtn = button(toggleLabel, actions.onToggleLog, false);
  toggleBtn.classList.add("primary");
  logHeader.appendChild(toggleBtn);

  bottom.appendChild(logHeader);

  // 접혀있지 않을 때만 렌더(성능/UX)
  if (!logCollapsed) {
    bottom.appendChild(logBox(g.log.join("\n")));
  }


  app.appendChild(top);
  app.appendChild(bottom);

  renderDragOverlay(app, g);

}

// =========================
// Combat UI
// =========================
function renderCombat(root: HTMLElement, g: GameState, actions: UIActions, targeting: boolean) {

  const controls = div("controls combatControls");

  controls.appendChild(
    button(
      "의도 공개(정찰)",
      actions.onRevealIntents,
      g.enemies.length === 0 || g.intentsRevealedThisTurn || g.phase !== "PLACE" || targeting
    )
  );
  controls.appendChild(button("후열 발동", actions.onResolveBack, !(g.phase === "PLACE" || g.phase === "BACK") || targeting));
  controls.appendChild(button("전열 발동", actions.onResolveFront, g.phase !== "FRONT" || targeting));
  controls.appendChild(button("적 행동", actions.onResolveEnemy, g.phase !== "ENEMY" || targeting));
  controls.appendChild(button("턴 정리", actions.onUpkeep, g.phase !== "UPKEEP" || targeting));
  controls.appendChild(button("드로우", actions.onDrawNextTurn, g.phase !== "DRAW" || targeting));
  controls.appendChild(button("선택 해제(Esc)", actions.onClearSelected, !g.selectedHandCardUid));

  root.appendChild(controls);
  root.appendChild(hr());

  root.appendChild(h3("전열 슬롯 (1~3)"));
  root.appendChild(renderSlotsGrid(g, actions, "front"));

  root.appendChild(h3("후열 슬롯 (Shift+1~3)"));
  root.appendChild(renderSlotsGrid(g, actions, "back"));

  root.appendChild(hr());

  root.appendChild(h3(`손패 (${g.hand.length}) — Tab로 선택 이동`));
  const hand = div("hand");
  hand.dataset.dropHand = "1";
  for (const uid of g.hand) {
    hand.appendChild(renderCard(g, uid, true, actions.onSelectHandCard));
  }
  root.appendChild(hand);

  const help = small("드래그: 손패→슬롯 배치 / 슬롯→슬롯 스왑. 키보드: 1~3 전열, Shift+1~3 후열, Tab 이동, Esc 해제.");
  help.className = "help";
  root.appendChild(help);
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

    if (hoverSlot && hoverSlot.side === side && hoverSlot.idx === i) {
      s.classList.add("dropHover");
    }
    if (hasSelected && !disabled) s.classList.add("placeable");

    s.appendChild(small(`${side === "front" ? "전열" : "후열"} ${i + 1}`));

    const uid = slots[i];
    if (uid) {
      s.appendChild(renderCard(g, uid, false));

      // 슬롯 카드 드래그 시작
      const cardEl = s.querySelector<HTMLElement>(".card");
      if (cardEl) {
        cardEl.onpointerdown = (ev) => {
          if (ev.button !== 0 && ev.pointerType === "mouse") return;
          if (isTargeting(g)) return;
          if (g.phase !== "PLACE") return;

          beginDrag(ev, { kind: "slot", cardUid: uid, fromSide: side, fromIdx: i });
        };
        cardEl.ondblclick = () => {
          actions.onReturnSlotToHand(side, i);
        };
      }
      
    }

    // 클릭 배치(선택된 손패가 있을 때)
    s.onclick = () => {
      if (disabled) return;
      actions.onPlaceSelected(side, i);
    };

    grid.appendChild(s);
  }

  return grid;
}

// =========================
// Drag + Keyboard
// =========================
function bindGlobalInput(app: HTMLElement, g: GameState, actions: UIActions) {
  app.onpointermove = (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    drag.x = ev.clientX;
    drag.y = ev.clientY;

    const dx = drag.x - drag.startX;
    const dy = drag.y - drag.startY;
    if (!drag.dragging && dx * dx + dy * dy > 36) drag.dragging = true;

    hoverSlot = drag.dragging ? hitTestSlot(ev.clientX, ev.clientY, g) : null;
    render(g, actions);
  };

  app.onpointerup = (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;

    if (drag.dragging) {
      const dropSlot = hitTestSlot(ev.clientX, ev.clientY, g);

      if (dropSlot) {
        // 슬롯 위 드롭
        if (drag.kind === "hand") {
          actions.onPlaceHandUidToSlot(drag.cardUid, dropSlot.side, dropSlot.idx);
        } else if (drag.kind === "slot") {
          if (drag.fromSide != null && drag.fromIdx != null) {
            if (!(drag.fromSide === dropSlot.side && drag.fromIdx === dropSlot.idx)) {
              actions.onMoveSlotCard(drag.fromSide, drag.fromIdx, dropSlot.side, dropSlot.idx);
            }
          }
        }
      } else {
        // 슬롯 아닌 곳: 손패 드롭 체크(슬롯 카드만)
        if (drag.kind === "slot" && drag.fromSide != null && drag.fromIdx != null) {
          if (hitTestHand(ev.clientX, ev.clientY)) {
            actions.onReturnSlotToHand(drag.fromSide, drag.fromIdx);
          }
        }
      }
    }

    drag = null;
    hoverSlot = null;
    render(g, actions);
  };

  window.addEventListener("keydown", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

    // 타겟팅 중엔 카드 배치 키 막기(실수 방지), Esc만 허용
    if (isTargeting(g)) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        actions.onClearSelected();
      }
      return;
    }

    if (ev.key === "Escape") {
      ev.preventDefault();
      actions.onClearSelected();
      return;
    }

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

    // ✅ Shift+1~3 문제 해결: ev.key가 아니라 ev.code 사용
    const n = parseDigit123(ev.code);
    if (n != null) {
      if (!g.selectedHandCardUid) return;
      if (g.phase !== "PLACE") return;

      const idx = n - 1;
      if (ev.shiftKey) actions.onPlaceSelected("back", idx);
      else actions.onPlaceSelected("front", idx);
      return;
    }
  });
}

function parseDigit123(code: string): 1 | 2 | 3 | null {
  if (code === "Digit1") return 1;
  if (code === "Digit2") return 2;
  if (code === "Digit3") return 3;
  return null;
}

function beginDrag(
  ev: PointerEvent,
  init: { kind: "hand" | "slot"; cardUid: string; fromSide?: Side; fromIdx?: number }
) {
  const target = ev.currentTarget as HTMLElement;
  target.setPointerCapture(ev.pointerId);

  drag = {
    kind: init.kind,
    cardUid: init.cardUid,
    fromSide: init.fromSide,
    fromIdx: init.fromIdx,
    pointerId: ev.pointerId,
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    dragging: false,
  };
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

function hitTestHand(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return false;

  const hand = closestWithDatasetKeys(el, ["dropHand"]);
  return !!hand;
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


function renderDragOverlay(app: HTMLElement, g: GameState) {
  if (!drag || !drag.dragging) return;


  const ghost = div("dragGhost");
  ghost.textContent = cardNameWithUpgrade(g, drag.cardUid);
  ghost.style.position = "fixed";
  ghost.style.left = `${drag.x + 12}px`;
  ghost.style.top = `${drag.y + 12}px`;
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "9999";
  app.appendChild(ghost);
}

// =========================
// Node / Choice render
// =========================
function renderChoice(root: HTMLElement, g: GameState, actions: UIActions) {
  root.appendChild(h3(g.choice!.title));
  if (g.choice!.prompt) {
    const pre = document.createElement("pre");
    pre.className = "rulebook";
    pre.textContent = g.choice!.prompt;
    root.appendChild(pre);
  }

  const box = div("controls");
  for (const opt of g.choice!.options) {
    const b = document.createElement("button");
    b.className = "primary";
    b.textContent = opt.detail ? `${opt.label} — ${opt.detail}` : opt.label;
    b.onclick = () => actions.onChooseChoice(opt.key);
    box.appendChild(b);
  }
  root.appendChild(box);
}

function nodeLabel(t: "BATTLE" | "REST" | "EVENT" | "TREASURE", isBoss: boolean) {
  if (t === "BATTLE") return isBoss ? "보스" : "전투";
  if (t === "REST") return "휴식";
  if (t === "EVENT") return "이벤트";
  return "저주받은 보물";
}
function labelList(offers: Array<{ type: "BATTLE" | "REST" | "EVENT" | "TREASURE" }>, isBoss: boolean) {
  if (isBoss) return "보스";
  return offers.map((o) => nodeLabel(o.type, false)).join(" / ");
}
function renderNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {
  const parts: string[] = [`[선택 ${g.run.nodePickCount}회]`];

  if (g.run.treasureObtained) {
    parts.push(`[보물 후 ${g.run.afterTreasureNodePicks}/10]`);
  }

  root.appendChild(p(parts.join(" ")));
  
  const nextIndex = g.run.nodePickCount + 1;
  const isBossNode = nextIndex % 30 === 0;
  const isBossNextAfterPick = (g.run.nodePickCount + 2) % 30 === 0;

  const offers = actions.getNodeOffers();
  const br = g.run.branchOffer;

  if (br) {
    root.appendChild(p(`전자 선택 시 다음 선택지: ${labelList(br.nextIfA, isBossNextAfterPick)}`));
    root.appendChild(p(`후자 선택 시 다음 선택지: ${labelList(br.nextIfB, isBossNextAfterPick)}`));
    root.appendChild(hr());
  }

  const row = div("controls");
  for (const off of offers) {
    const b = document.createElement("button");
    b.className = "primary";
    b.textContent = nodeLabel(off.type, isBossNode);
    b.onclick = () => actions.onChooseNode(off.id);
    row.appendChild(b);
  }
  root.appendChild(row);
}

// =========================
// Helpers / UI primitives
// =========================
function isTargeting(g: GameState) {
  return g.pendingTarget != null || (g.pendingTargetQueue?.length ?? 0) > 0;
}

function statsRow(g: GameState) {
  const row = div("stats");
  row.appendChild(badge(`HP ❤️ ${g.player.hp}/${g.player.maxHp}`));
  row.appendChild(badge(`블록 🛡️ ${g.player.block}`));
  row.appendChild(badge(`S ${g.player.supplies}`));
  row.appendChild(badge(`F ${g.player.fatigue}`));
  row.appendChild(badge(`${g.run.nodePickCount}번 탐험`));
  row.appendChild(badge(`덱 ${g.deck.length}장`));
  return row;
}

function statusBadges(st: Record<string, number>) {
  const box = div("badgesRow");

  for (const [k, v] of Object.entries(st)) {
    if (!v) continue;
    box.appendChild(badge(`${k} ${v}`));
  }
  return box;
}

function renderCard(g: GameState, cardUid: string, clickable: boolean, onClick?: (uid: string) => void) {
  const def = getCardDefFor(g, cardUid);

  const d = div("card");
  if (g.selectedHandCardUid === cardUid) d.classList.add("selected");
  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  d.appendChild(divText("cardTitle", cardNameWithUpgrade(g, cardUid)));

  const meta = div("cardMeta");
  if (def.tags?.includes("EXHAUST")) meta.appendChild(badge("소모"));
  if (def.tags?.includes("VANISH")) meta.appendChild(badge("소실"));
  d.appendChild(meta);

  const txt = divText("cardText", `전열: ${def.frontText}\n후열: ${def.backText}`);
  txt.style.whiteSpace = "pre-line";
  d.appendChild(txt);

  // 손패 카드: 클릭 선택 + 드래그 시작
  if (clickable && onClick) {
    d.onclick = () => onClick(cardUid);

    d.onpointerdown = (ev) => {
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      beginDrag(ev, { kind: "hand", cardUid });
    };
  }

  return d;
}

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
function hr() {
  return document.createElement("hr");
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

function renderOverlay(root: HTMLElement, g: GameState, actions: UIActions & { onCloseOverlay: () => void }, ov: Overlay) {
  const title =
    ov.kind === "RULEBOOK"
      ? "룰북"
      : ov.pile === "deck"
      ? "덱"
      : ov.pile === "discard"
      ? "버림 더미"
      : ov.pile === "exhausted"
      ? "소모(이번 전투)"
      : ov.pile === "vanished"
      ? "소실(영구)"
      : "손패";

  root.appendChild(h3(title));

  // 본문
  if (ov.kind === "RULEBOOK") {
    const pre = document.createElement("pre");
    pre.className = "rulebook";
    pre.textContent = RULEBOOK_TEXT;
    root.appendChild(pre);
  } else {
    const uids =
      ov.pile === "deck"
        ? g.deck
        : ov.pile === "discard"
        ? g.discard
        : ov.pile === "exhausted"
        ? g.exhausted
        : ov.pile === "vanished"
        ? g.vanished
        : g.hand;

    const sortedUids = [...uids].sort((a, b) => {
      const da = getCardDefFor(g, a);
      const db = getCardDefFor(g, b);
      const nameCmp = da.name.localeCompare(db.name, "ko");
      if (nameCmp !== 0) return nameCmp;

      const ua = g.cards[a].upgrade ?? 0;
      const ub = g.cards[b].upgrade ?? 0;
      if (ua !== ub) return ub - ua;

      return a.localeCompare(b);
    });

    const list = div("controls");
    for (const uid of sortedUids) {
      const def = getCardDefFor(g, uid);
      const b = document.createElement("button");
      b.className = "primary";
      b.textContent = `${cardNameWithUpgrade(g, uid)} — 전열: ${def.frontText} / 후열: ${def.backText}`;
      b.onclick = () => {};
      list.appendChild(b);
    }
    root.appendChild(list);

  }

  // 닫기
  const row = div("controls");
  row.appendChild(button("닫기", actions.onCloseOverlay, false));
  root.appendChild(row);
}
