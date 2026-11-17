// openOutside: the one way the Hub opens an address outside itself (a program's page, a guide, a payment page). Where
// the host can open a browser (the web: a new tab; a terminal with a browser), it does. Where it cannot (a terminal over
// SSH), nothing is ever silent: the address is copied when the host has a clipboard, and shown whole in a toast either
// way, so the person can open it themselves. What is SHOWN has its ids masked (shownAddress, as the hand-off draws
// an address); the browser and the clipboard get the whole address. A secret address (`shownAs`) is never drawn at all:
// the toast shows the caller's mask, and when it could be neither opened nor copied the toast says so, without it.
// A Hub route is never one of these: routes navigate.
import { hostEnv } from '../../core/host-env';
import { makeT } from '../strings';
import { shownAddress } from './handoff.pure';
import { showToast } from './Toast.store';
import strings from './openOutside.strings.en.json';

/** An http(s) address to hand on: absolute, no spaces or control characters. */
const outsideUrl = (url: string): boolean => {
  if (typeof url !== 'string' || /[\u0000- \u007f-\u009f]/.test(url)) return false;
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
};

/** Opens `url` outside the Hub; returns true when the host opened it. Elsewhere than a web page, falls back to copy +
 *  show (a web page keeps the browser's own answer, as before). `shownAs`: the address is secret; this stands for it
 *  wherever it would be drawn (the caller's mask), and it is never shown, not even when it cannot be copied. */
export function openOutside(url: string, o: { shownAs?: string } = {}): boolean {
  // Bound per call (makeT only binds the table), so loading this module runs nothing (kitpure).
  const t = makeT(strings);
  let env: ReturnType<typeof hostEnv> | null = null;
  try { env = hostEnv(); } catch { env = null; }
  // A web page: exactly what the call sites did before (a new tab, or the browser's own refusal).
  if (env?.browserPage) return env.openExternal?.(url) === true;
  if (!outsideUrl(url)) {
    showToast({ id: 'open-outside', tone: 'warn', title: t('outside.refused') });
    return false;
  }
  const open = env?.openExternal;
  if (open && open(url) !== false) return true;
  let copied = false;
  try { copied = env?.clipboard?.write(url) === true; } catch { copied = false; }
  if (o.shownAs !== undefined && !copied) {
    showToast({ id: 'open-outside', tone: 'warn', title: t('outside.secretStuck') }, 0);
    return false;
  }
  showToast({ id: 'open-outside', tone: 'info', title: copied ? t('outside.copied') : t('outside.copyIt'), body: o.shownAs ?? shownAddress(url) }, 0); // stays until dismissed: the person still has to open it
  return false;
}

/** Opens a page of the Hub's own site that is not a Hub route ('/auth/…': sign-in, the token page), from a host
 *  that is not a web page: the path is resolved against the web Hub's origin as the host gave it (never guessed) and
 *  handed to openOutside. With no known origin it says, in a toast, that the page opens on the web: never a dead
 *  press. Returns true when the host opened it. */
export function openOnWeb(path: string): boolean {
  const t = makeT(strings);
  let origin: string | null = null;
  try { origin = hostEnv().pageAddress?.origin ?? null; } catch { origin = null; }
  if (origin && path.startsWith('/') && !path.startsWith('//')) return openOutside(origin + path);
  showToast({ id: 'open-outside', tone: 'info', title: t('outside.webOnly') });
  return false;
}
