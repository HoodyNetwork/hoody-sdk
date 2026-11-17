// Why a script cannot be changed from the Hub, as string keys: made from an idea, an older Scripts program, or the agent's
// list of idea-made scripts not read. An unread list is said as what happened to the read (still going, the agent signed out,
// its login rejected, answered "could not open", did not answer), because each asks something different of the person. Null
// while the script can be written. None of the agent's refusals clears by itself: no sentence says it does.
import type { CompScripts, ScriptItem } from '../types';

export interface ReadOnlyNote {
  title: 'code.managed' | 'code.oldKit' | 'code.ownerReading' | 'code.ownerSignedOut' | 'code.ownerRejected' | 'code.ownerNoHost' | 'code.ownerNotOpen' | 'code.unknownOwner';
  body: 'code.managedBody' | 'code.oldKitBody' | 'code.ownerReadingBody' | 'code.ownerSignedOutBody' | 'code.ownerRejectedBody' | 'code.ownerNoHostBody' | 'code.ownerNotOpenBody' | 'code.unknownOwnerBody';
}

/** Why the agent's list of idea-made scripts is not read. 'signedOut': the agent is not signed in; 'rejected': its stored login
 *  was refused (as after a Hub sign-out); 'noHost': it is signed in for this account and still could not open the list (a realm
 *  of the computer keeps its data nowhere yet); 'notOpen': it could not open the list and its sign-in is not known to this page;
 *  'failed': any other failed read. */
export type OwnerHeld = 'reading' | 'signedOut' | 'rejected' | 'noHost' | 'notOpen' | 'failed';

// The agent's own codes for "I cannot say who owns the scripts". The deployed agents answer the first two (503) for every cause;
// OWNER_CODES are the ones a newer agent answers when the cause is its sign-in (409: no login, or its login refused or expired).
const CANT_OPEN: readonly string[] = ['ownership_unknown', 'restriction_unknown'];
const OWNER_CODES: Readonly<Record<string, OwnerHeld>> = { not_logged_in: 'signedOut', hoody_auth_expired: 'rejected' };

/** What the failed or running ownership read says, with the page's own read of the agent's sign-in (`agent`, from its
 *  auth/status): the deployed agents answer one code for every cause, so the sign-in tells them apart. Null when it was read. */
export function ownerHeld(comp: Pick<CompScripts, 'instances' | 'ownerRead'> & { agent?: Pick<CompScripts['agent'], 'writer' | 'writerWhy' | 'signIn'> }): OwnerHeld | null {
  if (comp.instances !== null) return null;
  const r = comp.ownerRead;
  if (!r || r.k === 'reading') return 'reading';
  const code = String((r.error as { code?: unknown } | null)?.code ?? '');
  const named = Object.hasOwn(OWNER_CODES, code) ? OWNER_CODES[code] : undefined;
  if (named) return named;
  if (!CANT_OPEN.includes(code)) return 'failed';
  const a = comp.agent;
  if (a?.writerWhy === 'login') return a.signIn === 'renew' ? 'rejected' : 'signedOut';
  // Signed in for this account ('realm': ready, only no realm is chosen for the assistant): the sign-in is not the cause.
  if (a && (a.writer || a.writerWhy === 'realm')) return 'noHost';
  return 'notOpen';
}

const HELD_NOTE: Readonly<Record<Exclude<OwnerHeld, 'reading'>, ReadOnlyNote>> = {
  signedOut: { title: 'code.ownerSignedOut', body: 'code.ownerSignedOutBody' },
  rejected: { title: 'code.ownerRejected', body: 'code.ownerRejectedBody' },
  noHost: { title: 'code.ownerNoHost', body: 'code.ownerNoHostBody' },
  notOpen: { title: 'code.ownerNotOpen', body: 'code.ownerNotOpenBody' },
  failed: { title: 'code.unknownOwner', body: 'code.unknownOwnerBody' },
};

export function readOnlyNote(item: Pick<ScriptItem, 'managed'>, comp: Pick<CompScripts, 'caps' | 'instances' | 'ownerRead'> & { agent?: Pick<CompScripts['agent'], 'writer' | 'writerWhy' | 'signIn'> }): ReadOnlyNote | null {
  if (item.managed) return { title: 'code.managed', body: 'code.managedBody' };
  const held = ownerHeld(comp);
  if (held) {
    // An unset ownerRead is a read with no account of itself: the did-not-answer words, as before.
    if (held === 'reading') return comp.ownerRead ? { title: 'code.ownerReading', body: 'code.ownerReadingBody' } : HELD_NOTE.failed;
    return HELD_NOTE[held];
  }
  if (!comp.caps?.revisions) return { title: 'code.oldKit', body: 'code.oldKitBody' };
  return null;
}

/** The note as one line of text. Every key is written out, so each sentence is counted where it is shown. */
export function readOnlyText(t: (k: ReadOnlyNote['title'] | ReadOnlyNote['body']) => string, n: ReadOnlyNote): string {
  switch (n.title) {
    case 'code.managed': return `${t('code.managed')}. ${t('code.managedBody')}`;
    case 'code.oldKit': return `${t('code.oldKit')}. ${t('code.oldKitBody')}`;
    case 'code.ownerReading': return `${t('code.ownerReading')}. ${t('code.ownerReadingBody')}`;
    case 'code.ownerSignedOut': return `${t('code.ownerSignedOut')}. ${t('code.ownerSignedOutBody')}`;
    case 'code.ownerRejected': return `${t('code.ownerRejected')}. ${t('code.ownerRejectedBody')}`;
    case 'code.ownerNoHost': return `${t('code.ownerNoHost')}. ${t('code.ownerNoHostBody')}`;
    case 'code.ownerNotOpen': return `${t('code.ownerNotOpen')}. ${t('code.ownerNotOpenBody')}`;
    case 'code.unknownOwner': return `${t('code.unknownOwner')}. ${t('code.unknownOwnerBody')}`;
  }
}
