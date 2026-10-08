import { Icon } from "./ui";
import type { Achievement, Game } from "./types";
import { recordKey, type Document } from "./state";
import type { AchievementSeries } from "./achievement-series";

export function AchievementRow({
  series,
  document,
  game,
  disabled,
  edit,
  onSelect,
  reward,
}: {
  series: AchievementSeries;
  document: Document;
  game: Game;
  disabled: boolean;
  edit: (a: Achievement, patch: { completed: boolean }) => void;
  onSelect: (a: Achievement) => void;
  reward: (a: Achievement) => string;
}) {
  const a = series.stages[0];
  const done = document.records[recordKey(game, a.id)]?.completed ?? false;
  const completed = series.stages.filter(
    (stage) => document.records[recordKey(game, stage.id)]?.completed,
  ).length;
  const completion = (stage: Achievement, label: string) => (
    <label className="completion-control">
      <input
        type="checkbox"
        aria-label={label}
        checked={
          document.records[recordKey(game, stage.id)]?.completed ?? false
        }
        disabled={disabled}
        onChange={(e) => edit(stage, { completed: e.target.checked })}
      />
      <span className="completion-box">
        <Icon name="check" size={16} />
      </span>
    </label>
  );
  if (series.stages.length === 1)
    return (
      <li className={`achievement-row ${done ? "is-complete" : ""}`}>
        {completion(a, `完成 ${a.name}`)}
        <button className="achievement-body" onClick={() => onSelect(a)}>
          <span className="achievement-title">
            {a.name}
            {a.hidden === true && <span className="hidden-badge">隐藏</span>}
          </span>
          <span className="achievement-description">{a.description}</span>
          <span className="achievement-category">{a.group_name}</span>
        </button>
        <span className="achievement-reward">
          <Icon name="star" size={18} />
          <span>{reward(a)}</span>
        </span>
        <button
          className="row-open"
          aria-label={`查看 ${a.name}`}
          onClick={() => onSelect(a)}
        >
          <Icon name="chevron" size={17} />
        </button>
      </li>
    );
  return (
    <li
      className={`achievement-series ${completed === series.stages.length ? "is-complete" : ""}`}
    >
      <div className="series-heading">
        <span className="series-emblem" aria-hidden="true">
          <Icon name="star" size={22} />
        </span>
        <button
          className="achievement-body"
          onClick={() =>
            onSelect(
              series.stages.find(
                (stage) =>
                  !document.records[recordKey(game, stage.id)]?.completed,
              ) ?? a,
            )
          }
        >
          <span className="achievement-title">{a.name}</span>
          <span className="achievement-category">{a.group_name}</span>
        </button>
        <span className="series-count">
          已完成 {completed} / {series.stages.length} 阶段
        </span>
      </div>
      <ol className="stage-list" aria-label={`${a.name}的完成阶段`}>
        {series.stages.map((stage, index) => {
          const p = document.records[recordKey(game, stage.id)];
          return (
            <li
              key={stage.id}
              className={`stage-row ${p?.completed ? "is-complete" : ""}`}
            >
              {completion(stage, `完成 ${a.name} 第${index + 1}阶段`)}
              <button
                className="stage-body"
                aria-label={`查看 ${a.name} 第${index + 1}阶段`}
                onClick={() => onSelect(stage)}
              >
                <span className="stage-label">
                  第 {index + 1} 阶段
                  {stage.hidden === true && (
                    <span className="hidden-badge">隐藏</span>
                  )}
                </span>
                <span className="achievement-description">
                  {stage.description}
                </span>
              </button>
              <span className="achievement-reward">
                <Icon name="star" size={16} />
                <span>{reward(stage)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </li>
  );
}
