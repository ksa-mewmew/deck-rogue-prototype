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

let suppressHoverUntil = 0;
let pinnedCardUid: string | null = null;

export function isHoverSuppressed() {
  return performance.now() < suppressHoverUntil;
}

export function suppressHover(ms = 250) {
  suppressHoverUntil = performance.now() + ms;
}

export function getPinnedCardUid() {
  return pinnedCardUid;
}

export function setPinnedCardUid(uid: string | null) {
  pinnedCardUid = uid;
}

function div(cls?: string) {
  const el = document.createElement("div");
  if (cls) el.className = cls;
  return el;
}

export function clearCardHoverPreview() {
  pinnedCardUid = null;
  try {
    cardHoverApi.hide();
  } catch {}
  const pv = document.querySelector(".cardHoverPreview");
  if (pv) pv.classList.remove("on", "pinned");
}

export const cardHoverApi = createCardHoverPreviewApi();

function createCardHoverPreviewApi(): CardHoverPreviewApi {
  let panel: HTMLElement | null = null;
  let titleEl: HTMLElement | null = null;
  let cardHost: HTMLElement | null = null;
  let detailEl: HTMLElement | null = null;
  let pinned = false;
  let wiredOutsideClose = false;

  function ensure(root: HTMLElement) {
    if (panel) return;

    panel = div("cardHoverPreview");
    titleEl = div("cardHoverPreviewTitle");
    const row = div("cardHoverPreviewRow");
    cardHost = div("cardHoverPreviewCard");
    detailEl = div("cardHoverPreviewDetail");

    row.appendChild(cardHost);
    row.appendChild(detailEl);

    panel.appendChild(titleEl);
    panel.appendChild(row);

    root.appendChild(panel);

    if (!wiredOutsideClose) {
      wiredOutsideClose = true;
      document.addEventListener(
        "pointerdown",
        (ev) => {
          if (!pinned || !panel) return;
          const t = ev.target as HTMLElement | null;
          if (!t) return;
          if (panel.contains(t)) return;
          pinnedCardUid = null;
          unpin();
          hide();
        },
        true
      );
    }
  }

  function show(p: CardHoverPreviewPayload) {
    if (!panel || !titleEl || !cardHost || !detailEl) return;

    titleEl.textContent = p.title;

    cardHost.innerHTML = "";
    if (p.cardEl) cardHost.appendChild(p.cardEl);

    detailEl.textContent = p.detail;

    panel.classList.add("on");
  }

  function hide() {
    if (!panel) return;
    panel.classList.remove("on");
  }

  function pin() {
    if (!panel) return;
    pinned = true;
    panel.classList.add("pinned");
    panel.style.pointerEvents = "auto";
  }

  function unpin() {
    if (!panel) return;
    pinned = false;
    panel.classList.remove("pinned");
    panel.style.pointerEvents = "none";
  }

  function isPinned() {
    return pinned;
  }

  return { ensure, show, hide, pin, unpin, isPinned } as any;
}
