const KW_ICON: Record<string, string> = {
  "취약": "🎯",
  "약화": "🥀",
  "출혈": "🩸",
  "교란": "🌀",
  "면역": "✨",
  "S": "🍞",
  "F": "💤",
  "드로우": "🃏",
  "피해": "🗡️",
  "회복": "💊",
  "방어": "🛡️",
  "블록": "🛡️",
  "소모": "🔥",
  "소실": "🕳️",
};

function badgeHtml(kw: string, n?: string, punc?: string, numDeltaClass?: string) {
  const icon = KW_ICON[kw] ?? "";
  const nHtml = n != null
    ? (numDeltaClass ? `<span class="${numDeltaClass}">${n}</span>` : n)
    : "";
  const label = n != null ? `${kw} ${nHtml}` : kw;
  const tail = punc ? punc : "";
  return `<span class="kwBadge"><span class="kwIcon">${icon}</span> <span class="kwLabel">${label}</span><span class="kwPunc">${tail}</span></span>`;
}

const PUNC = "[,，、]";
const reNum  = new RegExp(`(취약|약화|출혈|교란|면역|S|F|드로우|피해|방어|블록|회복|소모|소실)\\s*([+-]?\\d+)\\s*(${PUNC})?`, "g");
const reBare = new RegExp(`(^|[^가-힣A-Za-z0-9_])(소모|소실)\\s*(${PUNC})?`, "g");

function pickNumDeltaClass(currentText: string, baseText: string): (shownNum: string) => string {
  const baseNums: number[] = [];
  String(baseText ?? "").replace(reNum, (_m, _kw, nText) => {
    const n = Number(nText);
    baseNums.push(Number.isFinite(n) ? n : 0);
    return _m;
  });

  const shownNums: number[] = [];
  String(currentText ?? "").replace(reNum, (_m, _kw, nText) => {
    const n = Number(nText);
    shownNums.push(Number.isFinite(n) ? n : 0);
    return _m;
  });

  let idx = 0;
  return (shownNum: string) => {
    const shown = Number(shownNum);
    const before = baseNums[idx] ?? shown;
    const now = shownNums[idx] ?? shown;
    idx += 1;
    if (!Number.isFinite(shown) || !Number.isFinite(before) || !Number.isFinite(now)) return "";
    if (now > before) return "numDeltaUp";
    if (now < before) return "numDeltaDown";
    return "";
  };
}

export function renderCardRichText(text: string, baseText?: string): string {
  const src = String(text ?? "");
  const getClass = pickNumDeltaClass(src, baseText ?? src);
  let out = src.replace(reNum, (_m, kw, n, punc) => badgeHtml(kw, n, punc, getClass(String(n))));
  out = out.replace(reBare, (_m, prefix, kw, punc) => `${prefix}${badgeHtml(kw, undefined, punc)}`);
  out = out.replace(/\\n/g, "<br>");
  return out;
}

export function renderCardRichTextNode(text: string, baseText?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "cardText";
  el.innerHTML = renderCardRichText(text, baseText);
  return el;
}

export function plainTextFromRich(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(plainTextFromRich).join("");
  if (typeof node === "object") {
    if ((node as any).text) return String((node as any).text);
    if ((node as any).children) return plainTextFromRich((node as any).children);
  }
  return "";
}
