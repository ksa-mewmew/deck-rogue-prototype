import type { GameState, IntentCategory, IntentPreview, PileKind } from "../../engine/types";
import { isTargeting } from "../../engine/combat";
import { buildIntentPreview } from "../../engine/intentPreview";
import { ensureFaith } from "../../engine/faith";
import { assetUrl, ensureFaithTip, hideFaithTip, moveFaithTip, showFaithTipAt } from "../assets";
import { div, divText } from "../dom";

export type TopHudActions = {
  onViewPile: (pile: PileKind) => void;
  onSelectEnemy: (index: number) => void;
  onNewRun: () => void;
  onViewRulebook: () => void;
  onToggleLogOverlay: () => void;
  onViewSettings: () => void;
};

function mkButton(label: string, onClick: () => void, arg?: string | boolean) {
  const b = document.createElement("button");
  if (typeof arg === "string" && arg) b.className = arg;
  if (typeof arg === "boolean") b.disabled = arg;
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

function badge(text: string) {
  const s = document.createElement("span");
  s.className = "badge";
  s.textContent = text;
  return s;
}

function enemyArtUrl(enemyId: string) {
  return assetUrl(`assets/enemies/${enemyId}.png`);
}

const EFFECT_ICON: Record<string, string> = {
  vuln: "🎯",
  weak: "🥀",
  bleed: "🩸",
  disrupt: "🌀",
  immune: "✨",
  supplies: "🍞",
  fatigue: "💤",
  slash: "🗡️",
};

type EnemyState = GameState["enemies"][number];

function renderStatusEmojiRow(st: any, immuneThisTurn?: boolean) {
  const row = div("enemyStatusEmojiRow");

  const add = (key: string, n: number) => {
    if (!n || n <= 0) return;
    const s = document.createElement("span");
    s.className = "stEmoji";
    s.textContent = `${EFFECT_ICON[key] ?? "?"}${n}`;
    row.appendChild(s);
  };

  add("vuln", st?.vuln ?? 0);
  add("weak", st?.weak ?? 0);
  add("bleed", st?.bleed ?? 0);
  add("disrupt", st?.disrupt ?? 0);
  add("slash", st?.slash ?? 0);

  if (immuneThisTurn) {
    const s = document.createElement("span");
    s.className = "stEmoji";
    s.textContent = `${EFFECT_ICON.immune}1`;
    row.appendChild(s);
  }

  return row;
}

function isAttackCat(cat: IntentCategory) {
  return cat === "ATTACK" || cat === "ATTACK_BUFF" || cat === "ATTACK_DEBUFF";
}

function computeIntentDamageText(g: GameState, e: EnemyState, pv: IntentPreview | any): string {
  if (!pv) return "";
  if (!isAttackCat((pv as any).cat as any)) return "";

  const hits = Math.max(1, Number((pv as any).hits ?? 1) || 1);
  const per = Math.max(0, Number((pv as any).perHit ?? 0) || 0);
  const total = Math.max(0, Number((pv as any).dmgTotal ?? (per * hits)) || 0);

  if (hits > 1) {
    if (per <= 0) return `${total} (${hits}타)`;

    const baseTotal = per * hits;

    if (total === baseTotal) return `${total} (${per}x${hits})`;

    const blk = Math.max(0, Number(g.player?.block ?? 0) || 0);
    if (blk > 0) {
      let b = blk;
      const afterHits: number[] = [];
      for (let i = 0; i < hits; i++) {
        const used = Math.min(b, per);
        b -= used;
        afterHits.push(per - used);
      }
      const afterTotal = afterHits.reduce((s, x) => s + x, 0);

      if (afterTotal === total) {
        const allSame = afterHits.every((x) => x === afterHits[0]);
        if (allSame) return `${total} (${afterHits[0]}x${hits})`;
        return `${total} (${afterHits.join("+")})`;
      }
    }

    return `${total} (${per}x${hits})`;
  }

  return `${total}`;
}

function computeIntentIconFromPreview(pv: IntentPreview | any): string {
  if (!pv) return "?";

  const isAttack = isAttackCat((pv as any).cat as any);

  const applies = ((pv as any).applies ?? []) as Array<{ target: "player" | "enemy"; kind: string; amount: number }>;
  const hasDebuff = applies.some((a) => a.target === "player");
  const hasBuff = applies.some((a) => a.target === "enemy");

  let out = "";
  if (isAttack) out += "🗡️";
  if (hasDebuff) out += "🌀";
  if (hasBuff) out += "✨";

  if (!out) {
    const cat = (pv as any).cat as IntentCategory | undefined;
    if (cat === "DEFEND") return "🛡️";
    if (cat === "BUFF") return "✨";
    if (cat === "DEBUFF") return "🌀";
    return "?";
  }
  return out;
}

export function renderTopHud(g: GameState, actions: TopHudActions) {
  document.querySelectorAll(".topHud").forEach((el) => el.remove());
  document.querySelectorAll(".enemyHudCenter").forEach((el) => el.remove());

  const isMobile = document.body.classList.contains("mobile");
  const isPortrait = document.body.classList.contains("portrait");
  const mobilePortrait = isMobile && isPortrait;

  const top = div("topHud");
  top.appendChild(div("topHudLeftSpacer"));

  const left = div("playerHudLeft");

  const titleRow = div("playerTitleRow");
  titleRow.appendChild(divText("playerHudTitle", "플레이어"));

  if (!mobilePortrait) {
    const piles = div("pileButtons");
    piles.appendChild(mkButton("덱", () => actions.onViewPile("deck")));
    piles.appendChild(mkButton("버림", () => actions.onViewPile("discard")));
    piles.appendChild(mkButton("손패", () => actions.onViewPile("hand")));
    piles.appendChild(mkButton("소모", () => actions.onViewPile("exhausted")));
    piles.appendChild(mkButton("소실", () => actions.onViewPile("vanished")));
    titleRow.appendChild(piles);
  }

  left.appendChild(titleRow);

  const pbox = div("enemyChip");
  pbox.classList.add("playerHudBox");

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
  blFill.style.background = "#2a7cff";
  blFill.style.width = `${Math.max(0, Math.min(100, (g.player.block / Math.max(1, g.player.maxHp)) * 100))}%`;
  blOuter.appendChild(blFill);
  pbox.appendChild(blOuter);

  const pst = g.player.status;
  const pBadges = div("enemyBadges");
  pbox.appendChild(pBadges);

  const pBadgeList: string[] = [];
  if ((pst.vuln ?? 0) > 0) pBadgeList.push(`취약 ${pst.vuln}`);
  if ((pst.weak ?? 0) > 0) pBadgeList.push(`약화 ${pst.weak}`);
  if ((pst.bleed ?? 0) > 0) pBadgeList.push(`출혈 ${pst.bleed}`);
  if ((pst.disrupt ?? 0) > 0) pBadgeList.push(`교란 ${pst.disrupt}`);
  if ((pst.slash ?? 0) > 0) pBadgeList.push(`칼부림 ${pst.slash}`);

  for (const t of pBadgeList) pBadges.appendChild(badge(t));

  left.appendChild(pbox);

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  if (inCombat) {
    const center = div(mobilePortrait ? "mobileEnemyStrip" : "enemyHudCenter");
    center.dataset.enemyCount = String(g.enemies.length);
    if (g.enemies.length === 2) center.classList.add("enemyCount2");
    if (g.enemies.length === 3) center.classList.add("enemyCount3");
    const mover = div("enemyHudCenterMover");
    const enemiesWrap = div("enemyHud");

    enemiesWrap.style.cssText = `
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      justify-content: center;
      align-items: stretch;
      gap: calc(14 * var(--u));
      overflow: visible;
      white-space: nowrap;
    `;
    center.style.overflow = "visible";
    mover.style.overflow = "visible";
    mover.style.width = "max-content";

    const targeting = isTargeting(g);

    mover.appendChild(enemiesWrap);
    center.appendChild(mover);
    if (mobilePortrait) top.appendChild(center);
    else document.body.appendChild(center);

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      const banner = div("enemyBanner enemyCardWrap");

      let untargetable = false;
      if (targeting && e.hp > 0) {
        const req: any = (g as any).pendingTarget ?? null;
        const isDmgSelect = req?.kind === "damageSelect";
        if (isDmgSelect && e.id === "goblin_assassin") {
          const alive = g.enemies.filter((x) => (x as any).hp > 0);
          const rank = alive.indexOf(e) + 1;
          if (rank === 2 || rank === 3) untargetable = true;
        }
      }

      if (targeting && e.hp > 0 && !untargetable) banner.classList.add("targetable");
      if (untargetable) banner.classList.add("untargetable");

      const toggleEnemyDetail = () => {
        const alreadyOpen = banner.classList.contains("touchHover");
        document.querySelectorAll(".enemyBanner.touchHover").forEach((el) => el.classList.remove("touchHover"));
        if (!alreadyOpen) banner.classList.add("touchHover");
      };
      let skipNextClick = false;

      banner.addEventListener(
        "pointerdown",
        (ev) => {
          const pe = ev as PointerEvent;
          if (pe.pointerType !== "touch") return;
          if (targeting) return;
          toggleEnemyDetail();
          skipNextClick = true;
          ev.preventDefault();
          ev.stopPropagation();
        },
        { passive: false }
      );

      banner.addEventListener("pointerenter", (ev) => {
        const pe = ev as PointerEvent;
        if (pe.pointerType === "touch") return;
        banner.classList.add("touchHover");
      });

      banner.addEventListener("pointerleave", (ev) => {
        const pe = ev as PointerEvent;
        if (pe.pointerType === "touch") return;
        banner.classList.remove("touchHover");
      });

      banner.addEventListener(
        "pointerup",
        (ev) => {
          const pe = ev as PointerEvent;
          if (pe.pointerType !== "touch") return;
          if (targeting) {
            actions.onSelectEnemy(i);
            return;
          }
          toggleEnemyDetail();
          skipNextClick = true;
          ev.preventDefault();
          ev.stopPropagation();
        },
        { passive: false }
      );

      banner.onclick = (ev) => {
        if (skipNextClick) {
          skipNextClick = false;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (targeting) {
          actions.onSelectEnemy(i);
          return;
        }
        toggleEnemyDetail();
        ev.preventDefault();
        ev.stopPropagation();
      };

      const artWrap = div("enemyArtWrap");
      const artCard = div("enemyArtCard");

      artWrap.style.setProperty("--frameImg", `url("${assetUrl("assets/enemies/enemies_frame.png")}")`);
      artWrap.style.setProperty("--artImg", `url("${enemyArtUrl(e.id)}")`);
      artWrap.appendChild(artCard);

      const mini = div("enemyMiniHud");

      const def = g.content.enemiesById[e.id];
      const intent = def.intents[e.intentIndex % def.intents.length];
      const label = e.intentLabelOverride ?? intent.label;

      const pv = g.intentsRevealedThisTurn ? buildIntentPreview(g, e, intent, { includeBlock: false }) : null;

      const topRow = div("enemyIntentTopRow");

      let icon = "？";
      let dmgText = "";

      if (g.intentsRevealedThisTurn && pv) {
        icon = computeIntentIconFromPreview(pv);
        dmgText = computeIntentDamageText(g, e, pv) ?? "";
      } else {
        icon = "？";
        dmgText = "";
      }

      topRow.appendChild(divText("enemyIntentIcon", icon));
      topRow.appendChild(divText("enemyIntentDmg", dmgText));

      mini.appendChild(topRow);

      const passivesMini = (def as any).passives as any[] | undefined;
      if (passivesMini && passivesMini.length) {
        const prow = div("enemyPassiveRow");
        for (const p of passivesMini.slice(0, 4)) {
          const ic = divText("enemyPassiveIcon", String(p.icon ?? "Ⓟ"));
          prow.appendChild(ic);
        }
        mini.appendChild(prow);
      }

      const hpLine = div("enemyHpLine");
      hpLine.appendChild(divText("enemyHpText", `HP ${e.hp}/${e.maxHp}`));

      const hpOuter = div("enemyHPOuter");
      const hpFill = div("enemyHPFill");
      hpFill.style.width = `${Math.max(0, Math.min(100, (e.hp / Math.max(1, e.maxHp)) * 100))}%`;
      hpOuter.appendChild(hpFill);
      hpLine.appendChild(hpOuter);
      mini.appendChild(hpLine);

      mini.appendChild(renderStatusEmojiRow(e.status, e.immuneThisTurn));

      const hover = div("enemyHoverDetail");
      const st = e.status;
      const lines: string[] = [];
      if ((st.vuln ?? 0) > 0) lines.push(`취약 ${st.vuln}`);
      if ((st.weak ?? 0) > 0) lines.push(`약화 ${st.weak}`);
      if ((st.bleed ?? 0) > 0) lines.push(`출혈 ${st.bleed}`);
      if ((st.disrupt ?? 0) > 0) lines.push(`교란 ${st.disrupt}`);
      if (e.immuneThisTurn) lines.push("면역");

      const passiveLines: string[] = [];
      const passives = (def as any).passives as any[] | undefined;
      if (passives && passives.length) {
        for (const p of passives) {
          passiveLines.push(`${String(p.icon ?? "Ⓟ")} ${String(p.name ?? "패시브")}: ${String(p.text ?? "")}`);
        }
      }

      hover.textContent =
        g.enemies[i].name + "\n\n" +
        (passiveLines.length ? `패시브:\n${passiveLines.join("\n")}\n\n` : "") +
        `의도: ${label}\n\n` +
        (lines.length ? `상태: ${lines.join(", ")}` : "상태: 없음");

      banner.appendChild(artWrap);
      banner.appendChild(mini);
      banner.appendChild(hover);

      enemiesWrap.appendChild(banner);
    }
  }

  top.appendChild(left);

  if (mobilePortrait) {
    const enemyLeft = div("mobileEnemyLeftBtn");
    enemyLeft.appendChild(mkButton("새 런", () => actions.onNewRun()));
    top.appendChild(enemyLeft);

    const enemyRight = div("mobileEnemyRightChrome");
    enemyRight.appendChild(mkButton("룰북", () => actions.onViewRulebook()));
    enemyRight.appendChild(mkButton("로그", () => actions.onToggleLogOverlay()));
    enemyRight.appendChild(mkButton("설정", () => actions.onViewSettings()));
    top.appendChild(enemyRight);

    const right = div("mobileActionPanel");

    const piles = div("mobilePileButtons");
    piles.appendChild(mkButton("덱", () => actions.onViewPile("deck")));
    piles.appendChild(mkButton("버림", () => actions.onViewPile("discard")));
    piles.appendChild(mkButton("손패", () => actions.onViewPile("hand")));
    piles.appendChild(mkButton("소모", () => actions.onViewPile("exhausted")));
    piles.appendChild(mkButton("소실", () => actions.onViewPile("vanished")));
    right.appendChild(piles);

    const runRow = div("mobileRunButtons");

    const f = ensureFaith(g);
    const o0 = f.offered?.[0];
    const o1 = f.offered?.[1];
    const o2 = f.offered?.[2];
    const a = o0 ? (f.points[o0] ?? 0) : 0;
    const b = o1 ? (f.points[o1] ?? 0) : 0;
    const c = o2 ? (f.points[o2] ?? 0) : 0;
    const label = o0 && o1 && o2 ? `신앙 점수 ${a}·${b}·${c}` : "신앙 점수";
    const faithBtn = mkButton(label, () => {
      const tip = ensureFaithTip();
      if (tip.classList.contains("show")) {
        hideFaithTip();
        return;
      }
      const r = faithBtn.getBoundingClientRect();
      showFaithTipAt(g, r.left + r.width / 2, r.top + r.height / 2);
    });
    faithBtn.addEventListener("pointerenter", (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType === "touch") return;
      showFaithTipAt(g, pe.clientX, pe.clientY);
    });
    faithBtn.addEventListener(
      "pointermove",
      (ev) => {
        const pe = ev as PointerEvent;
        if (pe.pointerType === "touch") return;
        moveFaithTip(pe.clientX, pe.clientY);
      },
      { passive: true }
    );
    faithBtn.addEventListener("pointerleave", (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType === "touch") return;
      hideFaithTip();
    });
    runRow.appendChild(faithBtn);

    right.appendChild(runRow);

    const row = div("mobileHudRow");
    row.appendChild(left);
    row.appendChild(right);

    top.appendChild(row);
  }

  return top;
}

export function renderTopRightChrome(g: GameState, actions: TopHudActions) {
  void g;
  document.querySelector(".topHudRightChrome")?.remove();

  const right = div("topHudRight");
  right.classList.add("topHudRightChrome");
  (right.style as any).zIndex = "var(--zDevConsole)";

  right.appendChild(mkButton("룰북", () => actions.onViewRulebook()));
  right.appendChild(mkButton("로그", () => actions.onToggleLogOverlay()));
  right.appendChild(mkButton("설정", () => actions.onViewSettings()));

  document.body.appendChild(right);
}
