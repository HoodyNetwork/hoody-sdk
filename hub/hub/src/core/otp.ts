// otp.ts: the 2FA step-up prompt as state (promptOtp, cancelPrompt).
//
// Contract, in plain words:
//   - Every change already goes through 2FA inside api(): when the Hoody API answers OTP_REQUIRED (the
//     first gate, or a wrong code on a retry), api() asks this prompt for a code and sends the change
//     again with otp_code, until the user cancels. It never assumes a code is needed. Pages do nothing
//     to get this; reads never ask.
//   - This module is the prompt api() asks by default. It holds no UI: the shell renders a dialog
//     from useOtpPrompt() while `open` is true (a code field, Cancel and Confirm; Escape and a click
//     on the scrim cancel) and calls submit(code) or cancel().
//   - One prompt at a time: a second ask while one is open (or checking) answers null at once (that
//     change is cancelled). A blank code is a cancel.
//   - After submit(code) the prompt stays open with `checking` true until the change sent with that code
//     settles: then it closes, or, when the API refused the code, asks again with `retry` true (a new id,
//     so the shell clears the field and says the code was not accepted). Cancel while checking only
//     closes the dialog: the change already went out and settles on its own.
//   - A realm switch, sign-out or account change closes an open prompt without an answer (realm.ts
//     wipe → cancelOtpPrompt): a code is never typed into a context that is gone.
//   - A cancelled prompt rejects the change with {cancelled: true}: nothing was applied while its
//     context lives (otpCancelled(err) tells a page to stay quiet and put focus back). A token session
//     cannot do 2FA: its OTP_REQUIRED is a refusal marked notAllowed, never a prompt.
//   - otpGate(answer) is the fixture side: a change route that answers OTP_REQUIRED until the body
//     carries FIXTURE_OTP_CODE, so pages can show the step-up in dev and in shots.
import { useSyncExternalStore } from 'react';
import type { HubError, OtpPrompt } from './api';
import type { FixtureAnswer, FixtureRequest, Responder } from './transport';
import { createListeners } from './listeners';

export interface OtpPromptState {
  /** A change is waiting for a 2FA code. */
  readonly open: boolean;
  /** Changes on every new prompt, so the shell can reset its field and focus. */
  readonly id: number;
  /** This ask follows a code the API refused (wrong or expired). */
  readonly retry: boolean;
  /** A code was submitted and the change sent with it has not settled yet (keep the dialog, lock the field). */
  readonly checking: boolean;
}

const CLOSED = { open: false, retry: false, checking: false } as const;
let state: OtpPromptState = Object.freeze({ ...CLOSED, id: 0 });
let resolveOpen: ((code: string | null) => void) | null = null;
const listeners = createListeners();

function publish(next: OtpPromptState): void {
  state = Object.freeze(next);
  listeners.emit();
}

function answer(code: string | null): void {
  const r = resolveOpen;
  if (!r) { if (code === null && state.checking) publish({ ...CLOSED, id: state.id }); return; }
  resolveOpen = null;
  publish(code === null ? { ...CLOSED, id: state.id } : { open: true, id: state.id, retry: state.retry, checking: true });
  r(code);
}

/** The prompt api() asks by default (setOtpPrompt replaces it, for tests). */
export const otpPrompt: OtpPrompt = Object.freeze({
  ask(o?: { retry: boolean }): Promise<string | null> {
    // While checking, only the change that sent the code asks again (with retry); anyone else waits their turn.
    if (resolveOpen || (state.checking && !(o && o.retry))) return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      resolveOpen = resolve;
      publish({ open: true, id: state.id + 1, retry: !!(o && o.retry), checking: false });
    });
  },
  settle(): void { if (state.checking && !resolveOpen) publish({ ...CLOSED, id: state.id }); },
  cancel(): void { answer(null); },
});

/** The code the user typed; blank is a cancel. Ignored when no prompt is open. */
export function submitOtp(code: string): void {
  const c = typeof code === 'string' ? code.trim() : '';
  answer(c || null);
}

export function cancelOtp(): void { answer(null); }

export function otpState(): OtpPromptState { return state; }

export function onOtpState(l: () => void): () => void {
  return listeners.add(l);
}

/** The shell's hook: render the 2FA dialog while `open`. */
export function useOtpPrompt(): OtpPromptState & { submit(code: string): void; cancel(): void } {
  const s = useSyncExternalStore(onOtpState, otpState, otpState);
  return { ...s, submit: submitOtp, cancel: cancelOtp };
}

/** The change was stopped at the 2FA prompt (Cancel, Escape, a second prompt, or the context ended). */
export function otpCancelled(err: unknown): boolean {
  const e = err as HubError | null;
  return !!(e && e.cancelled === true && e.kind !== 'pending' && e.pending !== true);
}

/** The code otpGate accepts. */
export const FIXTURE_OTP_CODE = '123456';

/** Fixture answer for a change behind 2FA: OTP_REQUIRED until the body carries FIXTURE_OTP_CODE. */
export function otpGate<R>(ok: Responder<R>): Responder<R> {
  return (req: FixtureRequest): FixtureAnswer<R> | Promise<FixtureAnswer<R>> => {
    const b = req.body as { otp_code?: unknown } | null;
    if (!b || b.otp_code !== FIXTURE_OTP_CODE) return { status: 403, body: { error: 'OTP_REQUIRED' } };
    return typeof ok === 'function' ? ok(req) : ok;
  };
}

/** Closes any open prompt and resets the state (session disposal, dispose.ts; tests). */
export function resetOtp(): void {
  resolveOpen = null;
  publish({ ...CLOSED, id: 0 });
}
