import type { GameState, RelicId } from "../engine/types";
import { RELICS_BY_ID } from "./relicsContent";
import { pickOne } from "../engine/rules";

export type RelicOffer = {
  id: RelicId;
  name: string;
  desc?: string;
  art?: string;
};

function relicPool(g: GameState): RelicId[] {
  const owned = new Set<RelicId>(g.run.relics ?? []);
  return (Object.keys(RELICS_BY_ID) as RelicId[]).filter((id) => {
    const def: any = (RELICS_BY_ID as any)[id];
    if (!def) return false;
    if (def.debugOnly) return false;
    const tags = Array.isArray(def.tags) ? def.tags : [];
    if (tags.includes("EVENT_ONLY")) return false;
    if (owned.has(id)) return false;
    return true;
  });
}

export function offerRelicSingleContent(g: GameState, count: number = 1): { choices: RelicOffer[] } | null {
  const pool = relicPool(g);
  if (pool.length === 0) return null;

  const choices: RelicOffer[] = [];
  const available = pool.slice();

  const take = Math.min(count, available.length);
  for (let i = 0; i < take; i++) {
    const id = pickOne(available);
    const idx = available.indexOf(id);
    if (idx >= 0) available.splice(idx, 1);

    const def: any = (RELICS_BY_ID as any)[id] ?? {};
    choices.push({
      id,
      name: def.name ?? String(id),
      desc: def.desc ?? def.description ?? def.text,
      art: def.art,
    });
  }

  return { choices };
}

export function offerRelicSingle(g: GameState): RelicOffer | null {
  const r = offerRelicSingleContent(g, 1);
  return r ? r.choices[0] ?? null : null;
}