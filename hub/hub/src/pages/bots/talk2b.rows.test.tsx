// Vitest: a runtime row about a task says where its chat lives and where it runs, and its title links that chat. The
// session lives on the Bot's own computer, in the Bot's realm; the task runs on its delegate row's `computer` (empty: the Bot's own).
import { cleanup, render, screen } from '@testing-library/react';
import { renderPage, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Delegate, LogRow } from './data';
import { logOf } from './data';
import { rowPlace } from './logic';
import page from './page';
import { ActivityLog } from './parts/ActivityTab';
import S from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(cleanup);

const task = (sessionId: string, computerId: string, title = 'Run the tests'): Delegate => ({ sessionId, title, state: 'working', computerId, model: 'm', waitingOn: null, startedAt: '2026-11-06T10:00:00Z' });
const HOME = { id: 'c-atlas', name: 'atlas' };
const COMPUTERS = [HOME, { id: 'c-cinder', name: 'cinder' }];
const TASKS = [task('s-here', ''), task('s-same', 'c-atlas'), task('s-there', 'c-cinder'), task('s-gone', 'c-unlisted')];
const row = (kind: LogRow['kind'], sessionId: string | null): Pick<LogRow, 'kind' | 'sessionId'> => ({ kind, sessionId });

describe('the log row names its session', () => {
  it('reads session_id, and none when the agent wrote none', () => {
    const p = logOf({ items: [{ seq: 1, role: 'event', kind: 'report', text: 'done', session_id: 's-1' }, { seq: 2, role: 'event', kind: 'note', text: 'x' }] });
    expect(p.rows.map((r) => r.sessionId)).toEqual(['s-1', null]);
  });
});

describe('rowPlace', () => {
  it('a task with no computer runs on the Bot\'s own computer', () => {
    expect(rowPlace(row('report', 's-here'), TASKS, HOME, COMPUTERS)).toEqual({ sid: 's-here', title: 'Run the tests', session: 'atlas', runs: null });
  });

  it('a task naming the Bot\'s own computer by id runs there too', () => {
    expect(rowPlace(row('gone', 's-same'), TASKS, HOME, COMPUTERS)).toEqual({ sid: 's-same', title: 'Run the tests', session: 'atlas', runs: null });
  });

  it('a task on another computer names both; an unlisted computer is "another"', () => {
    expect(rowPlace(row('note', 's-there'), TASKS, HOME, COMPUTERS)).toEqual({ sid: 's-there', title: 'Run the tests', session: 'atlas', runs: 'cinder' });
    expect(rowPlace(row('error', 's-gone'), TASKS, HOME, COMPUTERS)?.runs).toBe('');
  });

  it('nothing for messages, rows naming no session, or a session that is not a listed task', () => {
    expect(rowPlace(row('bot', 's-here'), TASKS, HOME, COMPUTERS)).toBeNull();
    expect(rowPlace(row('user', 's-here'), TASKS, HOME, COMPUTERS)).toBeNull();
    expect(rowPlace(row('report', null), TASKS, HOME, COMPUTERS)).toBeNull();
    expect(rowPlace(row('report', 's-bot-own'), TASKS, HOME, COMPUTERS)).toBeNull();
  });
});

const logProps = { loading: false, error: false, onRetry: () => undefined, onLoadOlder: () => undefined, loadingOlder: false, olderFailed: false, hideTasks: false, onHideTasks: () => undefined };
const logRow = (seq: number, kind: LogRow['kind'], text: string, sessionId: string | null): LogRow => ({ seq, kind, text, at: '2026-11-06T10:00:00Z', raw: null, delegateTitle: 'Run the tests', sessionId, sender: null });

describe('the runtime row', () => {
  it('says "session on X, runs on Y", and the title links the chat', () => {
    const page = { rows: [logRow(1, 'report', 'All green.', 's-there')], live: 'up_to_date' as const, hasOlder: false, archiveRows: 0 };
    render(<ActivityLog {...logProps} page={page} placeOf={(r) => (r.sessionId === 's-there' ? { sid: 's-there', title: 'Run the tests', session: 'atlas', runs: 'cinder', href: '/ai/c/s-there?computer=atlas.tlas&realm=global' } : null)} />);
    expect(screen.getByText(/session on atlas, runs on cinder/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: "Run the tests: open the task's chat" });
    expect(link.textContent).toBe('Run the tests');
    expect(link.getAttribute('href')).toContain('/ai/c/s-there?computer=atlas.tlas&realm=global');
  });

  it('one computer reads "on X"; an unlisted one "another computer"; no chat path, no link', () => {
    const page = { rows: [logRow(1, 'report', 'A', 'a'), logRow(2, 'gone', 'B', 'b'), logRow(3, 'note', 'C', null)], live: 'up_to_date' as const, hasOlder: false, archiveRows: 0 };
    render(
      <ActivityLog
        {...logProps}
        page={page}
        placeOf={(r) => (r.sessionId === 'a' ? { sid: 'a', title: 'T', session: 'atlas', runs: null, href: null } : r.sessionId === 'b' ? { sid: 'b', title: 'T', session: 'atlas', runs: '', href: null } : null)}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('· on atlas');
    expect(items[0]?.textContent).not.toContain('runs on');
    expect(items[1]?.textContent).toContain(S['log.place.elsewhere'].replace('{{session}}', 'atlas'));
    expect(items[2]?.textContent).not.toContain('on atlas');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('the runtime row\'s title and names', () => {
  const one = (r: LogRow) => ({ rows: [r], live: 'up_to_date' as const, hasOlder: false, archiveRows: 0 });

  it('with no title on the row, the task\'s own title names it and its link', () => {
    const r = { ...logRow(1, 'report', 'Done.', 's-1'), delegateTitle: null };
    render(<ActivityLog {...logProps} page={one(r)} placeOf={() => ({ sid: 's-1', title: 'Rotate the logs', session: 'atlas', runs: null, href: '/ai/c/s-1?computer=atlas.tlas&realm=global' })} />);
    const link = screen.getByRole('link', { name: "Rotate the logs: open the task's chat" });
    expect(link.textContent).toBe('Rotate the logs');
  });

  it('the row\'s own title wins over the task\'s', () => {
    render(<ActivityLog {...logProps} page={one(logRow(1, 'report', 'Done.', 's-1'))} placeOf={() => ({ sid: 's-1', title: 'Other title', session: 'atlas', runs: null, href: '/ai/c/s-1' })} />);
    expect(screen.getByRole('link').textContent).toBe('Run the tests');
    expect(screen.queryByText(/Other title/)).toBeNull();
  });

  it('a hostile title shows no control character, bidi override or key, in the row or the link name', () => {
    const KEY = 'sk-live0123456789abcdefXYZ';
    const r = { ...logRow(1, 'report', 'Done.', 's-1'), delegateTitle: `Ship\u001b[2J it\u0007 now ${KEY} \u202Etxt.exe\u202C` };
    render(<ActivityLog {...logProps} page={one(r)} placeOf={() => ({ sid: 's-1', title: 'x', session: 'atlas', runs: null, href: '/ai/c/s-1' })} />);
    const link = screen.getByRole('link');
    const name = link.getAttribute('aria-label') ?? '';
    for (const text of [link.textContent ?? '', name, screen.getByRole('listitem').textContent ?? '']) {
      expect(text).not.toContain(KEY);
      expect(text).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/);
    }
    expect(link.textContent).toContain('[hidden]');
    expect(name).toBe(`${link.textContent}: open the task's chat`);
  });

  it('hostile computer names show no control character or bidi override, and stay bounded', () => {
    const long = 'c'.repeat(200);
    const r = logRow(1, 'note', 'Started.', 's-1');
    render(<ActivityLog {...logProps} page={one(r)} placeOf={() => ({ sid: 's-1', title: 'T', session: 'atl\u0007as\u202E', runs: `cin\nder ${long}`, href: null })} />);
    const text = screen.getByRole('listitem').textContent ?? '';
    expect(text).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/);
    expect(text).toContain('session on atl as, runs on cin der');
    expect(text).not.toContain(long);
  });
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

describe('on the Bots page', () => {
  it('a task row\'s title opens its chat by the full reference: the Bot\'s computer, its realm, the session', async () => {
    const { router } = await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    const log = within(await screen.findByRole('list', { name: S['activity.title'] }));
    expect((await log.findAllByText(/on atlas/)).length).toBeGreaterThan(0);
    const [link] = await log.findAllByRole('link', { name: "Read deploy log: open the task's chat" });
    await userEvent.click(link as HTMLElement);
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/sess-a1'));
    const q = router.state.location.search as Record<string, unknown>;
    expect(q.realm).toBe('a1b2c3d4e5f60718293a4b5c');
    expect(q.computer).toBe('atlas.tlas');
  });

  it('messages carry neither the place nor a chat link', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    const log = within(await screen.findByRole('list', { name: S['activity.title'] }));
    const msg = (await log.findAllByText(/Can you check why the last deploy/))[0]?.closest('li');
    expect(msg?.textContent).not.toContain('on atlas');
    expect(msg && within(msg).queryByRole('link', { name: /open the task's chat/ })).toBeNull();
  });
});
