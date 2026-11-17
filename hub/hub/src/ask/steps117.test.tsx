// A failed step says why (the first visible line the tool answered, credentials masked), a step
// held hooks blocked says so, a step whose result never came back says it may have run (never "failed"), and a
// conversation that got too long for the model says so and offers a new conversation instead of a Retry that runs
// out of room again, live and when reopened. Daemon facts: tool_result is_error/output/error_code (a held
// hook's "hook_held" + its deny text, the delegated "outcome_unknown", the ended
// and the unanswered tool result texts: history blocks may carry the text without
// the code), turn error code context_overflow, close marker "[response failed: <code>]" (the turn close:
// the marker alone, or after the partial reply and a blank line).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Column } from './Column';
import * as C from './conv';
import { tailFailed, type AskEngine, type Snapshot } from './engine';
import * as L from './logic';
import strings from './strings.en.json';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

let SEQ = 0;
const env = (type: string, data: any) => ({ seq: ++SEQ, incarnation: 'i1', turn_id: 'T1', event: { type, data } });
const frame = (e: any, now?: number): L.Action => ({ type: 'frame', name: e.event.type.slice(6), data: e, now });
function started(): C.Conv {
  let c = C.addUser(C.emptyConv('s1'), { id: '1', text: 'Fix the build', at: 0, key: 'k1', via: 'create', state: 'sending', turnId: null, commandId: null, reason: '' });
  c = C.addTurn(c, { turnId: 'T1', user: '1', now: 1000 });
  return C.patchUser(c, '1', { state: 'sent', turnId: 'T1' });
}
const ended = (c: C.Conv, state: string, code = '') => C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state, ...(code ? { error_code: code } : {}) } }, 5000);
function withStep(result: Record<string, unknown>): C.Conv {
  let c = started();
  c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'bash', summary: '$ make' }), 2000));
  return C.onTurn(c, frame(env('event.tool_result', { tool_id: 'a', ...result }), 3000));
}
const fakeEng = () => ({ send: vi.fn(), newConversation: vi.fn(), newWaits: () => false, decide: vi.fn(), answer: vi.fn(), checkDecision: vi.fn() }) as unknown as AskEngine & { send: any; newConversation: any };
function draw(conv: C.Conv, eng = fakeEng()) {
  const snap = { phase: 'ready', conv, status: null, dormant: false, gates: [] } as unknown as Snapshot;
  const r = render(<Column eng={eng} snap={snap} agentUrl="" typing empty={null} />);
  // The step trail's button: collapsed, and its name ends with an outcome word (its mark).
  const words = ['ask.mark.running', 'ask.mark.ok', 'ask.mark.failed', 'ask.mark.unknown'].map((k) => strings[k as keyof typeof strings]);
  const show = screen.queryAllByRole('button', { expanded: false }).find((b) => words.some((w) => (b.textContent ?? '').endsWith(w)));
  if (show) fireEvent.click(show);
  return { eng, ...r };
}
const trailOf = (c: C.Conv) => C.blocks(c, 9000).find((b) => b.k === 'trail') as any;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const why = (output: string) => L.resultOf({ is_error: true, output }).why;
// The daemon's own texts (copied from the files named above).
const ENDED = '[no result: the turn ended before this tool finished; it may have run — check before repeating]';
const RESTARTED = '[no result: the agent restarted before this tool finished; it may have run — check before repeating]';
const DELEGATED = 'The turn ended before this call reported its result. It may have run and changed something: check before running it again.';
const HELD = [
  "Blocked: a hook in this computer's settings is waiting for the person to trust it. Don't retry this tool or try another route to the same effect; tell the person to review and trust the hook (Hub Agent panel card, the Hooks tab, or /hooks).",
  "Blocked: the trust record cannot be read, so the hooks that cover this tool stay blocked. Sign in again. Don't retry this tool or try another route to the same effect; tell the person.",
  "Blocked: the hooks that cover this tool are held (isolation unavailable) and cannot run until that is fixed. Don't retry this tool or try another route to the same effect; tell the person.",
];

describe('a tool result\'s failure facts', () => {
  it('a key whose tail is a token of another family (-ak-) is hidden whole in the reason, its start with it', () => {
    expect(why(fake('bad key sk-12345678-ak-', 'Ab12Cd34Ef56Gh78Ij90'))).toBe('bad key [hidden]');
  });
  it('ok unless is_error is true', () => {
    expect(L.resultOf({})).toEqual({ ok: true });
    expect(L.resultOf({ is_error: false, error_code: 'hook_held', output: 'x' })).toEqual({ ok: true });
    expect(L.resultOf({ is_error: 'true' })).toEqual({ ok: true });
  });
  it('the reason is the first visible line: controls removed first, trimmed and bounded', () => {
    expect(why('\n   \n  make: *** No rule to make target  \nsecond line')).toBe('make: *** No rule to make target');
    expect(why('\u001b[31m\u001b[0m\nPermission denied')).toBe('Permission denied');
    expect(why('\u001b]8;;' + 'x'.repeat(1000) + '\u0007\nlater')).toBe('later');
    // An escape longer than the whole visible budget still never hides the reason after it.
    expect(why('\u001b]8;;' + 'x'.repeat(4100) + '\u0007\nPermission denied')).toBe('Permission denied');
    // An OSC that never ends takes nothing after its own line.
    expect(why('\u001b] title\nPermission denied')).toBe('Permission denied');
    expect(why('word '.repeat(200))).toHaveLength(300);
    expect(L.resultOf({ is_error: true })).toEqual({ ok: false });
    expect(L.resultOf({ is_error: true, output: { text: 'no' } })).toEqual({ ok: false });
    expect(L.resultOf({ is_error: true, output: '  \n ' })).toEqual({ ok: false });
  });
  it('credentials in the reason are masked', () => {
    const cases: Array<[string, string]> = [
      ['curl: Authorization: Bearer abcdef1234567890 refused', 'abcdef1234567890'],
      ['login failed password=hunter22 for ada', 'hunter22'],
      ['token: "s3cr3tvalue" rejected', 's3cr3tvalue'],
      [fake('fetch https://ada:', 'pa55word@example.org/x failed'), 'pa55word'],
      ['bad key hdy_0123456789abcdef01234567_0123456789abcdef0123456789abcdef0123456789abcdef', 'hdy_0123'],
      [fake('OPENAI sk-', 'proj-abcdefghijklmnopqrstuv invalid'), 'sk-proj-abcdefghij'],
      ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U expired', 'eyJhbGci'],
      ['config: password = "correct horse battery staple" rejected', 'battery staple'],
      ["mysql --password 'two words' -u ada denied", 'two words'],
      ['tool --token=abc123secret failed', 'abc123secret'],
      ['curl: Cookie: session=abcdef123456; theme=dark refused', 'abcdef123456'],
      ['redirect set sessionid=zzzz9999yyyy loop', 'zzzz9999yyyy'],
      ['request Cookie: prefs=1; remember_me=qwerty123456 rejected', 'qwerty123456'],
      ['config {"password": "correct horse battery staple"} rejected', 'battery staple'],
      ['config password="open quote never closed and more words', 'more words'],
      ['--password hunter2secret rejected', 'hunter2secret'],
      ['mysql --password "' + 'w '.repeat(250) + 'tailword" denied', 'tailword'],
      // Short enough that the cut to the reason's length cannot be what hides it.
      ['mysql --password "' + 'w '.repeat(100) + 'tailword" denied', 'tailword'],
      [fake('provider said api_key=AKIA', 'ABCDEFGHIJKLMNOP invalid'), fake('AKIA', 'ABCDEFGHIJKLMNOP')],
      ['config token=review-demo-token rejected', 'review-demo-token'],
      ['config secret=review-demo-secret rejected', 'review-demo-secret'],
      ['config pwd=review-demo-password rejected', 'review-demo-password'],
      ['curl --auth review-demo-password failed', 'review-demo-password'],
      ['proxy refused X-Hoody-Bot-Uid: 1234 header', 'X-Hoody-Bot-Uid'],
      ['proxy refused X-Hoody-Bot-Uid: 1234 header', '1234'],
      ['digest 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 mismatch', '9f86d081884c7d65'],
    ];
    // A key the shared scrub knows (an access key, an sk- key, a JWT) is hidden before the reason's own masks run, so its
    // reason reads [hidden], pinned whole; every other credential reads •••. Keyed by the case's secret; the whole key,
    // not only its start, is absent.
    const scrubbed: Record<string, string> = { hdy_0123: 'bad key [hidden]', 'sk-proj-abcdefghij': 'OPENAI [hidden] invalid', eyJhbGci: 'jwt [hidden] expired' };
    for (const [line, secret] of cases) {
      const w = why(line) as string;
      expect(w, line).not.toContain(secret);
      const shown = scrubbed[secret];
      if (shown === undefined) {
        expect(w, line).toContain('•••');
        continue;
      }
      expect(w, line).toBe(shown);
      expect(w, line).not.toContain(line.split(' ').find((word) => word.startsWith(secret)));
    }
    expect(Object.keys(scrubbed).filter((secret) => !cases.some(([, s]) => s === secret))).toEqual([]);
    expect(why('container 64f0ada000000000000000a1 not running')).toBe('container 64f0… not running');
    expect(why('cc: error: foo.c: No such file or directory')).toBe('cc: error: foo.c: No such file or directory');
    expect(why('/home/ada/projects/dashboard/src/components/index.tsx: not found')).toBe('/home/ada/projects/dashboard/src/components/index.tsx: not found');
  });
  it('controls go first, then the masker, then the cuts: a credential is never shown in part', () => {
    const w = why('fetch https://ada:' + 'p'.repeat(4100) + '@example.test/ failed') as string;
    expect(w).not.toContain('ada:p');
    expect(w).toContain('•••');
    // A control inside the credential: removed from the whole window before the masker runs.
    for (const c of ['\u0000', '\u200b']) {
      const v = why('fetch https:' + c + '//ada:' + 'p'.repeat(4100) + '@example.test/ failed') as string;
      expect(v, JSON.stringify(c)).not.toContain('ada:p');
      expect(v).toContain('•••');
    }
    // Controls (or blank lines) ahead of a credential no longer push it past a cut taken before the masker: the old
    // 4000-character cut left 'https://ada:se' with no '@' to recognise it.
    for (const pad of ['\u0000'.repeat(3976), '\u200b'.repeat(3976), '  \n'.repeat(1325)]) {
      const v = why(pad + fake('fetch https://ada:', 'secretpass9@example.test/ failed')) as string;
      expect(v, JSON.stringify(pad.slice(0, 3))).toBe('fetch https://•••@example.test/ failed');
    }
    // Past the 64 KiB window: a first line the window cuts is not shown at all (its end was not read).
    expect(why('fetch https://ada:' + 'p'.repeat(70000) + '@example.test/ failed')).toBeUndefined();
    // A whole first line inside the window still shows, whatever follows it.
    expect(why('cc: error: foo.c: No such file\n' + 'x'.repeat(70000))).toBe('cc: error: foo.c: No such file');
  });
  it('hostile text does not stall the masker: only the shown line is masked, and it is bounded', () => {
    let t0 = performance.now();
    expect(why('Permission denied\n' + 'eyJ-'.repeat(16379))).toBe('Permission denied');
    expect(performance.now() - t0).toBeLessThan(1000);
    t0 = performance.now();
    // A first line longer than 8192 characters is not shown at all (never masked or shown in part).
    expect(why('eyJ-'.repeat(16384))).toBeUndefined();
    expect(why('fetch https://ada:' + 'p.'.repeat(4100) + '@example.test/ failed')).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(1000);
    // At the bound it is still masked and shown.
    expect(why('eyJ-'.repeat(2048))).toBe('•••'.slice(0, 300));
  });
  const maskSecretsTime = (s: string) => { const t0 = performance.now(); L.maskSecrets(s); return performance.now() - t0; };
  it('the linear JWT mask gives what the old JWT pattern gave (fuzz), and stays linear on eyJ- runs', () => {
    const OLD = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
    let seed = 117, hits = 0;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; };
    const run = (n: number) => { let r = ''; for (; n > 0; n--) r += 'aZ9_-e'[rnd(6)]; return r; };
    const seg = () => [() => '', () => 'eyJ' + run(rnd(13)), () => run(rnd(5)) + '-_a'[rnd(3)] + 'eyJ' + run(rnd(13)), () => run(rnd(13))][rnd(4)]?.() ?? '';
    for (let k = 0; k < 50000; k++) {
      let s = seg();
      for (let j = rnd(6); j > 0; j--) s += '.... /'[rnd(6)] + seg();
      const want = s.replace(OLD, '•••');
      if (want !== s) hits++;
      expect(s.replace(/[A-Za-z0-9_.-]+/g, L.maskJwt), JSON.stringify(s)).toBe(want);
    }
    expect(hits).toBeGreaterThan(800);
    // The length bounds, exactly: 8 after eyJ, 8, then 4.
    const a8 = 'a'.repeat(8), b8 = 'b'.repeat(8);
    for (const s of [`eyJ${a8}.${b8}.cccc`, `eyJ${a8}.${b8}.ccc`, `eyJ${'a'.repeat(7)}.${b8}.cccc`, `eyJ${a8}.${'b'.repeat(7)}.cccc`, `x-eyJ${a8}.${b8}.cccc.eyJ${a8}.${b8}.dddd`]) {
      expect(s.replace(/[A-Za-z0-9_.-]+/g, L.maskJwt), s).toBe(s.replace(OLD, '•••'));
    }
    expect(`eyJ${a8}.${b8}.cccc`.replace(/[A-Za-z0-9_.-]+/g, L.maskJwt)).toBe('•••');
    expect(`eyJ${a8}.${b8}.ccc`.replace(/[A-Za-z0-9_.-]+/g, L.maskJwt)).toBe(`eyJ${a8}.${b8}.ccc`);
    const s = 'eyJ-'.repeat(16384), t0 = performance.now();
    expect(s.replace(/[A-Za-z0-9_.-]+/g, L.maskJwt)).toBe(s);
    expect(maskSecretsTime('Permission denied ' + s)).toBeLessThan(1000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('held or of unknown outcome, by code: no reason line', () => {
    expect(L.resultOf({ is_error: true, error_code: 'hook_held', output: 'Error: held' })).toEqual({ ok: false, held: true });
    expect(L.resultOf({ is_error: true, error_code: 'outcome_unknown', output: 'Error: unknown' })).toEqual({ ok: false, unknown: true });
  });
  it('held or of unknown outcome, by the daemon\'s exact text when the code is missing (history blocks)', () => {
    for (const t of [ENDED, RESTARTED, DELEGATED]) expect(L.resultOf({ is_error: true, output: t }), t).toEqual({ ok: false, unknown: true });
    for (const t of HELD) expect(L.resultOf({ is_error: true, output: t }), t).toEqual({ ok: false, held: true });
    // Look-alikes are ordinary failures.
    expect(L.resultOf({ is_error: true, output: 'Blocked: the firewall said no' })).toMatchObject({ ok: false, why: 'Blocked: the firewall said no' });
    expect(L.resultOf({ is_error: true, output: '[no result yet]' }).unknown).toBeUndefined();
    // A code wins over the text.
    expect(L.resultOf({ is_error: true, error_code: 'not_run', output: ENDED })).toMatchObject({ ok: false, why: ENDED.slice(0, 300) });
  });
});

describe('a failed step in the column', () => {
  it('live: says why it failed', () => {
    const c = withStep({ is_error: true, output: 'cc: error: foo.c: No such file\nmore' });
    expect(trailOf(c).rows[0].step).toMatchObject({ ok: false, why: 'cc: error: foo.c: No such file' });
    draw(c);
    expect(screen.getByText(fill(strings['ask.stepFailedWhy'], { why: 'cc: error: foo.c: No such file' }))).toBeTruthy();
  });
  it('the reason is drawn cleaned and cut to 160', () => {
    const words = 'word '.repeat(100).trim();
    draw(withStep({ is_error: true, output: '\u001b[31mred\u001b[0m ' + words }));
    const shown = ('red ' + words).slice(0, 160);
    expect(screen.getByText(fill(strings['ask.stepFailedWhy'], { why: shown }))).toBeTruthy();
  });
  it('without a reason: the plain line', () => {
    draw(withStep({ is_error: true }));
    expect(screen.getByText(strings['ask.stepFailed'])).toBeTruthy();
  });
  it('held: says hooks blocked it, never what the daemon told the model', () => {
    const c = withStep({ is_error: true, error_code: 'hook_held', output: HELD[0] });
    expect(trailOf(c).failed).toBe(true);
    draw(c);
    expect(screen.getByText(strings['ask.stepHeld'])).toBeTruthy();
    expect(screen.queryByText(/Don't retry/)).toBeNull();
  });
  it('unknown outcome: may have run, an info mark, never "failed"; the ended trail is not marked failed and shows the info mark', () => {
    const c = ended(withStep({ is_error: true, error_code: 'outcome_unknown', output: 'Error: no result' }), 'completed');
    expect(trailOf(c)).toMatchObject({ failed: false, unknown: true, done: true });
    const { container } = draw(c);
    expect(screen.getByText(strings['ask.stepUnknown'])).toBeTruthy();
    expect(container.textContent).not.toMatch(/failed/i);
    // One info mark on the trail row, one on the step; no failure mark anywhere.
    expect(container.querySelectorAll('svg[class*="infoMark"]')).toHaveLength(2);
    expect(container.querySelector('svg[class*="bad"]')).toBeNull();
  });
  it('from the transcript: the same facts, with or without the code', () => {
    const h = C.historyFrom({
      turn_boundaries: [3],
      messages: [
        { role: 'user', blocks: [{ kind: 'text', text: 'Go' }] },
        { role: 'assistant', blocks: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ kind: 'tool_use', tool_id: id, tool_name: 'bash', input: { command: 'make' } })) },
        { role: 'user', blocks: [
          { kind: 'tool_result', tool_id: 'a', is_error: true, output: 'boom\nmore' },
          { kind: 'tool_result', tool_id: 'b', is_error: true, error_code: 'hook_held', output: 'held' },
          { kind: 'tool_result', tool_id: 'c', is_error: true, error_code: 'outcome_unknown', output: 'unknown' },
          { kind: 'tool_result', tool_id: 'd', is_error: true, output: ENDED },
          { kind: 'tool_result', tool_id: 'e', is_error: true, output: HELD[0] },
        ] },
        { role: 'assistant', blocks: [{ kind: 'text', text: 'Done.' }] },
      ],
    }, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
    const steps = h.turns[0]!.s.steps;
    expect(steps[0]).toMatchObject({ ok: false, why: 'boom' });
    expect(steps[1]).toMatchObject({ ok: false, held: true });
    expect(steps[2]).toMatchObject({ ok: false, unknown: true });
    expect(steps[3]).toMatchObject({ ok: false, unknown: true });
    expect(steps[4]).toMatchObject({ ok: false, held: true });
    expect(steps[3]!.why).toBeUndefined();
  });
});

describe('a conversation too long for the model', () => {
  it('has its own words', () => {
    expect(L.failureKey('context_overflow')).toBe('ask.tooLong');
  });
  it('ended: offers a new conversation, no Retry', () => {
    const { eng } = draw(ended(started(), 'failed', 'context_overflow'));
    expect(screen.getByText(strings['ask.tooLong'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['ask.retry'] })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: strings['ask.new'] }));
    expect(eng.newConversation).toHaveBeenCalledTimes(1);
    expect(eng.send).not.toHaveBeenCalled();
  });
  it('still running (an error frame, no outcome yet): words only, no new conversation', () => {
    draw(C.onTurn(started(), frame(env('event.error', { code: 'context_overflow' }))));
    expect(screen.getByText(strings['ask.tooLong'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['ask.new'] })).toBeNull();
  });
  it('live: the close marker is hidden on the failed turn, from the reply and from what a screen reader hears', () => {
    let c = C.onTurn(started(), frame(env('event.stream_chunk', { text: 'Partial answer.' })));
    c = C.onTurn(c, frame(env('event.error', { code: 'context_overflow' })));
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: '\n\n[response failed: context_overflow]' })));
    c = ended(c, 'failed', 'context_overflow');
    const { container } = draw(c);
    expect(container.textContent).not.toContain('[response failed');
    expect(container.querySelector('[class*="reply"]')?.textContent).toContain('Partial answer.');
    expect((container.querySelector('[aria-live="polite"]') as HTMLElement).textContent).toBe('Partial answer.');
  });
  it('reopened from the transcript: the failed outcome comes back (words and New conversation, no Retry), marker hidden', () => {
    const h = C.historyFrom({
      turn_boundaries: [1],
      messages: [
        { role: 'user', blocks: [{ kind: 'text', text: 'Unzip the site' }] },
        { role: 'assistant', blocks: [{ kind: 'text', text: 'Looking.' }, { kind: 'text', text: '\n\n[response failed: context_overflow]' }] },
      ],
    }, { liveTail: false, idOf: (i) => 'h' + i, at: 0, lastFailed: true });
    const c: C.Conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
    const bs = C.blocks(c, 0);
    expect(bs.find((b) => b.k === 'outcome')).toMatchObject({ state: 'failed', code: 'context_overflow', retry: null });
    expect(bs.find((b) => b.k === 'reply')).toMatchObject({ text: 'Looking.' });
    const { container } = draw(c);
    expect(screen.getByText(strings['ask.tooLong'])).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['ask.new'] })).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['ask.retry'] })).toBeNull();
    expect(container.textContent).not.toContain('[response failed');
  });
  it('reopened: a reply that only ends in marker text keeps its text unless the record says the last turn failed', () => {
    const body = {
      turn_boundaries: [1, 3],
      messages: [
        { role: 'user', blocks: [{ kind: 'text', text: 'Print the marker' }] },
        { role: 'assistant', blocks: [{ kind: 'text', text: '[response failed: context_overflow]' }] },
        { role: 'user', blocks: [{ kind: 'text', text: 'Again, with a line before it' }] },
        { role: 'assistant', blocks: [{ kind: 'text', text: 'Here:\n\n[response failed: context_overflow]' }] },
      ],
    };
    const read = (lastFailed: boolean) => {
      const h = C.historyFrom(body, { liveTail: false, idOf: (i) => 'h' + i, at: 0, lastFailed });
      const c: C.Conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
      return C.blocks(c, 0);
    };
    const ok = read(false);
    expect(ok.filter((b) => b.k === 'reply').map((b) => (b as { text: string }).text)).toEqual(['[response failed: context_overflow]', 'Here:\n\n[response failed: context_overflow]']);
    expect(ok.some((b) => b.k === 'outcome' && (b as { state: string }).state === 'failed')).toBe(false);
    // Known failed: only the last turn reads as failed; the earlier successful reply keeps every character.
    const bad = read(true);
    expect(bad.filter((b) => b.k === 'reply').map((b) => (b as { text: string }).text)).toEqual(['[response failed: context_overflow]', 'Here:']);
    expect(bad.filter((b) => b.k === 'outcome' && (b as { state: string }).state === 'failed')).toHaveLength(1);
  });
  it('the record\'s failed turn counts only while the agent still names it the newest turn', () => {
    expect(tailFailed('T1', { id: 'T1', state: 'failed' })).toBe(true);
    expect(tailFailed('T1', { id: 'T2', state: 'completed' })).toBe(false);
    expect(tailFailed('T1', { id: 'T2', state: 'failed' })).toBe(false);
    expect(tailFailed('T1', { id: 'T1', state: 'completed' })).toBe(false);
    expect(tailFailed('T1', null)).toBe(false);
    expect(tailFailed('T1', 'bad')).toBe(false);
  });
  it('a marker the daemon did not write as a close stays: in a completed turn, or inside a line', () => {
    expect(C.failedClose('The exact marker is [response failed: context_overflow]')).toEqual({ text: 'The exact marker is [response failed: context_overflow]', code: '' });
    expect(C.failedClose('Partial.\n\n[response failed: refusal]')).toEqual({ text: 'Partial.', code: 'refusal' });
    expect(C.failedClose('[response failed: context_overflow]')).toEqual({ text: '', code: 'context_overflow' });
    let c = C.onTurn(started(), frame(env('event.stream_chunk', { text: '[response failed: context_overflow]' })));
    c = ended(c, 'completed');
    expect(C.blocks(c, 0).find((b) => b.k === 'reply')).toMatchObject({ text: '[response failed: context_overflow]' });
    let d = C.onTurn(started(), frame(env('event.stream_chunk', { text: 'Quoted:\n\n[response failed: refusal]' })));
    d = ended(d, 'completed');
    expect(C.blocks(d, 0).find((b) => b.k === 'reply')).toMatchObject({ text: 'Quoted:\n\n[response failed: refusal]' });
  });
});
