// A computer's VS Code extensions for the Board's "VS Code extension" pick.
//
// Contract, in plain words:
//   - extensionParams(id) → the code tile's params for the extension-only view ({extension: id}), through the
//     catalogue's own checks (storableParams: the PUBLISHER.NAME pattern and size), or null when the id is not one.
//     A picked row and a typed id go through it alike, so the tile is exactly what the tile's Options would make.
//   - extensionsOf(body) → the extensions the editor's list names (hoody-code GET /api/v1/code/extensions/list):
//     the observed section first, by its installation facts: an installed version is installed (note null), a failed
//     install keeps note 'failed', nothing installed but a staged version is 'staged' (it installs when the editor
//     next starts; the kit lists such an entry as observed too); an entry with neither version adds nothing here.
//     Then the staged section's entries not seen yet ('staged'). One row per PUBLISHER.NAME (case-insensitive; the
//     first wins), only ids the tile can open, names cleaned of control characters, sorted by name, at most
//     MAX_EXTENSIONS. A section the editor could not read adds nothing. The list carries no display name or icon:
//     name and publisher are the extension's own.
//   - listComplete(body) → true only when both sections were read ('ok') and the kit does not call the answer
//     partial; anything else (a section 'unavailable', not the list's shape) is incomplete, so an empty row list is
//     never read as "none installed" unless the answer was whole.
//   - useCodeExtensions(computer) → {rows, incomplete, retry}: rows null while reading, 'failed' when the read failed
//     (retry reads again); nothing is read for no computer or one that is not running (null). The kit answers 503
//     with the same list body when a section could not be read: its usable rows are kept, incomplete. incomplete is
//     true while the rows come from an answer that was not whole. A computer change drops the old answer and aborts
//     its read. A read only: nothing here installs or changes anything.
import { boardSend, computerState } from '@core';
import { useEffect, useState } from 'react';
import type { BoardComputer } from './computers';
import { CATALOG } from './embed/catalog';
import { storableParams } from './embed/options';
import type { EmbedValue } from './embed/build';
import { boardTarget } from './termSessions';

export const EXTENSIONS_PATH = '/api/v1/code/extensions/list';
export const MAX_EXTENSIONS = 500;

export interface CodeExtension {
  /** PUBLISHER.NAME, as the tile opens it. */
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  /** 'staged': not installed yet (installs at the editor's next start); 'failed': the install failed; null: installed. */
  readonly note: 'staged' | 'failed' | null;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '');

/** The code tile's params for this extension (see the contract), or null. */
export function extensionParams(id: string): Record<string, EmbedValue> | null {
  const kept = storableParams(CATALOG, 'code', 'extension', { extension: id });
  return kept.extension === id ? kept : null;
}

export function extensionsOf(body: unknown): CodeExtension[] {
  const o = rec(body);
  const seen = new Map<string, CodeExtension>();
  const add = (e: unknown, staged: boolean) => {
    const r = rec(e);
    if (staged && r.status !== 'ok') return;
    const has = (v: unknown) => typeof v === 'string' && v !== '';
    const note = staged ? 'staged' : r.status === 'failed' ? 'failed' : has(r.installedVersion) ? null : has(r.stagedVersion) ? 'staged' : undefined;
    if (note === undefined) return;
    const publisher = clean(r.publisher), name = clean(r.name);
    if (!publisher || !name) return;
    const id = publisher + '.' + name;
    const key = id.toLowerCase();
    if (seen.has(key) || !extensionParams(id)) return;
    seen.set(key, { id, name, publisher, note });
  };
  for (const [section, staged] of [['observed', false], ['desired', true]] as const) {
    const s = rec(o[section]);
    if (s.status === 'ok' && Array.isArray(s.extensions)) for (const e of s.extensions) add(e, staged);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.publisher.localeCompare(b.publisher)).slice(0, MAX_EXTENSIONS);
}

export function listComplete(body: unknown): boolean {
  const o = rec(body);
  return rec(o.observed).status === 'ok' && rec(o.desired).status === 'ok' && o.partial !== true;
}

/** The list body of an answer or of the kit's 503 (same shape), or undefined when it carries none. */
const listBody = (v: unknown): unknown => {
  const o = rec(v);
  return typeof rec(o.observed).status === 'string' || typeof rec(o.desired).status === 'string' ? v : undefined;
};

const keyOf = (c: BoardComputer | null) => (c && computerState(c.status) === 'running' ? c.project_id + '\n' + c.id + '\n' + (c.server_name ?? '') : '');

export function useCodeExtensions(computer: BoardComputer | null): { readonly rows: readonly CodeExtension[] | null | 'failed'; readonly incomplete: boolean; readonly retry: () => void } {
  const key = keyOf(computer);
  const [tries, setTries] = useState(0);
  const [got, setGot] = useState<{ key: string; rows: CodeExtension[] | 'failed'; incomplete: boolean } | null>(null);
  useEffect(() => {
    setGot(null);
    if (!key || !computer) return;
    const ac = new AbortController();
    boardSend({ kit: 'code', index: 1 }, 'GET', EXTENSIONS_PATH, { target: boardTarget(computer), signal: ac.signal }).then(
      (body) => { if (!ac.signal.aborted) setGot({ key, rows: extensionsOf(body), incomplete: !listComplete(body) }); },
      (e: unknown) => {
        if (ac.signal.aborted) return;
        const err = rec(e);
        const part = err.status === 503 ? listBody(err.data) : undefined;
        setGot(part === undefined ? { key, rows: 'failed', incomplete: false } : { key, rows: extensionsOf(part), incomplete: true });
      },
    );
    return () => ac.abort();
    // The key names the computer; the object changes with every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tries]);
  const mine = got && got.key === key ? got : null;
  return { rows: mine ? mine.rows : null, incomplete: !!mine && mine.incomplete, retry: () => setTries((n) => n + 1) };
}
