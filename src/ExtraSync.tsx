import { useState } from "react";
import { createGist, gistId, syncGist } from "./gist";
import { syncFile, type ProgressFile } from "./file-sync";
import type { Document } from "./state";
export function ExtraSync({
  channel,
  current,
  apply,
  disabled,
  notify,
}: {
  channel: "gist" | "file";
  current: () => Document;
  apply: (document: Document) => void;
  disabled: boolean;
  notify: (message: string) => void;
}) {
  const [id, setId] = useState(
    () => {
      try {
        return localStorage.getItem("hoyo-achievements.gist.v1") ?? "";
      } catch {
        return "";
      }
    },
  );
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (options: unknown) => Promise<ProgressFile[]>;
    }
  ).showOpenFilePicker;
  async function run(create = false) {
    setBusy(true);
    try {
      if (channel === "gist") {
        const target = create ? await createGist(token, current()) : gistId(id);
        setId(target);
        try {
          localStorage.setItem("hoyo-achievements.gist.v1", target);
        } catch {
          // 存储不可用时仍允许使用当前弹窗中的 Gist ID
        }
        if (!create) await syncGist({ id: target, token }, current, apply);
        notify(
          create ? "秘密 Gist 已创建并保存当前进度" : "GitHub Gist 同步完成",
        );
      } else {
        if (!picker)
          throw new Error(
            "当前浏览器不支持直接写入本地文件，请使用导入和导出按钮",
          );
        const [handle] = await picker.call(window, {
          multiple: false,
          types: [
            {
              description: "成就进度文件",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        await syncFile(handle, current, apply);
        notify("已合并并保存到所选文件");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        notify(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {channel === "gist" ? (
        <div role="tabpanel">
          <label className="form-field">
            Gist ID
            <input
              value={id}
              autoComplete="off"
              onChange={(event) => setId(event.target.value)}
              placeholder="Gist 链接末尾的 ID"
            />
          </label>
          <label className="form-field">
            GitHub Token
            <input
              value={token}
              type="password"
              autoComplete="off"
              onChange={(event) => setToken(event.target.value)}
              placeholder="仅需 Gist 权限"
            />
          </label>
          <p className="field-help">
            Token 仅在当前弹窗保留，关闭后清除。秘密 Gist
            持有链接即可读取，请勿放敏感资料
          </p>
          <p className="field-help">
            Gist 不支持 WebDAV
            式条件写入，请避免多台设备同时同步。同步前会读取合并，写入后再次核对
          </p>
          <div className="settings-actions">
            <button
              className="secondary-button"
              disabled={busy || disabled || !token || !!id.trim()}
              onClick={() => run(true)}
            >
              创建秘密 Gist
            </button>
            <button
              className="primary-button"
              disabled={busy || disabled || !token || !id.trim()}
              onClick={() => run()}
            >
              {busy ? "正在同步…" : "同步 Gist"}
            </button>
          </div>
        </div>
      ) : (
        <div role="tabpanel">
          <p className="field-help">
            可选择 OneDrive、iCloud 或其他同步文件夹中的本站备份
            JSON。读取后按更新时间合并，再保存回同一文件；空 JSON
            文件可用于初始化
          </p>
          <p className="field-help">
            直接写入需要桌面版 Edge / Chrome
            授权，请避免同时编辑同一文件。其他浏览器可通过导入、导出交换文件
          </p>
          <button
            className="primary-button"
            disabled={busy || disabled || !picker}
            onClick={() => run()}
          >
            {busy ? "正在合并…" : "选择文件并合并保存"}
          </button>
        </div>
      )}
    </section>
  );
}
