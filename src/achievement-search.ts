import { games, type Game } from "./types";

export function achievementSearchLinks(game: Game, name: string) {
  return {
    miyoushe: `https://www.miyoushe.com/${game}/search?keyword=${encodeURIComponent(name)}`,
    bilibili: `https://search.bilibili.com/all?keyword=${encodeURIComponent(`${games[game]} ${name}`)}`,
  };
}
