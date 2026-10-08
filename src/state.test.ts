import { expect, test } from "bun:test";
import { mergeDocuments, validateDocument, type Document } from "./state";
const state = (
  completed: boolean,
  updatedAt: number,
  device = "one",
): Document => ({
  format: 1,
  records: { "ys:1": { completed, date: "", note: "", updatedAt, device } },
});
test("跨设备取消完成保留为新记录，不被旧完成状态复活", () => {
  const a = state(true, 1),
    b = state(false, 2);
  expect(mergeDocuments(a, b).records["ys:1"]!.completed).toBe(false);
  expect(mergeDocuments(a, b)).toEqual(mergeDocuments(b, a));
});
test("同一时间的冲突仍确定性收敛", () => {
  const a = state(true, 2, "alpha"),
    b = state(false, 2, "beta");
  expect(mergeDocuments(a, b)).toEqual(mergeDocuments(b, a));
});
test("导入拒绝未知游戏和危险记录结构，去除额外字段", () => {
  expect(() =>
    validateDocument({ format: 1, records: { unknown: {} } }),
  ).toThrow();
  expect(() =>
    validateDocument({ format: 1, records: { "ys:1": { completed: "yes" } } }),
  ).toThrow();
  const original = state(true, 1);
  (original.records["ys:1"] as any).password = "secret";
  expect(
    (validateDocument(original).records["ys:1"] as any).password,
  ).toBeUndefined();
});
