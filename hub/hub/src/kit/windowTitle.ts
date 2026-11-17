// What a screen says about the window title. Pages and kit parts only DECLARE here; the one writer is the terminal shell
// (term/shell/windowTitle.tsx, the terminal's OSC title). The web Hub keeps its own document.title (app/pageRouter.tsx)
// and reads nothing here.
//
//   - useWindowTitleDetail(text): the thing the screen is about, put before the page's title ("<chat name> · AI").
//     Untrusted text is fine: the writer cleans and bounds it. The newest declaration wins; one ends when its screen
//     unmounts or declares null.
//   - useNeutralWindowTitle(on): while on, the title is the fixed neutral one (a secret is shown on screen).
//
// The store is module-level: a process runs one mount at a time (term/app/run.ts). Nothing here imports React DOM.
import { useEffect, useSyncExternalStore } from 'react';

export interface WindowTitleState {
  /** The newest declared detail, raw (the writer cleans it); null when none. */
  readonly detail: string | null;
  /** At least one screen asks for the neutral title. */
  readonly neutral: boolean;
}

const details: Array<{ readonly id: number; text: string }> = [];
// Each hold is its own token: a cleanup after a reset removes nothing (a counter would go below zero).
const neutralHolds = new Set<number>();
let nextId = 1;
let state: WindowTitleState = { detail: null, neutral: false };
const listeners = new Set<() => void>();

function publish(): void {
  const detail = details.length ? details[details.length - 1]!.text : null;
  const neutral = neutralHolds.size > 0;
  if (detail === state.detail && neutral === state.neutral) return;
  state = { detail, neutral };
  for (const l of [...listeners]) l();
}

/** The current declarations (a stable object until something changes). */
export const windowTitleState = (): WindowTitleState => state;

/** Called after every change; returns the unsubscribe. */
export function subscribeWindowTitle(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The declarations, re-rendering on change. */
export const useWindowTitleState = (): WindowTitleState => useSyncExternalStore(subscribeWindowTitle, windowTitleState, windowTitleState);

/** Declares what the screen is about (a chat's name) while mounted; null or empty declares nothing. */
export function useWindowTitleDetail(text: string | null | undefined): void {
  const t = typeof text === 'string' && text.trim() !== '' ? text : null;
  useEffect(() => {
    if (t === null) return;
    const entry = { id: nextId++, text: t };
    details.push(entry);
    publish();
    return () => {
      const i = details.findIndex((d) => d.id === entry.id);
      if (i >= 0) details.splice(i, 1);
      publish();
    };
  }, [t]);
}

/** While `on`, the window title is the fixed neutral one. */
export function useNeutralWindowTitle(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const id = nextId++;
    neutralHolds.add(id);
    publish();
    return () => {
      neutralHolds.delete(id);
      publish();
    };
  }, [on]);
}

/** Tests only: forget every declaration (a process restart). */
export const __windowTitleSeams = {
  reset(): void {
    details.length = 0;
    neutralHolds.clear();
    state = { detail: null, neutral: false };
  },
};
