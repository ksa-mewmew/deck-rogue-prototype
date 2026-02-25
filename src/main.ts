import "./style.css";

import { installUiFit, installLayoutMode } from "./ui/uiFit";
import { buildContent } from "./content";
import { render, createOrLoadGame, isDraggingNow, makeUIActions } from "./ui/ui";
import { isMobileLike } from "./ui/uiFit";

const content = buildContent();
let g = createOrLoadGame(content);

let actions = makeUIActions(g, setGame);

function setGame(next: typeof g) {
  g = next;
  actions = makeUIActions(g, setGame);
  render(g, actions);
}

function setAssetCssVars() {
  let base = import.meta.env.BASE_URL || "/";
  if (!base.endsWith("/")) base += "/";

  const root = document.documentElement;
  const setUrl = (cssVar: string, relPath: string) => {
    root.style.setProperty(cssVar, `url("${base}${relPath}")`);
  };

  setUrl("--cardBgBasic", "assets/ui/cards/card_basic.png");
  setUrl("--cardBgCommon", "assets/ui/cards/card_common.png");
  setUrl("--cardBgSpecial", "assets/ui/cards/card_special.png");
  setUrl("--cardBgRare", "assets/ui/cards/card_rare.png");
  setUrl("--cardBgMadness", "assets/ui/cards/card_madness.png");
}

function injectFontFaces() {
  let base = import.meta.env.BASE_URL || "/";
  if (!base.endsWith("/")) base += "/";

  const css = `
@font-face{
  font-family: "Mulmaru";
  src:
    url("${base}assets/fonts/Mulmaru.woff2") format("woff2"),
    url("${base}assets/fonts/Mulmaru.woff") format("woff");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
  `.trim();

  let style = document.getElementById("fontFaces") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "fontFaces";
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function installHandDockVarSync() {
  let raf = 0;

  const sync = () => {
    raf = 0;
    const dock = document.querySelector(".handDock") as HTMLElement | null;
    if (!dock) return;

    const r = document.documentElement;
    const rect = dock.getBoundingClientRect();

    r.style.setProperty("--handDockTopPx", `${rect.top}px`);
    r.style.setProperty("--handDockRightPx", `${rect.right}px`);
    r.style.setProperty("--handDockBottomPx", `${rect.bottom}px`);
    r.style.setProperty("--handDockLeftPx", `${rect.left}px`);
  };

  const request = () => {
    if (raf) return;
    raf = requestAnimationFrame(sync);
  };

  window.addEventListener("deckrogue:layout", request as any, { passive: true } as any);
  window.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("resize", request as any, { passive: true } as any);
  window.visualViewport?.addEventListener("scroll", request as any, { passive: true } as any);

  request();
}

function installRerenderOnLayoutChange() {
  let raf = 0;
  let pending = false;

  const doRender = () => {
    raf = 0;

    if (isDraggingNow()) {
      pending = true;
      window.setTimeout(() => {
        if (pending) request();
      }, 120);
      return;
    }

    pending = false;
    render(g, actions);
  };

  const request = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => requestAnimationFrame(doRender));
  };

  const requestFit = () => {
    window.dispatchEvent(new CustomEvent("deckrogue:uiFit"));
  };

  window.addEventListener("deckrogue:layout", request as any, { passive: true } as any);
  window.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("resize", request as any, { passive: true } as any);
  window.visualViewport?.addEventListener("scroll", request as any, { passive: true } as any);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) request();
  });

  window.addEventListener(
    "focus",
    () => {
      requestFit();
      request();
    },
    { passive: true } as any
  );

  const ro = new ResizeObserver(() => request());
  ro.observe(document.documentElement);

  requestFit();
  request();
}

setAssetCssVars();
injectFontFaces();

installUiFit();
installLayoutMode();

installHandDockVarSync();
installRerenderOnLayoutChange();

render(g, actions);

document.documentElement.style.setProperty("--base", import.meta.env.BASE_URL);

// 모바일 감지 및 orientation 클래스 적용
const { vw, vh } = (() => {
  const vv = window.visualViewport;
  return {
    vw: vv?.width ?? window.innerWidth,
    vh: vv?.height ?? window.innerHeight,
  };
})();

const mobile = isMobileLike(vw);
const orient = (vh >= vw * 1.08) ? "portrait" : (vw >= vh * 1.08) ? "landscape" : "square";

document.body.classList.toggle("mobile", mobile);
document.body.classList.toggle("desktop", !mobile);
document.body.classList.toggle("portrait", orient === "portrait");
document.body.classList.toggle("landscape", orient === "landscape");
document.body.classList.toggle("square", orient === "square");