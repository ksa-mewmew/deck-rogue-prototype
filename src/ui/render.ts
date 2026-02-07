import type { GameState, NodeType, PileKind } from "../engine/types";

export function mountRoot(): HTMLDivElement {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";
  return app;
}

export function render(g: GameState, actions: UIActions) {
  const app = mountRoot();

  const top = div("row top");

  const left = div("panel");
  const header = div("row");
  header.appendChild(h2("상태"));
  header.appendChild(button("새 런 시작", actions.onNewRun, false));
  left.appendChild(header);
  left.appendChild(statsRow(g));

  left.appendChild(hr());

  left.appendChild(h3("플레이어 상태"));
  left.appendChild(
    p(`취약 ${g.player.status.vuln} / 약화 ${g.player.status.weak} / 출혈 ${g.player.status.bleed} / 교란 ${g.player.status.disrupt}`)
  );

  const pileControls = div("controls");
  pileControls.appendChild(button("덱 보기", () => actions.onViewPile("deck"), false));
  pileControls.appendChild(button("버림 보기", () => actions.onViewPile("discard"), false));
  pileControls.appendChild(button("소모 보기", () => actions.onViewPile("exhausted"), false));
  pileControls.appendChild(button("소실 보기", () => actions.onViewPile("vanished"), false));
  pileControls.appendChild(button("손패 보기", () => actions.onViewPile("hand"), false));
  left.appendChild(pileControls);

  left.appendChild(hr());

  left.appendChild(h3("적"));
  if (g.enemies.length === 0) {
    left.appendChild(p("현재 전투 없음"));
  } else {
    g.enemies.forEach((e, i) => {
      const box = div("");
      box.style.display = "grid";
      box.style.gap = "6px";
      box.style.padding = "6px 0";

      const sameNameCount = g.enemies.filter(x => x.name === e.name).length;
      const label = sameNameCount >= 2 ? `${e.name} #${i+1}` : e.name;
      const title = p(`${i}. ${label} (HP ${e.hp}/${e.maxHp})`);
      title.style.fontWeight = "700";
      box.appendChild(title);

      box.appendChild(p(`취약 ${e.status.vuln} / 약화 ${e.status.weak} / 출혈 ${e.status.bleed} / 교란 ${e.status.disrupt}`));

      // ✅ 적 의도 표시
      const def = g.content.enemiesById[e.id];
      const intent = def.intents[e.intentIndex % def.intents.length];

      let note = "";
      if (e.id === "boss_soul_stealer") {
        const count = (e.soulCastCount ?? 0);
        const remain = Math.max(0, 5 - count);
        note = remain === 0 ? " (다음 행동: 50 피해!)" : ` (50피해까지 ${remain}턴)`;
      }

      box.appendChild(p(`의도: ${intent.label}${note}`));

      const btn = document.createElement("button");
      btn.textContent = "이 적을 대상으로 선택";
      btn.disabled = !g.pendingTarget || e.hp <= 0;
      btn.onclick = () => actions.onSelectEnemy(i);
      box.appendChild(btn);

      left.appendChild(box);
    });
  }

  const right = div("panel");
  right.appendChild(h2("진행"));

  if (g.run.finished) {
    right.appendChild(p("런 종료"));
  } else if (g.phase === "NODE") {
    renderNodeSelect(right, g, actions);
  } else {
    renderCombat(right, g, actions);
  }

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
  row.appendChild(badge(`S ${g.player.supplies}`));
  row.appendChild(badge(`F ${g.player.fatigue}`));
  row.appendChild(badge(`S=0 종료 ${g.player.zeroSupplyTurns}회`));
  row.appendChild(badge(`페이즈 ${g.phase}`));
  row.appendChild(badge(`이번 턴 사용 ${g.usedThisTurn}`));
  row.appendChild(badge(`인카운터 ${g.run.nodePickCount}회`));
  row.appendChild(
    badge(
      `전투 ${g.run.nodePickByType.BATTLE} / 휴식 ${g.run.nodePickByType.REST} / 이벤트 ${g.run.nodePickByType.EVENT} / 보물 ${g.run.nodePickByType.TREASURE}`
    )
  );
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

function renderNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {

  if (g.choice) {
    renderChoice(root, g, actions);
    return;
  }

  root.appendChild(
    p(`인카운터 ${g.run.nodePickCount} / 보물 ${g.run.treasureObtained ? "O" : "X"} / 보물 후 ${g.run.afterTreasureNodePicks}/10`)
  );

  const row = div("controls");

  const offers = actions.getNodeOffers();

  // 현재/다음/다다음이 보스 노드인지(노드 번호 기준)
  const isBossNow = ((g.run.nodePickCount + 1) % 30 === 0);
  const isBossNext = ((g.run.nodePickCount + 2) % 30 === 0);
  const isBossNext2 = ((g.run.nodePickCount + 3) % 30 === 0);

  for (const t of offers) {
    const b = document.createElement("button");
    b.className = "primary";
    b.textContent = nodeLabel(t, isBossNow);
    b.onclick = () => actions.onChooseNode(t);
    row.appendChild(b);
  }

  root.appendChild(row);

  // ✅ 미리보기(노드 오퍼 큐를 쓰는 경우)
  const q = (g.run as any).nodeOfferQueue as NodeType[][] | undefined;
  const preview1 = q?.[1];
  const preview2 = q?.[2];

  if (preview1) root.appendChild(p(`다음 선택지: ${preview1.map(x => nodeLabel(x, isBossNext)).join(" / ")}`));
  if (preview2) root.appendChild(p(`다다음 선택지: ${preview2.map(x => nodeLabel(x, isBossNext2)).join(" / ")}`));

  function nodeLabel(t: NodeType, isBossNode: boolean) {
    if (t === "BATTLE") return isBossNode ? "보스" : "전투";
    if (t === "REST") return "휴식";
    if (t === "EVENT") return "이벤트";
    return "저주받은 보물";
  }

  root.appendChild(row);
}

function renderCombat(root: HTMLElement, g: GameState, actions: UIActions) {

  const targeting = !!g.pendingTarget || (g.pendingTargetQueue?.length ?? 0) > 0;

  if (g.choice) {
    renderChoice(root, g, actions);
    return;
  }

  if (targeting) {
    root.appendChild(p(`대상 선택 중… (남은 선택 ${g.pendingTargetQueue.length} )`));
  }
  const controls = div("controls");

  controls.appendChild(
    button(
      "의도 공개",
      actions.onRevealIntents,
      g.enemies.length === 0 || g.intentsRevealedThisTurn || g.phase !== "PLACE" || targeting
    )
  );

  controls.appendChild(button("후열 발동", actions.onResolveBack,
    !(g.phase === "PLACE" || g.phase === "BACK") || targeting
  ));

  controls.appendChild(button("전열 발동", actions.onResolveFront,
    g.phase !== "FRONT" || targeting
  ));

  controls.appendChild(button("적 행동", actions.onResolveEnemy,
    g.phase !== "ENEMY" || targeting
  ));

  controls.appendChild(button("유지비/상태", actions.onUpkeep,
    g.phase !== "UPKEEP" || targeting
  ));

  controls.appendChild(button("드로우/다음 턴", actions.onDrawNextTurn,
    g.phase !== "DRAW" || targeting
  ));

  controls.appendChild(button("강제 패스(배치 안 함)", actions.onFastPass,
    g.phase !== "PLACE" || targeting
  ));
  root.appendChild(controls);
  root.appendChild(hr());

  root.appendChild(h3("전열 슬롯 (3)"));
  const frontGrid = div("grid6");
  for (let i = 0; i < 3; i++) {
    const s = div("slot");
    s.appendChild(small(`전열 ${i}`));
    const uid = g.frontSlots[i];
    if (uid) s.appendChild(renderCard(g, uid, false));
    s.onclick = () => actions.onPlaceSelected("front", i);
    frontGrid.appendChild(s);
  }
  root.appendChild(frontGrid);

  root.appendChild(h3("후열 슬롯 (3)"));
  const backGrid = div("grid6");
  for (let i = 0; i < 3; i++) {
    const s = div("slot" + (g.backSlotDisabled[i] ? " disabled" : ""));
    s.appendChild(small(`후열 ${i}`));
    const uid = g.backSlots[i];
    if (uid) s.appendChild(renderCard(g, uid, false));
    s.onclick = () => actions.onPlaceSelected("back", i);
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

  root.appendChild(small("사용법: 손패 카드 클릭 → 슬롯 클릭 배치. 정찰/화살 등 선택 피해는 적 버튼 클릭."));
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

  d.appendChild(divText("cardText", `전열: ${def.frontText}\n후열: ${def.backText}`));

  if (clickable && onClick) {
    d.onclick = () => onClick(cardUid);
  }

  return d;
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
  getNodeOffers: () => Array<"BATTLE" | "REST" | "EVENT" | "TREASURE">;
  onChooseNode: (t: "BATTLE" | "REST" | "EVENT" | "TREASURE") => void;

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
