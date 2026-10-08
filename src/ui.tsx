import { useEffect, useRef, type ReactNode } from "react";

export function Icon({
  name,
  size = 20,
}: {
  name:
    | "star"
    | "search"
    | "close"
    | "check"
    | "sync"
    | "download"
    | "upload"
    | "settings"
    | "chevron";
  size?: number;
}) {
  const paths = {
    star: "M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z",
    search: "M21 21 16 16M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    close: "m6 6 12 12M6 18 18 6",
    check: "m5 12 4 4L19 6",
    sync: "M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
    settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
    chevron: "m9 5 7 7-7 7",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    ref.current?.showModal();
    return () => {
      window.document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="overlay"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <div className="overlay-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
