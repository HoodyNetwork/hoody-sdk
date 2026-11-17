// The folder of /ai/f/<key>: the key is base64url (no padding) of the folder's
// absolute path in UTF-8. It carries no '/' and no '%', so the router keeps it as written through every search or sort
// write (navigate({to: '.'}) rebuilds the path from its splat, unescaping '/' and trimming slashes) and through a reload.
// A key that is not exactly that form is no folder: never inferred as the root, never read.

const B64URL = /^[A-Za-z0-9_-]+$/;

/** The route key of a folder path: base64url of its UTF-8 bytes, no padding. */
export function folderKey(path: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(path)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The folder path a route key names, or null: not base64url, not the canonical encoding (folderKey of the result is
 *  the key itself), not valid UTF-8, not an absolute path, or holding a control character. */
export function folderOfKey(key: string | null | undefined): string | null {
  if (!key || !B64URL.test(key) || key.length % 4 === 1) return null;
  let path: string;
  try {
    const bin = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
    path = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  if (folderKey(path) !== key || !path.startsWith('/') || /[\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
}

/** The heading of a folder: its last name, or "/" for the root. */
export function folderName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : '/';
}
