type NineSliceImages = {
  tl: HTMLImageElement; t: HTMLImageElement; tr: HTMLImageElement;
  l: HTMLImageElement;  c: HTMLImageElement; r: HTMLImageElement;
  bl: HTMLImageElement; b: HTMLImageElement; br: HTMLImageElement;
};

export type NineSliceBorders = { left: number; right: number; top: number; bottom: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${src}`));
  });
}

export async function loadNineSlice(basePath: string, prefix: string): Promise<NineSliceImages> {

  const p = (name: string) => `${basePath}/${prefix}_${name}.png`;

  const [tl,t,tr,l,c,r,bl,b,br] = await Promise.all([
    loadImage(p("tl")), loadImage(p("t")), loadImage(p("tr")),
    loadImage(p("l")),  loadImage(p("c")), loadImage(p("r")),
    loadImage(p("bl")), loadImage(p("b")), loadImage(p("br")),
  ]);

  return { tl,t,tr,l,c,r,bl,b,br };
}

type NineSliceMode = "stretch" | "repeat";

function clampMin(n: number, min: number) { return n < min ? min : n; }


export function drawNineSlice(
  ctx: CanvasRenderingContext2D,
  imgs: NineSliceImages,
  x: number, y: number, w: number, h: number,
  border: NineSliceBorders,
  opts?: { mode?: NineSliceMode; drawCenter?: boolean; pixelated?: boolean }
) {
  const mode: NineSliceMode = opts?.mode ?? "stretch";
  const drawCenter = opts?.drawCenter ?? true;

  // 너무 작은 박스에도 안전하게: 좌/우/상/하 보더는 박스 크기를 넘지 않게 조정
  let L = border.left, R = border.right, T = border.top, B = border.bottom;
  L = Math.min(L, Math.floor(w / 2));
  R = Math.min(R, Math.floor(w / 2));
  T = Math.min(T, Math.floor(h / 2));
  B = Math.min(B, Math.floor(h / 2));

  const cx = x + L;
  const cy = y + T;
  const cw = clampMin(w - L - R, 0);
  const ch = clampMin(h - T - B, 0);

  // 픽셀아트 느낌이면 스무딩 끄기
  const prevSmoothing = ctx.imageSmoothingEnabled;
  if (opts?.pixelated) ctx.imageSmoothingEnabled = false;

  // 1) 코너 4개 (고정)
  ctx.drawImage(imgs.tl, x, y, L, T);
  ctx.drawImage(imgs.tr, x + w - R, y, R, T);
  ctx.drawImage(imgs.bl, x, y + h - B, L, B);
  ctx.drawImage(imgs.br, x + w - R, y + h - B, R, B);

  // 2) 변 4개 + 중앙
  if (mode === "stretch") {
    // 상/하
    ctx.drawImage(imgs.t,  cx, y,          cw, T);
    ctx.drawImage(imgs.b,  cx, y + h - B,  cw, B);
    // 좌/우
    ctx.drawImage(imgs.l,  x,  cy,         L,  ch);
    ctx.drawImage(imgs.r,  x + w - R, cy,  R,  ch);
    // 중앙
    if (drawCenter) ctx.drawImage(imgs.c, cx, cy, cw, ch);
  } else {
    // repeat 타일링: 작은 이미지 반복해 채우기
    const patT = ctx.createPattern(imgs.t, "repeat")!;
    const patB = ctx.createPattern(imgs.b, "repeat")!;
    const patL = ctx.createPattern(imgs.l, "repeat")!;
    const patR = ctx.createPattern(imgs.r, "repeat")!;
    const patC = drawCenter ? ctx.createPattern(imgs.c, "repeat")! : null;

    // 상
    ctx.save();
    ctx.translate(cx, y);
    ctx.fillStyle = patT;
    ctx.fillRect(0, 0, cw, T);
    ctx.restore();

    // 하
    ctx.save();
    ctx.translate(cx, y + h - B);
    ctx.fillStyle = patB;
    ctx.fillRect(0, 0, cw, B);
    ctx.restore();

    // 좌
    ctx.save();
    ctx.translate(x, cy);
    ctx.fillStyle = patL;
    ctx.fillRect(0, 0, L, ch);
    ctx.restore();

    // 우
    ctx.save();
    ctx.translate(x + w - R, cy);
    ctx.fillStyle = patR;
    ctx.fillRect(0, 0, R, ch);
    ctx.restore();

    // 중앙
    if (patC) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = patC;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
  }

  ctx.imageSmoothingEnabled = prevSmoothing;
}

