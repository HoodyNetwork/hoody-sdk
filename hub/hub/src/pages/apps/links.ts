// Public hrefs of the apps launcher, which lives in the Apps tab of Programs. With
// launch/index.ts, the only files other pages may import from this folder.
import { capture, hostEnv, useCan, type Target } from '@core';
import { createElement, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import type { OwAsk, OwFile, OwPressedAt } from './launch/openWith/OpenWith';
import { choiceFor, typeOf, useRememberedDoc } from './launch/openWith/rememberDoc';
import { studioUrlFor } from './launch/openWith/sqlite';
import { templateById } from './launch/openWith/templates';
export { GH_PARAM, LAUNCH_PARAM, LAUNCH_Q, launchSearch, links, loadLauncher, OW_PROGRAM_MAX, OW_LABEL_UNITS } from './links.pure';
export type { OwLast } from './links.pure';
import type { OwLast } from './links.pure';
import { parseRepo } from './github';
import { repoPath } from './github/ready';

// ── Open with, for Files ─────────────────────────────────────────────────────────────────────────────────────
/** Open with's drawer and the Preview's Open in ‹Top›, loaded on demand (the run code stays out of Files' chunk). */
const loadOpenWith = () => import('./launch/openWith/OpenWith');
const OpenWithDrawer = lazy(loadOpenWith);
const OpenTop = lazy(() => loadOpenWith().then((m) => ({ default: m.OpenTop })));
export type { OwAsk, OwBrowserAction, OwFile } from './launch/openWith/OpenWith';
/** A listing's execute bit as Open with reads it (a hint: the exec decides). */
export { execHint } from './launch/openWith/types';

const EXEC = 'computers.actions.exec';

export interface OpenWithEntry {
  /** The computer runs: the entry points show (disabled with the reason while `can` is false). */
  readonly running: boolean;
  /** Files launches may start here: the computer runs and this key may start programs on it. */
  readonly can: boolean;
  /** The remembered choice for a file of this name on this computer, or null (folders never have one). */
  lastFor(name: string, dir: boolean): OwLast | null;
  /** Opens the drawer for an entry point. */
  open(a: OwAsk): void;
  /** Closes the drawer (an In this browser action hands over to the page). */
  close(): void;
  /** The drawer, when open (on the computer it opened on only). */
  readonly overlay: ReactNode;
  /** The Preview's Open in ‹Top› (nothing until the top program's check found it). A database's Open in SQLite Studio
   *  needs no right to run programs, so it shows whenever the computer runs. */
  top(file: OwFile, decodedText: boolean): ReactNode;
  /** The computer's SQLite Studio address for this file ('' unless it runs and the studio takes the file). A link, not a
   *  launch: offered without the right to run programs. */
  studio(file: OwFile): string;
}

/** Where the Hub is at a press, for the landing fence: a web page's address. A terminal has no address bar (reading
 *  window there is a TERM_GLOBAL trap inside the press): the host's route when it names one, else '', so the context
 *  and the computer still fence a landing. */
const owHere = (): string => (hostEnv().browserPage === true ? window.location.href : hostEnv().pageRoute ?? '');

/** Files' entry points of Open with on one computer (the pane's). `running`: the computer is running; nothing is
 *  offered otherwise (the computer-running gate, before any check is sent). */
export function useOpenWithEntry(o: { target: Target | null; running: boolean }): OpenWithEntry {
  const exec = useCan(EXEC);
  const cid = o.target?.container.id ?? null;
  const doc = useRememberedDoc(cid);
  const [held, setHeld] = useState<{ ask: OwAsk; on: string; at: OwPressedAt } | null>(null);
  const can = exec && o.running && !!o.target;
  const target = o.target;
  const ask = held && cid && held.on === cid && o.running ? held.ask : null;
  const close = useCallback(() => setHeld(null), []);
  // The entry's press is where the landing fence starts: taken here, before the drawer's chunk or its checks load.
  const open = useCallback((a: OwAsk) => { if (cid) setHeld({ ask: a, on: cid, at: { gen: capture().gen, href: owHere() } }); }, [cid]);
  const lastFor = (name: string, dir: boolean): OwLast | null => {
    const c = choiceFor(doc, typeOf(name, { dir }));
    if (!c) return null;
    if (c.k === 'cmd') return { kind: 'cmd' };
    const t = templateById(c.id);
    return t ? { kind: 'tpl', name: t.name } : null;
  };
  const overlay = ask && target ? createElement(Suspense, { fallback: null }, createElement(OpenWithDrawer, { target, ask, onClose: close, ...(held ? { pressedAt: held.at } : {}) })) : null;
  const studio = (file: OwFile): string => (o.running ? studioUrlFor(target, file) : '');
  const top = (file: OwFile, decodedText: boolean): ReactNode =>
    target && (can || studio(file)) ? createElement(Suspense, { fallback: null }, createElement(OpenTop, { target, file, decodedText, onOpen: (tpl) => open({ kind: 'tpl', file, tpl, decodedText }) })) : null;
  return { running: o.running && !!o.target, can, lastFor, open, close, overlay, top, studio };
}
export type { Placement } from './launch/placement';
export type { FindOutcome } from './launch/findOutcome';
/** Synchronous, without the launcher chunk: whether the Board mounts the launcher's hold on a tile (TileHold
 *  only then; every other tile is its frame at once), and the place a tile shows. */
export { placeOfTile, useLaunchHeld, type AnyTile, type HoldComputer, type HoldTile } from './launch/match';

// ── From GitHub, for a host's own search field ───────────────────────────────────────────────────────────────
/** The Ready key of a GitHub repository address typed in a host's field (owner/repo, with its ref and path), or null
 *  for anything that is not one (the address rules are parseRepo's). */
export const githubKey = (input: string): string | null => {
  const parsed = parseRepo(input);
  return parsed.ok ? repoPath(parsed.repo) : null;
};
