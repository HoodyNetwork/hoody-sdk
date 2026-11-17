// The error a live or demo boot ends with when core's bootLive does not reach `ready` (the TERM_BOOT_* family of
// docs/troubleshooting.md). Each state has its code written out whole: the diagnostic vocabulary lists only codes the
// source names as literals (scripts/term/diagnostic-codes.ts), so a code built from the state at run time would leave
// the mount as UNHANDLED and the failure line would name none. A new boot state fails the type check here until it
// has its code.
import type { BootResult } from '../../core/lifecycle';

export type BootFailedState = Exclude<BootResult['state'], 'ready'>;

export const BOOT_CODES: Readonly<Record<BootFailedState, string>> = {
  banned: 'TERM_BOOT_BANNED',
  offline: 'TERM_BOOT_OFFLINE',
  'purge-failed': 'TERM_BOOT_PURGE_FAILED',
  failed: 'TERM_BOOT_FAILED',
  leaving: 'TERM_BOOT_LEAVING',
};

/** The boot's failure: its code as the message (codeOf reads it), the state as `boot`. */
export function bootFailure(state: BootFailedState): Error & { boot: BootFailedState } {
  return Object.assign(new Error(BOOT_CODES[state]), { boot: state });
}
