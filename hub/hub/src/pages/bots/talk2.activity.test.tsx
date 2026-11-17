// The Activity log reads the Bot through BotSource. Its rows are the ones the log read gave, drawn exactly as
// before (sender and door line, runtime tones and raw lines, task updates); below them the reply the Bot's CURRENT session is
// writing shows until its row arrives. A reset (the view names another session) shows nothing of the old session.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { provideConversations, useBotSource, type BotHome, type ConversationProvider, type ConversationSource, type ConvBlock, type ConvRef, type ConvSnapshot } from '@kit';
import type { LogPage, LogRow } from './data';
import { ActivityLog } from './parts/ActivityTab';
import S from './strings.en.json';

const HOME: BotHome = { computer: 'atlas.00a1', realm: 'global', at: { project: 'p1', id: 'c0a7150000000000000000a1', name: 'atlas' } };
const row = (seq: number, o: Partial<LogRow>): LogRow => ({ seq, kind: 'note', text: '', at: '2026-11-06T10:00:00Z', raw: null, delegateTitle: null, sender: null, ...o });
const PAGE: LogPage = {
  rows: [
    row(1, { kind: 'user', text: 'Restore the orders database', sender: { via: 'telegram', who: 'Ana' } }),
    row(2, { kind: 'report', text: 'Task started', delegateTitle: 'Check the orders snapshots', raw: '[report] 9a1b "Check" started' }),
    row(3, { kind: 'error', text: 'The model refused', raw: '[error] refused' }),
    row(4, { kind: 'bot', text: 'Snapshots are **fine**.' }),
  ],
  live: 'up_to_date',
  hasOlder: true,
  archiveRows: 12,
};
const reply = (text: string, key = `r-${text}`, streaming = true): ConvBlock => ({ k: 'reply', key, text, streaming, final: !streaming, cost: null, at: null });

function fakeProvider() {
  const opened: { ref: ConvRef; set: (b: ConvBlock[]) => void; release: ReturnType<typeof vi.fn> }[] = [];
  const p: ConversationProvider = {
    open(_a, ref) {
      let snap = { facts: {}, title: null, blocks: [], gates: [] } as unknown as ConvSnapshot;
      const subs = new Set<() => void>();
      const source = { kind: 'session', ref, snapshot: () => snap, subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; }, watch: vi.fn(), can: () => ({ ok: false, reason: 'read_only' }) } as unknown as ConversationSource;
      const release = vi.fn();
      opened.push({ ref, release, set: (blocks) => { snap = { ...snap, blocks }; for (const f of [...subs]) f(); } });
      return { source, release };
    },
  };
  return { p, opened };
}

const logProps = { loading: false, error: false, onRetry: () => undefined, onLoadOlder: () => undefined, loadingOlder: false, olderFailed: false, hideTasks: false, onHideTasks: () => undefined };
/** Each render: whether the live reply shows and whether the reply's own row (seq 5) is in the log. */
let frames: { tail: boolean; row: boolean }[] = [];
function ThroughSource({ sid, page = PAGE, onReplyEnd }: { sid: string | null; page?: LogPage; onReplyEnd?: () => void }) {
  // As BotPane: the mark is the newest Bot reply row of the page.
  const mark = page.rows.reduce((m, r) => (r.kind === 'bot' && r.seq > m ? r.seq : m), -1);
  const src = useBotSource('chief', { page, sid, turnId: null, mark, ...(onReplyEnd ? { onReplyEnd } : {}) }, HOME);
  const tail = src.tail();
  frames.push({ tail: tail !== null, row: page.rows.some((r) => r.seq === 5) });
  return <ActivityLog {...logProps} page={src.page()} tail={tail?.text ?? null} />;
}

beforeEach(() => { boot(); frames = []; });
afterEach(() => { cleanup(); provideConversations(null); });

describe('Activity through BotSource', () => {
  it('draws the same rows as the log read gave: the move changes nothing', () => {
    // React Aria mints a new id per mount (the checkbox's), so ids are left out of the comparison; everything else must match.
    const html = (el: HTMLElement) => el.innerHTML.replace(/\b(id|for|aria-labelledby|aria-describedby|aria-controls)="[^"]*"/g, '$1=""');
    const direct = html(render(<ActivityLog {...logProps} page={PAGE} />).container);
    cleanup();
    const via = html(render(<ThroughSource sid={null} />).container);
    expect(via).toBe(direct);
    expect(via).toContain('Restore the orders database');
    expect(screen.getByRole('list', { name: S['activity.title'] }).children).toHaveLength(4);
  });

  it('the reply shows as it streams; when it ends its text stays and the log is read at once; its row then replaces it, with no frame showing neither', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const readLog = vi.fn();
    const r = render(<ThroughSource sid="s1" onReplyEnd={readLog} />);
    expect(screen.queryByRole('group', { name: S['activity.liveReply'] })).toBeNull();
    act(() => opened[0]!.set([reply('Looking at the snapshots', 'r9')]));
    expect(screen.getByRole('group', { name: S['activity.liveReply'] })).toHaveTextContent('Looking at the snapshots');
    act(() => opened[0]!.set([reply('Looking at the snapshots. All fine.', 'r9', false)]));
    expect(screen.getByRole('group', { name: S['activity.liveReply'] })).toHaveTextContent('Looking at the snapshots. All fine.');
    expect(readLog).toHaveBeenCalledTimes(1);
    frames = [];
    const withRow: LogPage = { ...PAGE, rows: [...PAGE.rows, row(5, { kind: 'bot', text: 'Looking at the snapshots. All fine.' })] };
    r.rerender(<ThroughSource sid="s1" page={withRow} onReplyEnd={readLog} />);
    expect(screen.queryByRole('group', { name: S['activity.liveReply'] })).toBeNull();
    expect(screen.getAllByText('Looking at the snapshots. All fine.')).toHaveLength(1);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.tail || f.row)).toBe(true);
    expect(frames.every((f) => !(f.tail && f.row))).toBe(true);
    expect(readLog).toHaveBeenCalledTimes(1);
  });

  it('a Bot reset while the tab is open (another session named) shows no text of the old session', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<ThroughSource sid="s1" />);
    act(() => opened[0]!.set([reply('old session words')]));
    expect(screen.getByRole('group', { name: S['activity.liveReply'] })).toHaveTextContent('old session words');
    r.rerender(<ThroughSource sid="s2" />);
    expect(screen.queryByText('old session words', { exact: false })).toBeNull();
    act(() => opened[0]!.set([reply('old session words, still going')]));
    expect(screen.queryByText('old session words', { exact: false })).toBeNull();
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
    act(() => opened.at(-1)!.set([reply('new session words')]));
    expect(screen.getByRole('group', { name: S['activity.liveReply'] })).toHaveTextContent('new session words');
  });

  it('with no rows yet the live reply still shows', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    render(<ThroughSource sid="s1" page={{ ...PAGE, rows: [], hasOlder: false, archiveRows: 0 }} />);
    act(() => opened[0]!.set([reply('First words')]));
    expect(screen.getByRole('group', { name: S['activity.liveReply'] })).toHaveTextContent('First words');
  });
});
