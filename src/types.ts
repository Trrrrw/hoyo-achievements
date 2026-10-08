export const games = {
  ys: "原神",
  sr: "崩坏：星穹铁道",
  zzz: "绝区零",
} as const;
export type Game = keyof typeof games;
export type Achievement = {
  id: string;
  name: string;
  description: string;
  group_id: string;
  group_name: string;
  group_order: number;
  order: number;
  hidden: boolean | null;
  rewards: { item_id: string; name: string | null; count: number }[];
  target: number | null;
  previous_id: string | null;
};
export type Group = { id: string; name: string; order: number; total: number };
export type Catalog = { items: Achievement[]; groups: Group[] };
