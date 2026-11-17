// The outcome Files shows for a change (split out of changes.tsx so the terminal build shares it; changes.tsx re-exports
// shownOutcome).
import { toOutcome, type OutcomeLike } from '@kit';

/** The outcome to show; a send refused because changes are off, or because an earlier change on this computer is
 *  out or may have gone through (core's lock: BUSY, READ_BACK_FIRST, HELD_BY_OTHER; an earlier build's hold:
 *  HELD_OVERLAP), says so in the page's words. `t`: the page's strings. */
const ONE_AT_A_TIME = new Set(['HELD_OVERLAP', 'READ_BACK_FIRST', 'HELD_BY_OTHER', 'BUSY']);
export const shownOutcome = (kind: OutcomeLike['kind'], code: string | undefined, t: (k: 'changes.off' | 'changes.overlap') => string): OutcomeLike | undefined =>
  toOutcome(code ? { kind, code, ...(code === 'CHANGES_OFF' ? { message: t('changes.off') } : ONE_AT_A_TIME.has(code) ? { message: t('changes.overlap') } : {}) } : kind) ?? undefined;
