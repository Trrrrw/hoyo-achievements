import type { Catalog, Game } from "./types";
export class CatalogNetworkError extends Error {}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("hoyo-achievements.catalog.v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("catalogs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function store(
  game: Game,
  value?: Catalog,
): Promise<Catalog | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("catalogs", value ? "readwrite" : "readonly");
      const request = value
        ? tx.objectStore("catalogs").put(value, game)
        : tx.objectStore("catalogs").get(game);
      tx.oncomplete = () => resolve(value ?? request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function withOfflineCatalog(
  game: Game,
  load: () => Promise<Catalog>,
  storage = store,
): Promise<Catalog> {
  try {
    const catalog = { ...(await load()), savedAt: Date.now() };
    // 缓存失败不影响在线使用；只持久化校验完成的整份目录
    try {
      await storage(game, catalog);
    } catch {
      /* 在线目录仍可使用 */
    }
    return catalog;
  } catch (error) {
    if (!(error instanceof CatalogNetworkError)) throw error;
    let cached: Catalog | undefined;
    try {
      cached = await storage(game);
    } catch {
      /* 返回原始网络错误 */
    }
    if (cached) return { ...cached, offline: true };
    throw error;
  }
}
