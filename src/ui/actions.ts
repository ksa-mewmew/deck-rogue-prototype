import type { GameState, NodeType, PileKind, ChoiceState } from "../engine/types";
import { render } from "./render";
import {
  spawnEncounter,
  startCombat,
  placeCard,
  resolveBack,
  resolveFront,
  resolveEnemy,
  upkeepEndTurn,
  drawStepStartNextTurn,
  revealIntentsAndDisrupt,
} from "../engine/combat";
import { logMsg, rollNodeOffers } from "../engine/rules";
import { pickRandomEvent } from "../content/events";
import { removeCardByUid, addCardToDeck, obtainTreasure, offerRewardPair } from "../content/rewards";
import { healPlayer, applyDamageToEnemy } from "../engine/effects";
import { createInitialState } from "../engine/state";

export function makeUIActions(g: GameState, setGame: (next: GameState) => void) {
  let choiceHandler: ((key: string) => void) | null = null;

  const actions = {
    getNodeOffers: () => {
      if (!g.run.nodeOfferQueue || g.run.nodeOfferQueue.length === 0) {
        g.run.nodeOfferQueue = [rollNodeOffers(g), rollNodeOffers(g), rollNodeOffers(g)];
      }
      return g.run.nodeOfferQueue[0];
    },
    onViewPile: (pile: PileKind) => {
      const title =
        pile === "deck" ? "덱"
        : pile === "discard" ? "버림 더미"
        : pile === "exhausted" ? "소모(이번 전투에서 제거)"
        : pile === "vanished" ? "소실(영구 제거)"
        : "손패";

      const uids =
        pile === "deck" ? g.deck
        : pile === "discard" ? g.discard
        : pile === "exhausted" ? g.exhausted
        : pile === "vanished" ? g.vanished
        : g.hand;

      const sortedUids = [...uids].sort((a, b) => {
        const da = g.content.cardsById[g.cards[a].defId];
        const db = g.content.cardsById[g.cards[b].defId];

        // 1) 이름
        const nameCmp = da.name.localeCompare(db.name, "ko");
        if (nameCmp !== 0) return nameCmp;

        // 2) 태그 우선순위
        const rank = (d: typeof da) => {
          const tags = d.tags ?? [];
          const vanish = tags.includes("VANISH") ? 0 : 1;  // 소실 먼저
          const exhaust = tags.includes("EXHAUST") ? 0 : 1; // 소모 다음
          return vanish * 10 + exhaust;
        };
        const r = rank(da) - rank(db);
        if (r !== 0) return r;

        // 3) 안정성
        return a.localeCompare(b);
      });

      // 현재 choice(예: 보상)를 스택에 저장
      if (g.choice) g.choiceStack.push(g.choice);

      g.choice = {
        kind: "VIEW_PILE",
        title: `${title} (${uids.length})`,
        prompt: "목록을 확인하세요.",
        options: [
          ...sortedUids.map((uid) => {
            const def = g.content.cardsById[g.cards[uid].defId];
            return {
              key: `noop:${uid}`,
              label: def.name,
              detail: `전열: ${def.frontText} / 후열: ${def.backText}`,
              cardUid: uid,
            };
          }),
          { key: "close", label: "닫기" },
        ],
      };

      // VIEW_PILE은 choiceHandler를 건드리지 않는다
      render(g, actions);
    },

    onRevealIntents: () => {
      if (g.run.finished) return;
      if (g.enemies.length === 0) return;
      revealIntentsAndDisrupt(g);
      render(g, actions);
    },

  onChooseNode: (t: NodeType) => {
    if (g.run.finished) return;

    // ✅ 전투/진행 중에는 노드 선택 금지
    if (g.phase !== "NODE") {
      logMsg(g, `무시: 전투/진행 중 노드 선택 시도 (phase=${g.phase})`);
      return;
    }

    const nextIndex = g.run.nodePickCount + 1;
    const forceBossNow = (nextIndex % 30 === 0);

    // ✅ 강제 보스 노드는 입력과 무관하게 BATTLE로 취급
    const actual: NodeType = forceBossNow ? "BATTLE" : t;

    // ✅ 노드 카운트/집계
    g.run.nodePickCount = nextIndex;
    g.run.nodePickByType[actual] = (g.run.nodePickByType[actual] ?? 0) + 1;

    // ✅ 노드 오퍼 큐 소비 + 보충(미리보기 2개 유지)
    if (!g.run.nodeOfferQueue || g.run.nodeOfferQueue.length === 0) {
      g.run.nodeOfferQueue = [rollNodeOffers(g), rollNodeOffers(g), rollNodeOffers(g)];
    } else {
      g.run.nodeOfferQueue.shift();
      g.run.nodeOfferQueue.push(rollNodeOffers(g));
    }

    // ✅ 보물 후 10회(노드 기반) — TREASURE 선택 자체는 카운트하지 않음
    if (g.run.treasureObtained && actual !== "TREASURE") {
      g.run.afterTreasureNodePicks += 1;
      if (g.run.afterTreasureNodePicks >= 10) {
        g.run.finished = true;
        logMsg(g, "승리! 저주받은 보물을 얻은 후 10턴 동안 살아남았습니다.");
        render(g, actions);
        return;
      }
    }

    // =========================
    // ✅ 실제 분기 처리
    // =========================

    // 1) BATTLE (또는 30노드 강제 보스)
    if (actual === "BATTLE") {
      if (forceBossNow) {
        logMsg(g, `=== ${nextIndex}번째 노드: 보스 전투 ===`);
        spawnEncounter(g, { forceBoss: true });
      } else {
        spawnEncounter(g);
      }
      startCombat(g);
      render(g, actions);
      return;
    }

    // 2) REST
    if (actual === "REST") {
      g.choice = {
        kind: "EVENT",
        title: "휴식",
        prompt: "무엇을 하시겠습니까?",
        options: [
          { key: "rest:heal", label: "HP +15" },
          { key: "rest:clear_f", label: "F = 0" },
          { key: "rest:skip", label: "생략" },
        ],
      };

      choiceHandler = (key: string) => {
        if (key === "rest:heal") {
          healPlayer(g, 15);
          logMsg(g, "휴식: HP +15");
        } else if (key === "rest:clear_f") {
          g.player.fatigue = 0;
          logMsg(g, "휴식: 피로 F=0");
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

    // 3) EVENT
    if (actual === "EVENT") {
      const ev = pickRandomEvent();

      // ✅ 매우 중요: options(g)는 단 1번만 호출(버튼 목록과 핸들러 불일치 방지)
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

        const outcome = picked.apply(g);

        // -------------------------
        // A) REMOVE_PICK: 카드 1장 제거 선택 UI로 전환
        // -------------------------
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
                const def = g.content.cardsById[g.cards[uid].defId];
                return {
                  key: `remove:${uid}`,
                  label: def.name,
                  detail: `전열: ${def.frontText} / 후열: ${def.backText}`,
                  cardUid: uid,
                };
              }),
              { key: "cancel", label: "취소" },
            ],
          };

          // ✅ 여기서 choiceHandler를 “제거 선택 핸들러”로 교체
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

            // 제거 UI 종료
            g.choice = null;
            choiceHandler = null;

            // ✅ then 분기 처리
            if (outcome.then === "BATTLE") {
              spawnEncounter(g);
              startCombat(g);
              render(g, actions);
              return;
            }

            if (outcome.then === "REWARD_PICK") {
              const [a, b] = offerRewardPair();
              const da = g.content.cardsById[a];
              const db = g.content.cardsById[b];

              g.choice = {
                kind: "REWARD",
                title: "카드 보상",
                prompt: "두 장 중 한 장을 선택하거나 생략합니다.",
                options: [
                  { key: `pick:${a}`, label: da.name, detail: `전열: ${da.frontText} / 후열: ${da.backText}` },
                  { key: `pick:${b}`, label: db.name, detail: `전열: ${db.frontText} / 후열: ${db.backText}` },
                  { key: "skip", label: "생략" },
                ],
              };

              choiceHandler = (kk: string) => {
                if (kk.startsWith("pick:")) addCardToDeck(g, kk.slice("pick:".length));
                else logMsg(g, "카드 보상 생략");

                g.choice = null;
                choiceHandler = null;
                render(g, actions);
              };

              render(g, actions);
              return;
            }

            // then === "NONE"
            render(g, actions);
            return;
          };

          render(g, actions);
          return; // ✅ 중요: REMOVE_PICK 진입 시 여기서 종료
        }

        // -------------------------
        // B) 일반 outcome 처리 (BATTLE / REWARD_PICK / NONE)
        // -------------------------
        g.choice = null;
        choiceHandler = null;

        if (outcome === "BATTLE") {
          spawnEncounter(g);
          startCombat(g);
          render(g, actions);
          return;
        }

        if (outcome === "REWARD_PICK") {
          const [a, b] = offerRewardPair();
          const da = g.content.cardsById[a];
          const db = g.content.cardsById[b];

          g.choice = {
            kind: "REWARD",
            title: "카드 보상",
            prompt: "두 장 중 한 장을 선택하거나 생략합니다.",
            options: [
              { key: `pick:${a}`, label: da.name, detail: `전열: ${da.frontText} / 후열: ${da.backText}` },
              { key: `pick:${b}`, label: db.name, detail: `전열: ${db.frontText} / 후열: ${db.backText}` },
              { key: "skip", label: "생략" },
            ],
          };

          choiceHandler = (kk: string) => {
            if (kk.startsWith("pick:")) addCardToDeck(g, kk.slice("pick:".length));
            else logMsg(g, "카드 보상 생략");

            g.choice = null;
            choiceHandler = null;
            render(g, actions);
          };

          render(g, actions);
          return;
        }

        // outcome === "NONE"
        render(g, actions);
      };

      render(g, actions);
      return;
    }

    // 4) TREASURE
    if (actual === "TREASURE") {
      obtainTreasure(g);
      g.run.treasureObtained = true;
      g.run.afterTreasureNodePicks = 0;
      render(g, actions);
      return;
    }

    // fallback
    render(g, actions);
  },


    onSelectHandCard: (uid: string) => {
      g.selectedHandCardUid = g.selectedHandCardUid === uid ? null : uid;
      render(g, actions);
    },

    onPlaceSelected: (side: "front" | "back", idx: number) => {
      const uid = g.selectedHandCardUid;
      if (!uid) return;

      placeCard(g, uid, side, idx);
      g.selectedHandCardUid = null;
      render(g, actions);
    },

    onResolveBack: () => {
      resolveBack(g);
      postCheck(g, actions);
    },

    onChooseChoice: (key: string) => {
      // 덱/더미 보기 닫기: 이전 choice 복구 + choiceHandler 유지
      if (g.choice?.kind === "VIEW_PILE" && key === "close") {
        g.choice = g.choiceStack.pop() ?? null;
        render(g, actions);
        return;
      }

      // VIEW_PILE에서 noop 클릭은 아무 것도 안 함
      if (g.choice?.kind === "VIEW_PILE" && key.startsWith("noop:")) {
        render(g, actions);
        return;
      }

      // 나머지(보상/이벤트/휴식 등)는 기존 choiceHandler로 처리
      if (!choiceHandler) return;
      choiceHandler(key);
    },

    onNewRun: () => {
      const next = createInitialState(g.content);
      next.run.nodeOfferQueue = [rollNodeOffers(next), rollNodeOffers(next), rollNodeOffers(next)];
      choiceHandler = null;
      setGame(next);
    },


    onResolveFront: () => {
      resolveFront(g);
      postCheck(g, actions);
    },

    onResolveEnemy: () => {
      resolveEnemy(g);
      postCheck(g, actions);
    },

    onUpkeep: () => {
      upkeepEndTurn(g);
      postCheck(g, actions);
    },

    onDrawNextTurn: () => {
      g.intentsRevealedThisTurn = false;

      if ((g.player.status.disrupt ?? 0) > 0) {
        g.disruptIndexThisTurn = Math.floor(Math.random() * 3); // 0..2
      } else {
        g.disruptIndexThisTurn = null;
      }

      g.backSlotDisabled = [false, false, false];
      if (g.disruptIndexThisTurn !== null) {
        g.backSlotDisabled[g.disruptIndexThisTurn] = true;
      }

      drawStepStartNextTurn(g);

      // 전투 끝났으면 보상(임시: 바로 보상 선택창)
      if (g.phase === "NODE" && !g.run.finished) {
        g.choice = maybeOfferReward(g);

        choiceHandler = (k: string) => {
          if (k.startsWith("pick:")) {
            addCardToDeck(g, k.slice("pick:".length));
            logMsg(g, "카드 보상 획득");
          } else {
            logMsg(g, "카드 보상 생략");
          }

          g.choice = null;
          choiceHandler = null;
          render(g, actions);
        };

        render(g, actions);
        return; // 보상 떠 있는 동안 아래 진행 막기
      }

      render(g, actions);
    },

    onFastPass: () => {
      if (g.phase === "PLACE") resolveBack(g);
      if (g.phase === "FRONT") resolveFront(g);
      if (g.phase === "ENEMY") resolveEnemy(g);
      if (g.phase === "UPKEEP") upkeepEndTurn(g);
      if (g.phase === "DRAW") drawStepStartNextTurn(g);

      if (g.phase === "NODE" && !g.run.finished) {
        g.choice = maybeOfferReward(g);

        choiceHandler = (k: string) => {
          if (k.startsWith("pick:")) {
            addCardToDeck(g, k.slice("pick:".length));
            logMsg(g, "카드 보상 획득");
          } else {
            logMsg(g, "카드 보상 생략");
          }

          g.choice = null;
          choiceHandler = null;
          render(g, actions);
        };

        render(g, actions);
        return; // 보상 떠 있는 동안 아래 진행 막기
      }

      render(g, actions);
    },

    onSelectEnemy: (enemyIndex: number) => {
      const cur = g.pendingTarget;
      if (!cur || cur.kind !== "damageSelect") return;

      const enemy = g.enemies[enemyIndex];
      if (!enemy || enemy.hp <= 0) return;

      applyDamageToEnemy(g, enemy, cur.amount);

      // ✅ 전멸이면 남은 타겟 자동 취소(막힘 방지)
      if (g.enemies.filter(e => e.hp > 0).length === 0) {
        const skipped = g.pendingTargetQueue.length;
        g.pendingTarget = null;
        g.pendingTargetQueue = [];
        if (skipped > 0) logMsg(g, `적 전멸: 남은 대상 선택 ${skipped}회 자동 취소`);
        render(g, actions);
        return;
      }

      // ✅ 다음 타겟으로 넘김 (큐에서 1개 꺼내 현재로)
      g.pendingTarget = g.pendingTargetQueue.shift() ?? null;

      render(g, actions);
    },


  };

  return actions;
}

function postCheck(g: GameState, actions: any) {
  render(g, actions);
}

export function maybeOfferReward(g: GameState): ChoiceState {
  const [a, b] = offerRewardPair();
  const da = g.content.cardsById[a];
  const db = g.content.cardsById[b];

  return {
    kind: "REWARD",
    title: "카드 보상",
    prompt: "두 장 중 한 장을 선택하거나 생략합니다.",
    options: [
      { key: `pick:${a}`, label: da.name, detail: `전열: ${da.frontText} / 후열: ${da.backText}` },
      { key: `pick:${b}`, label: db.name, detail: `전열: ${db.frontText} / 후열: ${db.backText}` },
      { key: "skip", label: "생략" },
    ],
  };
}

