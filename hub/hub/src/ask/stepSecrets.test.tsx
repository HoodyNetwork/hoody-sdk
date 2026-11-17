// Vitest: a key in what the agent's steps say (a tool's summary, why it failed, a note between steps) or in a finished reply is hidden
// wherever the chat shows or reads it out: the page's transcript (source.ts), the dock's column and its live region, the dock's
// transcript announcement and the status line. Each is checked with a key a failure reason's own mask lets through; the two live
// regions also with a percent-encoded key (the Prose hides it), and a failure reason with a key a control character joins to the word
// before it once the control is taken out.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStrings, type ActiveSource, type ConvSnapshot } from '@kit';
import { bootFixtureCore, queryClient } from '@core';
import { can, type CapFacts } from '@kit/agent/capability';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusLine } from './AskPanel';
import { Column } from './Column';
import * as C from './conv';
import { DockSessionView } from './DockSession';
import type { AskEngine, Snapshot } from './engine';
import * as L from './logic';
import { blocksOf } from './source';
import strings from './strings.en.json';

const KEY = 'sk-live0123456789abcdef';
// Built here, never written whole: a key the failure reason's own mask (logic.ts maskSecrets) does not know.
const AIZA = 'AIza' + 'f'.repeat(35);
// Built here, never written whole: KEY percent-encoded, which a scrub of the written text does not find.
const ENC = 'sk%2D' + 'live0123456789abcdef';
const read = (t: string): string => t.replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}]/gu, '');
const hidden = (t: string) => {
  expect(read(t)).not.toContain(KEY);
  expect(read(t)).not.toContain(AIZA);
  expect(t).not.toContain(ENC);
};

const T0 = 1_700_000_000_000;
let SEQ = 0;
const env = (type: string, data: any) => ({ seq: ++SEQ, incarnation: 'i1', turn_id: 'T1', event: { type, data } });
const frame = (e: any, now?: number): L.Action => ({ type: 'frame', name: e.event.type.slice(6), data: e, now });
const user = (id: string, text: string): C.UserMsg => ({ id, text, at: 0, key: 'k' + id, via: 'create', state: 'sending', turnId: null, commandId: null, reason: '' } as unknown as C.UserMsg);
function running(): C.Conv {
  let c = C.addUser(C.emptyConv('s1'), user('1', 'Check the deploy'));
  c = C.addTurn(c, { turnId: 'T1', user: '1', now: T0 });
  return C.patchUser(c, '1', { state: 'sent', turnId: 'T1' });
}
const on = (c: C.Conv, type: string, data: any) => C.onTurn(c, frame(env(type, data), T0 + 100));
/** A turn that said a key, ran a step whose command holds it, failed with another, and answered with the first. */
function said(end: boolean): C.Conv {
  let c = running();
  c = on(c, 'event.stream_chunk', { text: `Using ${KEY} for the call.` });
  c = on(c, 'event.tool_call', { tool_id: 'a', name: 'bash', summary: `$ curl -H "x: ${KEY}" https://example.com` });
  if (!end) return c;
  c = on(c, 'event.tool_result', { tool_id: 'a', is_error: true, output: `Error: key ${AIZA} was refused` });
  c = on(c, 'event.stream_chunk', { text: `Your key ${KEY} did not work.` });
  return C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, T0 + 200);
}
/** A finished turn whose reply holds the key percent-encoded. */
function saidEncoded(): C.Conv {
  const c = on(running(), 'event.stream_chunk', { text: `Your key ${ENC} did not work.` });
  return C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, T0 + 200);
}
const snapOf = (conv: C.Conv, status: Snapshot['status']): Snapshot => ({ phase: 'ready', conv, status, dormant: false, gates: [], band: null, blocked: null, decision: { pending: false, unknown: false } }) as unknown as Snapshot;
const eng = { retryMsg: () => undefined, decide: () => undefined, answer: () => undefined, checkDecision: () => undefined } as unknown as AskEngine;

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
});

describe('the page transcript (source.ts)', () => {
  it('a running step, a failed step, its reason and a note show no key', () => {
    const live = { id: 's1', name: 'bash', summary: `$ curl -H "x: ${KEY}" https://example.com`, ok: null, n: 1, seg: 0 } as L.Step;
    const failed = { id: 's0', name: 'bash', summary: `$ echo ${KEY}`, ok: false, n: 0, seg: 0, why: `Error: key ${AIZA} was refused` } as L.Step;
    const out = blocksOf([{ k: 'trail', key: 'tr1', rows: [{ k: 'note', text: `Using ${KEY} now` }, { k: 'step', step: failed }], total: 2, shown: 2, live, failed: true, unknown: false, done: false, ms: null }]);
    const steps = out.find((b) => b.k === 'steps') as Extract<(typeof out)[number], { k: 'steps' }>;
    hidden(JSON.stringify(out));
    expect(steps.label).toContain('curl');
    expect(steps.label).toContain('[hidden]');
    expect(steps.rows[0]?.summary).toBe('Using [hidden] now');
    expect(steps.rows[1]?.summary).toContain('echo [hidden]');
    expect(steps.rows[1]?.note).toContain('was refused');
    expect(steps.rows[1]?.note).toContain('[hidden]');
  });
});

describe('the dock column', () => {
  it('a running trail shows no key, closed (the step kind only) and opened (its command)', () => {
    const { container } = render(<Column eng={eng} snap={snapOf(said(false), 'working')} agentUrl="" typing={false} empty={null} />);
    hidden(container.textContent ?? '');
    const trail = [...container.querySelectorAll<HTMLElement>('[aria-expanded="false"]')].find((e) => /\b1 step(?!s)/.test(e.textContent ?? ''));
    expect(trail).toBeTruthy();
    fireEvent.click(trail as HTMLElement);
    expect(container.textContent).toContain('curl');
    hidden(container.textContent ?? '');
  });

  it('an opened trail (step, reason, note), the reply and its live region show no key', () => {
    const { container } = render(<Column eng={eng} snap={snapOf(said(true), null)} agentUrl="" typing={false} empty={null} />);
    const trail = [...container.querySelectorAll<HTMLElement>('[aria-expanded="false"]')].find((e) => /\b1 step(?!s)/.test(e.textContent ?? ''));
    expect(trail).toBeTruthy();
    fireEvent.click(trail as HTMLElement);
    const text = container.textContent ?? '';
    // What is shown is there (the trail opened), with the keys hidden.
    expect(text).toContain('curl');
    expect(text).toContain('was refused');
    expect(text).toContain('for the call.');
    hidden(text);
    const polite = [...container.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent ?? '');
    expect(polite.some((x) => x.includes('did not work'))).toBe(true);
    for (const x of polite) hidden(x);
  });

  it('a reply holding a percent-encoded key: the reply and its live region show it hidden', () => {
    const { container } = render(<Column eng={eng} snap={snapOf(saidEncoded(), null)} agentUrl="" typing={false} empty={null} />);
    expect(container.textContent).toContain('did not work.');
    hidden(container.textContent ?? '');
    const polite = [...container.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent ?? '');
    expect(polite.some((x) => x.includes('Your key [hidden] did not work.'))).toBe(true);
    for (const x of polite) hidden(x);
  });
});

describe('the dock transcript', () => {
  const facts: CapFacts = {
    mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
    turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
    prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
  };
  const cases = [['written', () => said(true), 'did not work'], ['percent-encoded', saidEncoded, 'Your key [hidden] did not work.']] as const;
  for (const [why, conv, words] of cases) {
    it(`announces the finished reply with its key hidden (a key ${why})`, async () => {
      bootFixtureCore({});
      const view: ConvSnapshot = { facts, title: 'Chat', gates: [], blocks: [] };
      const source = {
        kind: 'active', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => view, subscribe: () => () => undefined, watch: () => undefined,
        can: (a: any) => can(a, facts), send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(),
        canDismiss: () => false, resend: vi.fn(), retry: vi.fn(), takeBack: vi.fn(),
      } as unknown as ActiveSource;
      const engSnap = snapOf(conv(), null);
      const dockEng = { subscribe: () => () => undefined, getSnapshot: () => engSnap, stop: vi.fn() } as unknown as AskEngine;
      const { container } = render(<DockSessionView source={source} eng={dockEng} conv={{ computer: 'atlas.1234', realm: 'global', sid: 's1' }} host={{ computer: 'atlas', realm: 'global' }} agentUrl="" typing={false} empty={<p>Nothing yet</p>} onTakeBack={() => undefined} fallback={null} />);
      await act(async () => { await Promise.resolve(); });
      const polite = [...container.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent ?? '');
      expect(polite.some((x) => x.includes(words))).toBe(true);
      for (const x of polite) hidden(x);
    });
  }
});

describe('why a step failed', () => {
  // Built here, never written whole.
  const GLPAT = 'glpat-' + 'abcdefghijklmnopqrst';
  it('a key a control character parts from the word before it is hidden, not joined to that word and missed', () => {
    const why = L.resultOf({ is_error: true, output: `note\u0007${GLPAT}` }).why ?? '';
    expect(why).toContain('note');
    expect(why).toContain('[hidden]');
    expect(why).not.toContain(GLPAT);
    expect(why).not.toContain('abcdefghijklmnopqrst');
  });
  it('a key whose tail is a token of another family (-ak-) is hidden whole, its start with it', () => {
    const why = L.resultOf({ is_error: true, output: 'bad key sk-12345678-ak-' + 'Ab12Cd34Ef56Gh78Ij90' }).why ?? '';
    expect(why).toBe('bad key [hidden]');
  });
  it('a password= a control glued to the word before it is masked, not shown', () => {
    const why = L.resultOf({ is_error: true, output: 'note\u0000password=' + 'hunter22' }).why ?? '';
    expect(why).toContain('password=');
    expect(why).not.toContain('hunter22');
  });
  it('a quoted password= glued to the word before it is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: 'note\u0000password="alpha ' + 'beta"' }).why ?? '';
    expect(why).toContain('password=');
    expect(why).not.toContain('alpha');
    expect(why).not.toContain('beta');
  });
  it('an Authorization value of any scheme is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: 'Authorization: ApiKey ' + 'cedar-river-42' }).why ?? '';
    expect(why).not.toContain('cedar');
    expect(why).not.toContain('river-42');
    expect(why).not.toContain('ApiKey');
  });
  it('a Proxy-Authorization value of any scheme is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: 'Proxy-Authorization: Digest ' + 'cedar-river-42' }).why ?? '';
    expect(why).not.toContain('cedar-river-42');
  });
  it('an unquoted password with & in it is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: 'password=rain' + '&storm42' }).why ?? '';
    expect(why).not.toContain('rain');
    expect(why).not.toContain('storm42');
  });
  it('an unquoted password with , in it is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: 'password=rain' + ',storm42' }).why ?? '';
    expect(why).not.toContain('rain');
    expect(why).not.toContain('storm42');
  });
  it('an unquoted password with ; in it is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: 'password=rain' + ';storm42' }).why ?? '';
    expect(why).not.toContain('rain');
    expect(why).not.toContain('storm42');
  });
  it('a flag value of adjacent quoted fragments is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: 'run --password \'alpha\'' + '"beta"' }).why ?? '';
    expect(why).not.toContain('alpha');
    expect(why).not.toContain('beta');
  });
  it('a Cookie header glued to the word before it is masked', () => {
    const why = L.resultOf({ is_error: true, output: 'note\u0000Cookie: remember_me=' + 'cedar42' }).why ?? '';
    expect(why).not.toContain('cedar42');
  });
  it('a long flag glued to the word before it is masked', () => {
    const why = L.resultOf({ is_error: true, output: 'note\u0000--password "alpha ' + 'beta"' }).why ?? '';
    expect(why).not.toContain('alpha');
    expect(why).not.toContain('beta');
  });
  it('a password in escaped JSON is masked whole', () => {
    const why = L.resultOf({ is_error: true, output: '{\\"password\\":\\"cedar river ' + '42\\"}' }).why ?? '';
    expect(why).not.toContain('cedar');
    expect(why).not.toContain('river');
    expect(why).not.toContain('42');
  });
});

describe('the status line', () => {
  function Line({ snap }: { snap: Snapshot }) {
    const t = useStrings(strings);
    return <StatusLine snap={snap} t={t} />;
  }
  it('names the running step with its key hidden', () => {
    const { container } = render(<Line snap={snapOf(said(false), 'working')} />);
    expect(container.textContent).toContain('curl');
    expect(container.textContent).toContain('[hidden]');
    hidden(container.textContent ?? '');
  });
});
