import type { GameState, PileKind } from "../../engine/types";
import { displayCardTextPair } from "../../engine/cardText";
import { RULEBOOK_TEXT } from "../texts";
import { button, div, h3 } from "../dom";

export type Overlay =
  | { kind: "RULEBOOK" }
  | { kind: "PILE"; pile: PileKind }
  | { kind: "SETTINGS" };

export function renderOverlayLayer(
  g: GameState,
  overlay: Overlay | null,
  actions: any,
  deps: {
    renderSettingsPanel: (onChange: () => void, actions: any) => HTMLElement;
    onAfterSettingsChange: () => void;
    renderRealCardForOverlay: (g: GameState, uid: string, onPick?: (uid: string) => void) => HTMLElement;
    getCardDefByUid: (g: GameState, uid: string) => any;
    displayNameForUid: (g: GameState, uid: string) => string;
  }
) {
  document.querySelector(".overlay-layer")?.remove();
  if (!overlay) return;

  const isFull = overlay.kind === "SETTINGS";

  const layer = div("overlay-layer");
  layer.style.cssText = isFull
    ? "position:fixed; inset:0;" +
      "background:rgba(0,0,0,1);" +
      "display:flex; justify-content:center; align-items:flex-start;" +
      "padding:calc(24 * var(--u)); box-sizing:border-box;"
    : "position:fixed; inset:0;" +
      "background:rgba(0,0,0,.55);" +
      "display:flex; justify-content:center; align-items:center;";

  layer.onclick = (e) => {
    if (e.target === layer) actions.onCloseOverlay?.();
  };

  const panel = div("overlay-panel");
  panel.style.cssText = isFull
    ? "width:min(calc(860 * var(--u)), 96vw); max-height:calc(100vh - calc(48 * var(--u))); overflow:auto;" +
      "padding:calc(16 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.12); border-radius:calc(16 * var(--u));" +
      "background:rgba(15,18,22,1); box-shadow:0 calc(18 * var(--u)) calc(60 * var(--u)) rgba(0,0,0,.45);"
    : "width:min(calc(980 * var(--u)), 92vw); max-height:80vh; overflow:auto; padding:calc(16 * var(--u));" +
      "border:calc(1 * var(--u)) solid rgba(255,255,255,.12); border-radius:calc(16 * var(--u));" +
      "background:rgba(15,18,22,.92); box-shadow:0 calc(18 * var(--u)) calc(60 * var(--u)) rgba(0,0,0,.45);";
  panel.onclick = (e) => e.stopPropagation();

  const title =
    overlay.kind === "RULEBOOK"
      ? "룰북"
      : overlay.kind === "SETTINGS"
      ? "설정"
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
    "display:flex; align-items:center; justify-content:space-between; gap:calc(12 * var(--u)); position:sticky; top:0; padding-bottom:calc(12 * var(--u)); margin-bottom:calc(12 * var(--u)); background:rgba(15,18,22,.92);";

  const h = h3(title);
  h.classList.add("overlayTitle");

  const closeBtn = button("닫기", () => actions.onCloseOverlay?.());
  closeBtn.classList.add("overlayClose");
  closeBtn.style.cssText =
    "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16); background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";

  header.appendChild(h);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (overlay.kind === "RULEBOOK") {
    const pre = document.createElement("pre");
    pre.className = "rulebook";
    pre.textContent = RULEBOOK_TEXT;
    pre.style.cssText =
      "white-space:pre-wrap; line-height:1.45; font-size:calc(13 * var(--u)); margin:0; padding:calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.10); background:rgba(0,0,0,.18);";
    panel.appendChild(pre);
  } else if (overlay.kind === "SETTINGS") {
    panel.appendChild(
      deps.renderSettingsPanel(() => {
        deps.onAfterSettingsChange();
        actions.rerender?.();
      }, actions)
    );
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
      const na = deps.displayNameForUid(g, a);
      const nb = deps.displayNameForUid(g, b);
      return na.localeCompare(nb, "ko");
    });

    const wrap = div("pileView");
    wrap.style.cssText =
      "display:grid;" +
      "grid-template-columns: 1fr calc(320 * var(--u));" +
      "gap:calc(16 * var(--u));" +
      "align-items:start;";

    const grid = div("pileGrid");
    grid.style.cssText =
      "display:grid;" +
      "grid-template-columns: repeat(auto-fill, minmax(var(--handCardW), 1fr));" +
      "gap:calc(10 * var(--u));" +
      "align-content:start;" +
      "min-width:0;" +
      "max-height: 62vh;" +
      "overflow-y: auto;" +
      "overflow-x: hidden;";

    const side = div("pileSide");
    side.style.cssText =
      "position:sticky; top:calc(72 * var(--u));" +
      "align-self:start;" +
      "border:calc(1 * var(--u)) solid rgba(255,255,255,.10);" +
      "border-radius:calc(14 * var(--u));" +
      "padding:calc(12 * var(--u));" +
      "background:rgba(0,0,0,.22);";

    const sideTitle = div("pileSideTitle");
    sideTitle.style.cssText = "font-weight:800; margin:0 0 calc(10 * var(--u)) 0; opacity:.95;";
    side.appendChild(sideTitle);

    const previewBox = div("pilePreviewBox");
    previewBox.style.cssText =
      "display:flex; justify-content:center; align-items:flex-start;" +
      "padding:calc(8 * var(--u)) 0 calc(10 * var(--u)) 0;";
    side.appendChild(previewBox);

    const sidePre = document.createElement("pre");
    sidePre.className = "pileSideDetail";
    sidePre.style.cssText =
      "margin:0;" +
      "padding:calc(10 * var(--u));" +
      "white-space:pre-wrap;" +
      "border-radius:calc(12 * var(--u));" +
      "border:calc(1 * var(--u)) solid rgba(255,255,255,.10);" +
      "background:rgba(0,0,0,.20);" +
      "font-size:calc(12 * var(--u));" +
      "line-height:1.45;";
    side.appendChild(sidePre);

    let selectedUid: string | null = sortedUids[0] ?? null;

    const renderSide = () => {
      previewBox.innerHTML = "";
      if (!selectedUid) {
        sideTitle.textContent = "선택된 카드 없음";
        sidePre.textContent = "";
        return;
      }
      const def = deps.getCardDefByUid(g, selectedUid);
      const name = deps.displayNameForUid(g, selectedUid);
      const t = displayCardTextPair(g, def.frontText, def.backText, selectedUid);
      sideTitle.textContent = name;
      previewBox.appendChild(deps.renderRealCardForOverlay(g, selectedUid));
      sidePre.textContent = `전열: ${t.frontText}\n후열: ${t.backText}`;
    };

    if (sortedUids.length === 0) {
      const empty = div("overlayEmpty");
      empty.textContent = "비어 있음";
      empty.style.cssText =
        "padding:calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.10); background:rgba(255,255,255,.03);";
      grid.appendChild(empty);
    } else {
      for (const uid of sortedUids) {
        const thumb = deps.renderRealCardForOverlay(g, uid, (picked) => {
          selectedUid = picked;
          grid.querySelectorAll(".pileSelected").forEach((el) => el.classList.remove("pileSelected"));
          thumb.classList.add("pileSelected");
          renderSide();
        });
        thumb.style.width = "var(--handCardW)";
        thumb.style.height = "var(--handCardH)";
        thumb.style.boxSizing = "border-box";
        thumb.style.cursor = "pointer";
        if (uid === selectedUid) thumb.classList.add("pileSelected");
        grid.appendChild(thumb);
      }
    }

    wrap.appendChild(grid);
    wrap.appendChild(side);
    panel.appendChild(wrap);
    renderSide();
  }

  layer.appendChild(panel);
  document.body.appendChild(layer);
}
