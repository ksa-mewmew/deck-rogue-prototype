import type { GameState, NodeOffer, PileKind } from "../engine/types";

export function mountRoot(): HTMLDivElement {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";
  return app;
}

export function render(g: GameState, actions: UIActions) {
  const app = mountRoot();

  const top = div("row top");

  const left = div("panel");
  const right = div("panel");

  // ===== LEFT: 상태/적 =====
  const header = div("row");
  header.appendChild(h2("상태"));
  left.appendChild(header);
  left.appendChild(statsRow(g));

  left.appendChild(hr());

  left.appendChild(h3("플레이어 상태"));
  left.appendChild(
    p(
      `취약 ${g.player.status.vuln} / 약화 ${g.player.status.weak} / 출혈 ${g.player.status.bleed} / 교란 ${g.player.status.disrupt}`
    )
  );

  const pileControls = div("controls");
  pileControls.appendChild(button("덱 보기", () => actions.onViewPile("deck"), false));
  pileControls.appendChild(button("버림 보기", () => actions.onViewPile("discard"), false));
  pileControls.appendChild(button("소모 보기", () => actions.onViewPile("exhausted"), false));
  pileControls.appendChild(button("소실 보기", () => actions.onViewPile("vanished"), false));
  pileControls.appendChild(button("손패 보기", () => actions.onViewPile("hand"), false));
  pileControls.appendChild(button("새 런 시작", actions.onNewRun, false));
  left.appendChild(pileControls);

  left.appendChild(hr());

  // ===== Targeting 상태 판단 =====
  const targeting = !!g.pendingTarget || (g.pendingTargetQueue?.length ?? 0) > 0;
  const remainingTargets = g.pendingTargetQueue?.length ?? 0;

  left.appendChild(h3("적"));

  if (g.enemies.length === 0) {
    left.appendChild(p("현재 전투 없음"));
  } else {
    // 타겟팅 중이면 시선 유도 텍스트
    if (targeting) {
      const hint = div("banner banner-left");
      hint.textContent = `대상 선택이 필요합니다. (남은 선택 ${remainingTargets})`;
      hint.style.marginBottom = "8px";
      hint.style.fontWeight = "700";
      hint.style.padding = "8px";
      hint.style.borderRadius = "8px";
      hint.style.border = "1px solid rgba(255,80,80,0.7)";
      hint.style.background = "rgba(255,80,80,0.12)";
      left.appendChild(hint);
    }

    g.enemies.forEach((e, i) => {
      const box = div("enemyBox");
      box.style.display = "grid";
      box.style.gap = "6px";
      box.style.padding = "10px 10px";
      box.style.borderRadius = "10px";
      box.style.border = "1px solid rgba(255,255,255,0.10)";
      box.style.marginBottom = "8px";

      const alive = e.hp > 0;
      const canBeTargeted = targeting && alive;

      if (canBeTargeted) {
        box.classList.add("targetable");
        box.style.border = "1px solid rgba(255,200,80,0.75)";
        box.style.boxShadow = "0 0 0 2px rgba(255,200,80,0.15) inset";
        box.style.background = "rgba(255,200,80,0.06)";
      }
      if (!alive) {
        box.style.opacity = "0.6";
      }

      const sameNameCount = g.enemies.filter((x) => x.name === e.name).length;
      const label = sameNameCount >= 2 ? `${e.name} #${i + 1}` : e.name;

      // ✅ 화면 표시용 인덱스는 1부터
      const title = p(`${i + 1}. ${label} (HP ${e.hp}/${e.maxHp})`);
      title.style.fontWeight = "700";
      title.style.fontSize = "13px";
      box.appendChild(title);

      box.appendChild(
        p(
          `취약 ${e.status.vuln} / 약화 ${e.status.weak} / 출혈 ${e.status.bleed} / 교란 ${e.status.disrupt}`
        )
      );

      // ✅ 적 의도 표시
      const def = g.content.enemiesById[e.id];
      const intent = def.intents[e.intentIndex % def.intents.length];

      let note = "";
      if (e.id === "boss_soul_stealer") {
        const count = e.soulCastCount ?? 0;
        const remain = Math.max(0, 5 - count);
        note = remain === 0 ? " (다음 행동: 50 피해!)" : ` (50피해까지 ${remain}턴)`;
      }

      const intentRow = p(`의도: ${intent.label}${note}`);
      intentRow.style.opacity = g.intentsRevealedThisTurn ? "1" : "0.9";
      box.appendChild(intentRow);

      const btn = document.createElement("button");
      btn.textContent = canBeTargeted ? "이 적을 대상으로 선택" : "대상 선택";
      btn.disabled = !canBeTargeted;
      btn.onclick = () => actions.onSelectEnemy(i);
      box.appendChild(btn);

      left.appendChild(box);
    });
  }

  // ===== RIGHT: 진행 =====
  right.appendChild(h2("진행"));

  // ✅ 현재 단계 표시 (유저가 “지금 뭘 해야 하는지” 확인 가능)
  const phaseLabel = phaseToKorean(g.phase);
  const phaseInfo = div("banner banner-phase");
  phaseInfo.textContent = `현재 단계: ${phaseLabel} (${g.phase})`;
  phaseInfo.style.marginBottom = "10px";
  phaseInfo.style.padding = "8px";
  phaseInfo.style.borderRadius = "8px";
  phaseInfo.style.border = "1px solid rgba(255,255,255,0.10)";
  phaseInfo.style.background = "rgba(255,255,255,0.04)";
  right.appendChild(phaseInfo);

  // ✅ 타겟팅 배너(우측에도 크게)
  if (targeting) {
    const banner = div("banner banner-target");
    banner.textContent = `⚠ 대상 선택 필요 (남은 선택 ${remainingTargets}) — 왼쪽 적 패널에서 대상을 고르세요.`;
    banner.style.marginBottom = "10px";
    banner.style.fontWeight = "800";
    banner.style.padding = "10px";
    banner.style.borderRadius = "10px";
    banner.style.border = "1px solid rgba(255,200,80,0.8)";
    banner.style.background = "rgba(255,200,80,0.12)";
    right.appendChild(banner);
  }

  if (g.run.finished) {
    right.appendChild(p("런 종료"));
  } else if (g.phase === "NODE") {
    renderNodeSelect(right, g, actions);
  } else {
    renderCombat(right, g, actions, targeting);
  }

  // ===== Layout =====
  top.appendChild(left);
  top.appendChild(right);

  const bottom = div("panel");
  bottom.appendChild(h2("로그"));
  bottom.appendChild(logBox(g.log.join("\n")));

  app.appendChild(top);
  app.appendChild(bottom);
}

function statsRow(g: GameState) {
  const row = div("stats");
  row.appendChild(badge(`HP ${g.player.hp}/${g.player.maxHp}`));
  row.appendChild(badge(`블록 ${g.player.block}`));
  row.appendChild(badge(`S (보급) ${g.player.supplies}`));
  row.appendChild(badge(`F (피로도) ${g.player.fatigue}`));
  row.appendChild(badge(`이번 전투에서 보급 없이 종료 ${g.player.zeroSupplyTurns}회`));
  row.appendChild(badge(`이번 턴 사용한 카드의 수 ${g.usedThisTurn}`));
  row.appendChild(badge(`겪은 인카운터 ${g.run.nodePickCount}회`));
  return row;
}

function renderChoice(root: HTMLElement, g: GameState, actions: UIActions) {
  root.appendChild(h3(g.choice!.title));
  if (g.choice!.prompt) root.appendChild(p(g.choice!.prompt));

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

function renderNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {
  if (g.choice) {
    renderChoice(root, g, actions);
    return;
  }

  root.appendChild(
    p(`노드 ${g.run.nodePickCount} / 보물 ${g.run.treasureObtained ? "O" : "X"} / 보물 후 ${g.run.afterTreasureNodePicks}/10`)
  );

  const nextIndex = g.run.nodePickCount + 1;
  const isBossNode = nextIndex % 30 === 0;
  const isBossNext = (g.run.nodePickCount + 2) % 30 === 0;

  const offers = actions.getNodeOffers();
  const br = g.run.branchOffer;

  if (br) {
    root.appendChild(p(`전자 선택 시 다음 선택지: ${br.nextIfA.map((o) => nodeLabel(o.type, isBossNext)).join(" / ")}`));
    root.appendChild(p(`후자 선택 시 다음 선택지: ${br.nextIfB.map((o) => nodeLabel(o.type, isBossNext)).join(" / ")}`));
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

function renderCombat(root: HTMLElement, g: GameState, actions: UIActions, targeting: boolean) {
  if (g.choice) {
    renderChoice(root, g, actions);
    return;
  }

  // ===== 컨트롤 =====
  const controls = div("controls");

  controls.appendChild(
    button(
      "의도 공개(정찰)",
      actions.onRevealIntents,
      g.enemies.length === 0 || g.intentsRevealedThisTurn || g.phase !== "PLACE" || targeting
    )
  );

  controls.appendChild(
    button(
      "후열 카드 발동",
      actions.onResolveBack,
      !(g.phase === "PLACE" || g.phase === "BACK") || targeting
    )
  );

  controls.appendChild(
    button(
      "전열 카드 발동",
      actions.onResolveFront,
      g.phase !== "FRONT" || targeting
    )
  );

  controls.appendChild(
    button(
      "적 행동 진행",
      actions.onResolveEnemy,
      g.phase !== "ENEMY" || targeting
    )
  );

  controls.appendChild(
    button(
      "턴 정리(유지비/상태)",
      actions.onUpkeep,
      g.phase !== "UPKEEP" || targeting
    )
  );

  controls.appendChild(
    button(
      "드로우 후 다음 턴",
      actions.onDrawNextTurn,
      g.phase !== "DRAW" || targeting
    )
  );

  root.appendChild(controls);
  root.appendChild(hr());

  // ===== 슬롯 배치 피드백 =====
  const hasSelected = !!g.selectedHandCardUid;

  root.appendChild(h3("전열 슬롯 (3)"));
  const frontGrid = div("grid6");
  for (let i = 0; i < 3; i++) {
    const s = div("slot");
    s.appendChild(small(`전열 ${i + 1}`));

    if (hasSelected) {
      s.classList.add("placeable");
      s.style.outline = "2px solid rgba(120,200,255,0.25)";
      s.style.background = "rgba(120,200,255,0.06)";
    }

    const uid = g.frontSlots[i];
    if (uid) s.appendChild(renderCard(g, uid, false));

    s.onclick = () => actions.onPlaceSelected("front", i);
    frontGrid.appendChild(s);
  }
  root.appendChild(frontGrid);

  root.appendChild(h3("후열 슬롯 (3)"));
  const backGrid = div("grid6");
  for (let i = 0; i < 3; i++) {
    const disabled = !!g.backSlotDisabled[i];
    const s = div("slot" + (disabled ? " disabled" : ""));
    s.appendChild(small(`후열 ${i + 1}`));

    if (hasSelected && !disabled) {
      s.classList.add("placeable");
      s.style.outline = "2px solid rgba(120,200,255,0.25)";
      s.style.background = "rgba(120,200,255,0.06)";
    }

    const uid = g.backSlots[i];
    if (uid) s.appendChild(renderCard(g, uid, false));

    // ✅ disabled면 클릭 자체 막기 (UX 개선)
    if (!disabled) {
      s.onclick = () => actions.onPlaceSelected("back", i);
    } else {
      s.onclick = () => {};
      s.style.cursor = "not-allowed";
      s.style.opacity = "0.65";
    }

    backGrid.appendChild(s);
  }
  root.appendChild(backGrid);

  root.appendChild(hr());

  root.appendChild(h3(`손패 (${g.hand.length})`));
  const hand = div("hand");
  for (const c of g.hand) {
    hand.appendChild(renderCard(g, c, true, actions.onSelectHandCard));
  }
  root.appendChild(hand);

  const help = small("사용법: 손패 카드 클릭 → 슬롯 클릭 배치. 정찰/화살 등 선택 피해는 왼쪽 적 버튼 클릭.");
  help.style.display = "block";
  help.style.marginTop = "8px";
  root.appendChild(help);
}

function renderCard(g: GameState, cardUid: string, clickable: boolean, onClick?: (uid: string) => void) {
  const defId = g.cards[cardUid].defId;
  const def = g.content.cardsById[defId];

  const d = div("card");
  if (g.selectedHandCardUid === cardUid) d.classList.add("selected");
  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  d.appendChild(divText("cardTitle", def.name));

  const meta = div("cardMeta");
  if (def.tags?.includes("EXHAUST")) meta.appendChild(badge("소모"));
  if (def.tags?.includes("VANISH")) meta.appendChild(badge("소실"));
  d.appendChild(meta);

  const txt = divText("cardText", `전열: ${def.frontText}\n후열: ${def.backText}`);
  // ✅ 줄바꿈 표시
  txt.style.whiteSpace = "pre-line";
  d.appendChild(txt);

  if (clickable && onClick) {
    d.onclick = () => onClick(cardUid);
  }

  return d;
}

/** Phase label */
function phaseToKorean(phase: GameState["phase"]) {
  switch (phase) {
    case "NODE":
      return "노드 선택";
    case "PLACE":
      return "배치/준비";
    case "BACK":
      return "후열 발동";
    case "FRONT":
      return "전열 발동";
    case "ENEMY":
      return "적 행동";
    case "UPKEEP":
      return "유지비/상태 처리";
    case "DRAW":
      return "드로우/턴 시작";
    default:
      return "진행";
  }
}

/** DOM helpers */
function div(className: string) {
  const e = document.createElement("div");
  e.className = className;
  return e;
}
function divText(className: string, text: string) {
  const e = document.createElement("div");
  e.className = className;
  e.textContent = text;
  return e;
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
  const e = document.createElement("div");
  e.textContent = text;
  e.style.fontSize = "12px";
  e.style.lineHeight = "1.35";
  return e;
}
function small(text: string) {
  const e = document.createElement("small");
  e.textContent = text;
  return e;
}
function badge(text: string) {
  const e = document.createElement("span");
  e.className = "badge";
  e.textContent = text;
  return e;
}
function hr() {
  const e = document.createElement("div");
  e.className = "hr";
  return e;
}
function logBox(text: string) {
  const e = document.createElement("div");
  e.className = "log";
  e.textContent = text;
  return e;
}
function button(label: string, onClick: () => void, disabled: boolean) {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

export type UIActions = {
  getNodeOffers: () => NodeOffer[];
  onChooseNode: (id: "A" | "B") => void;

  onSelectHandCard: (uid: string) => void;
  onPlaceSelected: (side: "front" | "back", idx: number) => void;

  onRevealIntents: () => void;
  onResolveBack: () => void;
  onResolveFront: () => void;
  onResolveEnemy: () => void;
  onUpkeep: () => void;
  onDrawNextTurn: () => void;
  onFastPass: () => void;
  onViewPile: (pile: PileKind) => void;
  onChooseChoice: (key: string) => void;
  onNewRun: () => void;

  onSelectEnemy: (enemyIndex: number) => void;
};
