// localFiles.term: a path read from the machine this terminal Hub runs on (the computer a person reached over SSH, or
// their own). A regular file only, at most LOCAL_MAX_BYTES; its type from the name (images the host takes: png, jpeg,
// gif, webp; everything else is text, and the host refuses what is not). Nothing is read until the person asks.
import type * as Web from './localFiles';
import { LOCAL_MAX_BYTES } from './localFiles.pure';

export type { LocalRead } from './localFiles.pure';
export { LOCAL_MAX_BYTES, pastedPaths } from './localFiles.pure';

const MIME: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export const readLocalFile: typeof Web.readLocalFile = async (path) => {
  const home = process.env.HOME ?? '';
  const full = path.startsWith('~/') ? (home ? home + path.slice(1) : path) : path;
  try {
    const { readFile, stat } = await import('node:fs/promises');
    const st = await stat(full);
    if (!st.isFile()) return { k: 'refused', why: 'not_file' };
    if (st.size > LOCAL_MAX_BYTES) return { k: 'refused', why: 'too_big' };
    const name = full.split('/').pop() || 'file';
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    const type = MIME[ext] ?? 'text/plain';
    const bytes = await readFile(full);
    return { k: 'file', file: new File([bytes], name, { type }) };
  } catch (e) {
    return { k: 'refused', why: (e as { code?: string }).code === 'ENOENT' ? 'not_found' : 'unreadable' };
  }
};
