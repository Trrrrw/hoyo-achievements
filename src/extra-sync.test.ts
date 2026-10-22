import { afterEach, expect, test } from "bun:test";
import { createGist, gistId, syncGist } from "./gist";
import { syncFile, type ProgressFile } from "./file-sync";
import { emptyDocument, type Document } from "./state";
import { CatalogNetworkError, withOfflineCatalog } from "./offline-catalog";
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
const id = "a".repeat(32);
const doc = (key: string, time = 1): Document => ({
  format: 1,
  records: {
    [key]: { completed: true, date: "", updatedAt: time, device: "test" },
  },
});
const gist = (d: Document) =>
  Response.json({
    files: { "hoyo-achievements.json": { content: JSON.stringify(d) } },
  });
test("Gist 创建为秘密，只有进度进入远端文件", async () => {
  globalThis.fetch = (async (url, options) => {
    expect(String(url)).toBe("https://api.github.com/gists");
    const body = JSON.parse(String(options?.body));
    expect(body.public).toBe(false);
    expect(body.files["hoyo-achievements.json"].content).not.toContain(
      "secret-token",
    );
    return Response.json({ id });
  }) as typeof fetch;
  expect(await createGist("secret-token", doc("ys:1"))).toBe(id);
  expect(() => gistId("../admin")).toThrow();
  expect(gistId("1234567")).toBe("1234567");
});
test("Gist 同步期间的本地修改及核对发现的远端修改都会补写", async () => {
  let local = doc("ys:1"),
    remote = doc("sr:2"),
    calls = 0;
  globalThis.fetch = (async (_url, options) => {
    if (options?.method === "PATCH") {
      calls++;
      remote = JSON.parse(
        JSON.parse(String(options.body)).files["hoyo-achievements.json"]
          .content,
      );
      if (calls === 1) {
        local = {
          ...local,
          records: { ...local.records, ...doc("zzz:3").records },
        };
        remote.records["ys:4"] = doc("ys:4").records["ys:4"];
      }
      return gist(remote);
    }
    return gist(remote);
  }) as typeof fetch;
  await syncGist(
    { id, token: "token" },
    () => local,
    (d) => {
      local = d;
    },
  );
  expect(calls).toBe(2);
  expect(Object.keys(local.records).sort()).toEqual([
    "sr:2",
    "ys:1",
    "ys:4",
    "zzz:3",
  ]);
  expect(Object.keys(remote.records)).toHaveLength(4);
});
test("Gist 截断文件原始地址不携带 Token，鉴权失败不写本地", async () => {
  let calls = 0,
    applied = false;
  globalThis.fetch = (async (url, options) => {
    calls++;
    if (calls === 1)
      return Response.json({
        files: {
          "hoyo-achievements.json": {
            truncated: true,
            raw_url: "https://gist.githubusercontent.com/test/raw/a/file",
          },
        },
      });
    if (calls === 2) {
      expect(String(url)).toContain("gist.githubusercontent.com");
      expect(options?.headers).toBeUndefined();
      return new Response(JSON.stringify(doc("ys:1")));
    }
    return new Response("", { status: 401 });
  }) as typeof fetch;
  await expect(
    syncGist({ id, token: "private" }, emptyDocument, () => {
      applied = true;
    }),
  ).rejects.toThrow("401");
  expect(applied).toBe(false);
});
test("本地文件读写失败时不改本地，损坏文件不覆盖", async () => {
  let written = "",
    applied: Document | undefined;
  const handle: ProgressFile = {
    getFile: async () => ({ text: async () => JSON.stringify(doc("sr:2")) }),
    createWritable: async () => ({
      write: async (text) => {
        written = text;
      },
      close: async () => {},
      abort: async () => {},
    }),
  };
  await syncFile(
    handle,
    () => doc("ys:1"),
    (d) => {
      applied = d;
    },
  );
  expect(Object.keys(JSON.parse(written).records)).toHaveLength(2);
  expect(applied).toBeDefined();
  written = "";
  applied = undefined;
  handle.getFile = async () => ({ text: async () => "broken" });
  await expect(
    syncFile(handle, emptyDocument, (d) => {
      applied = d;
    }),
  ).rejects.toThrow();
  expect(written).toBe("");
  expect(applied).toBeUndefined();
});
test("仅网络故障使用完整离线目录，HTTP/目录错误不被缓存掩盖", async () => {
  const cached = { items: [], groups: [], savedAt: 123 };
  const storage = async () => cached;
  expect(
    await withOfflineCatalog(
      "ys",
      async () => {
        throw new CatalogNetworkError("offline");
      },
      storage,
    ),
  ).toEqual({ ...cached, offline: true });
  await expect(
    withOfflineCatalog(
      "ys",
      async () => {
        throw new Error("HTTP 404");
      },
      storage,
    ),
  ).rejects.toThrow("404");
});
test("缓存写入失败不阻断在线使用，失败或半份目录不进行缓存写入", async () => {
  const result = await withOfflineCatalog(
    "ys",
    async () => ({ items: [], groups: [] }),
    async () => {
      throw new Error("quota");
    },
  );
  expect(result.offline).toBeUndefined();
  expect(result.savedAt).toBeGreaterThan(0);
  let writes = 0;
  await expect(
    withOfflineCatalog(
      "ys",
      async () => {
        throw new Error("incomplete");
      },
      async (_game, value) => {
        if (value) writes++;
        return undefined;
      },
    ),
  ).rejects.toThrow("incomplete");
  expect(writes).toBe(0);
});
