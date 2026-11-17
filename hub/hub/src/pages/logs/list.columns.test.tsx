// Vitest: the list's columns (Time, Result, From, What, Visitor, Took), the Visitor column per source, and the
// windowing of a long list at one fixed row height.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@app/testing';
import type { Snapshot } from './controller';
import { DEFAULT_VIEW, type DataItem } from './logic';
import { LogList } from './parts/LogList';
import type { Source } from './rules';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const visit = (n: number, ip?: string): DataItem => ({
  kind: 'kit',
  k: `k${n}`,
  t: 1_700_000_000_000 - n * 1000,
  id: n,
  row: { id: n, serviceName: 'files', method: 'GET', url: '/files/a.txt?token_ref=secret', status: n % 7 === 0 ? 429 : 200, durationMs: 12, ...(ip ? { clientIp: ip } : {}) },
});

const snap = (items: DataItem[], source: Source): Snapshot => ({
  v: { ...DEFAULT_VIEW, source },
  items,
  loading: false,
  newCount: 0,
  moreOlder: false,
  moreNewer: false,
  liveOn: false,
  olderBusy: false,
  jump: 0,
} as unknown as Snapshot);

const props = { t, selected: undefined, onSelect: () => {}, onOlder: () => {}, onNewer: () => {}, onJump: () => {}, onReading: () => {}, active: undefined, onActive: () => {} };

describe('LogList columns', () => {
  afterEach(cleanup);

  it('heads and fills Time, Result, From, What, Visitor, Took in that order', () => {
    const { container } = render(<LogList {...props} snap={snap([visit(7, '203.0.113.7')], 'visits')} />);
    const head = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(Array.from(head.children).map((c) => c.textContent)).toEqual(['Time', 'Result', 'From', 'What happened', 'Visitor', 'Took']);
    const row = container.querySelector('button[data-key="k7"]') as HTMLElement;
    const cells = Array.from(row.children).map((c) => c.textContent);
    expect(cells.slice(1)).toEqual(['Too many requests', 'Visits', 'GET 429Files: tried to open /files/a.txt', '203.0.113.7', '12 ms']);
    expect(row.children[4]?.getAttribute('title')).toBe('203.0.113.7');
  });

  it('leads a visit with its method and status and trails its path, never its query string; a Bot call has neither', () => {
    const bot: DataItem = { kind: 'kit', k: 'kb', t: 1, row: { id: 9, serviceName: 'bots', method: 'POST', url: '/bots/support', status: 200, data: { bot_label: 'support' } } };
    const { container } = render(<LogList {...props} snap={snap([visit(1), bot], 'everything')} />);
    const what = (k: string) => (container.querySelector(`button[data-key="${k}"]`) as HTMLElement).children[3] as HTMLElement;
    expect(what('k1').textContent).toBe('GET 200Files: opened /files/a.txt');
    expect(container.textContent).not.toContain('token_ref');
    expect(what('kb').textContent).toBe('Bot call: support');
  });

  it('a row with no address leaves its Visitor cell empty and keeps the other columns in place', () => {
    const { container } = render(<LogList {...props} snap={snap([visit(1)], 'everything')} />);
    const row = container.querySelector('button[data-key="k1"]') as HTMLElement;
    expect(row.children.length).toBe(6);
    expect(row.children[4]?.textContent).toBe('');
    expect(row.children[5]?.textContent).toBe('12 ms');
  });

  it('a source without addresses has no Visitor column at all', () => {
    const { container } = render(<LogList {...props} snap={snap([visit(1, '203.0.113.7')], 'helper')} />);
    expect(screen.queryByText('Visitor')).toBeNull();
    const row = container.querySelector('button[data-key="k1"]') as HTMLElement;
    expect(row.children.length).toBe(5);
    expect(row.textContent).not.toContain('203.0.113.7');
  });

  it('draws only the window of a 2,000-row list and reaches the last row by scrolling', () => {
    const items = Array.from({ length: 2000 }, (_, i) => visit(i, '203.0.113.7'));
    const { container } = render(<LogList {...props} snap={snap(items, 'visits')} />);
    expect(container.querySelectorAll('button[data-key]').length).toBeLessThan(80);
    expect(container.querySelector('button[data-key="k1999"]')).toBeNull();
    const list = container.querySelector('[role="region"]') as HTMLElement;
    fireEvent.scroll(list, { target: { scrollTop: 32 * 2000 } });
    expect(container.querySelector('button[data-key="k1999"]')).not.toBeNull();
    expect(container.querySelector('button[data-key="k0"]')).toBeNull();
    expect(container.querySelectorAll('button[data-key]').length).toBeLessThan(80);
  });
});
