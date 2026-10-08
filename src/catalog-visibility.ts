import type { Catalog, Game } from "./types";

// 已确认未实装的目录条目，按游戏和 ID 排除，避免影响同名成就
const excludedIds: Partial<Record<Game, ReadonlySet<string>>> = {
  ys: new Set(["84517"]), // 善事有善报
};

export function visibleCatalog(game: Game, catalog: Catalog): Catalog {
  const excluded = excludedIds[game];
  if (!excluded) return catalog;
  const items = catalog.items.filter((item) => !excluded.has(item.id));
  const totals = new Map<string, number>();
  for (const item of items)
    totals.set(item.group_id, (totals.get(item.group_id) ?? 0) + 1);
  return {
    items,
    groups: catalog.groups.map((group) => ({
      ...group,
      total: totals.get(group.id) ?? 0,
    })),
  };
}
