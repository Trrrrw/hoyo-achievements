import { games, type Game } from "./types";
import { dateToTimestamp } from "./uiaf-time";
export type Progress = {
  completed: boolean;
  date: string;
  note?: string;
  uiaf?: { current: number; status: 0 | 1 | 2 | 3; timestamp: number };
  updatedAt: number;
  device: string;
};
export type Document = { format: 1; records: Record<string, Progress> };
export const storageKey = "hoyo-achievements.progress.v1";
const deviceKey = "hoyo-achievements.device.v1";
export const emptyDocument = (): Document => ({
  format: 1,
  records: Object.create(null) as Record<string, Progress>,
});
export function recordKey(game: Game, id: string): string {
  return `${game}:${id}`;
}
export function validateDocument(value: unknown): Document {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("同步文件格式无效");
  const d = value as Record<string, unknown>;
  if (
    d.format !== 1 ||
    !d.records ||
    typeof d.records !== "object" ||
    Array.isArray(d.records)
  )
    throw new Error("不支持的进度文件格式");
  const entries = Object.entries(d.records);
  if (entries.length > 100000) throw new Error("进度文件过大");
  const result = emptyDocument();
  for (const [key, raw] of entries) {
    const [game, ...ids] = key.split(":");
    const id = ids.join(":");
    if (
      !Object.hasOwn(games, game) ||
      !id ||
      id.length > 128 ||
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    )
      throw new Error("进度记录无效");
    const p = raw as Record<string, unknown>;
    if (
      typeof p.completed !== "boolean" ||
      typeof p.date !== "string" ||
      (p.date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) ||
      (p.note !== undefined &&
        (typeof p.note !== "string" || p.note.length > 10000)) ||
      !Number.isSafeInteger(p.updatedAt) ||
      Number(p.updatedAt) < 0 ||
      typeof p.device !== "string" ||
      !p.device ||
      p.device.length > 128
    )
      throw new Error("进度记录字段无效");
    result.records[key] = {
      completed: p.completed,
      date: p.date,
      ...(typeof p.note === "string" ? { note: p.note } : {}),
      updatedAt: Number(p.updatedAt),
      device: p.device,
    };
    if (p.uiaf !== undefined) {
      const u = p.uiaf as Record<string, unknown>;
      if (
        !u ||
        typeof u !== "object" ||
        Array.isArray(u) ||
        !Number.isSafeInteger(u.current) ||
        Number(u.current) < 0 ||
        ![0, 1, 2, 3].includes(Number(u.status)) ||
        typeof u.status !== "number" ||
        !Number.isSafeInteger(u.timestamp) ||
        Number(u.timestamp) < 0 ||
        Number(u.timestamp) > 253402271999 ||
        p.completed !== Number(u.status) >= 2
      )
        throw new Error("UIAF 进度字段无效");
      result.records[key].uiaf = {
        current: Number(u.current),
        status: u.status as 0 | 1 | 2 | 3,
        timestamp: Number(u.timestamp),
      };
    }
  }
  return result;
}
// 相同时戳按设备和内容排序，保证两端收敛；未完成记录也保留，防止重置后复活
export function mergeDocuments(...documents: Document[]): Document {
  const result = emptyDocument();
  for (const d of documents)
    for (const [key, p] of Object.entries(d.records)) {
      const old = result.records[key];
      if (
        !old ||
        p.updatedAt > old.updatedAt ||
        (p.updatedAt === old.updatedAt &&
          JSON.stringify(p) > JSON.stringify(old))
      )
        result.records[key] = { ...p };
    }
  return result;
}
export function loadDocument(): Document {
  const raw = localStorage.getItem(storageKey);
  return raw ? validateDocument(JSON.parse(raw)) : emptyDocument();
}
export function saveDocument(document: Document): void {
  localStorage.setItem(storageKey, JSON.stringify(document));
}
export function updateRecord(
  document: Document,
  game: Game,
  id: string,
  patch: Partial<Pick<Progress, "completed" | "date">>,
): Document {
  let device = localStorage.getItem(deviceKey);
  if (!device) {
    device = crypto.randomUUID();
    localStorage.setItem(deviceKey, device);
  }
  const key = recordKey(game, id),
    previous = document.records[key];
  const p: Progress = {
    ...(previous ?? { completed: false, date: "" }),
    ...patch,
    updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1),
    device,
  };
  if (patch.completed !== undefined && patch.completed !== previous?.completed)
    delete p.uiaf;
  else if (patch.date !== undefined && patch.date !== previous?.date && p.uiaf)
    p.uiaf = { ...p.uiaf, timestamp: dateToTimestamp(patch.date) };
  if (patch.completed === true && !previous?.completed && !p.date)
    p.date = new Date().toLocaleDateString("sv-SE");
  if (!p.completed) p.date = "";
  return mergeDocuments(document, { format: 1, records: { [key]: p } });
}
