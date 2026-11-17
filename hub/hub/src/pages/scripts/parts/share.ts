// Why the Overview's public-link actions are off: one answer for the Make a link button, its dialog, and each link's switch and
// remove, so a disabled action always has its reason on the page. A change held by another
// view (HeldElsewhere) and this view's own outcomes (ChangeBanner) explain themselves; they are not reasons here.
import { routeOf } from '../logic';
import { ownerHeld } from './readOnly';
import type { CompScripts, ScriptItem } from '../types';

export type ShareWhy =
  | { k: 'noAddress' }
  | { k: 'dynamic' }
  | { k: 'managed'; template: string }
  | { k: 'ownerReading' }
  | { k: 'ownerFailed'; kind: 'network' | 'forbidden' | 'not_found' | 'signedOut' | 'rejected' | 'noHost' | 'notOpen' | 'other'; error: unknown }
  | { k: 'waiting' };

const FAIL_KINDS = ['network', 'forbidden', 'not_found'] as const;

// The agent answering that it could not open its list of idea-made scripts is told apart by its sign-in (readOnly.ts ownerHeld):
// signed out, its login rejected, signed in and still not open (a realm that keeps its data nowhere yet), or not known. None
// clears by itself, so no line says it does; anything else stays `other`.
const HELD_KIND = { signedOut: 'signedOut', rejected: 'rejected', noHost: 'noHost', notOpen: 'notOpen', failed: 'other', reading: 'other' } as const;

/** Why making a link is off, or null when it is not. `locked`: a link change of this script is still open (useChange). The
 *  existing links' switch and remove do not need the script's own address: `forLinks` skips the address reasons. */
export function shareWhy(item: Pick<ScriptItem, 'path' | 'route' | 'managed' | 'ownershipUnknown'>, comp: Pick<CompScripts, 'ownerRead'> & { agent?: Pick<CompScripts['agent'], 'writer' | 'writerWhy' | 'signIn'> }, locked: boolean, forLinks = false): ShareWhy | null {
  if (!forLinks && !routeOf(item.path)) return { k: 'noAddress' };
  if (!forLinks && item.route.includes('[')) return { k: 'dynamic' };
  if (item.managed) return { k: 'managed', template: item.managed.template };
  if (item.ownershipUnknown) {
    const r = comp.ownerRead;
    if (r?.k === 'failed') {
      // The agent's own word first (a named cause may come with any status), then how the read failed.
      const held = HELD_KIND[ownerHeld({ instances: null, ownerRead: r, agent: comp.agent }) ?? 'failed'];
      return { k: 'ownerFailed', kind: held !== 'other' ? held : (FAIL_KINDS as readonly string[]).includes(r.kind) ? (r.kind as (typeof FAIL_KINDS)[number]) : 'other', error: r.error };
    }
    return { k: 'ownerReading' };
  }
  if (locked) return { k: 'waiting' };
  return null;
}

const KEY = {
  noAddress: 'share.why.noAddress', dynamic: 'share.dynamic', managed: 'share.why.managed', ownerReading: 'share.why.ownerReading', waiting: 'share.why.waiting',
} as const;
const FAILED_KEY = {
  network: 'share.why.ownerFailed.network', forbidden: 'share.why.ownerFailed.forbidden', not_found: 'share.why.ownerFailed.not_found', signedOut: 'share.why.ownerFailed.signedOut', rejected: 'share.why.ownerFailed.rejected', noHost: 'share.why.ownerFailed.noHost', notOpen: 'share.why.ownerFailed.notOpen', other: 'share.why.ownerFailed.other',
} as const;

/** The strings key of a reason's one line. */
export function shareWhyKey(w: ShareWhy): string {
  return w.k === 'ownerFailed' ? FAILED_KEY[w.kind] : KEY[w.k];
}

/** Whether the reason has a read that may clear it (Check again): only ownership, which the page reads again on reload. */
export const shareWhyRechecks = (w: ShareWhy): boolean => w.k === 'ownerReading' || w.k === 'ownerFailed';
