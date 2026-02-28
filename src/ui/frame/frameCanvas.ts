import { drawNineSlice } from "../nineslice";

let frameCanvas: HTMLCanvasElement | null = null;
let frameCtx: CanvasRenderingContext2D | null = null;

let frameCanvas: HTMLCanvasElement | null = null;
let frameCtx: CanvasRenderingContext2D | null = null;

function ensureFrameCanvas(): CanvasRenderingContext2D {
  if (frameCanvas && frameCtx) return frameCtx;

  const c = document.createElement("canvas");
  c.className = "uiFrameCanvas";
  c.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
  `;
  document.body.appendChild(c);
  frameCanvas = c;
  frameCtx = c.getContext("2d")!;
  resizeFrameCanvasToViewport();
  return frameCtx;
}

function ensureBgLayer() {
  if (document.querySelector(".bgLayer")) return;

  const bg = document.createElement("div");
  bg.className = "bgLayer";
  document.body.appendChild(bg);
}


function resizeFrameCanvasToViewport() {
  if (!frameCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  frameCanvas.width = Math.floor(w * dpr);
  frameCanvas.height = Math.floor(h * dpr);
  frameCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawFramesOnPanels(imgs: any) {
  const ctx = ensureFrameCanvas();
  resizeFrameCanvasToViewport();


  const main = document.querySelector<HTMLElement>(".mainPanel");
  const log  = document.querySelector<HTMLElement>(".logPanel");

  if (!main || !log) {
    console.log("[frame] panels missing", { main: !!main, log: !!log });
    return;
  }


  const mr = main.getBoundingClientRect();
  const lr = log.getBoundingClientRect();

  const rects = [mr, lr];

  const border = {
    left: imgs.tl.naturalWidth,
    right: imgs.tr.naturalWidth,
    top: imgs.tl.naturalHeight,
    bottom: imgs.bl.naturalHeight,
  };

  const pad = 6;

  for (const r of rects) {
    drawNineSlice(
      ctx,
      imgs,
      Math.floor(r.left - pad),
      Math.floor(r.top - pad),
      Math.floor(r.width + pad * 2),
      Math.floor(r.height + pad * 2),
      border,
      {
        mode: "stretch",
        drawCenter: false,
        pixelated: true,
      }
    );
  }
}
