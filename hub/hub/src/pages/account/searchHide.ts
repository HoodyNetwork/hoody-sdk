// Jump to's places on Account that the view does not draw now (manifest searchHide; the shell loads this, never the
// page). A suspended account sees only its sessions, and no questions: every place but the Sign-in sessions section and
// its rows is left out, and so are the Change password and Set up two-step commands, whose sheets it never opens
// (logic.ts openableSheet). A token session has no passcode lock, so not its section or rows. Set up two-step opens
// only while two-step sign-in reads off, so its command is left out while it is on or its status is not read (the
// two-step section stays: Turn off is there). The
// same reads as view.tsx: the core's identity or the page's own, either saying suspended; the page's two-step status.
import { capture, useCore } from '@core';
import type { SearchHide } from '@kit';
import { useIdentity, useTwoFactor } from './data';
import { twoStepRead, type TwoStepRead } from './logic';

/** What Account leaves out for this account and session; null: it draws every place. */
export function accountHide(state: { suspended: boolean; token: boolean; twoStep: TwoStepRead }): SearchHide | null {
  if (state.suspended) return { only: ['?section=sessions'], commands: ['password', 'twofa'] };
  const commands = state.twoStep === 'off' ? undefined : ['twofa'];
  if (state.token) return { hide: ['?section=passcode'], ...(commands ? { commands } : {}) };
  return commands ? { hide: [], commands } : null;
}

export default function useAccountSearchHide(): SearchHide | null {
  const identity = useIdentity();
  const twofa = useTwoFactor();
  const core = useCore().identity;
  return accountHide({
    suspended: core?.banned === true || identity.data?.banned === true,
    token: capture().page?.kind === 'token',
    twoStep: twoStepRead(twofa),
  });
}
