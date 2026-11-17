// The read-only actions' data: a preview's bytes and a search below a folder, all through core.
// Nothing here changes anything, so nothing is held (C9 has nothing to keep).
//
// Contract, in plain words:
//   - usePreview(c, path, name, enabled) reads one file's preview while `enabled` (the preview is open): an image's
//     thumbnail as bytes (?thumbnail&size=1024, at most 512 KiB) shown as a data: URL, anything else as its first 400
//     lines (?lines=1-400, at most 256 KiB). Each read starts fresh, and an answer for another file or a closed preview
//     is dropped. States: loading, image, text, off (thumbnails are off: 403), big (over the byte bound), notImage
//     (the bytes are no picture the Hub shows), notText (a NUL byte), gone (404), failed (anything else).
//   - useFind(c, base, q, round, enabled) searches names and paths below `base` (one part deep or more) for `q`
//     through ?q=; select reads it with foundOf, so an answer that is not a listing is an error, never "nothing
//     found". `round` counts the person's asks: each ask is a fresh search, never a cached answer.
import { coreSource, download, type SourceTable } from '@core';
import { useCallback, useEffect, useState } from 'react';
import type { FilesComputer } from './data';
import { blockedPath, partsOf } from './logic';
import { THUMB_BYTES, THUMB_SIZE, TEXT_BYTES, TEXT_LINES, foundOf, imageDataUrl, previewKind, textOf, type Found } from './ro';
import { findRoutes, linesRoutes, thumbRoutes } from './ro.routes';

interface At { id: string; project: string; server: string; path: string }
const atOf = (c: FilesComputer | undefined, path: string): At => ({ id: c?.id ?? '', project: c?.project_id ?? '', server: c?.server_name ?? '', path });
const placed = (p: At) => !!(p.id && p.project && p.server);
const target = (p: At) => ({ project: { id: p.project }, container: { id: p.id, server_name: p.server } });
const params = (p: At) => Object.fromEntries(partsOf(p.path).map((s, i) => [`p${i}`, s]));

export type PreviewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'text'; readonly text: string; readonly lines: number; readonly more: boolean }
  | { readonly kind: 'off' | 'big' | 'notImage' | 'notText' | 'gone' | 'failed'; readonly error?: unknown };

/** How a failed preview read reads (see the contract). */
export function previewProblem(err: unknown, image: boolean): PreviewState {
  const e = (err ?? {}) as { kind?: unknown; status?: unknown };
  if (e.kind === 'too_large') return { kind: 'big' };
  if (e.status === 404) return { kind: 'gone' };
  if (image && e.status === 403) return { kind: 'off' };
  return { kind: 'failed', error: err };
}

export function usePreview(c: FilesComputer | undefined, path: string, name: string, enabled: boolean): { state: PreviewState; retry: () => void } {
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });
  const [round, setRound] = useState(0);
  const p = atOf(c, path);
  const image = previewKind(name) === 'image';
  const key = `${p.id}|${p.project}|${p.server}|${path}|${image}`;
  useEffect(() => {
    if (!enabled) return;
    const n = partsOf(path).length;
    const route = (image ? thumbRoutes : linesRoutes)[n - 1];
    setState({ kind: 'loading' });
    if (!route || !placed(p) || blockedPath(path)) { setState({ kind: 'failed' }); return; }
    const ac = new AbortController();
    let live = true;
    download(route, {
      target: target(p), params: params(p), signal: ac.signal,
      query: image ? { thumbnail: '', size: THUMB_SIZE } : { lines: `1-${TEXT_LINES}` },
      maxBytes: image ? THUMB_BYTES : TEXT_BYTES,
    }).then(async (got) => {
      const bytes = new Uint8Array(await new Blob(got.parts).arrayBuffer());
      if (!live) return;
      if (image) {
        const url = imageDataUrl(bytes);
        setState(url ? { kind: 'image', url } : { kind: 'notImage' });
        return;
      }
      const text = textOf(bytes);
      if (text === null) { setState({ kind: 'notText' }); return; }
      const body = text.endsWith('\n') ? text.slice(0, -1) : text;
      const lines = body === '' ? 0 : body.split('\n').length;
      setState({ kind: 'text', text: body, lines, more: lines >= TEXT_LINES });
    }, (err: unknown) => { if (live) setState(previewProblem(err, image)); });
    return () => { live = false; ac.abort(); };
    // key names everything the read depends on; round is Try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, round]);
  const retry = useCallback(() => setRound((r) => r + 1), []);
  return { state: enabled ? state : { kind: 'loading' }, retry };
}

// ── Find by name ────────────────────────────────────────────────────────────────────────────────────────────
interface FindParams extends At { q: string; round: number }
export interface FoundList { readonly base: string; readonly items: readonly Found[]; readonly capped: boolean }
const reads: Record<string, NonNullable<SourceTable['reads']>[string]> = {};
findRoutes.forEach((route, i) => {
  reads[`find${i + 1}`] = {
    route,
    input: (p: FindParams) => (placed(p) ? { target: target(p), params: params(p), query: { q: p.q } } : { params: params(p), query: { q: p.q } }),
    select: (raw: unknown, p: FindParams): FoundList => {
      const got = foundOf(raw, p.path);
      if (!got) throw new Error('NOT_A_LISTING');
      return { base: p.path, ...got };
    },
    staleTime: 30_000,
  };
});
const source = coreSource('files-find', { reads });

/** Searches below `base` while `enabled` and `q` is set (findQuery checked it). */
export function useFind(c: FilesComputer | undefined, base: string, q: string, round: number, enabled: boolean) {
  const n = partsOf(base).length;
  const ok = !!c && n >= 1 && n <= findRoutes.length && !blockedPath(base) && !!q;
  return source.useQuery<FoundList, FindParams>(`find${ok ? n : 1}`, { ...atOf(c, base), q, round }, { enabled: enabled && ok });
}
