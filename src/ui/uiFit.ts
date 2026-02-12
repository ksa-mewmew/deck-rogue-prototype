
export function installUiFit() {
  const r = document.documentElement;

  const BASE_SLOT_W = 180; // px
  const BASE_SLOT_AR_W = 5;
  const BASE_SLOT_AR_H = 7;

  const BASE_COLS = 3;

  let raf = 0;

  const fit = () => {
    raf = 0;

    const cs = getComputedStyle(r);

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const hudH = parseFloat(cs.getPropertyValue("--hudH")) || 140;
    const dockH = parseFloat(cs.getPropertyValue("--dockH")) || 210;
    const uiGap = parseFloat(cs.getPropertyValue("--uiGap")) || 16;
    const edgePad = parseFloat(cs.getPropertyValue("--edgePad")) || 14;
    const logW = parseFloat(cs.getPropertyValue("--logW")) || 360;
    const logGap = parseFloat(cs.getPropertyValue("--logGap")) || 14;
    const playerW = parseFloat(cs.getPropertyValue("--playerW")) || 320;


    const baseGapX = parseFloat(cs.getPropertyValue("--slotGapXBase")) || 22;
    const baseGapY = parseFloat(cs.getPropertyValue("--slotGapYBase")) || 6;

    // 전장(중앙) 가용 영역
    const availW = Math.max(320, vw - (playerW + logW + logGap * 2 + edgePad * 2));
    const availH = Math.max(260, vh - (hudH + dockH + uiGap));

    // 보드(3칸) 기준 크기
    const baseBoardW = BASE_COLS * BASE_SLOT_W + (BASE_COLS - 1) * baseGapX;

    const slotH = BASE_SLOT_W * (BASE_SLOT_AR_H / BASE_SLOT_AR_W);


    const chromeH = parseFloat(cs.getPropertyValue("--battleChromeHBase")) || 140;

    const baseBoardH =
      slotH * 2 +
      baseGapY +
      chromeH;

    const uW = availW / baseBoardW;
    const uH = availH / baseBoardH;
    const u = Math.min(uW, uH);


    const clamped = Math.max(0.55, Math.min(u, 1.25));
    r.style.setProperty("--u", String(clamped));
  };

  const onResize = () => {
    if (raf) return;
    raf = requestAnimationFrame(fit);
  };

  window.addEventListener("resize", onResize, { passive: true });
  fit();
}

export function installLayoutMode() {

  let compact = false;

  const setMode = () => {
    const vw = window.innerWidth;

    if (!compact && vw < 1180) compact = true;
    if (compact && vw > 1220) compact = false;

    document.body.classList.toggle("compact", compact);
  };

  let raf = 0;
  const onResize = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      setMode();
    });
  };

  window.addEventListener("resize", onResize, { passive: true });
  setMode();
}