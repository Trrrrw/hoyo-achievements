import { expect, test } from "bun:test";
import { CatalogCache } from "./catalog-cache";
import type { Catalog } from "./types";

const catalog = (): Catalog => ({ items: [], groups: [] });

test("游戏目录按游戏缓存，进行中与完成后的请求都复用", async () => {
  const calls: string[] = [];
  let resolve!: (value: Catalog) => void;
  const ys = catalog();
  const cache = new CatalogCache((game) => {
    calls.push(game);
    return game === "ys"
      ? new Promise((r) => {
          resolve = r;
        })
      : Promise.resolve(catalog());
  });
  const first = cache.get("ys");
  expect(cache.get("ys")).toBe(first);
  await cache.get("sr");
  resolve(ys);
  expect(await first).toBe(ys);
  expect(await cache.get("ys")).toBe(ys);
  expect(cache.peek("ys")).toBe(ys);
  expect(calls).toEqual(["ys", "sr"]);
});

test("加载失败可重试，不缓存错误", async () => {
  let calls = 0;
  const cache = new CatalogCache(async () => {
    if (++calls === 1) throw new Error("network");
    return catalog();
  });
  await expect(cache.get("ys")).rejects.toThrow("network");
  expect(cache.peek("ys")).toBeUndefined();
  await cache.get("ys");
  expect(calls).toBe(2);
});

test("刷新仅使指定游戏失效，过期请求不会覆盖刷新结果", async () => {
  const resolvers: ((value: Catalog) => void)[] = [];
  const cache = new CatalogCache(
    () => new Promise((resolve) => resolvers.push(resolve)),
  );
  const old = cache.get("ys");
  await Promise.resolve();
  cache.invalidate("ys");
  const fresh = cache.get("ys");
  const sr = cache.get("sr");
  await Promise.resolve();
  const newest = catalog();
  resolvers[1](newest);
  await fresh;
  resolvers[0](catalog());
  await old;
  expect(cache.peek("ys")).toBe(newest);
  expect(cache.get("sr")).toBe(sr);
  resolvers[2](catalog());
  await sr;
});
