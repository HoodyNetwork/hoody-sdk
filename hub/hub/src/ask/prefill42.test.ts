// Vitest: a page's prefill keeps its provenance. Untouched, it is the page's and goes on panel
// close, a later start and a later prefill, leaving the person's earlier draft byte for byte; once the person changes
// the draft it is theirs and never removed; a draft with no provenance is the person's. Taking an untouched prefill
// out releases the new conversation only it owed (the new-conversation mark and the engine's), never one owed before it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bump } from '../core/ctx';
import {
  claimDraft, draftFresh, draftGet, draftSet, dropUntouchedPrefill, dropUntouchedPrefills, markDraftFresh, notePrefill, oweFreshForDraft, prefillUntouched, purgeDrafts,
} from './drafts';

const K = 'a|p|c';
/** A prefill as the panel applies it: appended to the draft on a new line, marked, provenance noted. */
function prefill(k: string, text: string, release: (() => void) | null = null): string {
  dropUntouchedPrefill(k);
  const owedBefore = draftFresh(k);
  const cur = draftGet(k) ?? '';
  const next = cur.trim() ? cur.replace(/\s+$/, '') + '\n' + text : text;
  draftSet(k, next);
  markDraftFresh(k, true);
  notePrefill(k, cur, next, owedBefore, release);
  return next;
}

afterEach(() => { purgeDrafts(null); });

describe('an untouched prefill is the page\'s', () => {
  it('"Schedule " alone, then a close: the composer is empty and owes nothing', () => {
    const release = vi.fn();
    prefill(K, 'Schedule ', release);
    expect(prefillUntouched(K)).toBe(true);
    dropUntouchedPrefills();
    expect(draftGet(K)).toBe('');
    expect(draftFresh(K)).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('typed text before it stays byte for byte, trailing spaces and blank lines included', () => {
    const typed = '  check the logs  \n\n';
    draftSet(K, typed);
    expect(prefill(K, 'Schedule ')).toBe('  check the logs\nSchedule ');
    expect(dropUntouchedPrefill(K)).toBe(typed);
    expect(draftGet(K)).toBe(typed);
  });
  it('a later prefill replaces an untouched earlier one; the typed text under both stays', () => {
    draftSet(K, 'mine');
    prefill(K, 'Schedule ');
    expect(prefill(K, 'Explain ')).toBe('mine\nExplain ');
    expect(dropUntouchedPrefill(K)).toBe('mine');
  });
  it('dropping twice, or with no prefill, removes nothing', () => {
    draftSet(K, 'typed only');
    expect(dropUntouchedPrefill(K)).toBeNull();
    prefill(K, 'Schedule ');
    dropUntouchedPrefill(K);
    expect(dropUntouchedPrefill(K)).toBeNull();
    expect(draftGet(K)).toBe('typed only');
  });
  it('other slots: a close takes every untouched prefill out, each slot back to its own draft', () => {
    draftSet('a|p|d', 'other typed');
    prefill('a|p|d', 'Schedule ');
    prefill(K, 'Schedule ');
    dropUntouchedPrefills();
    expect(draftGet(K)).toBe('');
    expect(draftGet('a|p|d')).toBe('other typed');
  });
});

describe('an edited draft is the person\'s', () => {
  it('a keystroke at the end, a cut inside the prefill, or an edit of the typed part: kept by close, start and prefill', () => {
    for (const edit of [(v: string) => v + 'a backup', (v: string) => v.replace('Sched', 'Sch'), (v: string) => 'x' + v]) {
      draftSet(K, 'mine');
      const v = prefill(K, 'Schedule ');
      draftSet(K, edit(v));
      expect(prefillUntouched(K)).toBe(false);
      dropUntouchedPrefills();
      expect(dropUntouchedPrefill(K)).toBeNull();
      expect(draftGet(K)).toBe(edit(v));
      purgeDrafts(null);
    }
  });
  it('edited back to the same text is still the person\'s (any change makes it theirs)', () => {
    const v = prefill(K, 'Schedule ');
    draftSet(K, v + 'x');
    draftSet(K, v);
    expect(dropUntouchedPrefill(K)).toBeNull();
    expect(draftGet(K)).toBe(v);
  });
  it('an edited prefill, then a new prefill: only the new one goes; the edited one and its owed conversation stay', () => {
    const r1 = vi.fn(), r2 = vi.fn();
    const v = prefill(K, 'Schedule ', r1);
    draftSet(K, v + 'nightly');
    prefill(K, 'Explain ', r2);
    expect(dropUntouchedPrefill(K)).toBe('Schedule nightly');
    expect(draftFresh(K)).toBe(true);
    expect(r1).not.toHaveBeenCalled();
    expect(r2).not.toHaveBeenCalled();
  });
  it('a sent draft (emptied) takes the provenance with it', () => {
    prefill(K, 'Schedule ');
    draftSet(K, '');
    expect(dropUntouchedPrefill(K)).toBeNull();
  });
  it('a provenance that does not match the draft is never noted', () => {
    draftSet(K, 'mine');
    notePrefill(K, '', 'Schedule ', false, null);
    expect(prefillUntouched(K)).toBe(false);
    expect(dropUntouchedPrefill(K)).toBeNull();
    expect(draftGet(K)).toBe('mine');
  });
});

describe('provenance lives with the draft', () => {
  it('a computer or realm switch keeps it; the account going drops it with the draft', () => {
    prefill(K, 'Schedule ');
    bump('switch');
    bump('fallback');
    expect(prefillUntouched(K)).toBe(true);
    bump('account');
    expect(prefillUntouched(K)).toBe(false);
    expect(draftGet(K)).toBeUndefined();
  });
  it('another account\'s purge leaves this account\'s provenance; signing out drops it', () => {
    prefill(K, 'Schedule ');
    purgeDrafts('a');
    expect(prefillUntouched(K)).toBe(true);
    purgeDrafts(null);
    expect(prefillUntouched(K)).toBe(false);
  });
});

/** An engine as the drafts see it: one owed new conversation, taken back by releaseFresh. */
function fakeEngine(owed = false) {
  const e = { owed, wantFresh() { e.owed = true; }, owesFresh() { return e.owed; }, releaseFresh() { e.owed = false; } };
  return e;
}

describe('an edit that leaves the same text is still an edit', () => {
  it('claimDraft (the composer\'s input event) makes the draft the person\'s even when its text did not change', () => {
    draftSet(K, 'mine');
    const v = prefill(K, 'Schedule ');
    claimDraft(K);
    expect(prefillUntouched(K)).toBe(false);
    dropUntouchedPrefills();
    expect(draftGet(K)).toBe(v);
    expect(draftFresh(K)).toBe(true);
  });
  it('claimDraft on a slot with no prefill changes nothing', () => {
    draftSet(K, 'typed');
    claimDraft(K);
    expect(draftGet(K)).toBe('typed');
  });
});

describe('the owed new conversation follows the prefill to a replacement engine', () => {
  it('replayed onto a new engine of the slot, removing the untouched prefill releases that engine (and the old one)', () => {
    const a = fakeEngine();
    oweFreshForDraft(K, a);
    draftSet(K, 'typed before prefill');
    const owedBefore = draftFresh(K), engOwed = a.owesFresh();
    a.wantFresh();
    const cur = draftGet(K)!, next = cur + '\nSchedule ';
    draftSet(K, next);
    markDraftFresh(K, true);
    notePrefill(K, cur, next, owedBefore, engOwed ? null : () => a.releaseFresh());
    const b = fakeEngine();
    oweFreshForDraft(K, b);
    expect(b.owed).toBe(true);
    expect(dropUntouchedPrefill(K)).toBe('typed before prefill');
    expect(b.owed).toBe(false);
    expect(a.owed).toBe(false);
    expect(draftFresh(K)).toBe(false);
  });
  it('a replacement engine that already owed a new conversation of its own keeps it', () => {
    const a = fakeEngine();
    oweFreshForDraft(K, a);
    prefill(K, 'Schedule ', () => a.releaseFresh());
    a.wantFresh();
    const b = fakeEngine(true);
    oweFreshForDraft(K, b);
    dropUntouchedPrefill(K);
    expect(b.owed).toBe(true);
    expect(a.owed).toBe(false);
  });
  it('a debt owed before the prefill is never released, on either engine', () => {
    const a = fakeEngine();
    draftSet(K, 'Explain ');
    markDraftFresh(K, true);
    oweFreshForDraft(K, a);            // a's debt is the earlier (edited) prefill's
    const owedBefore = draftFresh(K);
    const next = 'Explain\nSchedule ';
    draftSet(K, next);
    markDraftFresh(K, true);
    notePrefill(K, 'Explain ', next, owedBefore, null);
    const b = fakeEngine();
    oweFreshForDraft(K, b);
    dropUntouchedPrefill(K);
    expect(a.owed).toBe(true);
    expect(b.owed).toBe(true);
    expect(draftFresh(K)).toBe(true);
  });
});
