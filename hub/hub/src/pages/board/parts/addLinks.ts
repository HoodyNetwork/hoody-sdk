// Board Add links (links.ts boardAddPath; Apps' Put on Board): taken from the address above the Board's readiness gate
// and queued for the Board to settle (BoardView.tsx). Shared by the web Board and its terminal sibling.
import { showToast, useGo, useHiddenNow, useLocationEntry, useSearchParam } from '@kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { links, parseBoardAdd, type BoardAddRef } from '../links';
import { useT } from './text';

/** How long a first computer list read may stay unanswered before a waiting Add link says so (the read has no timeout). */
export const ADD_WAIT_MS = 8000;
/** How many taken Add links useAddLinks keeps (by history entry): far more than the Board locations the page host can still
 *  hold for it, which are the last few. */
export const TAKEN_KEEP = 50;

/** board: the Board the link names (`b`), the Board a new terminal goes on (the welcome's Open a terminal names its own). */
export interface AddRequest { readonly n: number; readonly ref: BoardAddRef; readonly board?: string }
/** Add links taken from the address, waiting to be settled by the Board (oldest first). */
export interface AddLinks {
  readonly queue: ReadonlyArray<AddRequest>;
  /** Settle request n: it leaves the queue and is never acted on again. */
  readonly settle: (n: number) => void;
  /** The last request settled (by n). */
  readonly done: { current: number };
  /** The newest request a waiting notice has covered (by n): each new link is told once. */
  readonly told: { current: number };
  /** The slot an added tile is in, to enter once the Board shows it. Kept here, above the readiness gate, so an add
   *  that finishes while the Board went back to its skeleton (a keyed landing's lock outlives that) still enters it. */
  readonly enter: string | null;
  readonly setEnter: (slot: string | null) => void;
  /** The Board a new terminal goes on, by request n: taken when its first read starts and kept here, above the readiness
   *  gate, so a later read for the same request keeps it. Dropped when the request settles. */
  readonly dest: { readonly current: Map<number, string> };
}

// An Add link (links.ts boardAddPath; Apps' Put on Board) is taken here, above the readiness gate, so the address drops
// it at the Board's first render with it, while the saved Boards still open too, and a request outlives the Board
// going back to its skeleton (another tab's sealed write opening). The address keeps `b` (its own effect applies it);
// a Connect over SSH link wins (it drops the address itself). A link that is not a whole Add link is dropped the same
// way, with a notice. Leaving the Board with links still waiting says they were not added.
export function useAddLinks(): AddLinks {
  const t = useT();
  const go = useGo();
  const hiddenNow = useHiddenNow();
  const [addParam] = useSearchParam('add');
  const [addCid] = useSearchParam('cid');
  const [addPath] = useSearchParam('path');
  // What a files or notes tile opens on (links.ts BoardOpen): read with the link, dropped with it.
  const [addOpen] = useSearchParam('open');
  const [addAt] = useSearchParam('at');
  const [addUser] = useSearchParam('user');
  const [addNode] = useSearchParam('node');
  // A program board's key and the program's name: read with the link, dropped with it.
  const [addFor] = useSearchParam('for');
  const [addLabel] = useSearchParam('label');
  const [connectParam] = useSearchParam('connect');
  const [bParam] = useSearchParam('b');
  // The history entry the link is in: the same link pushed again is a new entry and is taken again.
  const entry = useLocationEntry();
  // The links taken, by entry and values, newest last (TAKEN_KEEP at most): StrictMode's second run, a render before the
  // address change lands, and the kept Board drawn a step behind on a location it already read (Back from it,
  // the page host may hold an older one than the last link taken) take nothing more. Kept while the
  // address holds none. With no entry key the history gives each push by its values alone: then only the last link is
  // kept, cleared once the address holds none, so the same link sent again is taken again.
  const taken = useRef<readonly string[]>([]);
  const seq = useRef(0);
  const done = useRef(0);
  const told = useRef(0);
  const [queue, setQueue] = useState<ReadonlyArray<AddRequest>>([]);
  const waiting = useRef(0);
  useEffect(() => { waiting.current = queue.length; }, [queue]);
  useEffect(() => {
    if (addParam === undefined || connectParam === 'ssh') { if (!entry) taken.current = []; return; }
    const key = JSON.stringify([entry, addParam, addCid, addPath, addOpen, addAt, addUser, addNode, addFor, addLabel]);
    if (taken.current.includes(key)) return;
    taken.current = entry ? [...taken.current, key].slice(-TAKEN_KEEP) : [key];
    go(bParam ? links.boardById(String(bParam)) : links.board, { replace: true });
    const ref = parseBoardAdd({ add: addParam, cid: addCid, path: addPath, open: addOpen, at: addAt, user: addUser, node: addNode, for: addFor, label: addLabel });
    if (!ref) { showToast({ title: t('add.bad'), tone: 'info' }); return; }
    const n = ++seq.current;
    const board = bParam ? String(bParam) : '';
    setQueue((q) => [...q, board ? { n, ref, board } : { n, ref }]);
    // Only a new link counts; the values are read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, addParam, addCid, addPath, addOpen, addAt, addUser, addNode, addFor, addLabel, connectParam]);
  useEffect(() => () => {
    // A kept Board hiding keeps its links waiting (they are added when it shows again): nothing to say then.
    if (waiting.current && !hiddenNow()) showToast({ title: t('add.left', { count: waiting.current }), tone: 'info' });
    // Said once, when the Board goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dest = useRef(new Map<number, string>());
  const settle = useCallback((n: number) => {
    done.current = Math.max(done.current, n);
    dest.current.delete(n);
    setQueue((q) => q.filter((x) => x.n !== n));
  }, []);
  const [enter, setEnter] = useState<string | null>(null);
  return { queue, settle, done, told, enter, setEnter, dest };
}
