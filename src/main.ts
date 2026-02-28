import "./style.css";

import { installUiFit, installLayoutMode } from "./ui/uiFit";
import { buildContent } from "./content";
import { render, createOrLoadGame, isDraggingNow, makeUIActions } from "./ui/ui";
import { applyAssetVarsOnce } from "./ui/assets";
import { isMobileLike } from "./ui/uiFit";

const content = buildContent();
let g = createOrLoadGame(content);

let actions = makeUIActions(g, setGame);

function setGame(next: typeof g) {
  g = next;
  actions = makeUIActions(g, setGame);
  render(g, actions);
}

function runtimeBasePath() {
  let base = import.meta.env.BASE_URL || "/";
  if (base && base !== "/") {
    if (!base.endsWith("/")) base += "/";
    return base;
  }

  try {
    const p = new URL(import.meta.url).pathname;
    const idx = p.indexOf("/src/");
    if (idx >= 0) {
      const inferred = p.slice(0, idx + 1);
      return inferred.endsWith("/") ? inferred : `${inferred}/`;
    }
  } catch {}

  try {
    const path = window.location.pathname || "/";
    const m = path.match(/^\/([^/]+)\//);
    if (m && m[1] && m[1] !== "src") return `/${m[1]}/`;
  } catch {}

  return "/";
}

function setAssetCssVars() {
  const base = runtimeBasePath();

  const root = document.documentElement;
  const setUrl = (cssVar: string, relPath: string) => {
    root.style.setProperty(cssVar, `url("${base}${relPath}")`);
  };

  setUrl("--cardBgBasic", "assets/ui/cards/card_basic.png");
  setUrl("--cardBgCommon", "assets/ui/cards/card_common.png");
  setUrl("--cardBgSpecial", "assets/ui/cards/card_special.png");
  setUrl("--cardBgRare", "assets/ui/cards/card_rare.png");
  setUrl("--cardBgMadness", "assets/ui/cards/card_madness.png");
  setUrl("--cardUrl", "assets/ui/cards/card_parchment.png");
  setUrl("--bgUrl", "assets/ui/background/dungeon_bg.png");
  setUrl("--boardUrl", "assets/ui/boards/battle_board.png");
  setUrl("--mapBgUrl", "assets/ui/background/map_bg.png");
}

function injectFontFaces() {
  const base = runtimeBasePath();

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

  const request = (_ev?: Event) => {
    if (raf) return;
    raf = requestAnimationFrame(sync);
  };

  window.addEventListener("deckrogue:layout", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("scroll", request, { passive: true });

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

  const request = (_ev?: Event) => {
    if (raf) return;
    raf = requestAnimationFrame(() => requestAnimationFrame(doRender));
  };

  const requestFit = () => {
    window.dispatchEvent(new CustomEvent("deckrogue:uiFit"));
  };

  window.addEventListener("deckrogue:layout", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("scroll", request, { passive: true });

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

applyAssetVarsOnce();
installUiFit();
installLayoutMode();

installHandDockVarSync();
installRerenderOnLayoutChange();

render(g, actions);

document.documentElement.style.setProperty("--base", runtimeBasePath());

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