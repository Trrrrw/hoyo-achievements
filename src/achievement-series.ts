import type { Achievement, Game } from "./types";
import { recordKey, type Document } from "./state";

export type AchievementSeries = { id: string; stages: Achievement[] };

// 只使用同分类中的明确前置关联，同名的独立成就不会被合并
export function groupAchievementStages(
  items: Achievement[],
): AchievementSeries[] {
  const byId = new Map(items.map((a) => [a.id, a]));
  const series = new Map<
    string,
    { achievement: Achievement; depth: number }[]
  >();
  for (const achievement of items) {
    const seen = new Set<string>();
    let root = achievement;
    let depth = 0;
    while (root.previous_id) {
      seen.add(root.id);
      const previous = byId.get(root.previous_id);
      if (!previous || previous.group_id !== achievement.group_id) break;
      if (seen.has(previous.id)) {
        root = achievement;
        depth = 0;
        break;
      }
      root = previous;
      depth++;
    }
    const stages = series.get(root.id) ?? [];
    stages.push({ achievement, depth });
    series.set(root.id, stages);
  }
  return [...series].map(([id, stages]) => ({
    id,
    stages: stages
      .sort(
        (a, b) =>
          a.depth - b.depth ||
          a.achievement.order - b.achievement.order ||
          a.achievement.id.localeCompare(b.achievement.id),
      )
      .map((s) => s.achievement),
  }));
}

export function filterAchievementSeries(
  series: AchievementSeries[],
  document: Document,
  game: Game,
  group: string,
  status: string,
  query: string,
): AchievementSeries[] {
  const search = query.trim().toLocaleLowerCase();
  return series.filter(({ stages }) => {
    const done = stages.every(
      (a) => document.records[recordKey(game, a.id)]?.completed,
    );
    return (
      (group === "all" || stages[0].group_id === group) &&
      (status === "all" || (status === "done" ? done : !done)) &&
      (!search ||
        stages.some((a) =>
          `${a.name}\n${a.description}\n${a.id}`
            .toLocaleLowerCase()
            .includes(search),
        ))
    );
  });
}
