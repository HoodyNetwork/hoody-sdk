// Claude Code: turn it on, pick it as the helper's backend, and the guided setup in an owned terminal.
// The setup enters fixed commands with Enter pressed, so they run at once; the sign-in step prints a link the person follows.
// Every state is read back; a lost answer is "not confirmed".
import { RUN_BAND } from '@core';
import { isStale, isUnknown, type Api, type TermApi, type TermOwned } from './api';
import { COMMANDS, obj, rows } from './logic';
import type { ClaudeCode, Outcome } from './types';

export type ToggleResult = { state: 'saved' | 'not_confirmed' | 'stale' } | { state: 'failed'; err: Outcome };

export async function setEnabled(api: Api, realm: string, enabled: boolean): Promise<ToggleResult> {
  const r = await api.acpEnabled(realm, enabled);
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok && !isUnknown(r)) return { state: 'failed', err: r.err };
  return confirmEnabled(api, realm, enabled);
}

/** Check again: one read, nothing sent. */
export async function confirmEnabled(api: Api, realm: string, enabled: boolean): Promise<ToggleResult> {
  const back = await api.acp(realm);
  if (isStale(back)) return { state: 'stale' };
  // GET /acp/agents → {report:{agents:[{name, enabled, …}]}}
  const report = back.ok && obj(back.body) ? back.body.report : null;
  const row = rows(report, 'agents').find((a) => obj(a) && a.name === 'claude');
  return obj(row) && row.enabled === enabled ? { state: 'saved' } : { state: 'not_confirmed' };
}

export async function setBackend(api: Api, realm: string, agent: '' | 'claude'): Promise<ToggleResult> {
  const r = await api.acpDefaultPut(realm, agent);
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok && !isUnknown(r)) return { state: 'failed', err: r.err };
  return confirmBackend(api, realm, agent);
}

/** Check again: one read, nothing sent. */
export async function confirmBackend(api: Api, realm: string, agent: '' | 'claude'): Promise<ToggleResult> {
  const back = await api.acpDefault(realm);
  if (isStale(back)) return { state: 'stale' };
  // GET /acp/default → {delegated_agent}: 'claude', or empty when Hoody's own agent is the default.
  if (!back.ok || !obj(back.body)) return { state: 'not_confirmed' };
  const v = back.body.delegated_agent;
  const now = v === 'claude' ? 'claude' : '';
  return now === agent ? { state: 'saved' } : { state: 'not_confirmed' };
}

export type SetupStep = 'install' | 'login';

/** Whether a fresh read of Claude Code (claudeOf) says the typed step is done: a sign-in once it reads signed in; an install
 *  or update once it reads installed and current, whatever its sign-in. Unknown, failed or not yet done reads are not. */
export function setupDone(step: SetupStep, cc: ClaudeCode): boolean {
  if (step === 'login') return cc.state === 'signed_in';
  return cc.state === 'signed_in' || cc.state === 'signed_out' || cc.state === 'sign_in_unknown';
}
export type SetupResult = { state: 'typed'; owned: TermOwned } | { state: 'unsupported' | 'failed' | 'stale' };

/** A setup terminal is made only in the app-launch band (ids up to 9999); the routes allow its follow-ups there, and in the
 *  old band (15001-19999) for a setup terminal made before (routes.ts `term`). */
const BAND_FIRST = RUN_BAND[0];
const BAND_SIZE = RUN_BAND[1] - RUN_BAND[0] + 1;

/** Opens (or reuses) an owned terminal and enters the step's command (Enter included). The command is
 *  written once per call: a write whose answer may have gone through counts as typed, is never written again, and the
 *  section's read-back watch proves the result. A terminal made and then refused is closed again.
 *  `left` says the person has left this attempt (the section closed, or shows another computer or realm). It is asked after
 *  every answer and before the command is written: from then on nothing is written, a terminal this call made is closed
 *  again (also when the write was already on its way), and the call ends quietly.
 *  Every call of one press goes to the computer shown when it began (api.termOn), also the closing of a terminal it made
 *  after the person moved to another computer. A stale answer once a terminal was made closes that terminal too. */
export async function typeSetup(api: TermApi & Pick<Api, 'termOn'>, step: SetupStep, user: string, owned: TermOwned | null, left: () => boolean = () => false): Promise<SetupResult> {
  const t: TermApi = api.termOn ? api.termOn() : api;
  let o = owned;
  let made = false;
  const quit = async (): Promise<SetupResult> => {
    if (made && o) await closeSetup(t, o);
    return { state: 'stale' };
  };
  if (!o) {
    const caps = await t.termCaps();
    if (isStale(caps)) return { state: 'stale' };
    if (left()) return quit();
    if (!caps.ok) return { state: 'unsupported' };
    const n = BAND_FIRST + Math.floor(Math.random() * BAND_SIZE);
    const c = await t.termCreate(n, user);
    if (isStale(c)) return { state: 'stale' };
    // The kit answers {status, terminal_id, incarnation, ...}; a display timeout is a 200 with status 'error'.
    if (!c.ok || !obj(c.body) || c.body.status === 'error' || typeof c.body.incarnation !== 'string' || c.body.incarnation === '') return { state: 'failed' };
    o = { n, inc: c.body.incarnation };
    made = true;
    if (left()) return quit();
    const w = await t.termWait(o);
    if (isStale(w) || left()) return quit();
    if (!w.ok) {
      await closeSetup(t, o);
      return { state: 'failed' };
    }
  }
  if (left()) return quit();
  const w = await t.termWrite(o, COMMANDS[step]);
  if (isStale(w) || left()) return quit();
  if (w.ok || isUnknown(w)) return { state: 'typed', owned: o };
  if (made) await closeSetup(t, o);
  return { state: 'failed' };
}

export async function closeSetup(api: Pick<Api, 'termDelete'>, owned: TermOwned): Promise<void> {
  await api.termDelete(owned);
}
