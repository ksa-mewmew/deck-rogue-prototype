import type { ItemData } from "../engine/types";

// 더미 아이템(소모품) 정의
// - art는 아이콘 경로(assets/..). 성후님이 PNG만 넣으면 UI에 뜹니다.
// - effects는 사용 시 즉시 적용되는 효과(쿨다운/턴 제한 없음)

export const ITEMS: ItemData[] = [
  {
    id: "item_balm",
    name: "약초 연고",
    text: "HP를 8 회복합니다. (소모)",
    art: "assets/items/item_balm.png",
    effects: [{ op: "heal", n: 8 }],
    priceGold: 16,
    consumable: true,
  },
  {
    id: "item_talisman",
    name: "단단한 부적",
    text: "방어(블록) 10을 얻습니다. (소모)",
    art: "assets/items/item_talisman.png",
    effects: [{ op: "block", n: 10 }],
    priceGold: 18,
    consumable: true,
  },
  {
    id: "item_dust",
    name: "저주 가루",
    text: "모든 적에게 취약 2를 부여합니다. (소모)",
    art: "assets/items/item_dust.png",
    effects: [{ op: "statusEnemy", target: "all", key: "vuln", n: 2 }],
    priceGold: 22,
    consumable: true,
  },
];

export const ITEMS_BY_ID: Record<string, ItemData> = Object.fromEntries(ITEMS.map((x) => [x.id, x]));

export function getItemDefById(id: string): ItemData | null {
  return (ITEMS_BY_ID as any)[id] ?? null;
}

export function pickRandomItemId(): string | null {
  if (ITEMS.length === 0) return null;
  return ITEMS[Math.floor(Math.random() * ITEMS.length)]?.id ?? null;
}
