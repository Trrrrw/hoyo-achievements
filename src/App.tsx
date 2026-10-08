import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Overlay } from "./ui";
import { getCatalog } from "./api";
import { exportUiaf, importProgress } from "./uiaf";
import { CatalogCache } from "./catalog-cache";
import { achievementSearchLinks } from "./achievement-search";
import {
  groupAchievementStages,
  filterAchievementSeries,
} from "./achievement-series";
import { AchievementRow } from "./AchievementRow";
import { games, type Achievement, type Catalog, type Game } from "./types";
import {
  emptyDocument,
  loadDocument,
  mergeDocuments,
  recordKey,
  saveDocument,
  storageKey,
  updateRecord,
  type Document,
} from "./state";
import { davUrl, syncWebDav, type DavSettings } from "./webdav";
const davKey = "hoyo-achievements.webdav.v1";
function initialDav(): DavSettings {
  try {
    const value = JSON.parse(localStorage.getItem(davKey) || "{}");
    return {
      url: typeof value.url === "string" ? value.url : "",
      username: typeof value.username === "string" ? value.username : "",
      password: "",
    };
  } catch {
    return { url: "", username: "", password: "" };
  }
}
export default function App() {
  const [notice, setNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"backup" | "uiaf">("uiaf");
  const message = {
    error: (value: string) => setNotice(value),
    success: (value: string) => setNotice(value),
  };
  const [game, setGame] = useState<Game>("ys"),
    [catalog, setCatalog] = useState<Catalog>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  const [catalogCache] = useState(
    () =>
      new CatalogCache((game) =>
        getCatalog(game, new AbortController().signal),
      ),
  );
  const [document, setDocument] = useState<Document>(emptyDocument),
    [storageError, setStorageError] = useState("");
  const documentRef = useRef(document);
  const [group, setGroup] = useState("all"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState<Achievement>(),
    [settingsOpen, setSettingsOpen] = useState(false),
    [dav, setDav] = useState(initialDav),
    [draftDav, setDraftDav] = useState(initialDav),
    [syncing, setSyncing] = useState(false),
    [page, setPage] = useState(1);
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function apply(d: Document) {
    try {
      saveDocument(d);
      documentRef.current = d;
      setDocument(d);
      setStorageError("");
    } catch {
      setStorageError("浏览器保存失败，请检查存储空间或导出备份");
      throw new Error("浏览器保存失败");
    }
  }
  function current() {
    return mergeDocuments(documentRef.current, loadDocument());
  }
  useEffect(() => {
    try {
      const d = loadDocument();
      documentRef.current = d;
      setDocument(d);
    } catch {
      setStorageError(
        "本地进度文件无法读取，请先导出原始数据后处理；已停止进度写入",
      );
    }
    const listener = (event: StorageEvent) => {
      if (event.key === storageKey) {
        try {
          apply(current());
        } catch {
          /* 已显示持久化错误 */
        }
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  useEffect(() => {
    let active = true;
    const cached = catalogCache.peek(game);
    setCatalog(cached);
    setLoading(!cached);
    setError("");
    setGroup("all");
    setSelected(undefined);
    catalogCache
      .get(game)
      .then((value) => {
        if (active) setCatalog(value);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "目录加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [game, reload, catalogCache]);
  useEffect(() => setPage(1), [game, group, query, status]);
  function edit(a: Achievement, patch: Parameters<typeof updateRecord>[3]) {
    try {
      apply(updateRecord(current(), game, a.id, patch));
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "保存失败");
    }
  }
  const items = catalog?.items ?? [],
    completed = items.filter(
      (a) => document.records[recordKey(game, a.id)]?.completed,
    ).length;
  const series = useMemo(() => groupAchievementStages(items), [items]);
  const filtered = useMemo(
    () => filterAchievementSeries(series, document, game, group, status, query),
    [series, document, game, group, status, query],
  );
  const filteredStages = filtered.reduce(
    (total, entry) => total + entry.stages.length,
    0,
  );
  const selectedSeries = selected
    ? series.find((entry) => entry.stages.some((a) => a.id === selected.id))
    : undefined;
  async function synchronize() {
    setSyncing(true);
    try {
      await syncWebDav(dav, current, apply);
      void message.success("个人进度同步完成");
    } catch (e) {
      void message.error(
        e instanceof Error
          ? e.message
          : "同步失败，请检查 WebDAV 地址和 CORS 配置",
      );
    } finally {
      setSyncing(false);
    }
  }
  function exportProgress(format: "backup" | "uiaf" = "backup") {
    try {
      if (
        format === "uiaf" &&
        (game !== "ys" || !catalog || loading || error || storageError)
      )
        throw new Error("请先加载原神目录再导出 UIAF");
      const raw = storageError
        ? (localStorage.getItem(storageKey) ?? "null")
        : JSON.stringify(
            format === "uiaf" ? exportUiaf(current(), items) : current(),
            null,
            2,
          );
      const blob = new Blob([raw], { type: "application/json" }),
        url = URL.createObjectURL(blob),
        a = window.document.createElement("a");
      a.href = url;
      a.download = `${format === "uiaf" ? "genshin-uiaf" : "hoyo-achievements"}-${storageError ? "raw-" : ""}${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setExportOpen(false);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      void message.error(String(e));
    }
  }
  const progress = selected
    ? document.records[recordKey(game, selected.id)]
    : undefined;
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of items)
      if (document.records[recordKey(game, a.id)]?.completed)
        counts.set(a.group_id, (counts.get(a.group_id) ?? 0) + 1);
    return counts;
  }, [items, document, game]);
  const activeGroup = catalog?.groups.find((g) => g.id === group);
  const groupTotal = activeGroup?.total ?? items.length;
  const groupCompleted = activeGroup
    ? (groupCounts.get(activeGroup.id) ?? 0)
    : completed;
  const percent = groupTotal
    ? Math.round((groupCompleted / groupTotal) * 100)
    : 0;
  const pageSize = 16;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const rewardName = game === "ys" ? "原石" : game === "sr" ? "星琼" : "菲林";
  const reward = (a: Achievement) =>
    a.rewards.length
      ? a.rewards.map((r) => `${r.name ?? r.item_id} × ${r.count}`).join("、")
      : "暂无奖励数据";
  function openSettings() {
    setDraftDav(dav);
    setSettingsOpen(true);
  }
  function saveSettings() {
    try {
      if (draftDav.url) davUrl(draftDav.url);
      localStorage.setItem(
        davKey,
        JSON.stringify({ url: draftDav.url, username: draftDav.username }),
      );
      setDav(draftDav);
      setSettingsOpen(false);
      message.success("同步设置已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "设置保存失败");
    }
  }
  return (
    <div className={`achievement-app game-${game}`}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="米游成就首页">
          <span className="brand-mark">
            <Icon name="star" size={23} />
          </span>
          <span>
            米游成就<span className="brand-subtitle">每一份探索，都有回响</span>
          </span>
        </a>
        <nav className="header-tools" aria-label="进度管理">
          <button
            className="quiet-button"
            aria-label="导出进度"
            onClick={() => {
              if (storageError) exportProgress();
              else {
                setExportFormat(game === "ys" ? "uiaf" : "backup");
                setExportOpen(true);
              }
            }}
          >
            <Icon name="upload" size={17} />
            <span>导出进度</span>
          </button>
          <button
            className="quiet-button"
            aria-label="导入进度"
            onClick={() => importRef.current?.click()}
            disabled={!!storageError}
          >
            <Icon name="download" size={17} />
            <span>导入进度</span>
          </button>
          <button
            className="sync-button"
            aria-label="同步与备份"
            onClick={openSettings}
          >
            <Icon name="sync" size={17} />
            <span>同步与备份</span>
          </button>
        </nav>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <nav className="game-tabs" aria-label="选择游戏">
            {Object.entries(games).map(([id, name]) => (
              <button
                key={id}
                className={game === id ? "game-tab active" : "game-tab"}
                aria-pressed={game === id}
                onClick={() => {
                  setGame(id as Game);
                  setQuery("");
                  setStatus("all");
                }}
              >
                <span className="game-symbol" aria-hidden="true">
                  {id === "ys" ? "✦" : id === "sr" ? "✧" : "Z"}
                </span>
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-caption">
            <span>成就分类</span>
            <span>{catalog?.groups.length ?? "—"}</span>
          </div>
          <nav className="category-list" aria-label="成就分类">
            <button
              className={`category ${group === "all" ? "active" : ""}`}
              aria-current={group === "all" ? "page" : undefined}
              onClick={() => setGroup("all")}
            >
              <span className="category-icon">
                <Icon name="star" size={17} />
              </span>
              <span className="category-name">全部成就</span>
              <span className="category-count">{items.length || "—"}</span>
            </button>
            {(catalog?.groups ?? []).map((g) => (
              <button
                key={g.id}
                className={`category ${group === g.id ? "active" : ""}`}
                aria-current={group === g.id ? "page" : undefined}
                onClick={() => setGroup(g.id)}
              >
                <span
                  className={`category-dot ${(groupCounts.get(g.id) ?? 0) === g.total ? "complete" : ""}`}
                  aria-hidden="true"
                />
                <span className="category-name">{g.name}</span>
                <span className="category-count">
                  {groupCounts.get(g.id) ?? 0}
                  <span> / {g.total}</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="local-dot" />
            进度保存在此浏览器
            <button onClick={openSettings} aria-label="同步设置">
              <Icon name="settings" size={17} />
            </button>
          </div>
        </aside>
        <main className="main-content">
          <section
            className="collection-header"
            aria-labelledby="collection-title"
          >
            <div className="collection-copy">
              <div className="collection-context">
                <p className="game-context">{games[game]}成就手册</p>
                <button
                  className="catalog-refresh"
                  aria-label="刷新成就目录"
                  disabled={loading}
                  onClick={() => {
                    catalogCache.invalidate(game);
                    setReload((n) => n + 1);
                  }}
                >
                  <Icon name="sync" size={14} />
                  刷新目录
                </button>
              </div>
              <h1 id="collection-title">{activeGroup?.name ?? "全部成就"}</h1>
              <p className="collection-description">
                {activeGroup
                  ? "在这里记录你的探索，收集每一个难忘的瞬间"
                  : "还有未发现的故事，等你点亮下一颗星"}
              </p>
            </div>
            <div className="collection-seal" aria-hidden="true">
              <div className="seal-orbit" />
              <Icon name="star" size={68} />
              <span>成就手册</span>
            </div>
            <div className="collection-progress">
              <div>
                <span>探索进度（按完成阶段）</span>
                <span>
                  <strong>{groupCompleted}</strong> / {groupTotal}{" "}
                  <span className="progress-percent">{percent}%</span>
                </span>
              </div>
              <progress
                max={Math.max(1, groupTotal)}
                value={groupCompleted}
                aria-label="当前分类完成进度"
              />
            </div>
          </section>
          {storageError && (
            <div className="error-banner" role="alert">
              {storageError}
              <button onClick={() => exportProgress()}>导出原始数据</button>
            </div>
          )}
          <div className="mobile-category">
            <label htmlFor="mobile-group">成就分类</label>
            <select
              id="mobile-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="all">全部成就</option>
              {catalog?.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}（{g.total}）
                </option>
              ))}
            </select>
          </div>
          <section className="catalog" aria-label="成就清单">
            <div className="catalog-toolbar">
              <div className="status-tabs" aria-label="完成状态">
                {[
                  ["all", "全部"],
                  ["todo", "未完成"],
                  ["done", "已完成"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={status === value}
                    className={status === value ? "active" : ""}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="search-field">
                <Icon name="search" size={18} />
                <input
                  aria-label="搜索成就"
                  placeholder="搜索成就名称、描述或 ID"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button aria-label="清空搜索" onClick={() => setQuery("")}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="list-caption">
              <span>
                {error
                  ? "目录加载失败"
                  : loading
                    ? "正在加载成就目录"
                    : `找到 ${filtered.length} 项成就${filteredStages > filtered.length ? `，含 ${filteredStages} 个阶段` : ""}`}
              </span>
              <span>奖励 / {rewardName}</span>
            </div>
            {error ? (
              <div className="empty-state" role="alert">
                <Icon name="sync" size={30} />
                <h2>成就目录未能加载</h2>
                <p>{error}</p>
                <button
                  className="primary-button"
                  onClick={() => setReload((n) => n + 1)}
                >
                  重新加载
                </button>
              </div>
            ) : loading ? (
              <div className="loading-state" role="status">
                <span className="loading-star">
                  <Icon name="star" size={32} />
                </span>
                <p>正在加载{games[game]}成就</p>
              </div>
            ) : !filtered.length ? (
              <div className="empty-state">
                <Icon name="search" size={30} />
                <h2>
                  {query || status !== "all"
                    ? "没有符合条件的成就"
                    : "此分类暂无成就"}
                </h2>
                <p>试试其他关键词，或查看全部成就</p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setGroup("all");
                  }}
                >
                  查看全部成就
                </button>
              </div>
            ) : (
              <ul className="achievement-list">
                {filtered
                  .slice((visiblePage - 1) * pageSize, visiblePage * pageSize)
                  .map((entry) => (
                    <AchievementRow
                      key={entry.id}
                      series={entry}
                      document={document}
                      game={game}
                      disabled={!!storageError}
                      edit={edit}
                      onSelect={setSelected}
                      reward={reward}
                    />
                  ))}
              </ul>
            )}
            {!loading && !error && filtered.length > 0 && (
              <div className="pagination">
                <span>
                  第 {(visiblePage - 1) * pageSize + 1}–
                  {Math.min(visiblePage * pageSize, filtered.length)} 项，共{" "}
                  {filtered.length} 项
                </span>
                <nav aria-label="分页">
                  <button
                    disabled={visiblePage <= 1}
                    onClick={() => {
                      setPage(visiblePage - 1);
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    上一页
                  </button>
                  <span>
                    {visiblePage} / {pageCount}
                  </span>
                  <button
                    disabled={visiblePage >= pageCount}
                    onClick={() => {
                      setPage(visiblePage + 1);
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    下一页
                  </button>
                </nav>
              </div>
            )}
          </section>
          <footer className="main-footer">
            <span>目录来自 Akasha</span>
            <span>把足迹留在旅途中</span>
          </footer>
        </main>
      </div>
      {notice && !selected && !settingsOpen && !exportOpen && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {selected && (
        <Overlay title="成就详情" onClose={() => setSelected(undefined)}>
          {notice && (
            <div className="dialog-notice" role="status">
              {notice}
            </div>
          )}
          <div className="detail-emblem">
            <Icon name="star" size={42} />
          </div>
          <p className="detail-category">{selected.group_name}</p>
          <h3 className="detail-title">{selected.name}</h3>
          {selectedSeries && selectedSeries.stages.length > 1 && (
            <nav className="detail-stage-tabs" aria-label="成就阶段">
              {selectedSeries.stages.map((a, index) => (
                <button
                  key={a.id}
                  aria-pressed={a.id === selected.id}
                  onClick={() => setSelected(a)}
                >
                  第 {index + 1} 阶段
                  {document.records[recordKey(game, a.id)]?.completed && (
                    <Icon name="check" size={14} />
                  )}
                </button>
              ))}
            </nav>
          )}
          <p className="detail-description">{selected.description}</p>
          <nav className="detail-search-links" aria-label="搜索成就攻略">
            <a
              href={achievementSearchLinks(game, selected.name).miyoushe}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="search" size={16} />米游社搜索
            </a>
            <a
              href={achievementSearchLinks(game, selected.name).bilibili}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="search" size={16} />哔哩哔哩搜索
            </a>
          </nav>
          <div className="detail-reward">
            <Icon name="star" size={20} />
            {reward(selected)}
          </div>
          <div className="detail-divider" />
          <label className="detail-completion">
            <input
              type="checkbox"
              disabled={!!storageError}
              checked={progress?.completed ?? false}
              onChange={(e) => edit(selected, { completed: e.target.checked })}
            />
            <span>
              {selectedSeries && selectedSeries.stages.length > 1
                ? "已完成此阶段"
                : "已完成此成就"}
            </span>
          </label>
          <label className="form-field">
            完成日期
            <input
              type="date"
              aria-label="完成日期"
              disabled={!progress?.completed || !!storageError}
              value={progress?.date ?? ""}
              onChange={(e) => edit(selected, { date: e.target.value })}
            />
          </label>
          <p className="field-help">修改自动保存在此浏览器</p>
          <dl className="detail-meta">
            <div>
              <dt>成就 ID</dt>
              <dd>{selected.id}</dd>
            </div>
            <div>
              <dt>隐藏成就</dt>
              <dd>
                {selected.hidden === null
                  ? "未知"
                  : selected.hidden
                    ? "是"
                    : "否"}
              </dd>
            </div>
            {selected.target !== null && (
              <div>
                <dt>目标数量</dt>
                <dd>{selected.target}</dd>
              </div>
            )}
            {selected.previous_id && (
              <div>
                <dt>前置成就 ID</dt>
                <dd>{selected.previous_id}</dd>
              </div>
            )}
          </dl>
        </Overlay>
      )}
      {settingsOpen && (
        <Overlay title="同步与备份" onClose={() => setSettingsOpen(false)}>
          {notice && (
            <div className="dialog-notice" role="status">
              {notice}
            </div>
          )}
          <p className="settings-intro">将探索进度带到另一台设备</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSettings();
            }}
          >
            <label className="form-field">
              WebDAV 进度文件地址
              <input
                type="url"
                placeholder="https://dav.example.com/hoyo-achievements.json"
                value={draftDav.url}
                onChange={(e) =>
                  setDraftDav({ ...draftDav, url: e.target.value })
                }
              />
            </label>
            <label className="form-field">
              用户名
              <input
                autoComplete="off"
                value={draftDav.username}
                onChange={(e) =>
                  setDraftDav({ ...draftDav, username: e.target.value })
                }
              />
            </label>
            <label className="form-field">
              密码
              <input
                type="password"
                autoComplete="off"
                value={draftDav.password}
                onChange={(e) =>
                  setDraftDav({ ...draftDav, password: e.target.value })
                }
              />
            </label>
            <p className="field-help">密码仅在当前页面保留，刷新后需重新填写</p>
            <details className="sync-help">
              <summary>同步服务要求</summary>
              <p>
                请先创建文件所在目录。服务需允许本站跨域 GET /
                PUT、Authorization、If-Match、If-None-Match，并暴露
                ETag。同步只包含个人成就进度，不包含 WebDAV 凭据。
              </p>
            </details>
            <div className="settings-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSettingsOpen(false)}
              >
                取消
              </button>
              <button className="primary-button" type="submit">
                保存设置
              </button>
            </div>
          </form>
          <div className="sync-now">
            <span>{dav.url ? "已配置同步地址" : "保存地址后可同步进度"}</span>
            <button
              className="secondary-button"
              onClick={synchronize}
              disabled={!dav.url || syncing || !!storageError}
            >
              <Icon name="sync" size={17} />
              {syncing ? "正在同步…" : "立即同步"}
            </button>
          </div>
        </Overlay>
      )}
      {exportOpen && (
        <Overlay title="导出进度" onClose={() => setExportOpen(false)}>
          {notice && (
            <div className="dialog-notice" role="status">
              {notice}
            </div>
          )}
          <div className="export-options">
            <label>
              <input
                type="radio"
                name="export-format"
                value="uiaf"
                checked={exportFormat === "uiaf"}
                disabled={game !== "ys" || !catalog || loading || !!error}
                onChange={() => setExportFormat("uiaf")}
              />
              <span>
                <strong>原神 UIAF v1.1</strong>
                <small>仅导出原神，可与其他支持 UIAF 的工具交换进度</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="export-format"
                value="backup"
                checked={exportFormat === "backup"}
                onChange={() => setExportFormat("backup")}
              />
              <span>
                <strong>全部游戏备份</strong>
                <small>完整保留本站的游戏进度与同步信息</small>
              </span>
            </label>
          </div>
          <p className="field-help">
            导入时自动识别 UIAF v1.0 / v1.1 和本站备份文件
          </p>
          <a
            className="standard-link"
            href="https://uigf.org/zh/standards/uiaf.html"
            target="_blank"
            rel="noreferrer"
          >
            查看 UIGF-Org 的 UIAF 标准
          </a>
          <div className="settings-actions">
            <button
              className="secondary-button"
              onClick={() => setExportOpen(false)}
            >
              取消
            </button>
            <button
              className="primary-button"
              onClick={() => exportProgress(exportFormat)}
              disabled={
                exportFormat === "uiaf" &&
                (game !== "ys" || !catalog || loading || !!error)
              }
            >
              导出 JSON
            </button>
          </div>
        </Overlay>
      )}
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (file.size > 5_000_000) throw new Error("导入文件过大");
            const imported = importProgress(
              JSON.parse(await file.text()),
              current(),
            );
            apply(imported.document);
            message.success(
              `${imported.format}进度已合并${imported.format === "UIAF" ? "到原神" : ""}`,
            );
          } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败");
          }
        }}
      />
    </div>
  );
}
