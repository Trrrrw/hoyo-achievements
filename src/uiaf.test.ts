import { expect, test } from "bun:test";
import {
  exportUiaf,
  importProgress,
  importUiaf,
  timestampToDate,
  unknownTimestamp,
} from "./uiaf";
import {
  emptyDocument,
  updateRecord,
  validateDocument,
  type Document,
} from "./state";
import type { Achievement } from "./types";

const file = (list: unknown[], version = "v1.1") => ({
  info: { export_app: "test", uiaf_version: version },
  list,
});
const entry = (
  id = 80142,
  status = 2,
  current = 10,
  timestamp = 1725465600,
) => ({ id, status, current, timestamp });
const catalog: Achievement[] = [
  {
    id: "80142",
    name: "旋律",
    description: "",
    group_id: "1",
    group_name: "探索",
    group_order: 1,
    order: 1,
    hidden: false,
    rewards: [],
    target: 10,
    previous_id: null,
  },
];
const record = (completed: boolean, date = "", patch = {}): Document => ({
  format: 1,
  records: {
    "ys:80142": { completed, date, updatedAt: 1, device: "test", ...patch },
  },
});

test("UIAF v1.1 四种状态、部分进度和时间戳经备份及同步校验后仍无损导出", () => {
  const list = [
    entry(1, 0, 0, unknownTimestamp),
    entry(2, 1, 7, unknownTimestamp),
    entry(3, 2, 10, 1725465601),
    entry(4, 3, 30, 1725465602),
  ];
  const imported = importUiaf(file(list), emptyDocument(), 100);
  expect(Object.values(imported.records).map((p) => p.completed)).toEqual([
    false,
    false,
    true,
    true,
  ]);
  const backup = validateDocument(JSON.parse(JSON.stringify(imported)));
  expect(exportUiaf(backup, []).list).toEqual(list);
});

test("v1.0 无状态字段按已完成导入，不推断已领奖", () => {
  const imported = importUiaf(
    file([{ id: 80142, current: 10, timestamp: unknownTimestamp }], "v1.0"),
    emptyDocument(),
  );
  expect(imported.records["ys:80142"].completed).toBe(true);
  expect(imported.records["ys:80142"].date).toBe("");
  expect(exportUiaf(imported, catalog).list[0].status).toBe(2);
});

test("时间按 UTC+8 转换，未知时间保留空日期", () => {
  expect(timestampToDate(Date.parse("2024-09-04T20:00:00Z") / 1000)).toBe(
    "2024-09-05",
  );
  expect(timestampToDate(unknownTimestamp)).toBe("");
  const exported = exportUiaf(record(true, "2024-09-05"), catalog, 100000);
  expect(exported.list[0]).toEqual(
    entry(80142, 2, 10, Date.parse("2024-09-05T00:00:00+08:00") / 1000),
  );
  expect(exported.info.export_timestamp).toBe(100);
  expect(exported.info.uiaf_version).toBe("v1.1");
  expect(exportUiaf(record(true), []).list[0]).toEqual(
    entry(80142, 2, 0, unknownTimestamp),
  );
  expect(() => exportUiaf(record(true, "2024-02-30"), catalog)).toThrow();
});

test("导入覆盖文件列出的原神项，保留其他游戏和未列出的进度、旧备注", () => {
  const old = record(true, "2024-01-01", { note: "legacy", updatedAt: 500 });
  old.records["sr:1"] = {
    completed: true,
    date: "",
    updatedAt: 1,
    device: "test",
  };
  old.records["ys:2"] = {
    completed: true,
    date: "",
    updatedAt: 1,
    device: "test",
  };
  const imported = importUiaf(
    file([entry(80142, 1, 7, unknownTimestamp)]),
    old,
    100,
  );
  expect(imported.records["ys:80142"].completed).toBe(false);
  expect(imported.records["ys:80142"].updatedAt).toBe(501);
  expect(imported.records["ys:80142"].note).toBe("legacy");
  expect(imported.records["ys:2"]).toEqual(old.records["ys:2"]);
  expect(imported.records["sr:1"]).toEqual(old.records["sr:1"]);
  expect(exportUiaf(imported, []).list).toHaveLength(2);
});

test("自动识别两种格式，拒绝新版本、重复 ID、字符串数字和错误字段", () => {
  expect(importProgress(record(true), emptyDocument()).format).toBe("备份");
  expect(importProgress(file([entry()]), emptyDocument()).format).toBe("UIAF");
  for (const bad of [
    file([entry()], "v2.0"),
    file([entry(), entry()]),
    file([{ ...entry(), id: "80142" }]),
    file([{ ...entry(), status: 4 }]),
    file([{ ...entry(), current: -1 }]),
    file([{ ...entry(), timestamp: unknownTimestamp + 1 }]),
    file([{ id: 1, current: 0, timestamp: 0 }]),
  ])
    expect(() => importUiaf(bad, emptyDocument())).toThrow();
});

test("日期修改保留 UIAF 进度与领奖状态，取消完成后不再导出旧状态", () => {
  const values = new Map<string, string>();
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const imported = importUiaf(file([entry(80142, 3, 10)]), emptyDocument());
    const edited = updateRecord(imported, "ys", "80142", {
      date: "2024-09-06",
    });
    expect(exportUiaf(edited, catalog).list[0]).toEqual(
      entry(80142, 3, 10, Date.parse("2024-09-06T00:00:00+08:00") / 1000),
    );
    const cleared = updateRecord(edited, "ys", "80142", { date: "" });
    expect(exportUiaf(cleared, catalog).list[0].timestamp).toBe(
      unknownTimestamp,
    );
    const undone = updateRecord(edited, "ys", "80142", { completed: false });
    expect(exportUiaf(undone, catalog).list[0]).toEqual(
      entry(80142, 1, 0, unknownTimestamp),
    );
  } finally {
    if (original === undefined)
      Reflect.deleteProperty(globalThis, "localStorage");
    else
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
  }
});
