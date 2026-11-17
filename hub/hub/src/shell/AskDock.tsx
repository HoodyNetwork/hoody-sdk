// The Ask dock frame: an `aside` region on the end edge below the top
// bar. Header 48: target chip (realm square · state dot · computer), Recent (the Ask panel's slot), New,
// Close; on phones ‹ closes. That header is only the placeholder: the Ask panel (`children`)
// draws its own header (target, Recent, New, Close) and fills the whole height. Width 400 / 360 by
// viewport, resizable 320-560 by a 6 px grip (←/→ 16 px, Home/End min/max, Enter or double-click
// resets); the shell may lower the max (768-1279, where the dock overlays the page). From 768 up the dock is a
// region, not an overlay: Esc returns focus to the page without closing. On a phone it is a full-screen sheet
// (`sheet`): Esc closes it, and the shell puts focus back on what opened it.
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { DOCK_MAX, DOCK_MIN, useAskDock } from "@kit/ask";
import { cx, IconButton } from "@kit/controls/Button";
import { EmptyState } from "@kit/states/States";
import { useStrings } from "@kit/strings";
import { useShellData } from "./context";
import { IS_MAC } from "./TopBar";
import strings from "./strings.en.json";
import s from "./AskDock.module.css";
import { dialogOpen } from "./keygate";
import { shownPageRoot } from "./pageHost";

/** Move focus back to the page: its title, else the content area. */
export function focusPage(): void {
  const main = document.getElementById("hub-main");
  const h1 = shownPageRoot()?.querySelector<HTMLElement>("h1[data-hub-title]");
  (h1 ?? main)?.focus({ preventScroll: true });
}

export interface AskDockProps {
  width: number;
  /** The widest the grip goes (default DOCK_MAX); the shell lowers it where the dock overlays the page. */
  max?: number;
  /** A phone's full-screen sheet: Esc closes the dock instead of returning to the page under it. */
  sheet?: boolean;
  onNew?: () => void;
  /** The Ask panel's Recent conversations button. */
  recent?: ReactNode;
  children?: ReactNode;
}

export function AskDock({ width, max = DOCK_MAX, sheet = false, onNew, recent, children }: AskDockProps) {
  const t = useStrings(strings);
  const ask = useAskDock();
  const data = useShellData();
  const drag = useRef<{ x: number; w: number } | null>(null);
  const realm = data.realms.find((r) => r.id === data.realmId);
  const computer = data.computers.find((c) => c.id === data.computerId);
  const rtl = () => (document.documentElement.dir === "rtl" ? -1 : 1);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  // The width asked for is stored as is (the kit keeps it within DOCK_MIN-DOCK_MAX); the shell draws it within
  // `max`, so a narrow window never shrinks what a wide one shows. Moves start from the drawn width.
  const setWidth = ask.setWidth;
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current)
      setWidth(drag.current.w - (e.clientX - drag.current.x) * rtl());
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onGripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (k !== 0) setWidth(width + k * 16 * rtl());
    else if (e.key === "Home") setWidth(DOCK_MIN);
    else if (e.key === "End") setWidth(max);
    else if (e.key === "Enter") setWidth(undefined);
    else return;
    e.preventDefault();
  };
  // Esc anywhere in the dock (no popover of its own open: those take Esc first) returns to the page. A phone's sheet
  // covers the page, so there Esc closes the dock, wherever focus is (a tap on blank sheet leaves it on <body>); it
  // listens on window, after React's own handlers, so a popup inside the panel that takes Esc keeps it.
  const root = useRef<HTMLElement>(null);
  const close = useRef(ask.close);
  close.current = ask.close;
  useEffect(() => {
    const el = sheet ? window : root.current;
    if (!el) return;
    const onKey = (e: Event) => {
      const k = e as globalThis.KeyboardEvent;
      // Esc that ends an IME composition is the composition's, and a dialog over the sheet (one whose Esc is off while
      // it is busy) keeps its own, wherever focus is: a busy dialog may have dropped it on <body> before it puts it back.
      if (k.key !== "Escape" || k.defaultPrevented || k.isComposing) return;
      if (sheet && dialogOpen(root.current)) return;
      e.preventDefault();
      if (sheet) close.current();
      else focusPage();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [sheet]);
  const realmName = realm?.name ?? t("top.realmAll");
  return (
    <aside
      className={s.dock}
      aria-label={t("ask.label")}
      style={{ ["--dock-cur" as string]: `${width}px` }}
      ref={root}
      // Focusable from script only: the fallback target when the panel has no control yet, and a click on blank
      // dock lands focus in it.
      tabIndex={-1}
      data-hub-dock
    >
      {/* A focusable separator is the ARIA window-splitter pattern. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className={s.handle}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("ask.resize")}
        aria-valuemin={Math.min(DOCK_MIN, max)}
        aria-valuemax={max}
        aria-valuenow={Math.round(width)}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onGripKey}
        onDoubleClick={() => ask.setWidth(undefined)}
      />
      {children ? (
        <div className={s.panel}>{children}</div>
      ) : (
        <>
          <header className={s.head}>
            <span className={s.back}>
              <IconButton
                icon="chevron-left"
                label={t("ask.back")}
                onPress={ask.close}
              />
            </span>
            <span
              className={s.target}
              title={
                computer
                  ? t("ask.target", {
                      realm: realmName,
                      computer: computer.name,
                    })
                  : realmName
              }
            >
              {realm && (
                <span
                  className={cx(s.realmDot, realm.color && `rc-${realm.color}`)}
                  aria-hidden="true"
                />
              )}
              <span className={s.realmName}>{realmName}</span>
              {computer && (
                <>
                  <span className={s.sep} aria-hidden="true">
                    ·
                  </span>
                  <span
                    className={cx(s.live, computer.running && s.liveOn)}
                    aria-hidden="true"
                  />
                  <span className={s.computerName}>{computer.name}</span>
                </>
              )}
            </span>
            {recent}
            {onNew && (
              <IconButton icon="pen" label={t("ask.new")} onPress={onNew} />
            )}
            <span className={s.close}>
              <IconButton
                icon="x"
                label={t("ask.close")}
                shortcut={IS_MAC ? "⌘J" : "Ctrl J"}
                onPress={ask.close}
              />
            </span>
          </header>
          <div className={s.body}>
            <EmptyState
              icon="sparkle"
              title={t("ask.emptyTitle")}
              body={t("ask.emptyBody")}
              size="sm"
            />
          </div>
        </>
      )}
    </aside>
  );
}
