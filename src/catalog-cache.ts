import type { Catalog, Game } from "./types";

// 缓存完整目录并复用进行中的请求，失败结果不进入缓存
export class CatalogCache {
  private entries = new Map<
    Game,
    { value?: Catalog; pending: Promise<Catalog> }
  >();

  constructor(private load: (game: Game) => Promise<Catalog>) {}

  peek(game: Game): Catalog | undefined {
    return this.entries.get(game)?.value;
  }

  get(game: Game): Promise<Catalog> {
    const existing = this.entries.get(game);
    if (existing) return existing.pending;
    const entry: { value?: Catalog; pending: Promise<Catalog> } = {
      pending: Promise.resolve()
        .then(() => this.load(game))
        .then((value) => {
          entry.value = value;
          return value;
        })
        .catch((error) => {
          if (this.entries.get(game) === entry) this.entries.delete(game);
          throw error;
        }),
    };
    this.entries.set(game, entry);
    return entry.pending;
  }

  invalidate(game: Game) {
    this.entries.delete(game);
  }
}
