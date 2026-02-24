// src/ui/uiFit.ts
//
// 목적:
// 1) --uiScale을 "레이아웃/뷰포트"에 맞춰 자동 산출(DevTools 도킹/언도킹에도 안정)
// 2) 설정(UI 스케일 슬라이더)이 즉시 반영되도록 커스텀 이벤트(deckrogue:uiFit) 지원
//
// 원칙:
// - --uBase는 CSS에서 viewport 기반으로 계산됨(1440x900 기준).
// - 여기서는 "필요한 1 design-unit(px)"을 직접 계산 → uiScale = (필요 u) / uBase
// - 이렇게 하면 이전 uiScale/렌더 상태에 영향을 덜 받음(=F5 같은 안정감)

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
  // style.css의: --uBase: min(100vw/1440, 100vh/900)
  return Math.min(vw / 1440, vh / 900);
};

const isMobileLike = (vw: number) => {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return coarse && vw <= 980;
};

export function installUiFit() {
  const r = document.documentElement;

  // ===== 보드(슬롯) 기본 설계 단위 =====
  const BASE_SLOT_W = 180;
  const BASE_SLOT_AR_W = 5;
  const BASE_SLOT_AR_H = 7;
  const BASE_COLS = 3;

  // ===== 주변 UI(좌/우/상/하) 설계 단위 =====
  // style.css의 토큰과 맞춘 값(단위는 "design-unit")
  const EDGE_PAD = 14;
  const LOG_W = 360;
  const LOG_GAP = 14;
  const PLAYER_W = 320;

  const HUD_H = 64;
  const DOCK_H = 160;
  const UI_GAP = 16; // uiGap 토큰이 없는 경우 대비

  // 슬롯 간격/전투 크롬 높이(코드에서 쓰던 기본값)
  const SLOT_GAP_X = 22;
  const SLOT_GAP_Y = 6;
  const CHROME_H = 140;

  let raf = 0;
  let lastKey = "";

  const fit = () => {
    raf = 0;

    const cs = getComputedStyle(r);
    const { vw, vh } = getViewportWH();

    // 사용자 배율(설정)
    const mobile = isMobileLike(vw);
    const userMulRaw = mobile
      ? cssNum(cs, "--uiScaleMobile", 1)
      : cssNum(cs, "--uiScaleDesktop", 1);
    const userMul = clamp(userMulRaw, 0.65, 1.5);

    // 보드 크기(설계 단위)
    const baseBoardW = BASE_COLS * BASE_SLOT_W + (BASE_COLS - 1) * SLOT_GAP_X;
    const slotH = BASE_SLOT_W * (BASE_SLOT_AR_H / BASE_SLOT_AR_W);
    const baseBoardH = slotH * 2 + SLOT_GAP_Y + CHROME_H;

    // 전체 레이아웃이 동일한 u(=var(--u))로 스케일 된다고 가정.
    // (현재 style.css가 대부분 var(--u) 기반이므로 이 가정이 잘 맞음)
    const totalWUnits = EDGE_PAD * 2 + PLAYER_W + LOG_W + LOG_GAP * 2 + baseBoardW;
    const totalHUnits = HUD_H + DOCK_H + UI_GAP + baseBoardH;

    // viewport(px)에서 필요한 design-unit(px) 값
    const desiredU = Math.min(vw / totalWUnits, vh / totalHUnits);

    // CSS의 uBase(px) 대비 uiScale(무차원)
    const uBase = getUBasePx(vw, vh);
    const fitUiScale = desiredU / Math.max(1e-6, uBase);

    // 자동 fit 스케일(설정 적용 전)
    const fitScale = clamp(fitUiScale, 0.55, 1.25);

    // 최종 스케일 = fit × user
    const finalScale = clamp(fitScale * userMul, 0.55, 2.0);

    // 디버그용
    r.style.setProperty("--uiScaleFit", String(fitScale));
    r.style.setProperty("--uiScale", String(finalScale));

    // 레이아웃 이벤트(뷰포트/스케일이 바뀌면)
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

  // ✅ 설정(UI 스케일) 변경 시 즉시 반영
  window.addEventListener("deckrogue:uiFit", requestFit as any, { passive: true } as any);

  fit();
}

export function installLayoutMode() {
  // 현재 CSS에 compact 분기가 없어도, 나중 확장을 위해 유지.
  let compact = false;
  let raf = 0;

  const setMode = () => {
    const vw = window.innerWidth;

    // 히스테리시스(깜빡임 방지)
    if (!compact && vw < 1180) compact = true;
    if (compact && vw > 1220) compact = false;

    const before = document.body.classList.contains("compact");
    document.body.classList.toggle("compact", compact);
    const after = document.body.classList.contains("compact");

    if (before !== after) {
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

  setMode();
}
