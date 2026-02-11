export function installUiFit() {
  const r = document.documentElement;


  const BASE_SLOT_W = 180;   // px
  const BASE_SLOT_AR_W = 5;
  const BASE_SLOT_AR_H = 7;

  // 보드: 3칸 + gap 2개
  const BASE_COLS = 3;

  const fit = () => {
    const cs = getComputedStyle(r);

    const vw = window.innerWidth;
    const vh = window.innerHeight;


    const hudH    = parseFloat(cs.getPropertyValue("--hudH")) || 140;
    const dockH   = parseFloat(cs.getPropertyValue("--dockH")) || 210;
    const uiGap   = parseFloat(cs.getPropertyValue("--uiGap")) || 16;
    const edgePad = parseFloat(cs.getPropertyValue("--edgePad")) || 14;
    const logW    = parseFloat(cs.getPropertyValue("--logW")) || 360;
    const logGap  = parseFloat(cs.getPropertyValue("--logGap")) || 14;
    const playerW = parseFloat(cs.getPropertyValue("--playerW")) || 320;


    const availW = Math.max(
      320,
      vw - (playerW + logW + logGap * 2 + edgePad * 2)
    );
    const availH = Math.max(
      260,
      vh - (hudH + dockH + uiGap)
    );


    const baseGapX = parseFloat(cs.getPropertyValue("--slotGapX")) || 22;
    const baseBoardW = BASE_COLS * BASE_SLOT_W + (BASE_COLS - 1) * baseGapX;


    const slotH = BASE_SLOT_W * (BASE_SLOT_AR_H / BASE_SLOT_AR_W); // 180*(7/5)=252
    const baseGapY = parseFloat(cs.getPropertyValue("--slotGapY")) || 6;
    const baseBoardH =
      slotH * 2 + baseGapY +  // 슬롯 두 줄 + 줄간격
      140;                    // 전장 안의 타이틀/버튼/여백

    const uW = availW / baseBoardW;
    const uH = availH / baseBoardH;
    const u = Math.min(uW, uH);

    // 너무 작아지는 거 방지
    const clamped = Math.max(0.55, Math.min(u, 1.25));
    r.style.setProperty("--u", String(clamped));
  };

  window.addEventListener("resize", fit, { passive: true });
  fit();
}

export function installLayoutMode(){
  const setMode = () => {
    const vw = window.innerWidth;

    // 임계값: 필요하면 1100~1400 사이에서 조절
    document.body.classList.toggle("compact", vw < 1200);
  };

  window.addEventListener("resize", setMode, { passive: true });
  setMode();
}