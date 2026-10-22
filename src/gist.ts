import { mergeDocuments, validateDocument, type Document } from "./state";
const filename = "hoyo-achievements.json";
const api = "https://api.github.com/gists";
export type GistSettings = { id: string; token: string };
export function gistId(value: string): string {
  const id = value.trim();
  if (!/^[a-f0-9]{1,64}$/i.test(id))
    throw new Error("请填写有效的 Gist ID（链接末尾的十六进制字符）");
  return id;
}
async function request(token: string, path: string, body?: unknown) {
  if (!token.trim()) throw new Error("请填写 GitHub Token，仅需 Gist 权限");
  const response = await fetch(`${api}${path}`, {
    method: body ? (path ? "PATCH" : "POST") : "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.trim()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub Gist 请求失败（${response.status}），请检查 ID、权限或 API 限额`,
    );
  return response.json();
}
async function read(settings: GistSettings): Promise<Document> {
  const gist = await request(settings.token, `/${gistId(settings.id)}`);
  const file = gist.files?.[filename];
  if (!file) throw new Error(`Gist 中缺少 ${filename}，请选择本站创建的 Gist`);
  let content = file.content;
  if (file.truncated) {
    const url = new URL(file.raw_url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "gist.githubusercontent.com" ||
      url.username ||
      url.password
    )
      throw new Error("Gist 原始文件地址无效");
    // 原始文件域名不接收 GitHub Token
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Gist 原始文件读取失败");
    content = await response.text();
  }
  if (typeof content !== "string" || content.length > 20_000_000)
    throw new Error("Gist 进度文件无效或过大");
  return validateDocument(JSON.parse(content));
}
const files = (document: Document) => ({
  [filename]: { content: JSON.stringify(document) },
});
export async function createGist(
  token: string,
  document: Document,
): Promise<string> {
  const result = await request(token, "", {
    description: "成就手册进度",
    public: false,
    files: files(validateDocument(document)),
  });
  return gistId(result.id);
}
function same(a: Document, b: Document) {
  const keys = Object.keys(a.records).sort();
  return (
    keys.length === Object.keys(b.records).length &&
    keys.every(
      (key) =>
        JSON.stringify(a.records[key]) === JSON.stringify(b.records[key]),
    )
  );
}
export async function syncGist(
  settings: GistSettings,
  current: () => Document,
  apply: (document: Document) => void,
): Promise<void> {
  const id = gistId(settings.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const merged = mergeDocuments(await read(settings), current());
    await request(settings.token, `/${id}`, { files: files(merged) });
    const verified = await read(settings);
    const final = mergeDocuments(merged, verified, current());
    apply(final);
    if (same(verified, final)) return;
  }
  throw new Error("进度持续变化，已保留合并后的本地数据，请稍后再次同步");
}
