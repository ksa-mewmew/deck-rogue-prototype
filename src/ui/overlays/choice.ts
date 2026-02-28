import type { GameState, GodId } from "../../engine/types";
import type { UIActions } from "../ui";
import { ensureFaith, godAbilityBlock, godArt, godName } from "../../engine/faith";
import { getItemDefById } from "../../content/items";
import { assetUrl, wireItemHover } from "../assets";

function div(cls: string) {
  const e = document.createElement("div");
  e.className = cls;
  return e;
}

function divText(cls: string, text: string) {
  const e = div(cls);
  e.textContent = text;
  return e;
}

function el(tag: string, cls: string) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function h2(text: string) {
  const e = document.createElement("h2");
  e.textContent = text;
  return e;
}

function p(text: string) {
  const e = document.createElement("p");
  e.textContent = text;
  return e;
}

function button(text: string, onClick: () => void, disabled: boolean) {
  const e = document.createElement("button");
  e.type = "button";
  e.className = "uiBtn";
  e.textContent = text;
  e.disabled = disabled;
  e.onclick = onClick;
  return e;
}

export function renderChoiceLayer(
  g: GameState,
  actions: UIActions,
  deps: {
    renderCard: (g: GameState, uid: string, clickable?: boolean, onPick?: (uid: string) => void, opt?: any) => HTMLElement;
    renderCardPreviewByDef: (g: GameState, defId: string, upgrade: number) => HTMLElement;
    renderCardPreviewByUidWithUpgrade: (g: GameState, uid: string, upgrade: number) => HTMLElement;
    renderRealCardForOverlay: (g: GameState, uid: string, onPick?: (uid: string) => void) => HTMLElement;
    wireUpgradeHoverPreviewForChoice: (el: HTMLElement, g: GameState, defId: string, upgrade: number) => void;
  }
) {
  const SHOP_CHOICE_BODY_CLASS = "shopChoiceOpen";

  document.querySelector(".choice-overlay")?.remove();

  const c = g.choice;
  const main = document.querySelector<HTMLElement>(".mainPanel");
  if (!c) {
    main?.classList.remove("choiceOpen");
    document.body.classList.remove(SHOP_CHOICE_BODY_CLASS);
    return;
  }
  if (!main) {
    document.body.classList.remove(SHOP_CHOICE_BODY_CLASS);
    return;
  }
  main.classList.add("choiceOpen");


  const isShopChoice = (g.choiceCtx as any)?.kind === "SHOP";
  document.body.classList.toggle(SHOP_CHOICE_BODY_CLASS, isShopChoice);
  const CHOICE_DROP = 70;
  const PAD_TOP = 20 + CHOICE_DROP;
  const PAD_R = 36;
  const PAD_B = 16;
  const PAD_L = 16;

  const GAP_ROW  = isShopChoice ? 12 : 18;
  const GAP_LIST = 10;

  const ILLU_SIZE = isShopChoice ? 220 : 260;
  const ILLU_MIN  = isShopChoice ? 170 : 200;

  const ITEM_R   = 14;
  const ITEM_PAD = 12;

  const DETAIL_PAD  = 10;
  const DETAIL_R    = 12;
  const DETAIL_FS   = 12;
  const DETAIL_MAXH = 220;

  const TITLE_FS  = 22;
  const PROMPT_FS = 14;


  const overlayEl = div("choice-overlay");
  if (isShopChoice) overlayEl.classList.add("shopOverlay");
  overlayEl.style.cssText =
    "position:fixed; inset:0; z-index: var(--zChoice);" +
    "display:flex; justify-content:center; align-items:flex-start;" +
    "pointer-events:none;";


  const backdrop = div("choice-backdrop");
  backdrop.style.cssText =
    "position:absolute; inset:0;" +
    "background: rgba(0,0,0,1);" +
    "backdrop-filter: blur(calc(4 * var(--u)));" +
    "-webkit-backdrop-filter: blur(calc(4 * var(--u)));" +
    "pointer-events:none;";


  backdrop.onclick = () => {

  };

  const padWrap = div("choice-padWrap");
  padWrap.style.cssText =
    "position:relative; width:100%;" +
    `padding:calc(${PAD_TOP} * var(--u)) calc(${PAD_R} * var(--u)) calc(${PAD_B} * var(--u)) calc(${PAD_L} * var(--u));` +
    "box-sizing:border-box;" +
    "display:flex; justify-content:center; align-items:flex-start;" +
    "pointer-events:none;";


  const panel = div("choice-panel");



  panel.style.cssText =
    "position:relative;" +
    "pointer-events:auto;";

  panel.onclick = (e) => e.stopPropagation();

  const titleEl = h2(c.title);
  titleEl.style.cssText =
    `margin:0 0 calc(${8} * var(--u)) 0; font-size:calc(${TITLE_FS} * var(--u)); font-weight:900;` +
    "text-align:left;";
  panel.appendChild(titleEl);

  if (c.prompt) {
    const promptEl = p(c.prompt);
    promptEl.style.cssText =
      `margin:0 0 calc(${12} * var(--u)) 0; font-size:calc(${PROMPT_FS} * var(--u)); line-height:1.25; opacity:.95;`;
    panel.appendChild(promptEl);
  }

  const ctxAny: any = g.choiceCtx as any;
  const optsAny: any[] = Array.isArray((c as any).options) ? (c as any).options : [];
  const isBossSlotUpgrade = ctxAny?.kind === "BOSS_SLOT_UPGRADE";
  const hasFrontBackPick =
    optsAny.length === 2 &&
    optsAny.some((o) => String((o?.text ?? o?.label ?? "")).includes("전열")) &&
    optsAny.some((o) => String((o?.text ?? o?.label ?? "")).includes("후열"));
  const artPath = typeof ctxAny?.artPath === "string" ? ctxAny.artPath : (!isBossSlotUpgrade && hasFrontBackPick) ? "assets/ui/choice/slot_pick.png" : null;
  if (artPath) {
    const artWrap = div("choice-art");
    artWrap.style.cssText =
      `margin:0 0 calc(${12} * var(--u)) 0;` +
      `border-radius:calc(${14} * var(--u)); overflow:hidden;` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.14);` +
      `background:rgba(255,255,255,.06);`;
    const img = document.createElement("img");
    img.src = assetUrl(artPath);
    img.alt = "";
    img.style.cssText = "display:block; width:100%; height:auto; max-height:calc(240 * var(--u)); object-fit:cover;";
    artWrap.appendChild(img);
    panel.appendChild(artWrap);
  }


  if (c.kind === "FAITH" && (g.choiceCtx as any)?.kind === "FAITH_START") {
    panel.style.cssText +=
      `width:min(100vw, calc(${1800} * var(--u))); height:90vh;` +
      `max-height:94vh; overflow:auto;` +
      `padding:calc(${18} * var(--u)) calc(${18} * var(--u));` +
      `border-radius:calc(${18} * var(--u));` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.16);` +
      `background:rgba(0,0,0,1);` +
      `box-shadow: 0 calc(18 * var(--u)) calc(60 * var(--u)) rgba(0,0,0,1);` +
      `font-family:"Mulmaru", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;`;

    const f = ensureFaith(g);
    const offered = f.offered as any as Array<Exclude<GodId, "madness">>;

    const sub = div("faith-sub");
    sub.style.cssText =
      `margin:0 0 calc(${16} * var(--u)) 0;` +
      `font-size:calc(${19} * var(--u)); opacity:.92; line-height:1.35;`;
    sub.textContent = "선택한 신은 신앙 5로 시작합니다. 유혹 수락 시: 유혹한 신 +1 / 현재 포커스 -1. 포커스 점수 ≥3이면 후원 패시브가 활성화됩니다.";
    panel.appendChild(sub);

    const mobilePortrait = document.body.classList.contains("mobile") && document.body.classList.contains("portrait");
    if (mobilePortrait) {
      const list = div("faith-list");
      list.style.cssText = `display:flex; flex-direction:column; gap:calc(${16} * var(--u));`;

      const makeGodRow = (id: Exclude<GodId, "madness">) => {
        const row = div("faith-godRow");
        row.style.cssText =
          `display:flex; gap:calc(${18} * var(--u)); align-items:stretch;` +
          `min-height:calc(${340} * var(--u));` +
          `border-radius:calc(${16} * var(--u));` +
          `border:calc(1 * var(--u)) solid rgba(255,255,255,.14);` +
          `background:#101010; overflow:hidden;`;

        const art = div("faith-godArt");
        art.style.cssText =
          `flex:0 0 clamp(calc(${160} * var(--u)), 36vw, calc(${260} * var(--u)));` +
          `position:relative; overflow:hidden;` +
          `border-right:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
          `background:rgba(0,0,0,1);`;

        const img = document.createElement("img");
        img.alt = godName(id);
        img.src = assetUrl(godArt(id));
        (img.style as any).imageRendering = "pixelated";
        img.style.cssText =
          `position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:50% 35%;` +
          `transform: scale(1.06); transform-origin: 50% 50%;` +
          `image-rendering: pixelated; image-rendering: crisp-edges;`;
        img.onerror = () => {
          try { img.remove(); } catch {}
          const ph = div("faith-imgPh");
          ph.textContent = "(illustration)";
          ph.style.cssText =
            `position:absolute; inset:0; display:flex; align-items:center; justify-content:center;` +
            `opacity:.35; font-size:calc(${18} * var(--u));`;
          art.appendChild(ph);
        };
        art.appendChild(img);
        row.appendChild(art);

        const body = div("faith-godBody");
        body.style.cssText =
          `flex:1 1 auto; min-width:0;` +
          `display:flex; flex-direction:column; gap:calc(${14} * var(--u));` +
          `padding:calc(${20} * var(--u));`;

        const head = div("faith-godHead");
        head.style.cssText =
          `display:flex; align-items:center; justify-content:space-between; gap:calc(${10} * var(--u));`;

        const nameEl = div("faith-godName");
        nameEl.textContent = godName(id);
        nameEl.style.cssText = `font-size:calc(${34} * var(--u)); font-weight:900;`;
        head.appendChild(nameEl);

        const pickBtn = button("선택", () => actions.onChooseChoice(`faith:choose:${id}`), false);
        pickBtn.style.cssText +=
          `flex:0 0 auto;` +
          `font-size:calc(${22} * var(--u));` +
          `padding:calc(${14} * var(--u)) calc(${16} * var(--u));` +
          `border-radius:calc(${12} * var(--u));`;
        head.appendChild(pickBtn);
        body.appendChild(head);

        const pre = document.createElement("pre");
        pre.textContent = godAbilityBlock(id);
        pre.style.cssText =
          `margin:0; padding:calc(${14} * var(--u));` +
          `white-space:pre-wrap; line-height:1.35;` +
          `font-size:calc(${20} * var(--u));` +
          `border:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
          `background:rgba(0,0,0,1);` +
          `font-family:"Mulmaru", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;`;
        body.appendChild(pre);

        row.appendChild(body);
        return row;
      };

      for (const id of offered) list.appendChild(makeGodRow(id));
      panel.appendChild(list);
    } else {
      const grid = div("faith-grid");
      grid.style.cssText =
        `display:grid; grid-template-columns:repeat(3, minmax(0, 1fr));` +
        `gap:calc(${14} * var(--u));`;

      const makeGodCard = (id: Exclude<GodId, "madness">) => {
      const card = div("faith-godCard");
      card.style.cssText =
        `display:flex; flex-direction:column;` +
        `border-radius:calc(${16} * var(--u)); display:flex; align-items:center; justify-content:center;` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.14);` +
        `background:#101010;` +
        `overflow:hidden;` +
        `min-height:calc(${640} * var(--u));`;

      const imgWrap = div("faith-imgWrap");
      imgWrap.style.cssText =
        `width:70%; aspect-ratio: 1/1; height:auto;` +
        `background:rgba(0,0,0,0);` +
        `border-bottom:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
        `position:relative; overflow:hidden;`;

      const img = document.createElement("img");
      img.alt = godName(id);
      img.src = assetUrl(godArt(id));
      (img.style as any).imageRendering = "pixelated";
      img.style.cssText =
        `position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:50% 35%;` +
        `transform: scale(1.09); transform-origin: 50% 50%;` +
        `image-rendering: pixelated; image-rendering: crisp-edges;`;
      img.onerror = () => {
        img.remove();
        const ph = div("faith-imgPh");
        ph.textContent = "(illustration)";
        ph.style.cssText =
          `position:absolute; inset:0; display:flex; align-items:center; justify-content:center;` +
          `opacity:.35; font-size:calc(${14} * var(--u));`;
        imgWrap.appendChild(ph);
      };

      imgWrap.appendChild(img);
      card.appendChild(imgWrap);

      const body = div("faith-body");
      body.style.cssText =
        `display:flex; flex-direction:column; gap:calc(${10} * var(--u));` +
        `padding:calc(${12} * var(--u));`;

      const nameEl = document.createElement("div");
      nameEl.textContent = godName(id);
      nameEl.style.cssText =
        `font-size:calc(${20} * var(--u)); font-weight:900; letter-spacing: 0.3em;` +
        `width:100%; text-align:center;`;
      body.appendChild(nameEl);

      const pre = document.createElement("pre");
      pre.textContent = godAbilityBlock(id);
      pre.style.cssText =
        `margin:0; padding:calc(${10} * var(--u));` +
        `white-space:pre-wrap; line-height:1.35;` +
        `font-size:calc(${13} * var(--u));` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
        `background:rgba(0,0,0,1);` +
        `font-family:"Mulmaru", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;`;
      body.appendChild(pre);

      const pickBtn = button("선택", () => actions.onChooseChoice(`faith:choose:${id}`), false);
      pickBtn.style.cssText +=
        `margin-top:auto; width:100%;` +
        `font-size:calc(${15} * var(--u));` +
        `padding:calc(${12} * var(--u)) calc(${12} * var(--u));` +
        `border-radius:calc(${12} * var(--u));`;
      body.appendChild(pickBtn);

      card.appendChild(body);
      return card;
    };

    for (const id of offered) grid.appendChild(makeGodCard(id));
    panel.appendChild(grid);
    }

    padWrap.appendChild(panel);
    overlayEl.appendChild(backdrop);
    overlayEl.appendChild(padWrap);
    document.body.appendChild(overlayEl);
    return;
  }


  const fixPreviewSize = (cardEl: HTMLElement, scale = 1) => {
    const w = scale === 1 ? "var(--handCardW)" : `calc(var(--handCardW) * ${scale})`;
    const h = scale === 1 ? "var(--handCardH)" : `calc(var(--handCardH) * ${scale})`;
    cardEl.style.width = w;
    cardEl.style.height = h;
    cardEl.style.boxSizing = "border-box";
  };

  const makeDetailPre = (detail: any) => {
    const pre = document.createElement("pre");
    pre.className = "choice-detail";
    pre.textContent = String(detail);
    pre.style.cssText =
      `margin:calc(${10} * var(--u)) 0 0 0; padding:calc(${DETAIL_PAD} * var(--u));` +
      "white-space:pre-wrap;" +
      `border-radius: 0; border:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
      "background:rgba(0,0,0,.22);" +
      `font-size:calc(${DETAIL_FS} * var(--u)); line-height:1.45;` +
      `max-height:calc(${DETAIL_MAXH} * var(--u)); overflow:auto;`;
    return pre;
  };

  const makeItemShell = () => {
    const item = div("choice-item");
    item.style.cssText =
      "display:flex;" +
      `gap:calc(${12} * var(--u));` +
      "align-items:flex-start;" +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); border-radius:calc(${ITEM_R} * var(--u));` +
      `padding:calc(${ITEM_PAD} * var(--u));` +
      "background:rgba(255,255,255,.03);";
    return item;
  };

  const hasCardPreview = c.options.some((opt) => {
    if ((opt as any).cardUid) return true;
    if (typeof opt.key === "string" && opt.key.startsWith("pick:")) return true;
    if (isShopChoice && typeof opt.key === "string" && opt.key.startsWith("shop:card:")) return true;
    return false;
  });


  if (!hasCardPreview) {
    const contentRow = div("choice-contentRow");
    contentRow.style.cssText =
      "display:flex;" +
      `gap:calc(${GAP_ROW} * var(--u)); margin-top:calc(${12} * var(--u));` +
      "justify-content:center; align-items:stretch;";

    const leftCol = div("choice-leftCol");
    leftCol.style.cssText =
      `flex:1 1 calc(${isShopChoice ? 560 : 640} * var(--u)); max-width:calc(${isShopChoice ? 640 : 720} * var(--u)); min-width:0;` +
      "display:flex; flex-direction:column;";

    const list = div("choice-list");
    list.style.cssText = `display:flex; flex-direction:column; gap:calc(${GAP_LIST} * var(--u));`;

    c.options.forEach((opt) => {
      const item = makeItemShell();

      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("choiceOptBtn");
      b.style.fontSize = `calc(${14} * var(--u))`;
      b.style.padding = `calc(${10} * var(--u)) calc(${12} * var(--u))`;
      b.style.borderRadius = `calc(${10} * var(--u))`;
      item.appendChild(b);

      if ((opt as any).detail) item.appendChild(makeDetailPre((opt as any).detail));
      list.appendChild(item);
    });

    leftCol.appendChild(list);

    const illuCol = div("choice-illuCol");
    illuCol.style.cssText =
      `flex:0 0 calc(${ILLU_SIZE} * var(--u)); min-width:calc(${ILLU_MIN} * var(--u));` +
      "display:flex; align-items:center; justify-content:center;";

    const illuBox = div("choice-illuBox");
    illuBox.style.cssText =
      "width:100%; aspect-ratio:1/1;" +
      `border-radius:calc(${18} * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,1);` +
      "background:rgba(0,0,0,1);" +
      "position:relative; overflow:hidden;" +
      "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);";

    const art = (c as any).art as string | undefined;
    if (art) {
      const img = document.createElement("img");
      img.src = assetUrl(art);
      img.alt = c.title ?? "illustration";
      const ZOOM = 1.5;
      (img.style as any).imageRendering = "pixelated";
      img.style.cssText =
        "position:absolute; inset:0;" +
        `width:${ZOOM * 100}%; height:${ZOOM * 100}%;` +
        `left:${-(ZOOM - 1) * 50}%; top:${-(ZOOM - 1) * 50}%;` +
        "object-fit:cover; object-position:50% 50%;" +
        "image-rendering: pixelated; image-rendering: crisp-edges;";
      illuBox.appendChild(img);
    }

    illuCol.appendChild(illuBox);

    contentRow.appendChild(leftCol);
    contentRow.appendChild(illuCol);
    panel.appendChild(contentRow);

    padWrap.appendChild(panel);
    overlayEl.appendChild(backdrop);
    overlayEl.appendChild(padWrap);
    document.body.appendChild(overlayEl);
    return;
  }

  if (isShopChoice) {
    panel.classList.add("shopPanel");
    panel.style.overflow = "hidden";

    const nodeId = String((g.choiceCtx as any)?.nodeId ?? "");
    const shop = (g.run as any)?.shops?.[nodeId];

    if (!shop) {
    } else {
      const cardsGrid = div("shopCardsGrid");
      for (let i = 0; i < (shop.cards?.length ?? 0); i++) {
        const offer = shop.cards[i];
        if (!offer?.defId) continue;

        const tile = div("shopCardTile");
        if (offer.sold) tile.classList.add("sold");

        const cardEl = deps.renderCardPreviewByDef(
          g,
          String(offer.defId),
          Number(offer.upgrade ?? 0) || 0
        ) as HTMLElement;

        fixPreviewSize(cardEl, 1);
        tile.appendChild(cardEl);

        deps.wireUpgradeHoverPreviewForChoice(
          tile,
          g,
          String(offer.defId),
          Number(offer.upgrade ?? 0) || 0
        );

        const price = divText(
          "shopTilePrice",
          offer.sold ? "품절" : `🪙${Number(offer.priceGold ?? 0) || 0}`
        );
        tile.appendChild(price);

        if (!offer.sold) {
          tile.onclick = () => actions.onChooseChoice(`shop:card:${i}`);
        }

        cardsGrid.appendChild(tile);
      }

      const bottomRow = div("shopBottomRow");

      const itemsCol = div("shopItemsCol");
      const itemsGrid = div("shopItemsGrid");

      for (let i = 0; i < (shop.items?.length ?? 0); i++) {
        const offer = shop.items[i];
        if (!offer?.itemId) continue;

        const tile = div("shopItemTile");
        if (offer.sold) tile.classList.add("sold");
        wireItemHover(tile, String(offer.itemId));

        const def = getItemDefById(String(offer.itemId));
        const img = document.createElement("img");
        img.alt = def?.name ?? String(offer.itemId);
        if (def?.art) img.src = assetUrl(def.art);
        tile.appendChild(img);

        const price = divText(
          "shopTilePrice",
          offer.sold ? "품절" : `🪙${Number(offer.priceGold ?? 0) || 0}`
        );
        tile.appendChild(price);

        if (!offer.sold) {
          tile.onclick = () => {
            const until = Number((tile as any).__itemHoverSuppressClickUntil ?? 0);
            if (until > performance.now()) return;
            actions.onChooseChoice(`shop:item:${i}`);
          };
        }

        itemsGrid.appendChild(tile);
      }

      itemsCol.appendChild(itemsGrid);

      const svcCol = div("shopSvcCol");
      const svcGrid = div("shopSvcGrid");

      const mkSvc = (key: string, label: string, note: string, disabled: boolean) => {
        const box = div("shopSvcTile");
        const b = button(label, () => actions.onChooseChoice(key), disabled);
        b.classList.add("primary");
        box.appendChild(b);

        const n = divText("shopSvcNote", note);
        box.appendChild(n);
        return box;
      };

      svcGrid.appendChild(
        mkSvc(
          "shop:service:upgrade",
          shop.usedUpgrade ? "강화" : "강화",
          shop.usedUpgrade ? "사용 완료" : "🪙25",
          !!shop.usedUpgrade
        )
      );
      svcGrid.appendChild(
        mkSvc(
          "shop:service:remove",
          shop.usedRemove ? "제거" : "제거",
          shop.usedRemove ? "사용 완료" : "🪙25",
          !!shop.usedRemove
        )
      );
      svcGrid.appendChild(mkSvc("shop:supply:buy", "보급 구매", "-🪙6 / 🍞+3", false));
      svcGrid.appendChild(mkSvc("shop:supply:sell", "보급 판매", "+🪙4 / 🍞-3", false));

      svcCol.appendChild(svcGrid);

      bottomRow.appendChild(itemsCol);
      bottomRow.appendChild(svcCol);

      const leaveLabel =
        (c.options.find((o) => o.key === "shop:leave")?.label) ?? "나가기";

      const leaveBtn = button(leaveLabel, () => actions.onChooseChoice("shop:leave"), false);
      leaveBtn.classList.add("shopLeaveBtn");
      leaveBtn.style.cssText =
        "position:absolute;" +
        `top:calc(${16} * var(--u)); right:calc(${16} * var(--u));` +
        "z-index: 2;" +
        "border-radius:0;" +
        `padding:calc(${10} * var(--u)) calc(${14} * var(--u));` +
        `font-size:calc(${13} * var(--u)); font-weight:900;`;

      panel.appendChild(leaveBtn);

      const contentRow = div("choice-contentRow");
      contentRow.classList.add("shopContentRow");

      const leftCol = div("choice-leftCol");
      leftCol.classList.add("shopLeftCol");
      leftCol.appendChild(cardsGrid);
      leftCol.appendChild(bottomRow);

      const illuCol = div("choice-illuCol");
      illuCol.style.cssText =
        `flex:0 0 calc(${ILLU_SIZE} * var(--u)); min-width:calc(${ILLU_MIN} * var(--u));` +
        "display:flex; align-items:center; justify-content:center;";

      const illuBox = div("choice-illuBox");
      illuBox.style.cssText =
        "width:100%; aspect-ratio:1/1;" +
        `border-radius:calc(${18} * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,1);` +
        "background:rgba(0,0,0,1);" +
        "position:relative; overflow:hidden;" +
        "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);";

      const art = (c as any).art as string | undefined;
      if (art) {
        const img = document.createElement("img");
        img.src = assetUrl(art);
        img.alt = c.title ?? "illustration";
        const ZOOM = 1.5;
        (img.style as any).imageRendering = "pixelated";
        img.style.cssText =
          "position:absolute; inset:0;" +
          `width:${ZOOM * 100}%; height:${ZOOM * 100}%;` +
          `left:${-(ZOOM - 1) * 50}%; top:${-(ZOOM - 1) * 50}%;` +
          "object-fit:cover; object-position:50% 50%;" +
          "image-rendering: pixelated; image-rendering: crisp-edges;";
        illuBox.appendChild(img);
      }

      illuCol.appendChild(illuBox);

      contentRow.appendChild(leftCol);
      contentRow.appendChild(illuCol);
      panel.appendChild(contentRow);

      padWrap.appendChild(panel);
      overlayEl.appendChild(backdrop);
      overlayEl.appendChild(padWrap);
      document.body.appendChild(overlayEl);
      return;
    }
  } else {
    const ck = (g.choiceCtx as any)?.kind;
    const isBattleCardReward = !isShopChoice && (ck === "BATTLE_CARD_REWARD" || ck === "BATTLE_REWARD");

    const renderClickablePreviewByDef = (defId: string, upgrade: number, onPick: () => void): HTMLElement => {
      const tmpUid = `__choice_preview:${defId}:${upgrade}:${Math.random().toString(36).slice(2)}`;
      const prev = g.cards[tmpUid];
      (g.cards as any)[tmpUid] = { uid: tmpUid, defId, upgrade, zone: "preview" };

      const el = deps.renderCard(g, tmpUid, true, () => onPick(), { draggable: false }) as HTMLElement;
      el.classList.add("overlayCard", "choicePickCard");
      el.draggable = false;
      el.style.cursor = "pointer";

      if (prev) g.cards[tmpUid] = prev;
      else delete (g.cards as any)[tmpUid];
      return el;
    };

    if (isBattleCardReward) {
      const pickOpts = c.options.filter((opt) => typeof opt.key === "string" && opt.key.startsWith("pick:"));
      const skipOpt = c.options.find((opt) => opt.key === "skip") ?? null;

      const ctx: any = g.choiceCtx as any;
      const cardDecision = ctx?.cardDecision as (string | "SKIPPED" | undefined);

      {
        const itemId = String(ctx?.itemOfferId ?? "");
        const itemDecision = ctx?.itemDecision as ("TAKEN" | "SKIPPED" | undefined);
        if (itemId) {
          const def = getItemDefById(itemId);
          const row = div("choice-rewardItemRow");
          row.style.cssText =
            "display:flex; justify-content:center; align-items:flex-start;" +
            `gap:calc(${14} * var(--u)); margin-bottom:calc(${16} * var(--u));`;

          const card = div("itemOfferCard");
          card.style.cssText =
            `width:calc(${170} * var(--u)); aspect-ratio:3/4;` +
            `border-radius: 0;` +
            "border:calc(1 * var(--u)) solid rgba(255,255,255,.14);" +
            "background:rgba(0,0,0,.35);" +
            "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);" +
            "display:flex; flex-direction:column; align-items:center; justify-content:flex-start;" +
            `padding:calc(${12} * var(--u)); gap:calc(${10} * var(--u));` +
            "cursor:pointer; user-select:none;";

          wireItemHover(card, itemId);

          if (itemDecision) {
            card.style.opacity = ".55";
            card.style.cursor = "default";
          } else {
            card.onclick = () => actions.onChooseChoice("take_item");
          }

          const title = divText("itemOfferTitle", "아이템 보상");
          title.style.cssText = `font-weight:900; font-size:calc(${14} * var(--u)); opacity:.92;`;

          if (def?.art) {
            const img = document.createElement("img");
            img.src = assetUrl(def.art);
            img.alt = def.name;
            (img.style as any).imageRendering = "pixelated";
            img.style.cssText =
              `width:calc(${96} * var(--u)); height:calc(${96} * var(--u));` +
              "object-fit:contain;" +
              "image-rendering: pixelated; image-rendering: crisp-edges;";
            card.appendChild(img);
          }

          const nm = divText("itemOfferName", def?.name ?? itemId);
          nm.style.cssText = `font-weight:800; font-size:calc(${14} * var(--u)); text-align:center;`;
          const hint = divText(
            "itemOfferHint",
            itemDecision === "TAKEN" ? "획득함" : itemDecision === "SKIPPED" ? "생략함" : "클릭하면 받습니다"
          );
          hint.style.cssText = `opacity:.75; font-size:calc(${12} * var(--u)); text-align:center;`;

          const wrap = div("itemOfferWrap");
          wrap.style.cssText = "display:flex; flex-direction:column; align-items:center;";
          wrap.appendChild(title);
          wrap.appendChild(card);
          const desc = divText("itemOfferDesc", def?.text ?? "");
          desc.style.cssText = `opacity:.85; font-size:calc(${12} * var(--u)); text-align:center; white-space:pre-wrap; line-height:1.35;`;
          (desc.style as any).maxHeight = `calc(${54} * var(--u))`;
          (desc.style as any).overflow = "hidden";
          (desc.style as any).textOverflow = "ellipsis";

          card.appendChild(nm);
          card.appendChild(desc);
          card.appendChild(hint);

          row.appendChild(wrap);

          if (!itemDecision) {
            const skipB = button("아이템 생략", () => actions.onChooseChoice("skip_item"), false);
            skipB.classList.add("ghost");
            skipB.style.fontSize = `calc(${13} * var(--u))`;
            skipB.style.padding = `calc(${10} * var(--u)) calc(${14} * var(--u))`;
            skipB.style.borderRadius = `calc(${10} * var(--u))`;
            row.appendChild(skipB);
          }

          panel.appendChild(row);
        }
      }

      const row = div("choice-rewardCardRow");
      row.style.cssText =
        "display:flex; justify-content:center; align-items:flex-start;" +
        `gap:calc(${12} * var(--u)); flex-wrap:nowrap;`;

      for (const opt of pickOpts) {
        const payload = opt.key.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        const canPick = !cardDecision;
        const el = renderClickablePreviewByDef(defId, upgrade, () => {
          if (!canPick) return;
          actions.onChooseChoice(opt.key);
        });
        deps.wireUpgradeHoverPreviewForChoice(el, g, defId, upgrade);
        if (!canPick) {
          el.style.opacity = ".55";
          el.style.cursor = "default";
        }
        fixPreviewSize(el, 1);
        row.appendChild(el);
      }

      panel.appendChild(row);

      if (skipOpt && !cardDecision) {
        const skipWrap = div("choice-rewardSkipRow");
        skipWrap.style.cssText = `margin-top:calc(${18} * var(--u)); display:flex; justify-content:center;`;
        const b = button(skipOpt.label || "생략", () => actions.onChooseChoice("skip"), false);
        b.classList.add("primary");
        b.style.fontSize = `calc(${14} * var(--u))`;
        b.style.padding = `calc(${10} * var(--u)) calc(${16} * var(--u))`;
        b.style.borderRadius = `calc(${10} * var(--u))`;
        skipWrap.appendChild(b);
        panel.appendChild(skipWrap);
      }

      padWrap.appendChild(panel);
      overlayEl.appendChild(backdrop);
      overlayEl.appendChild(padWrap);
      document.body.appendChild(overlayEl);
      return;
    }

    const list = div("choice-list");
    list.style.cssText =
      "display:flex; flex-direction:column;" +
      `gap:calc(${GAP_LIST} * var(--u)); margin-top:calc(${12} * var(--u));`;

    c.options.forEach((opt) => {
      if (isShopChoice && (opt.key === "shop:sep" || opt.key.startsWith("shop:sep:"))) {
        const sep = div("choice-sep");
        sep.style.cssText =
          `height:calc(${1} * var(--u));` +
          "background:rgba(255,255,255,.12);" +
          `margin:calc(${6} * var(--u)) 0;`;
        list.appendChild(sep);
        return;
      }

      const item = makeItemShell();

      const left = div("choice-left");
      left.style.cssText = "flex:0 0 auto;";

      const uid = (opt as any).cardUid as string | undefined;
      if (uid) {
        const isUpgradePick = g.choice?.kind === ("UPGRADE_PICK" as any);
        const card = g.cards[uid];
        const curUp = (card?.upgrade ?? 0) || 0;
        const nextUp = curUp + 1;

        if (isUpgradePick) {
          const pair = div("upgradePair");
          pair.style.cssText = `display:flex; gap:calc(${10} * var(--u)); align-items:flex-start;`;

          let elCur: HTMLElement;
          let elNext: HTMLElement;
          try { elCur = deps.renderCardPreviewByUidWithUpgrade(g, uid, curUp); }
          catch { elCur = deps.renderRealCardForOverlay(g, uid) as HTMLElement; }
          try { elNext = deps.renderCardPreviewByUidWithUpgrade(g, uid, nextUp); }
          catch { elNext = deps.renderRealCardForOverlay(g, uid) as HTMLElement; }

          fixPreviewSize(elCur, 1);
          fixPreviewSize(elNext, 1);

          const arrow = divText("upgradeArrow", "→");
          arrow.style.cssText = `align-self:center; font-weight:900; opacity:.85; margin-top:calc(${6} * var(--u));`;

          pair.appendChild(elCur);
          pair.appendChild(arrow);
          pair.appendChild(elNext);
          left.appendChild(pair);
        } else {
          let el: HTMLElement;
          try { el = deps.renderRealCardForOverlay(g, uid) as HTMLElement; }
          catch { el = deps.renderRealCardForOverlay(g, uid) as HTMLElement; }
          fixPreviewSize(el);
          left.appendChild(el);
        }
      } else if (typeof opt.key === "string" && opt.key.startsWith("pick:")) {
        const payload = opt.key.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        const el = deps.renderCardPreviewByDef(g, defId, upgrade) as HTMLElement;
        fixPreviewSize(el);
        left.appendChild(el);
        deps.wireUpgradeHoverPreviewForChoice(left, g, defId, upgrade);
      } else if (isShopChoice && typeof opt.key === "string" && opt.key.startsWith("shop:card:")) {
        const nodeId = String((g.choiceCtx as any)?.nodeId ?? "");
        const shop = (g.run as any)?.shops?.[nodeId];
        const idx = Number(opt.key.slice("shop:card:".length));
        const offer = shop?.cards?.[idx];
        if (offer?.defId) {
          const el = deps.renderCardPreviewByDef(g, String(offer.defId), Number(offer.upgrade ?? 0) || 0) as HTMLElement;
          fixPreviewSize(el);
          if (offer.sold) el.style.opacity = ".35";
          left.appendChild(el);
        }
      } else if (isShopChoice && typeof opt.key === "string" && opt.key.startsWith("shop:item:")) {
        const nodeId = String((g.choiceCtx as any)?.nodeId ?? "");
        const shop = (g.run as any)?.shops?.[nodeId];
        const idx = Number(opt.key.slice("shop:item:".length));
        const offer = shop?.items?.[idx];
        if (offer?.itemId) {
          const def = getItemDefById(String(offer.itemId));
          const card = div("shopItemCard");
          card.style.cssText =
            `width:calc(${150} * var(--u)); aspect-ratio:3/4;` +
            `border-radius: 0;` +
            "border:calc(1 * var(--u)) solid rgba(255,255,255,.14);" +
            "background:rgba(0,0,0,.30);" +
            "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.25);" +
            "display:flex; flex-direction:column; align-items:center; justify-content:flex-start;" +
            `padding:calc(${10} * var(--u)); gap:calc(${8} * var(--u));` +
            "user-select:none;" +
            (offer.sold ? "opacity:.35; cursor:default;" : "cursor:pointer;");

          if (!offer.sold) card.onclick = () => actions.onChooseChoice(opt.key);

          if (def?.art) {
            const img = document.createElement("img");
            img.src = assetUrl(def.art);
            img.alt = def?.name ?? String(offer.itemId);
            (img.style as any).imageRendering = "pixelated";
            img.style.cssText =
              `width:calc(${84} * var(--u)); height:calc(${84} * var(--u));` +
              "object-fit:contain;" +
              "image-rendering: pixelated; image-rendering: crisp-edges;";
            card.appendChild(img);
          }

          const nm = divText("shopItemName", def?.name ?? String(offer.itemId));
          nm.style.cssText = `font-weight:900; font-size:calc(${13} * var(--u)); text-align:center;`;
          const pr = divText("shopItemPrice", offer.sold ? "품절" : `🪙${Number(offer.priceGold ?? 0) || 0}`);
          pr.style.cssText = `opacity:.85; font-size:calc(${12} * var(--u));`;
          card.appendChild(nm);
          card.appendChild(pr);

          left.appendChild(card);
        }
      }

      const right = div("choice-right");
      right.style.cssText = `flex:1 1 auto; min-width:calc(${260} * var(--u));`;

      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("primary");
      b.style.fontSize = `calc(${14} * var(--u))`;
      b.style.padding = `calc(${10} * var(--u)) calc(${12} * var(--u))`;
      b.style.borderRadius = `calc(${10} * var(--u))`;
      right.appendChild(b);

      if ((opt as any).detail) right.appendChild(makeDetailPre((opt as any).detail));

      item.appendChild(left);
      item.appendChild(right);
      list.appendChild(item);
    });

    if (isShopChoice) {
      const contentRow = div("choice-contentRow");
      contentRow.style.cssText =
        "display:flex;" +
        `gap:calc(${GAP_ROW} * var(--u)); margin-top:calc(${12} * var(--u));` +
        "justify-content:center; align-items:stretch;";

      const leftCol = div("choice-leftCol");
      leftCol.style.cssText =
        `flex:1 1 calc(${560} * var(--u)); max-width:calc(${640} * var(--u)); min-width:0;` +
        "display:flex; flex-direction:column;";
      leftCol.appendChild(list);

      const illuCol = div("choice-illuCol");
      illuCol.style.cssText =
        `flex:0 0 calc(${ILLU_SIZE} * var(--u)); min-width:calc(${ILLU_MIN} * var(--u));` +
        "display:flex; align-items:center; justify-content:center;";

      const illuBox = div("choice-illuBox");
      illuBox.style.cssText =
        "width:100%; aspect-ratio:1/1;" +
        `border-radius:calc(${18} * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,1);` +
        "background:rgba(0,0,0,1);" +
        "position:relative; overflow:hidden;" +
        "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);";

      const art = (c as any).art as string | undefined;
      if (art) {
        const img = document.createElement("img");
        img.src = assetUrl(art);
        img.alt = c.title ?? "illustration";
        const ZOOM = 1.5;
        (img.style as any).imageRendering = "pixelated";
        img.style.cssText =
          "position:absolute; inset:0;" +
          `width:${ZOOM * 100}%; height:${ZOOM * 100}%;` +
          `left:${-(ZOOM - 1) * 50}%; top:${-(ZOOM - 1) * 50}%;` +
          "object-fit:cover; object-position:50% 50%;" +
          "image-rendering: pixelated; image-rendering: crisp-edges;";
        illuBox.appendChild(img);
      }

      illuCol.appendChild(illuBox);
      contentRow.appendChild(leftCol);
      contentRow.appendChild(illuCol);
      panel.appendChild(contentRow);
    } else {
      panel.appendChild(list);
    }
  }

  padWrap.appendChild(panel);
  overlayEl.appendChild(backdrop);
  overlayEl.appendChild(padWrap);
  document.body.appendChild(overlayEl);
}
