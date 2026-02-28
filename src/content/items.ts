import type { ItemData } from "../engine/types";


export const ITEMS: ItemData[] = [
  {
    id: "item_balm",
    name: "약초 연고",
    text: "HP 8 회복. (소모)",
    art: "assets/items/item_balm.png",
    effects: [{ op: "heal", n: 8 }],
    priceGold: 16,
    consumable: true,
  },
  {
    id: "item_talisman",
    name: "단단한 부적",
    text: "🛡️ 방어 10 획득. (소모)",
    art: "assets/items/item_talisman.png",
    effects: [{ op: "block", n: 10 }],
    priceGold: 18,
    consumable: true,
  },
  {
    id: "item_dust",
    name: "저주 가루",
    text: "모든 적에게 취약 2 부여. (소모)",
    art: "assets/items/item_dust.png",
    effects: [{ op: "statusEnemy", target: "all", key: "vuln", n: 2 }],
    priceGold: 22,
    consumable: true,
  },

  {
    id: "item_moon_scroll",
    name: "달빛 두루마리",
    text: "달빛 두루마리 1장을 손패에 추가. (소모)",
    art: "assets/items/item_moon_scroll.png",
    effects: [{ op: "addCardToHand", defId: "token_moon_scroll", n: 1 }],
    priceGold: 18,
    consumable: true,
  },
  {
    id: "item_triple_swap",
    name: "교환권",
    text: "손패에서 무작위 세 장을 버림, 🃏 드로우 3. (소모)",
    art: "assets/items/item_triple_swap.png",
    effects: [{ op: "discardHandRandom", n: 3 }, { op: "draw", n: 3 }],
    priceGold: 20,
    consumable: true,
  },
  {
    id: "item_stanch_cloth",
    name: "지혈 천",
    text: "출혈을 0으로 설정. (소모)",
    art: "assets/items/item_stanch_cloth.png",
    effects: [{ op: "clearStatusSelf", key: "bleed" }],
    priceGold: 17,
    consumable: true,
  },
  {
    id: "item_supply_sack",
    name: "보급 자루",
    text: "🍞 S를 5로 설정. (소모)",
    art: "assets/items/item_supply_sack.png",
    effects: [{ op: "setSupplies", n: 5 }],
    priceGold: 19,
    consumable: true,
  },
  {
    id: "item_clear_incense",
    name: "맑은 향로",
    text: "교란을 0으로 설정. (소모)",
    art: "assets/items/item_clear_incense.png",
    effects: [{ op: "clearStatusSelf", key: "disrupt" }],
    priceGold: 17,
    consumable: true,
  },
  {
    id: "item_throwing_spike",
    name: "투척용 가시",
    text: "모든 적에게 출혈 3 부여. (소모)",
    art: "assets/items/item_throwing_spike.png",
    effects: [{ op: "statusEnemy", target: "all", key: "bleed", n: 3 }],
    priceGold: 23,
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
