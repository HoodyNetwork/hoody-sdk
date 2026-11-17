// The remembered Open-with choice as stored: the value's shape, its parse and the type a file's
// choice is kept under, plus a read-only hook. Pure, and light: pages/apps/links.ts reads it for the row menu's
// "Open in ‹Last used›" without loading the launcher (no plan or run code here). Storing is remember.ts.
//   - A type is a known extension ('.txt') or, for a name with none the table knows, its kind ('kind:text'): never a
//     file name, so the stored value holds no name, path or folder.
//   - A choice is a template id or Other command text (at most 1,024 bytes) and where it opens.
//   - A value that does not parse is read as nothing remembered (fails closed), and is replaced by the next store.
import { useAccountPref } from '@core';
import { CMD_MAX_BYTES, utf8Bytes } from './argv';
import { templateById, type FileKind, type TemplateId } from './templates';
import { EXTENSIONS, NAMES, kindOf } from './types';

export const REMEMBER_KEY = 'hub_openwith_v1';
/** A third of the store's value limit. */
export const REMEMBER_MAX_BYTES = 16_000;
export const REMEMBER_MAX_TYPES = 48;

export type Choice = { k: 'tpl'; id: TemplateId } | { k: 'cmd'; text: string; opens: 'terminal' | 'screen' };
export interface RememberDoc {
  v: 1;
  /** type → the choice and when it was last used (ms). */
  t: Record<string, { c: Choice; u: number }>;
}

export const emptyDoc = (): RememberDoc => ({ v: 1, t: {} });

export const TYPE = /^(\.[a-z0-9]{1,16}|kind:[a-z-]{1,16})$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The type a file's choice is kept under: its known extension, else its kind (never the name). Folders have none. */
export function typeOf(name: string, o: { dir?: boolean; decodedText?: boolean } = {}): string | null {
  if (o.dir) return null;
  const base = (typeof name === 'string' ? name : '').toLowerCase();
  const dot = base.lastIndexOf('.');
  const ext = !NAMES.has(base) && dot > 0 && dot < base.length - 1 ? base.slice(dot + 1) : '';
  if (ext && EXTENSIONS.has(ext)) return '.' + ext;
  const kind: FileKind = kindOf(name, o);
  return kind === 'folder' ? null : 'kind:' + kind;
}

export function choiceOf(raw: unknown): Choice | null {
  if (!isObj(raw)) return null;
  if (raw.k === 'tpl' && Object.keys(raw).length === 2) {
    const t = typeof raw.id === 'string' ? templateById(raw.id) : undefined;
    // A folder template is never a file's choice.
    return t && !t.for.includes('folder') ? { k: 'tpl', id: t.id } : null;
  }
  if (raw.k === 'cmd' && Object.keys(raw).length === 3) {
    const { text, opens } = raw;
    if (typeof text !== 'string' || !text.trim() || utf8Bytes(text) > CMD_MAX_BYTES) return null;
    if (opens !== 'terminal' && opens !== 'screen') return null;
    return { k: 'cmd', text, opens };
  }
  return null;
}

/** The stored value, or nothing remembered when any part of it does not read (fails closed). */
export function parseDoc(raw: unknown): RememberDoc {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.t) || Object.keys(raw).length !== 2) return emptyDoc();
  const entries = Object.entries(raw.t);
  if (entries.length > REMEMBER_MAX_TYPES) return emptyDoc();
  const t: RememberDoc['t'] = {};
  for (const [type, e] of entries) {
    if (!TYPE.test(type) || !isObj(e) || Object.keys(e).length !== 2) return emptyDoc();
    const c = choiceOf(e.c);
    const u = e.u;
    if (!c || typeof u !== 'number' || !Number.isSafeInteger(u) || u < 0) return emptyDoc();
    t[type] = { c, u };
  }
  const doc: RememberDoc = { v: 1, t };
  return bytesOf(doc) > REMEMBER_MAX_BYTES ? emptyDoc() : doc;
}

export const bytesOf = (d: RememberDoc): number => utf8Bytes(JSON.stringify(d));

export const choiceFor = (d: RememberDoc, type: string | null): Choice | null => (type ? (d.t[type]?.c ?? null) : null);

/** The remembered choices of one computer, read only (nothing remembered without a computer). */
export function useRememberedDoc(computer: string | null): RememberDoc {
  const [value] = useAccountPref<RememberDoc>('hub_openwith_v1', parseDoc, { scope: 'account+computer', keepAtSignOut: false, part: computer ?? '' });
  return computer ? value : emptyDoc();
}
