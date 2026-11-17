// The folder reads behind Share a folder's folder field: the kit PathField asks for one folder of the source
// computer at a time, and this answers from the Files folder read (reads only). The field's root is the computer's top
// folder, so its value is the path without the leading "/". A computer that is stopped or cannot be read lists
// nothing; the typed path is still the value, and the server judges it.
import type { PathReads } from '@kit';
import { useCallback, useMemo, useState } from 'react';
import { useFolder, type FilesComputer } from '../data';

/** The absolute path of a folder the field names ('' is the top folder, "a/b/" a folder below it). */
export const absOf = (dir: string): string => '/' + dir.replace(/\/+$/, '');

export function useFolderReads(c: FilesComputer | undefined): PathReads {
  const [dir, setDir] = useState<string | null>(null);
  const want = useCallback((d: string | null) => setDir(d), []);
  const path = absOf(dir ?? '');
  const q = useFolder(c, path, dir !== null);
  // Only the listing of the folder asked for now: an older folder's entries are never offered for another.
  const listed = dir !== null && q.data && q.data.path === path ? q.data : null;
  const failed = dir !== null && !listed && (q.isError || !c);
  return useMemo(
    () => ({
      entries: listed ? listed.entries.filter((e) => !e.lossy).map((e) => ({ name: e.name, dir: e.dir })) : [],
      dir: listed ? dir : null,
      reading: dir !== null && !listed && !failed,
      failed,
      want,
    }),
    [listed, dir, failed, want],
  );
}
