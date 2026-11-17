// ownPair.ts: takes back an account pair a sign-in flow itself just wrote (signin.ts, standalone/device.ts).
// Used only when the Hoody named in storage changed between a flow's origin check and its write: the pair belongs to the
// Hoody the flow started on and must not stay beside another Hoody's record. Each key goes only while it still holds
// this flow's own value (another sign-in may have written since); an expiry goes with its own token. Every removal has
// its own try, so one refused removal never skips the rest. Not atomic across tabs: a write landing between a compare
// and its removal is the general check-then-remove limit of Web Storage.

export interface OwnPair { readonly token: string; readonly refreshToken: string }

export function dropOwnPair(pair: OwnPair): void {
  const g = globalThis as { bumpAuthRev?: () => string };
  let ls: Storage;
  try { ls = globalThis.localStorage; } catch { return; }
  const read = (k: string): string | null => { try { return ls.getItem(k); } catch { return null; } };
  const drop = (k: string): void => { try { ls.removeItem(k); } catch { /* the next key is still tried */ } };
  const access = read('access_token') === pair.token;
  const refresh = read('refresh_token') === pair.refreshToken;
  if (!access && !refresh) return;
  try { g.bumpAuthRev?.(); } catch { /* the removal still runs */ }
  if (access && read('access_token') === pair.token) { drop('access_token'); drop('access_token_expires_at'); }
  if (refresh && read('refresh_token') === pair.refreshToken) { drop('refresh_token'); drop('refresh_token_expires_at'); }
}
