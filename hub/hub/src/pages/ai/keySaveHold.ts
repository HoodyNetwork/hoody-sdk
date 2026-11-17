// The AI page's key saves (a built-in provider's key, or an own endpoint's) whose answer is unknown: core's key-save hold
// (core/providers/keySave.ts), the one the kit's KeySetup takes too, on the lock of a key or endpoint removal
// (credentialLock: one provider's stored credential on one computer). Core admits one of the two at a time, so such a
// removal is never sent while a key may still land, and no key is sent while such a removal may. The hold, its proof by
// fingerprint and its rules live in core; this page keeps its import path and adds one thing:
//   - The page's Api sends each call to the computer shown at that moment, so every call of a save (the PUT, its
//     read-back, a later Check again) goes only to the computer the caller was shown (shownGate.ts onlyOn): a switch while
//     the hold is being taken sends nothing and lets the hold go; a switch after the key left keeps the hold, unread, for
//     that computer.
import { providers } from '@core';
import type { Api } from './api';
import type { DisconnectAt } from './disconnectHold';
import type { KeyResult } from './flows-key';
import { onlyOn, shownComputer } from './shownGate';

export const { useHeldKeySave, stopKeySave } = providers;
export type HeldKeySave = providers.HeldKeySave;
export type KeySaveResult = providers.KeySaveResult;

/** Holds the save and runs `save` once (core's holdKeySave). `on`: the computer the caller was shown (shownComputer());
 *  every call goes there or nowhere. */
export function sendKeySave(api: Api, env: providers.Env, at: DisconnectAt | null, provider: string, on: string, save: (api: Api) => Promise<KeyResult>): Promise<KeySaveResult> {
  return providers.holdKeySave(onlyOn(api, on), env, at, provider, save, () => shownComputer() === on);
}

/** Check again (core's checkKeySave), read only from `on` (the computer the caller was shown): shown another one, nothing
 *  is read and the answer is 'not_confirmed'. `live` is the caller's guard on the read. */
export function checkKeySave(api: Api, env: providers.Env, provider: string, held: HeldKeySave, on: string, live?: () => boolean): Promise<'saved' | 'not_confirmed' | 'unproved'> {
  return providers.checkKeySave(onlyOn(api, on), env, provider, held, live);
}
