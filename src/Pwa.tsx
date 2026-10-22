import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function usePwa() {
  const [install, setInstall] = useState<InstallEvent>();
  const [waiting, setWaiting] = useState<ServiceWorker>();
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installed = () => setInstall(undefined);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", installed);
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      let alive = true;
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          const update = () => {
            if (alive && navigator.serviceWorker.controller)
              setWaiting(registration.waiting ?? undefined);
          };
          update();
          registration.addEventListener("updatefound", () =>
            registration.installing?.addEventListener("statechange", update),
          );
        })
        .catch(() => {
          if (alive) setHelp(true);
        });
      return () => {
        alive = false;
        window.removeEventListener("beforeinstallprompt", prompt);
        window.removeEventListener("appinstalled", installed);
      };
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  async function requestInstall() {
    if (!install) {
      setHelp((value) => !value);
      return;
    }
    await install.prompt();
    await install.userChoice;
    setInstall(undefined);
  }
  function update() {
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
    waiting?.postMessage("UPDATE");
  }
  return (
    <section className="pwa-settings" aria-label="应用设置">
      {!matchMedia("(display-mode: standalone)").matches && (
        <button className="secondary-button" onClick={requestInstall}>
          安装成就手册
        </button>
      )}
      {waiting && (
        <button className="secondary-button" onClick={update}>
          发现新版本，刷新更新
        </button>
      )}
      {help && (
        <p className="field-help">
          可在浏览器菜单中选择“安装应用”或“添加到主屏幕”。iPhone / iPad 请使用
          Safari 的分享菜单。离线前需先加载对应游戏目录
        </p>
      )}
    </section>
  );
}
