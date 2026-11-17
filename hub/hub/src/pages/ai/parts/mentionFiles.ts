// The folder reads of every AI path picker: the composer's "@" picker and the type-or-browse folder field
// (PathField: New chat, Work in a folder, New TODO), one hook, usePathReads. It reads the folder the "@" token names, under the chat's folder, with the Files
// page's own folder read (files/links useFolder), only while the menu asks (want(dir) with a string). The kit never leaves the
// chat's folder by name (mention.ts refuses "/", "~" and ".." first); this hook never leaves it by a link either: it reads a
// folder only once every folder on the way down was listed as a real folder (type 'dir'; a symlink, or a listing that does not
// say, is never gone into). A link is offered as a name to write, never as a folder to open. What the menu shows and proves
// comes only from a read it started itself in this menu session (one per folder, never a cached or shared answer); closing the
// menu drops it all. The fence is a scope rule, not a security boundary: the same user can browse the
// whole computer on the Files page. Accepted race: a folder swapped for a link between the listing that proved it and its own
// read (including a read already out when the menu opened, which the query may join) is read through; the files program reads
// by path, so no page can close it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Target } from '@core';
import type { ComposerProps } from '@kit';
import { blockedPath, useFolder, type FilesComputer, type FolderEntry } from '../../files/links';

/** The composer's "@" menu host and one of its entries, as the kit's Composer takes them. */
type ComposerMention = NonNullable<ComposerProps['mention']>;
type MentionEntry = ComposerMention['entries'][number];

/** Where the chat runs: its computer and its folder (absolute, on that computer). */
export interface MentionAt {
  target: Target;
  folder: string;
}

/** The Files page's computer, from the chat's target: only what its folder read uses (rules not known). */
export function filesComputerOf(target: Target): FilesComputer {
  const id = target.container.id;
  return { id, name: id.slice(-4), project_id: target.project.id, server_name: target.container.server_name ?? '', status: '', rules: 'unknown' };
}

/** `dir` ("src/kit/", '' for the folder itself) under the absolute `folder`, without a trailing "/". */
export function mentionPath(folder: string, dir: string): string {
  const base = folder.replace(/\/+$/u, '');
  const sub = dir.replace(/\/+$/u, '');
  return sub === '' ? base || '/' : `${base}/${sub}`;
}

/** A name with a control character (C0, DEL, C1) is neither shown nor written into the draft. */
const hasControl = (name: string): boolean => [...name].some((ch) => { const c = ch.codePointAt(0) ?? 0; return c < 0x20 || (c >= 0x7f && c <= 0x9f); });

/** A listing's entries as the menu takes them: names the program turned lossy, and names with a control character, are left out
 *  (neither can be written back as a path the agent reads). */
export function mentionEntries(entries: readonly FolderEntry[] | undefined): MentionEntry[] {
  return (entries ?? []).filter((e) => !e.lossy && !hasControl(e.name)).map((e) => ({ name: e.name, dir: realDir(e) }));
}

/** A folder the menu may go into: listed as one ('dir'). A symlink to a folder, or an entry whose type the listing did not say,
 *  is not: its target may be outside the chat's folder. */
const realDir = (e: FolderEntry): boolean => e.dir && e.type === 'dir';

/** The folders `dir` ("a/b/") goes through, top first: '', 'a/', 'a/b/'. */
export function mentionChain(dir: string): string[] {
  const out = [''];
  let at = 0;
  for (;;) { const i = dir.indexOf('/', at); if (i < 0) break; out.push(dir.slice(0, i + 1)); at = i + 1; }
  return out;
}

const ROOT: ReadonlySet<string> = new Set(['']);

/** One menu session (id: a later session never takes an earlier one's answers): the folder asked (null: closed), and per folder
 *  path the answer of the read this session started for it ('asked' until it answers). Proven folders are those listed as
 *  'dir' by their parent in such an answer, relative to the chat's folder ('' is the folder itself) at `place`. */
type Got = 'asked' | 'failed' | readonly FolderEntry[];
interface Session { id: number; dir: string | null; place: string; got: ReadonlyMap<string, Got>; dirs: ReadonlySet<string> }
const NO_GOT: ReadonlyMap<string, Got> = new Map();

/** The reads of a path picker rooted at `at` (the "@" menu's: the chat's folder; PathField's: the home folder); null (no
 *  picker reads) without a computer or a folder. `dir` says which folder the entries are of, so the kit never offers one
 *  folder's entries for another. `want` keeps one identity (PathReads' contract). */
export function usePathReads(at: MentionAt | null): ComposerMention | null {
  // Another computer or folder starts again from ''.
  const place = at ? at.target.container.id + '\n' + at.folder : '';
  const [ses, setSes] = useState<Session>({ id: 0, dir: null, place, got: NO_GOT, dirs: ROOT });
  // want keeps one identity (the kit calls it from an effect on it); closing drops every answer and proof.
  const want = useCallback((x: string | null) => {
    setSes((s) => (x === s.dir ? s
      : x === null ? { id: s.id + 1, dir: null, place: s.place, got: NO_GOT, dirs: ROOT }
        : { ...s, dir: x }));
  }, []);
  const cur = ses.place === place ? ses : { ...ses, got: NO_GOT, dirs: ROOT };
  const dir = cur.dir;
  // The folder read now: the asked one once proven, else the deepest proven folder on its way (whose listing proves the next).
  const chain = dir === null ? [] : mentionChain(dir);
  const known = chain.filter((d) => cur.dirs.has(d));
  const read = dir === null ? null : known.length === chain.length ? dir : (known.at(-1) ?? '');
  const c = at ? filesComputerOf(at.target) : undefined;
  const path = at && read !== null ? mentionPath(at.folder, read) : '/';
  // The query only carries the read; its cached data is never used (it may predate this session, or be another page's).
  const q = useFolder(c, path, false);
  const { refetch } = q;
  const got = read !== null ? cur.got.get(path) : undefined;
  const sid = ses.id;
  // The folder read now and whether the hook is still mounted, for answers that come back later.
  const now = useRef<string | null>(null);
  now.current = read === null ? null : path;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const project = c?.project_id ?? '';
  const server = c?.server_name ?? '';
  useEffect(() => {
    if (read === null || place === '' || got !== undefined) return;
    // Marked asked first, so this read is started once per folder per session.
    setSes((s) => {
      if (s.id !== sid) return s;
      const base = s.place === place ? s : { ...s, place, got: NO_GOT, dirs: ROOT };
      return { ...base, got: new Map(base.got).set(path, 'asked') };
    });
    const done = (r: Got | 'left') => { if (alive.current) setSes((s) => {
      if (s.id !== sid || s.place !== place) return s;
      // An answer that is not this read's (it was dropped when the menu moved to another folder) leaves the folder unasked,
      // so it is read again when the menu comes back to it; while it is still the folder shown, it says failed.
      const g = r === 'left' ? new Map(s.got) : new Map(s.got).set(path, r);
      if (r === 'left') g.delete(path);
      if (typeof r === 'string') return { ...s, got: g };
      const add = r.filter((e) => !e.lossy && !hasControl(e.name) && realDir(e)).map((e) => read + e.name + '/');
      return { ...s, got: g, dirs: new Set([...s.dirs, ...add]) };
    }); };
    // The folder read's own guard (useFolder sends nothing for these; a refetch would not ask it): never sent, said failed.
    if (!project || !server || blockedPath(path)) { done('failed'); return; }
    // A read of our own, started now: a new fetch (cancelRefetch drops one already out), and only an answer that landed after
    // it was asked counts. One read per folder per session: a failure stays failed until the menu opens again.
    const t = Date.now();
    refetch({ cancelRefetch: true }).then(
      (r) => done(r.isSuccess && r.data && r.dataUpdatedAt >= t ? r.data.entries : now.current === path ? 'failed' : 'left'),
      () => done(now.current === path ? 'failed' : 'left'),
    );
  }, [read, path, got, place, sid, project, server, refetch]);
  const listed = Array.isArray(got) ? (got as readonly FolderEntry[]) : null;
  const failedHere = got === 'failed';
  if (!at || !at.folder) return null;
  if (dir === null) return { entries: [], dir: null, want };
  if (read !== dir) {
    // Going down: the next folder must be a real folder of the listing read now. A link (or a folder the listing does not
    // type) is outside the fence; a name that is not there reads as a folder that cannot be read.
    const next = chain[known.length] ?? '';
    const name = next.slice((read ?? '').length, -1);
    const e = listed?.find((x) => x.name === name);
    if (failedHere) return { entries: [], dir: null, failed: true, want };
    if (!listed || (e && realDir(e))) return { entries: [], dir: null, reading: true, want };
    return e ? { entries: [], dir: null, outside: true, want } : { entries: [], dir: null, failed: true, want };
  }
  return {
    entries: listed ? mentionEntries(listed) : [],
    dir: listed ? dir : null,
    reading: !listed && !failedHere,
    failed: failedHere,
    want,
  };
}

/** A path picker's reads with nothing to list (no computer read here, or its root unknown): a typed path is still the value. */
export const NO_PATH_READS: NonNullable<ComposerMention> = { entries: [], dir: null, failed: true, want: () => {} };

/** The composer's "@" menu host: the same reads (no second copy of the fence). */
export const useMentionFiles = usePathReads;
