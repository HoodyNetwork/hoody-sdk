// Issued-secret ids and the keyed Bot link (split out of KeyShare.tsx so the terminal build shares them; KeyShare.tsx
// re-exports both). One ISSUED map and counter, never copied.

const ISSUED = new WeakMap<object, string>();
let issued = 0;
/** A fresh id for each issued secret, by the identity of the object that holds it (a mint answer, a rotated key, a new Bot's result). */
export function issueKey(holder: object): string {
  let id = ISSUED.get(holder);
  if (!id) {
    id = `issued-${++issued}`;
    ISSUED.set(holder, id);
  }
  return id;
}

/** The Bot's address with its key after # (the Bot's page: shareLink, readKeyFromLocation), or null with no address. */
export function keyedLink(url: string | undefined, secret: string): string | null {
  if (!url) return null;
  return `${url.replace(/\/+$/, '')}/#key=${encodeURIComponent(secret)}`;
}
