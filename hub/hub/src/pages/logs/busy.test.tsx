// Vitest: data-hub-busy, the e2e-search settle hook, on the Logs list and the Program output. Present only while
// loading (kept rows included), absent once settled.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@app/testing';
import type { ProgramsState, Snapshot } from './controller';
import { DEFAULT_VIEW, type DataItem } from './logic';
import { LogList } from './parts/LogList';
import { ProgramOutput } from './parts/ProgramOutput';
import strings from './strings.en.json';
import type { T } from './parts/words';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never as T;

const item = (n: number): DataItem => ({ kind: 'kit', k: `k${n}`, t: 1_700_000_000_000 - n * 1000, id: n, row: { id: n, serviceName: 'files', method: 'GET', url: '/a', status: 200, durationMs: 1 } });
const snap = (items: DataItem[], loading: boolean): Snapshot =>
  ({ v: { ...DEFAULT_VIEW, source: 'everything' }, items, loading, newCount: 0, moreOlder: false, moreNewer: false, liveOn: false, olderBusy: false, jump: 0 }) as unknown as Snapshot;
const listProps = { t, selected: undefined, onSelect: () => {}, onOlder: () => {}, onNewer: () => {}, onJump: () => {}, onReading: () => {}, active: undefined, onActive: () => {} };

describe('LogList: data-hub-busy (test hook)', () => {
  afterEach(cleanup);
  const region = (c: HTMLElement) => c.querySelector('[role="region"]');

  it('no list root on the first load (a waiter keeps waiting); absent once the rows are in', () => {
    const { container, rerender } = render(<LogList {...listProps} snap={snap([], true)} />);
    expect(region(container)).toBeNull();
    rerender(<LogList {...listProps} snap={snap([item(1)], false)} />);
    expect(region(container)!.hasAttribute('data-hub-busy')).toBe(false);
  });

  it('present while kept rows stay on screen during a load, and gone in the same render the load ends', () => {
    const { container, rerender } = render(<LogList {...listProps} snap={snap([item(1), item(2)], false)} />);
    expect(region(container)!.hasAttribute('data-hub-busy')).toBe(false);
    rerender(<LogList {...listProps} snap={snap([item(1), item(2)], true)} />);
    expect(container.querySelector('[data-key="k2"]')).not.toBeNull();
    expect(region(container)!.getAttribute('data-hub-busy')).toBe('');
    rerender(<LogList {...listProps} snap={snap([item(3)], false)} />);
    expect(container.querySelector('[data-key="k3"]')).not.toBeNull();
    expect(region(container)!.hasAttribute('data-hub-busy')).toBe(false);
  });
});

describe('ProgramOutput: data-hub-busy (test hook)', () => {
  afterEach(cleanup);
  const list: ProgramsState['list'] = [{ id: '1', name: 'api', range: null }];
  const props = { t, channel: 'stdout' as const, port: null, find: '', onProgram: () => {}, onChannel: () => {}, onPort: () => {}, onRefresh: () => {}, onExplain: () => {} };
  const prog = (c: HTMLElement) => c.firstElementChild as HTMLElement;

  it('present while the snapshot loads (the bar stays), absent once its text is in', () => {
    const { container, rerender } = render(<ProgramOutput {...props} state={{ list, current: list[0]!, snap: { busy: true } }} />);
    expect(prog(container).getAttribute('data-hub-busy')).toBe('');
    rerender(<ProgramOutput {...props} state={{ list, current: list[0]!, snap: { text: 'ready\n', at: 0 } }} />);
    expect(container.querySelector('pre')?.textContent).toBe('ready');
    expect(prog(container).hasAttribute('data-hub-busy')).toBe(false);
  });

  it('present with no snapshot yet; absent on a snapshot too big to show (settled, nothing to load)', () => {
    const { container, rerender } = render(<ProgramOutput {...props} state={{ list, current: list[0]!, snap: null }} />);
    expect(prog(container).getAttribute('data-hub-busy')).toBe('');
    rerender(<ProgramOutput {...props} state={{ list, current: list[0]!, snap: { big: true } }} />);
    expect(prog(container).hasAttribute('data-hub-busy')).toBe(false);
  });
});
