import { expect, test } from "bun:test";
import {
  groupAchievementStages,
  filterAchievementSeries,
} from "./achievement-series";
import { emptyDocument, type Document } from "./state";
import type { Achievement } from "./types";

const stage = (
  id: string,
  previous_id: string | null,
  target = 1,
  patch: Partial<Achievement> = {},
): Achievement => ({
  id,
  previous_id,
  target,
  name: "旋律收藏",
  description: `激活${target}首旋律`,
  group_id: "one",
  group_name: "探索",
  group_order: 1,
  order: Number(id),
  hidden: false,
  rewards: [],
  ...patch,
});
const stages = () => [
  stage("1", null, 10),
  stage("2", "1", 30),
  stage("3", "2", 60),
];
const completed = (...ids: string[]): Document => ({
  format: 1,
  records: Object.fromEntries(
    ids.map((id) => [
      `ys:${id}`,
      { completed: true, date: "", note: "", updatedAt: 1, device: "test" },
    ]),
  ),
});

test("按照前置链合并并排序，支持不同名称和任意数量的阶段", () => {
  const items = [...stages(), stage("4", "3", 100, { name: "最后一段旋律" })];
  const grouped = groupAchievementStages([
    items[2],
    items[3],
    items[0],
    items[1],
  ]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].stages.map((a) => a.id)).toEqual(["1", "2", "3", "4"]);
});

test("同名但没有关联、跨分类或缺失前置的成就保持独立", () => {
  const grouped = groupAchievementStages([
    stage("1", null),
    stage("2", null),
    stage("3", "1", 1, { group_id: "other" }),
    stage("4", "missing"),
  ]);
  expect(grouped).toHaveLength(4);
});

test("循环关联不会死循环或被合并为正常阶段", () => {
  expect(
    groupAchievementStages([stage("1", "2"), stage("2", "1")]),
  ).toHaveLength(2);
});

test("搜索任意阶段描述或 ID 时保留完整阶段链", () => {
  const series = groupAchievementStages(stages());
  expect(
    filterAchievementSeries(
      series,
      emptyDocument(),
      "ys",
      "all",
      "all",
      "60首",
    )[0].stages,
  ).toHaveLength(3);
  expect(
    filterAchievementSeries(series, emptyDocument(), "ys", "all", "all", "3"),
  ).toHaveLength(1);
  expect(
    filterAchievementSeries(series, emptyDocument(), "ys", "other", "all", ""),
  ).toHaveLength(0);
});

test("部分阶段完成仍属未完成，全部阶段完成后才进入已完成", () => {
  const series = groupAchievementStages(stages());
  expect(
    filterAchievementSeries(series, completed("1"), "ys", "all", "todo", ""),
  ).toHaveLength(1);
  expect(
    filterAchievementSeries(series, completed("1"), "ys", "all", "done", ""),
  ).toHaveLength(0);
  expect(
    filterAchievementSeries(
      series,
      completed("1", "2", "3"),
      "ys",
      "all",
      "done",
      "",
    ),
  ).toHaveLength(1);
  expect(
    filterAchievementSeries(
      series,
      completed("1", "2", "3"),
      "ys",
      "all",
      "todo",
      "",
    ),
  ).toHaveLength(0);
});
