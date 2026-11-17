// Ask drafts: typed text kept in memory only (never stored), keyed account|project|computer. They go when the
// account goes (sign-out, another account, a suspension), whether or not the dock is open; a computer switch or a
// fallback to another computer keeps them.
//
// A page's prefill keeps its provenance: the text the page put in, and the person's draft before it, are
// held with the draft (in memory, as the draft is, so they survive a computer or realm switch as the draft does).
// While the draft is exactly what the prefill made, the prefilled part is the page's: dropUntouchedPrefill puts the
// person's earlier draft back, byte for byte (on panel close, a later start, a later prefill). Any other change to the
// draft (a keystroke, paste or cut anywhere, a send) makes the whole draft the person's: it is never removed then,
// also when the edit left the same text (a letter typed over itself: the composer's input event calls claimDraft). A
// draft with no provenance is the person's. The new conversation only the prefill owed follows it to a replacement
// engine of the slot (oweFreshForDraft), so taking the prefill out releases it there too.
import { onBump } from '@core';

const drafts = new Map<string, string>();
// Drafts a page's prefill wrote: they go to a NEW conversation, also from the next engine of the slot
// (a realm switch and back makes one, which picks up the stored conversation again). Gone once the draft is
// emptied (sent, or cleared by the person).
const fresh = new Set<string>();
interface Prefill {
  /** The person's draft before the prefill, exactly. */
  readonly typed: string;
  /** The draft the prefill made: while the draft is this, the prefilled part is untouched. */
  readonly whole: string;
  /** Whether the slot already owed a new conversation before this prefill (an earlier, edited prefill). */
  readonly owedBefore: boolean;
  /** Takes back the new conversation this prefill asked the engine for (null: the engine owed one already). */
  readonly release: (() => void) | null;
}
const prefills = new Map<string, Prefill>();

export function draftGet(k: string): string | undefined { return drafts.get(k); }
/** The draft of slot `k` as it is NOW with taken-back `text` after it (on a new line; alone when the draft is blank). Read at the moment
 *  the text arrives: an answer that comes after a wait keeps what was typed meanwhile. Computes only; the caller writes. */
export function draftWithTaken(k: string, text: string): string {
  const cur = drafts.get(k) ?? '';
  return cur.trim() ? `${cur}\n${text}` : text;
}
export function draftSet(k: string, v: string): void {
  drafts.set(k, v);
  if (!v.trim()) fresh.delete(k);
  if (prefills.get(k)?.whole !== v) prefills.delete(k);
}
/** A page's prefill made slot `k`'s draft `whole` over the person's `typed` one (see the header). Call after the
 *  draftSet that wrote `whole`. */
export function notePrefill(k: string, typed: string, whole: string, owedBefore: boolean, release: (() => void) | null): void {
  if (drafts.get(k) === whole) prefills.set(k, { typed, whole, owedBefore, release });
}
/** The person edited slot `k`'s draft (the composer's input event, whatever text it left): it is theirs now. */
export function claimDraft(k: string): void { prefills.delete(k); }
/** Whether slot `k`'s draft is still exactly what a prefill made. */
export function prefillUntouched(k: string): boolean { const p = prefills.get(k); return !!p && drafts.get(k) === p.whole; }
/** An untouched prefill of slot `k` is taken out: the draft is the person's earlier one again, byte for byte, and
 *  the new conversation only this prefill owed is released. Returns that draft, or null (nothing removed: no
 *  prefill, or the person changed the draft, which is then theirs). */
export function dropUntouchedPrefill(k: string): string | null {
  const p = prefills.get(k);
  if (!p) return null;
  prefills.delete(k);
  if (drafts.get(k) !== p.whole) return null;
  drafts.set(k, p.typed);
  if (!p.owedBefore || !p.typed.trim()) {
    fresh.delete(k);
    if (!p.owedBefore) p.release?.();
  }
  return p.typed;
}
/** Every slot's untouched prefill taken out (the panel closed). */
export function dropUntouchedPrefills(): void { for (const k of [...prefills.keys()]) dropUntouchedPrefill(k); }
export function draftFresh(k: string): boolean { return fresh.has(k); }
// Bumped each time a prefill marks a slot, so a start taken earlier never clears a later prefill's mark.
const markGen = new Map<string, number>();
export function markDraftFresh(k: string, on: boolean): void {
  if (on) { fresh.add(k); markGen.set(k, (markGen.get(k) ?? 0) + 1); } else fresh.delete(k);
}
const owedTo = new WeakMap<object, Set<string>>();
/** A new engine of slot `k`: a prefilled draft still owes it a new conversation. Once per engine and slot (the
 *  panel remounts on the same engine each time the dock opens; that engine already knows, and may since have made
 *  a newer conversation, e.g. Home's quick ask, which must not be reset). */
export function oweFreshForDraft(k: string, eng: { wantFresh(): void; owesFresh?(): boolean; releaseFresh?(): void }): void {
  let seen = owedTo.get(eng);
  if (!seen) { seen = new Set(); owedTo.set(eng, seen); }
  if (seen.has(k)) return;
  seen.add(k);
  if (!fresh.has(k) || !(drafts.get(k) ?? '').trim()) return;
  const owned = eng.owesFresh?.() ?? true;
  eng.wantFresh();
  // An untouched prefill that alone owed this: taking it out also releases this engine, unless the engine already
  // owed a new conversation of its own (kept). The earlier engine's release stays (harmless once it ended).
  const p = prefills.get(k);
  if (!p || p.owedBefore || drafts.get(k) !== p.whole || owned || !eng.releaseFresh) return;
  const before = p.release;
  prefills.set(k, { ...p, release: () => { before?.(); eng.releaseFresh?.(); } });
}
/** Keeps only `account`'s drafts; none when it is null (signing out). */
export function purgeDrafts(account: string | null): void {
  for (const k of [...drafts.keys()]) if (!account || !k.startsWith(account + '|')) drafts.delete(k);
  for (const k of [...fresh]) if (!account || !k.startsWith(account + '|')) fresh.delete(k);
  for (const k of [...prefills.keys()]) if (!account || !k.startsWith(account + '|')) prefills.delete(k);
}
/** How many drafts are held (tests). */
export function draftCount(): number { return drafts.size; }

onBump((reason) => { if (reason !== 'switch' && reason !== 'fallback') { drafts.clear(); fresh.clear(); prefills.clear(); } });

/** The outcome callback the panel gives a start taken on slot `k`. Once the start made its new conversation (sent, or
 *  maybe sent and shown), a prefilled draft kept for `k` belongs to it, as shown. Not sent: nothing new was made, so
 *  the draft still owes its own new conversation (also to the next engine, after a realm switch). */
export function startTellFor<O extends string>(k: string, told: (o: O) => void): (o: O) => void {
  // Only the draft as it was when the start was taken, and once: a prefill marked later (while the start was still
  // being watched, then an outcome or a realm switch) keeps owing its own new conversation.
  const gen = markGen.get(k) ?? 0;
  let done = false;
  return (o) => {
    if (o !== 'notSent' && !done && (markGen.get(k) ?? 0) === gen) markDraftFresh(k, false);
    if (o !== 'notSent') done = true;
    told(o);
  };
}
