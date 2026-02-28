import type { GameState } from "../../engine/types";
import { getCardDefByIdWithUpgrade } from "../../content/cards";
import { displayCardText, displayCardTextPair } from "../../engine/cardText";
import { wireCardDragInteractions } from "../interaction/drag";
import { wireCardHoverPreviewInteractions } from "../interaction/hover";
import { plainTextFromRich, renderCardRichTextNode } from "./richText";

export type CardRenderMode = "FULL" | "SLOT_NAME_ONLY";

export type CardHoverPreviewPayload = {
  title: string;
  detail: string;
  cardEl?: HTMLElement;
};

export type CardHoverPreviewApi = {
  ensure(root: HTMLElement): void;
  show(p: CardHoverPreviewPayload): void;
  hide(): void;
  pin?(): void;
  unpin?(): void;
  isPinned?(): boolean;
};

export type RenderCardOpt = {
  draggable?: boolean;
  mode?: CardRenderMode;
  hoverPreview?: {
    root: HTMLElement;
    api: CardHoverPreviewApi;
    buildDetail?: (g: GameState, cardUid: string) => string;
  };
};

export type RenderCardCtx = {
  div: (cls: string) => HTMLElement;
  divText: (cls: string, text: string) => HTMLElement;
  badge: (text: string) => HTMLElement;
  displayNameForUid: (g: GameState, uid: string) => string;

  isTargeting: (g: GameState) => boolean;
  isDraggingNow: () => boolean;
  beginDrag: (ev: PointerEvent, src: any) => void;
  getDragPointerId: () => number | null;

  isHoverSuppressed: () => boolean;
  suppressHover: (ms: number) => void;
  isMobile: () => boolean;

  getPinnedCardUid: () => string | null;
  setPinnedCardUid: (uid: string | null) => void;
  clearCardHoverPreview: () => void;
};

export function renderCardWithCtx(
  ctx: RenderCardCtx,
  g: GameState,
  cardUid: string,
  clickable: boolean,
  onClick?: (uid: string) => void,
  opt?: RenderCardOpt
) {
  const c = g.cards[cardUid];
  const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
  const textPair = displayCardTextPair(g, def.frontText, def.backText, cardUid);
  const synth = (c as any)?.synth as any;
  const isSynth = Boolean(synth?.done);

  const draggable = opt?.draggable ?? true;
  const mode: CardRenderMode = opt?.mode ?? "FULL";

  const d = ctx.div("card") as HTMLElement;

  const rarity = (def as any).rarity ?? (String(c.defId).startsWith("mad_") ? "MADNESS" : "COMMON");
  d.classList.add(`rarity-${String(rarity).toLowerCase()}`);
  if (isSynth) d.classList.add("synthesized");

  if (g.selectedHandCardUid === cardUid) d.classList.add("selected");
  const exhaustWhen = (def as any).exhaustWhen as any;
  const vanishWhen = (def as any).vanishWhen as any;
  const isExhaust = (exhaustWhen && exhaustWhen !== "NONE") || def.tags?.includes("EXHAUST");
  const isVanish = (vanishWhen && vanishWhen !== "NONE") || def.tags?.includes("VANISH");
  if (isExhaust) d.classList.add("exhaust");
  if (isVanish) d.classList.add("vanish");

  if (mode === "SLOT_NAME_ONLY") d.classList.add("slotNameOnly");

  const header = ctx.div("cardHeader");
  const title = ctx.displayNameForUid(g, cardUid);
  header.appendChild(ctx.divText("cardTitle", title));

  if (mode === "FULL") {
    const meta = ctx.div("cardMeta");
    if (isExhaust) meta.appendChild(ctx.badge(""));
    if (isVanish) meta.appendChild(ctx.badge(""));
    header.appendChild(meta);
  }

  d.appendChild(header);

  if (mode === "FULL") {
    const body = ctx.div("cardBody");

    const inst = g.cards[cardUid];
    const flipped = Boolean((inst as any)?.flipped);
    const frontRich = flipped ? textPair.backText : textPair.frontText;
    const backRich = flipped ? textPair.frontText : textPair.backText;
    const frontBase = flipped ? def.backText : def.frontText;
    const backBase = flipped ? def.frontText : def.backText;

    const sec1 = ctx.div("cardSection");
    sec1.classList.add("front");
    sec1.appendChild(renderCardRichTextNode(frontRich, frontBase));
    body.appendChild(sec1);

    const sec2 = ctx.div("cardSection");
    sec2.classList.add("back");
    sec2.appendChild(renderCardRichTextNode(backRich, backBase));
    body.appendChild(sec2);

    d.appendChild(body);
  }

  if (clickable && onClick) (d as any).onclick = () => onClick(cardUid);

  if (clickable) {
    const showTouchHoldHover = () => {
      if (!opt?.hoverPreview) return;
      if (ctx.isDraggingNow()) return;

      const { root, api, buildDetail } = opt.hoverPreview;
      api.ensure(root);

      const detailText =
        buildDetail?.(g, cardUid)
        ?? (() => {
          const f = plainTextFromRich(displayCardText(g, def.frontText, cardUid));
          const b = plainTextFromRich(displayCardText(g, def.backText, cardUid));
          return `전열: ${f || "없음"}\n후열: ${b || "없음"}`;
        })();

      const big = renderCardWithCtx(ctx, g, cardUid, false, undefined, { draggable: false, mode: "FULL" });
      big.classList.add("isPreviewCard");

      ctx.setPinnedCardUid(cardUid);
      api.show({ title, detail: detailText, cardEl: big });
      api.pin?.();
    };

    wireCardDragInteractions(d, {
      g,
      cardUid,
      draggable,
      isTargeting: ctx.isTargeting,
      isDraggingNow: ctx.isDraggingNow,
      beginDrag: ctx.beginDrag,
      onTouchHold: showTouchHoldHover,
    });
  }

  if (opt?.hoverPreview) {
    const { root, api, buildDetail } = opt.hoverPreview;

    api.ensure(root);

    const detailText =
      buildDetail?.(g, cardUid)
      ?? (() => {
        const f = plainTextFromRich(displayCardText(g, def.frontText, cardUid));
        const b = plainTextFromRich(displayCardText(g, def.backText, cardUid));
        return `전열: ${f || "없음"}\n후열: ${b || "없음"}`;
      })();

    wireCardHoverPreviewInteractions(d, {
      g,
      cardUid,
      title,
      detailText,
      root,
      api,
      buildBigCardEl: () => {
        const big = renderCardWithCtx(ctx, g, cardUid, false, undefined, { draggable: false, mode: "FULL" });
        big.classList.add("isPreviewCard");
        return big;
      },
      isDraggingNow: ctx.isDraggingNow,
      isHoverSuppressed: ctx.isHoverSuppressed,
      suppressHover: ctx.suppressHover,
      isMobile: ctx.isMobile,
      getPinnedCardUid: ctx.getPinnedCardUid,
      setPinnedCardUid: ctx.setPinnedCardUid,
      clearCardHoverPreview: ctx.clearCardHoverPreview,
      getDragPointerId: ctx.getDragPointerId,
    });
  }

  return d;
}
