// localFiles: a file named by its path, read from the machine this Hub runs on, for a composer attachment. The web Hub
// has no such thing (a browser picks files with its own dialog): every path is refused. The terminal Hub reads it
// (localFiles.term.ts). Paths come from what the person typed or pasted (a terminal turns a file dropped on it into a
// paste of its path).

import type { LocalRead } from './localFiles.pure';

export { LOCAL_MAX_BYTES, pastedPaths } from './localFiles.pure';
export type { LocalRead } from './localFiles.pure';

/** The web cannot read a path. */
export async function readLocalFile(_path: string): Promise<LocalRead> {
  return { k: 'refused', why: 'unsupported' };
}
