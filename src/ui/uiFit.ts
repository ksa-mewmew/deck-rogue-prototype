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

const getOrientation = (vw: number, vh: number) => {
  // 주소창/툴바 등으로 vh가 흔들릴 때 깜빡임 방지(약간의 히스테리시스)
  if (vh >= vw * 1.08) return "portrait";
  if (vw >= vh * 1.08) return "landscape";
  return "square";
};

const getUrlFlags = () => {
  // PC에서 모바일 레이아웃을 강제로 테스트하기 위한 플래그
  // 예)
  //  - ?mobile=1  (강제 모바일)
  //  - ?mobile=0  (강제 데스크탑)
  //  - ?m=1 / ?m=0 (동일)
  //  - ?orient=portrait|landscape|square (강제 방향)
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
    const mobile = urlFlags.forceDevice ?? isMobileLike(vw);
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
    //
    // 모바일 세로(portrait)에서는 "보드 + 손패"가 최우선으로 들어오도록
    // 사이드 패널(플레이어/로그)을 fit 계산에서 제외(배치는 CSS가 담당).
    const orient = urlFlags.forceOrient ?? getOrientation(vw, vh);
    const mobilePortrait = mobile && orient === "portrait";

    const totalWUnits = mobilePortrait
      ? (EDGE_PAD * 2 + baseBoardW)
      : (EDGE_PAD * 2 + PLAYER_W + LOG_W + LOG_GAP * 2 + baseBoardW);

    // 세로 모드에서 로그 패널을 하단에 스택/시트로 둘 때를 감안해 최소 여유를 둠
    const MOBILE_LOG_MIN_H = 220;
    const totalHUnits = mobilePortrait
      ? (HUD_H + DOCK_H + UI_GAP + baseBoardH + MOBILE_LOG_MIN_H)
      : (HUD_H + DOCK_H + UI_GAP + baseBoardH);

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

  let lastKey = "";

  const urlFlags = getUrlFlags();

  const setMode = () => {
    const { vw, vh } = getViewportWH();
    const orient = urlFlags.forceOrient ?? getOrientation(vw, vh);
    const mobile = urlFlags.forceDevice ?? isMobileLike(vw);

    // 히스테리시스(깜빡임 방지)
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
