// A Notes page as a tile: the computer's notebooks and their pages, read through core's Board requests
// (boardSend) for the picker, never kept. The tile stores ids only: the Notes view 'node' with {userId, nodeId}.
//
// Contract, in plain words:
//   - notebooksOf(body) → the notebooks Notes lists ({notebooks: [...]}) that the viewer can open: an id and the
//     viewer's own user id in it (both Notes ids, 24-28 lowercase letters and digits), a role other than 'none', and
//     the name (or '' for none). Sorted by name. Anything else gives [].
//   - pagesOf(body) → {pages, total}: the nodes of type 'page' ({nodes: [...], total}) with a Notes id, and their name
//     ('' for none); total is the notebook's count when the answer gives one, else null.
//   - notesLink(text) → the ids in a Notes page address, or null: the address Notes' own address bar shows,
//     /<notebookId>/<nodeId> (its path, the whole of it), gives {notebookId, nodeId}, and the caller finds the
//     viewer's user id in that notebook (notebooksOf); the route behind it, …/notebook/<userId>/<nodeId>, gives
//     {userId, nodeId}.
//   - useNotebooks(computer) → {rows, retry}: rows are the notebooks, null while reading, 'failed' when the read
//     failed (retry reads again); nothing is read for no computer or one that is not running (null). A computer
//     change drops the old answer and aborts its read.
//   - useNotesPages(computer, notebookId) → {pages, total, failed, loading, hasMore, more}: the first PAGE_SIZE pages, then
//     `more()` reads the next PAGE_SIZE (one read at a time; a failed one can be tried again). A new notebook or
//     computer starts again from the first page.
import { boardSend, computerState } from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardComputer } from './computers';
import { boardTarget } from './termSessions';

export const PAGE_SIZE = 100;
const NOTES_ID = /^[0-9a-z]{24,28}$/;

export interface Notebook { readonly id: string; readonly name: string; readonly userId: string }
export interface NotesPage { readonly id: string; readonly name: string }

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const nameOf = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '');
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function notebooksOf(body: unknown): Notebook[] {
  const list = rec(body).notebooks;
  if (!Array.isArray(list)) return [];
  const out: Notebook[] = [];
  for (const it of list) {
    const r = rec(it), u = rec(r.user);
    if (typeof r.id !== 'string' || !NOTES_ID.test(r.id) || typeof u.id !== 'string' || !NOTES_ID.test(u.id) || u.role === 'none') continue;
    out.push({ id: r.id, name: nameOf(r.name), userId: u.id });
  }
  return out.sort(byName);
}

export function pagesOf(body: unknown): { pages: NotesPage[]; total: number | null } {
  const o = rec(body);
  const list = Array.isArray(o.nodes) ? o.nodes : [];
  const pages: NotesPage[] = [];
  for (const it of list) {
    const r = rec(it);
    if (r.type !== 'page' || typeof r.id !== 'string' || !NOTES_ID.test(r.id)) continue;
    pages.push({ id: r.id, name: nameOf(r.name) });
  }
  return { pages, total: typeof o.total === 'number' && Number.isInteger(o.total) && o.total >= 0 ? o.total : null };
}

export type NotesLink = { readonly userId: string; readonly nodeId: string } | { readonly notebookId: string; readonly nodeId: string };

export function notesLink(text: string): NotesLink | null {
  const s = text.trim();
  const m = /\/notebook\/([0-9a-z]{24,28})\/([0-9a-z]{24,28})(?:[/?#]|$)/.exec(s);
  if (m) return { userId: m[1]!, nodeId: m[2]! };
  let path = s;
  try { path = new URL(s).pathname; } catch { /* a bare path */ }
  const short = /^\/([0-9a-z]{24,28})\/([0-9a-z]{24,28})\/?$/.exec(path);
  return short ? { notebookId: short[1]!, nodeId: short[2]! } : null;
}

const keyOf = (c: BoardComputer | null) => (c && computerState(c.status) === 'running' ? c.project_id + '\n' + c.id + '\n' + (c.server_name ?? '') : '');

export function useNotebooks(computer: BoardComputer | null): { readonly rows: readonly Notebook[] | null | 'failed'; readonly retry: () => void } {
  const key = keyOf(computer);
  const [tries, setTries] = useState(0);
  const [got, setGot] = useState<{ key: string; rows: Notebook[] | 'failed' } | null>(null);
  useEffect(() => {
    setGot(null);
    if (!key || !computer) return;
    const ac = new AbortController();
    boardSend({ kit: 'notes', index: 1 }, 'GET', '/api/v1/notes/notebooks', { target: boardTarget(computer), signal: ac.signal }).then(
      (body) => { if (!ac.signal.aborted) setGot({ key, rows: notebooksOf(body) }); },
      () => { if (!ac.signal.aborted) setGot({ key, rows: 'failed' }); },
    );
    return () => ac.abort();
    // The key names the computer; the object changes with every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tries]);
  return { rows: got && got.key === key ? got.rows : null, retry: () => setTries((n) => n + 1) };
}

export interface NotesPages {
  readonly pages: readonly NotesPage[];
  readonly total: number | null;
  readonly loading: boolean;
  readonly failed: boolean;
  /** More pages than these are in the notebook (or the last read failed and can be tried again). */
  readonly hasMore: boolean;
  /** Reads the next PAGE_SIZE pages (nothing while a read runs or when every page is in). */
  readonly more: () => void;
}

export function useNotesPages(computer: BoardComputer | null, notebookId: string | null): NotesPages {
  const at = keyOf(computer);
  const key = at && notebookId && NOTES_ID.test(notebookId) ? at + '\n' + notebookId : '';
  const [st, setSt] = useState<{ key: string; pages: NotesPage[]; offset: number; total: number | null; loading: boolean; failed: boolean; done: boolean }>({ key: '', pages: [], offset: 0, total: null, loading: false, failed: false, done: false });
  const ac = useRef<AbortController | null>(null);
  const read = useCallback((k: string, offset: number, prev: NotesPage[]) => {
    if (!computer || !notebookId) return;
    ac.current?.abort();
    const c = new AbortController();
    ac.current = c;
    setSt({ key: k, pages: prev, offset, total: null, loading: true, failed: false, done: false });
    boardSend({ kit: 'notes', index: 1 }, 'GET', '/api/v1/notes/notebooks/' + notebookId + '/nodes', { target: boardTarget(computer), query: { type: 'page', limit: PAGE_SIZE, offset }, signal: c.signal }).then(
      (body) => {
        if (c.signal.aborted) return;
        const r = pagesOf(body);
        const seen = new Set(prev.map((p) => p.id));
        const pages = [...prev, ...r.pages.filter((p) => !seen.has(p.id))];
        const answered = Array.isArray(rec(body).nodes) ? (rec(body).nodes as unknown[]).length : 0;
        setSt({ key: k, pages, offset: offset + answered, total: r.total, loading: false, failed: false, done: answered < PAGE_SIZE || (r.total !== null && offset + answered >= r.total) });
      },
      () => { if (!c.signal.aborted) setSt((s) => ({ ...s, loading: false, failed: true })); },
    );
    // The key names computer and notebook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (key) read(key, 0, []);
    return () => ac.current?.abort();
  }, [key, read]);
  const cur = key && st.key === key ? st : null;
  const more = () => { if (cur && !cur.loading && !cur.done) read(key, cur.offset, cur.pages); };
  return { pages: cur?.pages ?? [], total: cur?.total ?? null, loading: !!key && (!cur || cur.loading), failed: !!cur?.failed, hasMore: !!cur && !cur.done && !cur.loading, more };
}
