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

function badgeHtml(kw: string, n?: string, punc?: string) {
  const icon = KW_ICON[kw] ?? "";
  const label = n != null ? `${kw} ${n}` : kw;
  const tail = punc ? punc : "";
  return `<span class="kwBadge"><span class="kwIcon">${icon}</span> <span class="kwLabel">${label}</span><span class="kwPunc">${tail}</span></span>`;
}

const PUNC = "[,，、]";
const reNum  = new RegExp(`(취약|약화|출혈|교란|면역|S|F|드로우|피해|방어|블록|회복|소모|소실)\\s*([+-]?\\d+)\\s*(${PUNC})?`, "g");
const reBare = new RegExp(`(^|[^가-힣A-Za-z0-9_])(소모|소실)\\s*(${PUNC})?`, "g");

export function renderCardRichText(text: string): string {
  const src = String(text ?? "");
  let out = src.replace(reNum, (_m, kw, n, punc) => badgeHtml(kw, n, punc));
  out = out.replace(reBare, (_m, prefix, kw, punc) => `${prefix}${badgeHtml(kw, undefined, punc)}`);
  out = out.replace(/\\n/g, "<br>");
  return out;
}

export function renderCardRichTextNode(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "cardText";
  el.innerHTML = renderCardRichText(text);
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
