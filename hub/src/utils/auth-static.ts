// Stub of the API server's auth-static module for the standalone Hub source: only what hub/scripts/build.ts imports.
import path from 'node:path';

// `<name>-<hash>.<ext>` (Vite's 8-character base64url content hash), or one of its compressed siblings.
const HUB_HASHED_RE = /-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+(?:\.(?:br|gz|deflate))?$/;

/** True for a content-hashed Hub asset name (or its compressed sibling). */
export function isHubHashedName(name: string): boolean {
  return HUB_HASHED_RE.test(path.basename(name));
}
