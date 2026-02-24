import "./style.css";

import { installUiFit, installLayoutMode } from "./ui/uiFit";
import { buildContent } from "./content";
import { render, createOrLoadGame, isDraggingNow, makeUIActions } from "./ui/ui";

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

  window.addEventListener("deckrogue:layout", request as any, { passive: true } as any);
  window.addEventListener("resize", request, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) request();
  });

  window.addEventListener("focus", () => {
    window.dispatchEvent(new CustomEvent("deckrogue:uiFit"));
    request();
  }, { passive: true } as any);

  window.visualViewport?.addEventListener("resize", request as any, { passive: true } as any);
  window.visualViewport?.addEventListener("scroll", request as any, { passive: true } as any);

  // 진짜 최후의 보루: 레이아웃 박스 크기 변하면 리렌더
  const ro = new ResizeObserver(() => request()); 
  ro.observe(document.documentElement);

  // 옵션: 초기 1회도 “안전빵”으로 맞춰주고 싶으면
  // request();
}

// ---- 실행 순서(이제부터는 전부 import 아래) ----
setAssetCssVars();
injectFontFaces();

installUiFit();
installLayoutMode();

installRerenderOnLayoutChange();

render(g, actions);

document.documentElement.style.setProperty("--base", import.meta.env.BASE_URL);