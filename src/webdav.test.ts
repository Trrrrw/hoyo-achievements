import { expect, test } from "bun:test";
import { davUrl, syncWebDav } from "./webdav";
import { emptyDocument, type Document } from "./state";
const config = {
  url: "https://dav.example.com/progress.json",
  username: "user",
  password: "test-password",
};
const progress = (id: string, updatedAt: number): Document => ({
  format: 1,
  records: {
    [`ys:${id}`]: {
      completed: true,
      date: "",
      note: "",
      device: "test",
      updatedAt,
    },
  },
});
test("首次创建使用 If-None-Match，远端和本地合并不覆盖", async () => {
  let local = progress("1", 1),
    writes = 0;
  const request = (async (_: unknown, options: RequestInit) => {
    if (options.method === "GET") return new Response(null, { status: 404 });
    expect(new Headers(options.headers).get("If-None-Match")).toBe("*");
    writes++;
    expect(JSON.parse(String(options.body))).toEqual(local);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  await syncWebDav(
    config,
    () => local,
    (d) => (local = d),
    request,
  );
  expect(writes).toBe(1);
});
test("ETag 冲突重新读取，保留并发远端和本地修改", async () => {
  let local = progress("1", 1),
    gets = 0,
    puts = 0;
  const request = (async (_: unknown, options: RequestInit) => {
    if (options.method === "GET") {
      gets++;
      return new Response(JSON.stringify(progress(gets === 1 ? "2" : "3", 2)), {
        headers: { ETag: `"v${gets}"` },
      });
    }
    puts++;
    expect(new Headers(options.headers).get("If-Match")).toBe(`"v${gets}"`);
    return new Response(null, { status: puts === 1 ? 412 : 204 });
  }) as typeof fetch;
  await syncWebDav(
    config,
    () => local,
    (d) => (local = d),
    request,
  );
  expect(gets).toBe(2);
  expect(Object.keys(local.records).sort()).toEqual(["ys:1", "ys:3"]);
});
test("同步期间的新本地编辑不会丢失", async () => {
  let local = emptyDocument();
  const request = (async (_: unknown, options: RequestInit) => {
    if (options.method === "GET")
      return new Response(JSON.stringify(emptyDocument()), {
        headers: { ETag: '"v1"' },
      });
    local = progress("1", 3);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await syncWebDav(
    config,
    () => local,
    (d) => (local = d),
    request,
  );
  expect(local.records["ys:1"]!.completed).toBe(true);
});
test("鉴权失败、损坏 JSON 或缺失 ETag 都不覆盖远端", async () => {
  for (const response of [
    new Response(null, { status: 401 }),
    new Response("not json", { headers: { ETag: '"v1"' } }),
    new Response(JSON.stringify(emptyDocument())),
  ]) {
    let puts = 0;
    const request = (async (_: unknown, o: RequestInit) => {
      if (o.method === "PUT") puts++;
      return response;
    }) as typeof fetch;
    await expect(
      syncWebDav(config, emptyDocument, () => {}, request),
    ).rejects.toThrow();
    expect(puts).toBe(0);
  }
});
test("禁用外部明文和 URL 内凭据", () => {
  expect(() => davUrl("http://dav.example.com/progress.json")).toThrow();
  expect(() =>
    davUrl("https://user:password@dav.example.com/progress.json"),
  ).toThrow();
  expect(davUrl("http://127.0.0.1:8010/progress.json")).toContain("127.0.0.1");
});
