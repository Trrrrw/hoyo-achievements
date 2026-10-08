import type { Catalog, Game, Achievement, Group } from "./types";
import { visibleCatalog } from "./catalog-visibility";
const base = (
  import.meta.env.VITE_AKASHA_URL ||
  (import.meta.env.DEV ? "" : "https://akasha.trrw.cn")
).replace(/\/$/, "");
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${base}/api/v1${path}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok) throw new Error(`Akasha 请求失败（${response.status}）`);
  return response.json() as Promise<T>;
}
export async function getCatalog(
  game: Game,
  signal: AbortSignal,
): Promise<Catalog> {
  const groups = await get<{ items: Group[] }>(
    `/games/${game}/achievement-groups`,
    signal,
  );
  const items: Achievement[] = [];
  let expected: number | undefined;
  while (true) {
    const page = await get<{ total: number; items: Achievement[] }>(
      `/games/${game}/achievements?limit=100&offset=${items.length}`,
      signal,
    );
    if (expected !== undefined && expected !== page.total)
      throw new Error("目录正在更新，请重新加载");
    expected = page.total;
    if (
      !Array.isArray(page.items) ||
      !Number.isSafeInteger(expected) ||
      expected < 0 ||
      expected > 100000
    )
      throw new Error("成就目录响应无效");
    if (page.items.length === 0 && items.length < expected)
      throw new Error("成就目录分页不完整");
    items.push(...page.items);
    if (items.length >= expected) break;
  }
  if (
    new Set(items.map((a) => a.id)).size !== items.length ||
    groups.items.reduce((n, g) => n + g.total, 0) !== items.length
  )
    throw new Error("目录正在更新，请重新加载");
  return visibleCatalog(game, { items, groups: groups.items });
}
