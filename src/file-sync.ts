import { mergeDocuments, validateDocument, type Document } from "./state";
export type ProgressFile = {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{
    write(content: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
};
export async function syncFile(
  handle: ProgressFile,
  current: () => Document,
  apply: (document: Document) => void,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await (await handle.getFile()).text();
    // 空文件是初始化；已有文件损坏时禁止覆盖
    const remote = raw.trim()
      ? validateDocument(JSON.parse(raw))
      : { format: 1 as const, records: {} };
    const merged = mergeDocuments(remote, current());
    const writable = await handle.createWritable();
    try {
      await writable.write(JSON.stringify(merged, null, 2));
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch {
        /* 保留原始写入错误 */
      }
      throw error;
    }
    const latest = mergeDocuments(merged, current());
    apply(latest);
    if (
      Object.keys(latest.records).length ===
        Object.keys(merged.records).length &&
      Object.keys(latest.records).every(
        (key) =>
          JSON.stringify(latest.records[key]) ===
          JSON.stringify(merged.records[key]),
      )
    )
      return;
  }
  throw new Error("同步期间仍有编辑，请再次同步以保存最新进度");
}
