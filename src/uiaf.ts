import {
  mergeDocuments,
  recordKey,
  validateDocument,
  type Document,
} from "./state";
import type { Achievement } from "./types";

import {
  unknownTimestamp,
  timestampToDate,
  dateToTimestamp,
} from "./uiaf-time";
export { unknownTimestamp, timestampToDate } from "./uiaf-time";
type Entry = {
  id: number;
  current: number;
  status: 0 | 1 | 2 | 3;
  timestamp: number;
};
export type Uiaf = {
  info: {
    export_app: string;
    export_app_version: string;
    uiaf_version: "v1.1";
    export_timestamp: number;
  };
  list: Entry[];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("UIAF 文件结构无效");
  return value as Record<string, unknown>;
}
function integer(
  value: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error("UIAF 的 ID、进度、状态和时间戳必须是有效数字");
  return value;
}
export function importUiaf(
  value: unknown,
  existing: Document,
  now = Date.now(),
): Document {
  const raw = object(value),
    info = object(raw.info);
  if (
    typeof info.export_app !== "string" ||
    !["v1.0", "v1.1"].includes(String(info.uiaf_version))
  )
    throw new Error("仅支持 UIAF v1.0 和 v1.1，请检查文件格式");
  if (!Array.isArray(raw.list) || raw.list.length > 100000)
    throw new Error("UIAF 成就列表无效或过大");
  if (
    (info.export_app_version !== undefined &&
      typeof info.export_app_version !== "string") ||
    (info.export_timestamp !== undefined &&
      (typeof info.export_timestamp !== "number" ||
        !Number.isFinite(info.export_timestamp)))
  )
    throw new Error("UIAF 导出信息无效");
  const imported: Document = { format: 1, records: Object.create(null) };
  for (const value of raw.list) {
    const entry = object(value);
    const id = integer(entry.id, 1),
      current = integer(entry.current, 0),
      timestamp = integer(entry.timestamp, 0, unknownTimestamp);
    const status = (
      info.uiaf_version === "v1.0" ? 2 : integer(entry.status, 0, 3)
    ) as Entry["status"];
    const key = recordKey("ys", String(id));
    if (imported.records[key]) throw new Error(`UIAF 包含重复的成就 ID：${id}`);
    const old = existing.records[key];
    imported.records[key] = {
      completed: status >= 2,
      date: status >= 2 ? timestampToDate(timestamp) : "",
      ...(old?.note !== undefined ? { note: old.note } : {}),
      updatedAt: Math.max(now, (old?.updatedAt ?? 0) + 1),
      device: "uiaf-import",
      uiaf: { current, status, timestamp },
    };
  }
  return mergeDocuments(existing, imported);
}

export function importProgress(
  value: unknown,
  existing: Document,
): { document: Document; format: "UIAF" | "备份" } {
  const raw = object(value);
  if ("info" in raw || "list" in raw)
    return { document: importUiaf(raw, existing), format: "UIAF" };
  return {
    document: mergeDocuments(existing, validateDocument(value)),
    format: "备份",
  };
}

export function exportUiaf(
  document: Document,
  catalog: Achievement[],
  now = Date.now(),
): Uiaf {
  const targets = new Map(catalog.map((a) => [a.id, a.target]));
  const list: Entry[] = Object.entries(document.records)
    .filter(([key]) => key.startsWith("ys:"))
    .map(([key, progress]) => {
      const rawId = key.slice(3);
      if (!/^[1-9]\d*$/.test(rawId))
        throw new Error("原神进度含非数字 ID，请使用全部游戏备份导出");
      const id = integer(Number(rawId), 1);
      const source = progress.uiaf;
      return {
        id,
        current:
          source?.current ??
          (progress.completed ? (targets.get(rawId) ?? 0) : 0),
        status: source?.status ?? (progress.completed ? 2 : 1),
        timestamp:
          source?.timestamp ??
          (progress.completed
            ? dateToTimestamp(progress.date)
            : unknownTimestamp),
      };
    })
    .sort((a, b) => a.id - b.id);
  return {
    info: {
      export_app: "米游成就",
      export_app_version: "0.1.0",
      uiaf_version: "v1.1",
      export_timestamp: Math.floor(now / 1000),
    },
    list,
  };
}
