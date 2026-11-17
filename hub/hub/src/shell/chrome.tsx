// Focus mode: a page hides the shell chrome (sidebar, top bar, phone bottom bar, Ask
// dock) with useChromeHidden. The chrome is hidden, never unmounted, so nothing in it loses state.
// The shell always gives the way back, whatever the page does: its own restore button (drawn here,
// bottom-right, above any page content the page names with `lift`), Esc when the chrome has the
// keyboard (keys.ts), and the page leaving (the hook's cleanup). Entering and leaving is announced. A restore tells every page that asked (onRestore) and shows the chrome at once; a page
// that still says `on` does not hide it again until it turns focus mode off and on. Not saved: a
// reload shows the chrome.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { IconButton } from '@kit/controls/Button';
import { SR_ONLY } from '@kit/controls/SrOnly';
import { useStrings } from '@kit/strings';
import { hiddenByPage } from './keygate';
import strings from './strings.en.json';
import s from './chrome.module.css';

type Hider = { cb: { current: (() => void) | undefined }; lift: number };
const hiders = new Map<symbol, Hider>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

const isHidden = (): boolean => hiders.size > 0;

// What had focus when focus mode began: a restore that leaves focus on <body> (the restore button
// is gone) puts it back there, else on what the page marks with data-hub-restore-focus (the Board
// strip), else main.
let focusBefore: HTMLElement | undefined;

function placeFocusAfterRestore(): void {
  const now = document.activeElement;
  if (now && now !== document.body && now.isConnected) return;
  const target = [focusBefore, document.querySelector<HTMLElement>('[data-hub-restore-focus]'), document.getElementById('hub-main')].find(
    (el): el is HTMLElement => !!el && el.isConnected && !hiddenByPage(el),
  );
  focusBefore = undefined;
  target?.focus({ preventScroll: true });
}

/** Whether a page has the chrome hidden now (the shell's key handler reads it for Esc). */
export function chromeHidden(): boolean {
  return isHidden();
}

/** Show the chrome again and tell every page that hid it. */
export function restoreChrome(): void {
  if (hiders.size === 0) return;
  const told = [...hiders.values()];
  hiders.clear();
  emit();
  for (const h of told) h.cb.current?.();
}

/** How far above the bottom inset the restore button sits: the height of the page's own bottom
 *  row it must not cover (the Board's chips row on phones and in one-at-a-time view: 44). */
export type ChromeHiddenOptions = { lift?: number };

/**
 * Hide the shell chrome while `on` (focus mode). `onRestore` runs when the shell brings the chrome
 * back (its button or Esc): turn the page's own focus state off there.
 */
export function useChromeHidden(on: boolean, onRestore?: () => void, options: ChromeHiddenOptions = {}): void {
  const cb = useRef(onRestore);
  cb.current = onRestore;
  const lift = Math.max(0, options.lift ?? 0);
  const me = useRef<symbol | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    const id = Symbol('chrome-hidden');
    me.current = id;
    if (hiders.size === 0) {
      const el = document.activeElement;
      focusBefore = el instanceof HTMLElement && el !== document.body ? el : undefined;
    }
    hiders.set(id, { cb, lift: 0 });
    emit();
    return () => {
      me.current = undefined;
      if (hiders.delete(id)) emit();
    };
  }, [on]);
  useEffect(() => {
    const h = me.current === undefined ? undefined : hiders.get(me.current);
    if (!h || h.lift === lift) return;
    h.lift = lift;
    emit();
  }, [on, lift]);
}

const liftNow = (): number => Math.max(0, ...[...hiders.values()].map((h) => h.lift));

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** For AppShell: whether to hide the chrome now. */
export function useChromeIsHidden(): boolean {
  return useSyncExternalStore(subscribe, isHidden, isHidden);
}

function useRestoreLift(): number {
  return useSyncExternalStore(subscribe, liftNow, liftNow);
}

/** Fades after this long without the pointer near. */
export const RESTORE_FADE_MS = 2000;
const NEAR_PX = 80;

/** The way out of focus mode: always drawn while the chrome is hidden. Its polite live region is
 *  always mounted, so the change is announced; it says nothing at first load. */
export function ChromeRestore() {
  const t = useStrings(strings);
  const hidden = useChromeIsHidden();
  const lift = useRestoreLift();
  const [dim, setDim] = useState(false);
  const [said, setSaid] = useState('');
  const was = useRef(hidden);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (was.current === hidden) return;
    was.current = hidden;
    setSaid(t(hidden ? 'chrome.announceOn' : 'chrome.announceOff'));
    if (!hidden) placeFocusAfterRestore();
  }, [hidden, t]);

  useEffect(() => {
    if (!hidden) return;
    let timer = window.setTimeout(() => setDim(true), RESTORE_FADE_MS);
    const wake = () => {
      setDim(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setDim(true), RESTORE_FADE_MS);
    };
    const onMove = (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      if (Math.hypot(dx, dy) <= NEAR_PX) wake();
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      setDim(false);
    };
  }, [hidden]);

  const live = (
    <div className={SR_ONLY} role="status" aria-live="polite">
      {said}
    </div>
  );
  if (!hidden) return live;
  return (
    <>
      {live}
      <div ref={box} className={s.restore} style={{ '--restore-lift': `${lift}px` } as CSSProperties} data-dim={dim || undefined} data-hub-chrome-restore>
        <IconButton icon="minimize" label={t('chrome.restore')} shortcut="Esc" variant="secondary" size="xs" tooltipPlacement="start" onPress={restoreChrome} />
      </div>
    </>
  );
}
