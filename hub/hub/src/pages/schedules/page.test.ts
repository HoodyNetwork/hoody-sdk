// Vitest: the schedules page's logic and interaction in every fixture state.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import defaultFixtures from './fixtures';
import { KIND_FILTERS, SHOW_FILTERS, attentionRank, nextAt, statusOf, clock, curlTarget, nextRuns, draftExpr, draftFrom, emptyDraft, fromHandoff, label, mask, merge, model, problem, recognise, retry, timerName, toExpr, toHandoff, type RawSchedules } from './logic';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';
import { pickRuns, runsButton } from './testRuns';

const heldOp = (suffix: string) => [...opsStore.snapshot()].find(([k]) => k.endsWith(`\u0001${suffix}`))?.[1];
const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const m = model(raw);
const rowOf = (key: string) => {
  const r = m.rows.find((x) => x.key === key);
  if (!r) throw new Error(`no fixture row ${key}`);
  return r;
};

describe('schedules logic: presets', () => {
  it('writes cron and exec expressions with five fields', () => {
    expect(toExpr('cron', { k: 'every', n: 15 })).toBe('*/15 * * * *');
    expect(toExpr('cron', { k: 'hourly', m: 5 })).toBe('5 * * * *');
    expect(toExpr('cron', { k: 'daily', h: 8, m: 30 })).toBe('30 8 * * *');
    expect(toExpr('cron', { k: 'weekdays', h: 7, m: 0 })).toBe('0 7 * * 1-5');
    expect(toExpr('cron', { k: 'weekly', h: 3, m: 30, days: [1, 3] })).toBe('30 3 * * 1,3');
    expect(toExpr('cron', { k: 'monthly', d: 1, h: 4, m: 15 })).toBe('15 4 1 * *');
    expect(toExpr('cron', { k: 'reboot' })).toBe('@reboot');
  });

  it('writes web request expressions with seconds and day names', () => {
    expect(toExpr('curl', { k: 'daily', h: 9, m: 0 })).toBe('0 0 9 * * *');
    expect(toExpr('curl', { k: 'weekdays', h: 9, m: 0 })).toBe('0 0 9 * * MON-FRI');
    expect(toExpr('curl', { k: 'weekly', h: 9, m: 0, days: [0, 6] })).toBe('0 0 9 * * SUN,SAT');
    expect(toExpr('curl', { k: 'reboot' })).toBeNull();
  });

  it('refuses out-of-range fields', () => {
    expect(toExpr('cron', { k: 'every', n: 7 })).toBeNull();
    expect(toExpr('cron', { k: 'daily', h: 24, m: 0 })).toBeNull();
    expect(toExpr('cron', { k: 'monthly', d: 32, h: 0, m: 0 })).toBeNull();
    expect(toExpr('cron', { k: 'weekly', h: 1, m: 1, days: [] })).toBeNull();
    expect(toExpr('cron', { k: 'weekly', h: 1, m: 1, days: [2, 2] })).toBeNull();
  });

  it('recognises a preset only when it regenerates the saved string byte for byte', () => {
    expect(recognise('cron', '30 8 * * *')).toEqual({ k: 'daily', h: 8, m: 30 });
    expect(recognise('cron', '0 7 * * 1-5')).toEqual({ k: 'weekdays', h: 7, m: 0 });
    expect(recognise('curl', '0 0 9 * * MON-FRI')).toEqual({ k: 'weekdays', h: 9, m: 0 });
    expect(recognise('cron', '@reboot')).toEqual({ k: 'reboot' });
    expect(recognise('cron', '*/7 * * * *')).toEqual({ k: 'custom', expr: '*/7 * * * *' });
    expect(recognise('cron', '0 8 * * 7')).toMatchObject({ k: 'custom' });
    expect(recognise('cron', '00 8 * * *')).toMatchObject({ k: 'custom' });
    expect(recognise('cron', '0 8 * 6 *')).toMatchObject({ k: 'custom' });
  });
});

describe('schedules logic: names and masking', () => {
  it('names an agent timer by its timer name only', () => {
    expect(timerName('hoody-timer-morning-check')).toBe('morning-check');
    expect(timerName('hoody-timer-')).toBeNull();
    expect(label('hoody-timer-x', 'anything')).toEqual({ k: 'timer', name: 'x' });
  });

  it('names an unnamed command by the basename of its first plain word, never more', () => {
    expect(label('', '/usr/local/bin/cleanup-tmp --older-than 7d')).toEqual({ k: 'cmd', name: 'cleanup-tmp' });
    expect(label('', 'FOO=1 BAR=2 run.sh arg')).toEqual({ k: 'cmd', name: 'run.sh' });
    expect(label('', 'curl https://u:p@x/y')).toEqual({ k: 'cmd', name: 'curl' });
    expect(label('', '"quoted thing"')).toEqual({ k: 'unnamed' });
    expect(label('', '$HOME/x')).toEqual({ k: 'unnamed' });
  });

  it('masks the secrets it recognises and keeps the rest', () => {
    const out = mask('curl -H "Authorization: Bearer abc123" https://u:pw@host/x --token=zzz TOKEN=1 run');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('pw@');
    expect(out).not.toContain('zzz');
    expect(out).toContain('run');
  });

  it('names a web request by method and host only', () => {
    expect(curlTarget({ url: 'https://User:pw@API.Example.com:8443/p?x=1', method: 'post' })).toEqual({ method: 'POST', host: 'api.example.com' });
    expect(curlTarget(undefined)).toEqual({ method: 'GET', host: '' });
  });
});

describe('schedules logic: rows', () => {
  it('merges every source into one list with the soonest first', () => {
    expect(m.total).toBe(7 + 1 + 3 + 2 + 2);
    const times = m.rows.flatMap((r) => ('at' in r.next ? [r.next.at] : []));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const firstWithout = m.rows.findIndex((r) => !('at' in r.next));
    expect(m.rows.slice(firstWithout).every((r) => !('at' in r.next))).toBe(true);
  });

  it('gives an agent timer no Run now and no Edit, and never reads Worked', () => {
    const r = rowOf('timer:user/a6');
    expect(r.can.run).toBe(false);
    expect(r.can.edit).toBe(false);
    expect(r.last.k).toBe('chat');
  });

  it('keeps a hand-written line read-only without results', () => {
    const r = rowOf('raw:user/raw12');
    expect(r.can).toEqual({});
    expect(r.last.k).toBe('no_reports');
    expect(r.next).toEqual({ k: 'unknown' });
  });

  it('reads a failed command, a paused command and an @reboot line', () => {
    expect(rowOf('cron:user/a3').last).toMatchObject({ k: 'failed', n: 1 });
    expect(rowOf('cron:user/a3').attention).toBe(true);
    expect(rowOf('cron:user/a4').paused).toBe(true);
    expect(rowOf('cron:user/a4').next).toEqual({ k: 'paused' });
    expect(rowOf('cron:user/a7').next).toEqual({ k: 'reboot' });
  });

  it('turns script outcomes into last-result words and keeps scripts without a switch', () => {
    expect(rowOf('exec:default/1/nightly-digest.ts').last.k).toBe('worked');
    expect(rowOf('exec:default/1/queue-drain.ts').last.k).toBe('failed');
    const off = rowOf('exec:default/1/archive.ts');
    expect(off.next).toEqual({ k: 'off' });
    expect(off.last).toMatchObject({ k: 'skipped', why: 'off' });
    expect(off.can.pause).toBeUndefined();
    expect(off.can.del).toBeUndefined();
  });

  it('shows a web request last_run as started when the kit gives no result', () => {
    const r = rowOf('curl:c2');
    expect(r.last.k).toBe('failed');
    expect(r.label).toEqual({ k: 'web', method: 'POST', host: 'hooks.example.org' });
  });

  it('keeps a loop that is between fires as Scheduled and one in error as paused with a resume confirm', () => {
    expect(rowOf('loop:sess_01/loop_1a2b3c4d').state?.k).toBe('scheduled');
    const bad = rowOf('loop:sess_02/loop_5e6f7a8b');
    expect(bad.state?.k).toBe('error');
    expect(bad.paused).toBe(true);
    expect(bad.confirm).toBe('resume');
    expect(bad.attention).toBe(true);
  });

  it('counts failures of today and classes every row for the chips and the sort', () => {
    expect(m.failedToday).toBeGreaterThanOrEqual(2);
    expect(m.rows.filter((r) => r.kind === 'web').every((r) => r.src === 'curl')).toBe(true);
    expect(m.rows.filter((r) => statusOf(r).includes('paused')).every((r) => r.paused)).toBe(true);
    expect(m.rows.filter((r) => statusOf(r).includes('attention')).every((r) => r.attention)).toBe(true);
    expect(KIND_FILTERS.every((k) => m.rows.some((r) => r.kind === k))).toBe(true);
    expect(SHOW_FILTERS).toEqual(['paused', 'attention']);
    const sorted = [...m.rows].sort((a, b) => nextAt(a) - nextAt(b));
    expect(sorted.map(nextAt)).toEqual([...sorted.map(nextAt)].sort((a, b) => a - b));
    expect(attentionRank(rowOf('cron:user/a3'))).toBeLessThan(attentionRank(rowOf('cron:user/a1')));
  });

  it('marks every count "at least" when a source did not answer completely', () => {
    const partial = (defaultFixtures.states.partial.schedules as { data: RawSchedules }).data;
    const p = model(partial);
    expect(p.atLeast).toBe(true);
    expect(p.unchecked).toEqual(['exec', 'curl', 'loop']);
    expect(p.empty).toBe(false);
    const none = model({ ...raw, cron: { ...raw.cron, items: [], hand: [] }, exec: { ...raw.exec, items: [] }, curl: { ...raw.curl, items: [] }, loop: { ...raw.loop, items: [] } });
    expect(none.empty).toBe(true);
  });

  it('orders ties by name', () => {
    const a = rowOf('cron:user/a1');
    const b = { ...rowOf('cron:user/a2'), next: a.next };
    expect(merge([b, a]).map((r) => r.key)).toEqual([a.key, b.key]);
  });
});

describe('schedules logic: actions', () => {
  it('repeats only what a repeat cannot do twice', () => {
    expect(retry('pause')).toBe('try');
    expect(retry('del')).toBe('try');
    expect(retry('run')).toBe('check');
    expect(retry('run', { run_now: true })).toBe('try');
    expect(retry('exec.run', {})).toBe('check');
    expect(retry('loop.run', { loop_receipts: true })).toBe('try');
  });

  it('hands scripts over by their path inside the default folder only', () => {
    expect(toHandoff('default/1/a/b.ts')).toBe('a/b.ts');
    expect(toHandoff('other/x.ts')).toBeNull();
    expect(fromHandoff('a/b.ts')).toBe('default/1/a/b.ts');
    expect(fromHandoff('../b.ts')).toBeNull();
    expect(fromHandoff('a//b')).toBeNull();
    expect(fromHandoff('/a')).toBeNull();
  });

  it('formats a clock in a fixed offset and refuses an unknown zone', () => {
    expect(clock(Date.UTC(2026, 0, 1, 12, 0), 3600, 'en', false)).toBe('13:00');
    expect(clock(Date.UTC(2026, 0, 1, 12, 0), 'utc', 'en', false)).toBe('12:00');
    expect(clock(0, 'Nowhere/Land', 'en', false)).toBeNull();
  });
});

describe('schedules logic: preview', () => {
  const NOW = Date.UTC(2026, 9, 23, 3, 10); // 03:10 UTC; the computer reads UTC+1, so 04:10 there
  it('follows the hour and minute fields, not a canned list', () => {
    const p = nextRuns('0 2 * * *', NOW, 3600, 3);
    expect(p.ok && p.runs.map((at) => clock(at, 3600, 'en', false))).toEqual(['02:00', '02:00', '02:00']);
    expect(p.ok && p.runs[0]).toBe(Date.UTC(2026, 9, 24, 1, 0));
    const q = nextRuns('*/15 * * * *', NOW, 3600, 2);
    expect(q.ok && q.runs).toEqual([Date.UTC(2026, 9, 23, 3, 15), Date.UTC(2026, 9, 23, 3, 30)]);
  });
  it('reads weekdays, days of the month and either-or when both are set', () => {
    const w = nextRuns('30 9 * * 1-5', NOW, 0, 3);
    expect(w.ok && w.runs.map((at) => new Date(at).getUTCDay())).toEqual([5, 1, 2]);
    const mo = nextRuns('15 4 1 * *', NOW, 0, 1);
    expect(mo.ok && mo.runs[0]).toBe(Date.UTC(2026, 10, 1, 4, 15));
  });
  it('names the field that is out of range', () => {
    expect(nextRuns('0 24 * * *', NOW, 0)).toEqual({ ok: false, field: 'hour', min: 0, max: 23 });
    expect(nextRuns('61 * * * *', NOW, 0)).toMatchObject({ ok: false, field: 'minute' });
    expect(nextRuns('@reboot', NOW, 0)).toEqual({ ok: false, field: null });
  });
  it('says so when it never fires', () => {
    expect(nextRuns('0 0 31 2 *', NOW, 0)).toMatchObject({ ok: true, never: true, runs: [] });
  });
});

describe('schedules logic: editor', () => {
  it('starts an edit from the saved preset and builds the same expression back', () => {
    const d = draftFrom(rowOf('cron:user/a2'), 'rotate-logs');
    expect(d).toMatchObject({ kind: 'weekly', hour: 3, minute: 30, days: [1] });
    expect(draftExpr('cron', d)).toBe('30 3 * * 1');
  });

  it('needs a command to create but not to edit, and a valid time', () => {
    const d = { ...emptyDraft(), command: '' };
    expect(problem('cron', d, true)).toBe('command');
    expect(problem('cron', d, false)).toBeNull();
    expect(problem('cron', { ...d, command: 'a\nb' }, false)).toBe('command');
    expect(problem('cron', { ...d, command: 'x', name: 'a'.repeat(121) }, true)).toBe('name');
    expect(problem('cron', { ...d, command: 'x', kind: 'weekly', days: [] }, true)).toBe('when');
    expect(problem('curl', { ...d, kind: 'custom', custom: '* * * *' }, false)).toBe('curl');
    expect(problem('curl', { ...d, kind: 'custom', custom: '0 0 9 * * MON' }, false)).toBeNull();
  });
});

beforeEach(() => opsStore.reset());

async function table() {
  return screen.findByRole('table', { name: strings.title }, { timeout: 6000 });
}

describe('schedules page', () => {
  it('lists schedules of every kind with their schedule in words', async () => {
    await renderPage(page);
    const t = await table();
    await within(t).findByRole('row', { name: /backup/ });
    expect(within(t).getByRole('row', { name: /morning-check/ })).toBeInTheDocument();
    expect(within(t).getAllByText(/Every day at 02:00/).length).toBeGreaterThan(0);
    expect(within(t).getByRole('row', { name: /GET|POST/ })).toBeInTheDocument();
  });

  it('opens a schedule with the selection in the URL and shows its history', async () => {
    const { router } = await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa1' });
    expect(await screen.findByText(strings['detail.history'])).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ sel: 'cron:user/a1' });
    expect(await screen.findByRole('table', { name: strings['detail.history'] })).toBeInTheDocument();
  });

  it('keeps the command behind Advanced until Show, then masks it', async () => {
    await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa1' });
    // The revealed command is a shell CodeBlock (a figure named by its label): coloured, so its text spans several tokens.
    expect(screen.queryByRole('figure', { name: strings['a.show'] })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: strings['a.show'] }));
    const code = await screen.findByRole('figure', { name: strings['a.show'] });
    expect(code.textContent).toMatch(/restic backup/);
    expect(code.textContent).not.toContain('abc123');
    expect(screen.getByRole('button', { name: strings['a.copyExact'] })).toBeInTheDocument();
  });

  it('gives an agent timer no Run now and no Edit, while a script row on the same page has Run now', async () => {
    await renderPage(page, { path: '/schedules?sel=timer%3Auser%2Fa6' });
    await screen.findByText(strings['detail.history']);
    const t = await table();
    const timer = within(t).getByRole('row', { name: /morning-check/ });
    expect(within(timer).queryByRole('button', { name: strings['action.runNow'] })).not.toBeInTheDocument();
    const script = within(t).getByRole('row', { name: /queue-drain/ });
    expect(within(script).getByRole('button', { name: strings['action.runNow'] })).toBeInTheDocument();
    // The inspector header adds nothing for the timer: no Edit, and no Run now beyond the script rows' own.
    expect(screen.queryByRole('button', { name: strings['action.edit'] })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['action.runNow'] })).toHaveLength(within(t).getAllByRole('button', { name: strings['action.runNow'] }).length);
  });

  it('asks before deleting and names what it deletes', async () => {
    await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa1' });
    await userEvent.click((await screen.findAllByRole('button', { name: /More actions/ }))[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(strings['action.delete']) }));
    expect(await screen.findByText('Delete Nightly backup?')).toBeInTheDocument();
  });

  it('holds an unconfirmed Run now on the row and offers a read-back, not a resend', async () => {
    await renderPage(page, { state: 'act-pending', path: '/schedules?sel=cron%3Auser%2Fa3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.runNow'] })).at(-1) as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.status).toBe('unknown'));
    expect((await screen.findAllByRole('button', { name: strings['u.check'] })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: strings['op.again'] })).not.toBeInTheDocument();
  });

  it('shows a refused change as not sent and a failed one with its reason', async () => {
    await renderPage(page, { state: 'act-failed', path: '/schedules?sel=cron%3Auser%2Fa3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.runNow'] })).at(-1) as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.status).toBe('failed'));
    expect(await screen.findByText(strings['no.disabled'])).toBeInTheDocument();
  });

  it('opens the chooser from New schedule and the form from Command', async () => {
    const { router } = await renderPage(page);
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    expect(await screen.findByText(strings['new.pick'])).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ edit: 'new' });
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['new.cmd']) }));
    expect(await screen.findByLabelText(strings['e.cmd'])).toBeInTheDocument();
  });

  it('previews the hour and minute the fields say, not a canned time', async () => {
    await renderPage(page, { path: '/schedules?edit=cron%3Auser%2Fa1' });
    const dlg = within(await screen.findByRole('dialog'));
    expect(await dlg.findAllByText(/02:00/)).toHaveLength(5);
    await pickRuns('weekdays');
    expect(await dlg.findAllByText(/02:00/)).toHaveLength(5);
    const time = dlg.getByLabelText(strings['ed.time']);
    await userEvent.clear(time);
    await userEvent.type(time, '09:30');
    expect(await dlg.findAllByText(/09:30/)).toHaveLength(5);
    expect(dlg.queryByText(/02:00/)).not.toBeInTheDocument();
  });

  it('names the part that is out of range, in plain words, and keeps Save off', async () => {
    await renderPage(page, { state: 'preview-error', path: '/schedules?edit=cron%3Auser%2Fa8' });
    expect(await screen.findAllByText('Hour must be 0 to 23.')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: strings['ed.save'] })).toBeDisabled();
  });

  it('locks the form and shows the outcome while a save is unconfirmed', async () => {
    await renderPage(page, { state: 'save-pending', path: '/schedules?edit=cron%3Auser%2Fa1' });
    await pickRuns('weekdays');
    await userEvent.click(screen.getByRole('button', { name: strings['ed.save'] }));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    expect(await runsButton()).toBeDisabled();
  });

  it('never loads the saved command into the edit form', async () => {
    await renderPage(page, { path: '/schedules?edit=cron%3Auser%2Fa1' });
    const field = (await screen.findByLabelText(strings['e.cmd'])) as HTMLInputElement;
    expect(field.value).toBe('');
    expect(screen.getByText(strings['e.cmdKeep'])).toBeInTheDocument();
  });

  it('says plainly which sources were not read, one line each, with no summary to open', async () => {
    await renderPage(page, { state: 'partial' });
    expect(await screen.findByText(strings['n.exec.old'])).toBeInTheDocument();
    // Curl is stopped here and no web request is known, so nothing blames Curl.
    expect(screen.queryByText(strings['line.curl_stopped'])).toBeNull();
    expect(screen.getByText(/doesn't let the Hub in/)).toBeInTheDocument();
    expect(screen.queryByText(/Some schedules may be missing/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });

  it.each([
    ['empty', 'No schedules on atlas yet'],
    ['no-computer', strings['st.title.noComputer']],
    ['stopped', strings['st.title.stopped']],
    ['private', strings['st.title.private']],
    ['error', strings['st.title.failed']],
  ] as const)('shows the %s state', async (state, title) => {
    await renderPage(page, { state });
    expect(await screen.findByText(title)).toBeInTheDocument();
  });
});
