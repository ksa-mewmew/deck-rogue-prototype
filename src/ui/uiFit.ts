const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const cssNum = (cs: CSSStyleDeclaration, name: string, fallback: number) => {
  const v = parseFloat(cs.getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};

const getViewportWH = () => {
  const vv = window.visualViewport;
  const w = vv?.width ?? window.innerWidth;
  const h = vv?.height ?? window.innerHeight;
  return { vw: Math.max(1, w), vh: Math.max(1, h) };
};

const getUBasePx = (vw: number, vh: number) => {
  return Math.min(vw / 1440, vh / 900);
};

const getOrientation = (vw: number, vh: number) => {
  if (vh >= vw * 1.08) return "portrait";
  if (vw >= vh * 1.08) return "landscape";
  return "square";
};

const getUrlFlags = () => {

  try {
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("mobile") ?? sp.get("m");
    const d = sp.get("desktop");
    const orient = sp.get("orient") as any;
    const forceMobile = m === "1" ? true : m === "0" ? false : null;
    const forceDesktop = d === "1" ? true : null;

    const forceDevice = forceDesktop ? false : forceMobile;
    const forceOrient = orient === "portrait" || orient === "landscape" || orient === "square" ? orient : null;
    return { forceDevice, forceOrient };
  } catch {
    return {
      forceDevice: null as boolean | null,
      forceOrient: null as ("portrait" | "landscape" | "square") | null,
    };
  }
};


export const isMobileLike = (vw: number) => {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return coarse && vw <= 980;
};

export function installUiFit() {
  const r = document.documentElement;

  const urlFlags = getUrlFlags();


  const BASE_SLOT_W = 180;
  const BASE_SLOT_AR_W = 5;
  const BASE_SLOT_AR_H = 7;
  const BASE_COLS = 3;


  const EDGE_PAD = 14;
  const LOG_W = 360;
  const LOG_GAP = 14;
  const PLAYER_W = 320;

  const HUD_H = 64;
  const DOCK_H = 160;
  const UI_GAP = 16;

  const SLOT_GAP_X = 22;
  const SLOT_GAP_Y = 6;
  const CHROME_H = 140;

  let raf = 0;
  let lastKey = "";

  const fit = () => {
    raf = 0;

    const cs = getComputedStyle(r);
    const { vw, vh } = getViewportWH();

    const mobile = urlFlags.forceDevice ?? isMobileLike(vw);
    const userMulRaw = mobile
      ? cssNum(cs, "--uiScaleMobile", 1)
      : cssNum(cs, "--uiScaleDesktop", 1);
    const userMul = clamp(userMulRaw, 0.65, 1.5);

    const baseBoardW = BASE_COLS * BASE_SLOT_W + (BASE_COLS - 1) * SLOT_GAP_X;
    const slotH = BASE_SLOT_W * (BASE_SLOT_AR_H / BASE_SLOT_AR_W);
    const baseBoardH = slotH * 2 + SLOT_GAP_Y + CHROME_H;

    const orient = urlFlags.forceOrient ?? getOrientation(vw, vh);
    const mobilePortrait = mobile && orient === "portrait";

    const totalWUnits = mobilePortrait
      ? (EDGE_PAD * 2 + baseBoardW)
      : (EDGE_PAD * 2 + PLAYER_W + LOG_W + LOG_GAP * 2 + baseBoardW);

    const MOBILE_LOG_MIN_H = 220;
    const totalHUnits = mobilePortrait
      ? (HUD_H + DOCK_H + UI_GAP + baseBoardH + MOBILE_LOG_MIN_H)
      : (HUD_H + DOCK_H + UI_GAP + baseBoardH);

    const desiredU = Math.min(vw / totalWUnits, vh / totalHUnits);

    const uBase = getUBasePx(vw, vh);
    const fitUiScale = desiredU / Math.max(1e-6, uBase);

    const fitScale = clamp(fitUiScale, 0.55, 1.25);

    const finalScale = clamp(fitScale * userMul, 0.55, 2.0);

    r.style.setProperty("--uiScaleFit", String(fitScale));
    r.style.setProperty("--uiScale", String(finalScale));

    const key = `${Math.round(vw)}x${Math.round(vh)}|${finalScale.toFixed(4)}`;
    if (key !== lastKey) {
      lastKey = key;
      window.dispatchEvent(new CustomEvent("deckrogue:layout"));
    }
  };

  const requestFit = () => {
    if (raf) return;
    raf = requestAnimationFrame(fit);
  };

  window.addEventListener("resize", requestFit, { passive: true });
  window.visualViewport?.addEventListener("resize", requestFit, { passive: true });
  window.visualViewport?.addEventListener("scroll", requestFit, { passive: true });

  window.addEventListener("deckrogue:uiFit", requestFit as any, { passive: true } as any);

  fit();
}

export function installLayoutMode() {
  let compact = false;
  let raf = 0;

  let lastKey = "";

  const urlFlags = getUrlFlags();

  const setMode = () => {
    const { vw, vh } = getViewportWH();
    const orient = urlFlags.forceOrient ?? getOrientation(vw, vh);
    const mobile = urlFlags.forceDevice ?? isMobileLike(vw);

    if (!compact && vw < 1180) compact = true;
    if (compact && vw > 1220) compact = false;

    const b = document.body;
    b.classList.toggle("compact", compact);

    b.classList.toggle("mobile", mobile);
    b.classList.toggle("desktop", !mobile);

    b.classList.toggle("portrait", orient === "portrait");
    b.classList.toggle("landscape", orient === "landscape");
    b.classList.toggle("square", orient === "square");

    const key = [
      compact ? "c" : "n",
      mobile ? "m" : "d",
      orient,
      Math.round(vw),
      Math.round(vh),
    ].join("|");

    if (key !== lastKey) {
      lastKey = key;
      window.dispatchEvent(new CustomEvent("deckrogue:layout"));
    }
  };

  const request = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      setMode();
    });
  };

  window.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("resize", request, { passive: true });
  window.visualViewport?.addEventListener("scroll", request, { passive: true });

  setMode();
}
