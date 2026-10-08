import {
  mergeDocuments,
  validateDocument,
  emptyDocument,
  type Document,
} from "./state";
export type DavSettings = { url: string; username: string; password: string };
export function davUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.search)
    throw new Error("WebDAV 地址不能包含凭据、查询或片段");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("WebDAV 需要 HTTPS");
  if (!url.pathname.endsWith(".json"))
    throw new Error("请填写完整的 .json 文件地址");
  return url.href;
}
function authorization(settings: DavSettings): string {
  if (settings.username.includes(":"))
    throw new Error("WebDAV 用户名不能包含冒号");
  const bytes = new TextEncoder().encode(
    `${settings.username}:${settings.password}`,
  );
  return `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
}
export async function syncWebDav(
  settings: DavSettings,
  readLocal: () => Document,
  writeLocal: (d: Document) => void,
  request: typeof fetch = fetch,
): Promise<void> {
  const url = davUrl(settings.url),
    auth = authorization(settings);
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const remote = await request(url, {
        method: "GET",
        headers: { Authorization: auth },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      let document = emptyDocument();
      let etag: string | null = null;
      if (remote.ok) {
        const raw = await remote.text();
        if (raw.length > 5_000_000) throw new Error("WebDAV 进度文件过大");
        document = validateDocument(JSON.parse(raw));
        etag = remote.headers.get("ETag");
        if (!etag || etag.startsWith("W/"))
          throw new Error("WebDAV 未提供可用的 ETag，请配置 CORS 暴露 ETag");
      } else if (remote.status !== 404)
        throw new Error(`WebDAV 读取失败（${remote.status}）`);
      const merged = mergeDocuments(document, readLocal());
      const result = await request(url, {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          ...(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
        },
        body: JSON.stringify(merged),
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      if (result.status === 412 || result.status === 409) continue;
      if (!result.ok) throw new Error(`WebDAV 写入失败（${result.status}）`);
      // 网络请求期间的新编辑不能被远端响应覆盖
      const latest = mergeDocuments(merged, readLocal());
      writeLocal(latest);
      if (JSON.stringify(latest) !== JSON.stringify(merged)) continue;
      return;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("WebDAV 文件连续发生冲突，请稍后重试");
}
