// The Ready step's key: what `gh=` in the address names. A library program by
// its id (`gh=uptime-kuma`), or any other repository by its address after github.com (`gh=octo/demo`, with
// `/tree/<ref>[/<path>]` when the address had one). The key is read back through parseRepo, never a looser reading, so a
// key that does not parse names nothing; an id is only an id while the library holds it.
import { parseRepo, type Repo } from '../github';
import type { LibraryState } from './Library';
import { findById, findByRepo, type Library, type LibraryProgram } from './library';

/** A library program's id (library.ts ID): a key without a slash. */
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The address of a repository after github.com/, as parseRepo reads it back. */
export const repoPath = (r: Repo): string => `${r.owner}/${r.name}${r.ref ? `/tree/${r.ref}${r.path ? `/${r.path}` : ''}` : ''}`;

/** A program's repository. */
export const repoOf = (p: LibraryProgram): Repo => ({ owner: p.owner, name: p.repo });

/** The key for a repository: its library program's id when it is one (the plain address, no ref or path), else its
 *  address. */
export function keyFor(r: Repo, lib: Library | null): string {
  const p = lib && !r.ref ? findByRepo(lib, r) : undefined;
  return p ? p.id : repoPath(r);
}

/** What a key shows: Ready for a repository (its program when the library holds it), `wait` while the library that
 *  an id needs is loading, `none` for a key that names nothing (Library then). */
export type ReadyShown = { kind: 'ready'; repo: Repo; program: LibraryProgram | undefined } | { kind: 'wait' } | { kind: 'none' };

export function readyOf(key: string | undefined, state: LibraryState): ReadyShown {
  if (!key) return { kind: 'none' };
  const lib = state.kind === 'ready' ? state.lib : null;
  if (key.includes('/')) {
    const parsed = parseRepo(`github.com/${key}`);
    if (!parsed.ok) return { kind: 'none' };
    return { kind: 'ready', repo: parsed.repo, program: lib && !parsed.repo.ref ? findByRepo(lib, parsed.repo) : undefined };
  }
  if (!ID.test(key)) return { kind: 'none' };
  if (state.kind === 'loading') return { kind: 'wait' };
  const program = lib ? findById(lib, key) : undefined;
  return program ? { kind: 'ready', repo: repoOf(program), program } : { kind: 'none' };
}
