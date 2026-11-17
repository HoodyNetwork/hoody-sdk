// localFiles.pure: the shared, pure part of localFiles (see localFiles.ts).

/** What reading a path came to. */
export type LocalRead = { k: 'file'; file: File } | { k: 'refused'; why: 'not_found' | 'not_file' | 'too_big' | 'unreadable' | 'unsupported' };

/** The most read from one path; the host's own limits (image and text sizes) still apply after. */
export const LOCAL_MAX_BYTES = 8 * 1024 * 1024;

/** The paths in a paste, when the whole paste is one or more paths (one per line, or quoted / backslash-escaped as a
 *  terminal writes a dropped file); null when it is anything else. Pure. */
export function pastedPaths(text: string): string[] | null {
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > 8) return null;
  const out: string[] = [];
  for (const l of lines) {
    let p = l;
    if ((p.startsWith("'") && p.endsWith("'")) || (p.startsWith('"') && p.endsWith('"'))) p = p.slice(1, -1);
    else p = p.replace(/\\(.)/g, '$1');
    if (p.startsWith('file://')) { try { p = decodeURIComponent(new URL(p).pathname); } catch { return null; } }
    if (!/^(\/|~\/)[^\0]*$/.test(p) || p.length > 4096) return null;
    out.push(p);
  }
  return out;
}
