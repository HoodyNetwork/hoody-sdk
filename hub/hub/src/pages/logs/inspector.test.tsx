// Vitest: the Inspector's technical details in two blocks, with the header, summary, actions and a script run's
// output states unchanged around them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@app/testing';
import type { OutState } from './controller';
import { outcomeOf, toneOf, type DataItem } from './logic';
import { Inspector } from './parts/Inspector';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const visit: DataItem = {
  kind: 'kit',
  k: 'k1',
  t: 1_700_000_000_000,
  id: 1,
  row: { id: 1, serviceName: 'files', method: 'GET', url: '/files/a.txt', status: 429, durationMs: 12, traceId: ID, clientIp: '203.0.113.7', level: 'info' },
};
const run: DataItem = { kind: 'script', k: 's1', t: 1_700_000_000_000, id: 'e1', row: { path: '/run/x', method: 'POST', status: 500, executionId: ID, error: 'boom' } };

// The details blocks' headings: the kit's sub-section titles (whatever level the pane gives them), the run output's
// own section left out.
const blocks = (c: Element): Element[] =>
  [...c.querySelectorAll('[data-hub-section="sub"] [data-hub-heading]')].filter((h) => h.textContent !== table['lbl.recent_output']);

const props = { t, onAround: () => {}, onExplain: () => {}, out: undefined as OutState | undefined };

describe('Inspector', () => {
  afterEach(cleanup);

  it('shows the details as a Request block then a Details block, each with its own facts', () => {
    const { container } = render(<Inspector {...props} item={visit} />);
    const heads = blocks(container).map((h) => h.textContent);
    expect(heads).toEqual([table['det.group_request'], table['det.group_details']]);
    const sections = blocks(container).map((h) => h.closest('section') as Element);
    expect(sections).toHaveLength(2);
    // The kit's Facts draws a wide fact (the address) under the grid.
    const labels = (el: Element) => [...el.querySelectorAll('dt')].map((d) => d.textContent);
    expect(labels(sections[0] as Element)).toEqual([table['det.time'], table['det.method'], table['det.status'], table['det.request'], table['det.ip'], table['det.program'], table['det.address']]);
    expect(labels(sections[1] as Element)).toEqual([table['det.level']]);
  });

  it('keeps every fact: ids masked, the address copyable and wide, the visitor address not copyable', () => {
    const { container } = render(<Inspector {...props} item={visit} />);
    expect(container.textContent).not.toContain(ID);
    expect(container.textContent).toContain('/files/a.txt');
    expect(container.textContent).toContain('203.0.113.7');
    const dd = (label: string) => screen.getByText(label).closest('div') as HTMLElement;
    expect(dd(table['det.address'] as string).className).toMatch(/factWide/);
    expect(dd(table['det.ip'] as string).querySelector('button')).toBeNull();
    expect(dd(table['det.address'] as string).querySelector('button')).not.toBeNull();
  });

  it('leaves out a block with no rows', () => {
    const change: DataItem = { kind: 'changes', k: 'c1', t: 1_700_000_000_000, row: { event_type: 'file.opened', resource_id: ID, resource_type: 'file' } };
    const { container } = render(<Inspector {...props} item={change} />);
    expect(blocks(container)).toHaveLength(2);
    cleanup();
    const bare: DataItem = { kind: 'helper', k: 'h1', t: 1_700_000_000_000, row: {} };
    const r = render(<Inspector {...props} item={bare} />);
    expect(blocks(r.container)).toHaveLength(1);
  });

  it('keeps the outcome pill in the header, with the tone outcomeOf gives (not just the summary line)', () => {
    const { container } = render(<Inspector {...props} item={visit} />);
    const o = outcomeOf(visit);
    expect(o).not.toBe('neutral');
    const header = container.querySelector('header') as HTMLElement;
    const pill = within(header).getByText(table[`out.${o}`] as string).closest('span') as HTMLElement;
    expect(pill.className).toMatch(toneOf(o) === 'danger' ? /danger/ : toneOf(o) === 'ok' ? /ok/ : /warn/);
    cleanup();
    const quiet: DataItem = { kind: 'helper', k: 'h2', t: 1_700_000_000_000, row: { level: 'info', message: 'x' } };
    const r = render(<Inspector {...props} item={quiet} />);
    expect(outcomeOf(quiet)).toBe('neutral');
    expect(r.container.querySelector('header span[class*="pill"]')).toBeNull();
  });

  describe('a script run output, above the details', () => {
    const output = (o: OutState, onRetry?: () => void) => render(<Inspector {...props} item={run} out={o} {...(onRetry ? { onRetryOut: onRetry } : {})} />);
    const before = (c: HTMLElement, el: Element) => !!(el.compareDocumentPosition(blocks(c)[0] as Element) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('shows the lines before the first details block', () => {
      const { container } = output({ out: { text: 'line one', lines: ['line one'] } as never });
      const code = container.querySelector('pre, code') as Element;
      expect(code.textContent).toContain('line one');
      expect(before(container, code)).toBe(true);
      expect(screen.getByText(table['lbl.recent_output'] as string)).toBeTruthy();
      // The section and the code block inside it both carry the name.
      expect(screen.getAllByLabelText(table['lbl.recent_output'] as string).length).toBeGreaterThan(0);
    });

    it('says when the run wrote nothing', () => {
      const { container } = output({ out: { text: '', lines: [] } as never });
      const note = screen.getByText(table['row.noOut'] as string);
      expect(before(container, note)).toBe(true);
    });

    it('shows a loading state while the output is read', () => {
      const { container } = output({ busy: true });
      const sk = container.querySelector('[data-skeleton]') as Element;
      expect(sk).not.toBeNull();
      expect(before(container, sk)).toBe(true);
      expect(screen.queryByText(table['row.outErr'] as string)).toBeNull();
    });

    it('offers Try again on a failed read, and calls onRetryOut', () => {
      const onRetry = vi.fn();
      const { container } = output({ err: 'failed' }, onRetry);
      const msg = screen.getByText(table['row.outErr'] as string);
      expect(before(container, msg)).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('shows nothing for the output when the kit is out of date or the run is gone, and still the details', () => {
      for (const err of ['needs_update', 'gone'] as const) {
        const { container } = output({ err });
        expect(screen.queryByText(table['row.outErr'] as string)).toBeNull();
        expect(screen.queryByText(table['row.noOut'] as string)).toBeNull();
        expect(screen.queryByText(table['lbl.recent_output'] as string)).toBeNull();
        expect(screen.queryByLabelText(table['lbl.recent_output'] as string)).toBeNull();
        expect(container.querySelector('[data-skeleton]')).toBeNull();
        expect(blocks(container)).toHaveLength(2);
        cleanup();
      }
    });
  });

  describe('a Bot call', () => {
    const botItem: DataItem = {
      kind: 'kit', k: 'b1', t: 1_700_000_000_000, id: 9,
      row: { id: 9, serviceName: 'bots', method: 'POST', url: '/bots/x', status: 502, durationMs: 800, traceId: ID, level: 'error', data: { bot_label: 'Support', bot_door: 'link', bot_caller: ID, bot_caller_name: 'Ada', bot_exposure: 'public', bot_result: 'failed', bot_limit: { scope: 'bot', kind: 'daily', max: 200, retry_at: '2026-10-31T00:00:00Z' }, other: 'hidden' } },
    };

    it('adds a Bot call block between Request and Details with its facts', () => {
      const { container } = render(<Inspector {...props} item={botItem} />);
      const heads = blocks(container).map((h) => h.textContent);
      expect(heads).toEqual([table['det.group_request'], table['det.group_bot'], table['det.group_details']]);
      const block = blocks(container)[1]?.closest('section') as HTMLElement;
      const labels = [...block.querySelectorAll('dt')].map((d) => d.textContent);
      expect(labels).toEqual([table['det.door'], table['det.caller'], table['det.bot_url'], table['det.result'], table['det.limit_scope'], table['det.limit_kind'], table['det.limit_max'], table['det.limit_retry']]);
      expect(block.textContent).toContain('Ada');
      expect(block.textContent).toContain('200');
      expect(container.textContent).not.toContain('hidden');
      expect(container.textContent).not.toContain(ID);
    });

    it('shows a caller that is only an id as a masked id, and any other caller as text', () => {
      const only = (data: Record<string, unknown>): DataItem => ({ ...botItem, row: { ...botItem.row, data } });
      const { container } = render(<Inspector {...props} item={only({ bot_caller: ID })} />);
      const fact = screen.getByText(table['det.caller'] as string).closest('div') as HTMLElement;
      expect(fact.textContent).not.toContain(ID);
      expect(fact.textContent).toContain(ID.slice(0, 4));
      expect(fact.querySelector('button')).not.toBeNull();
      expect(container.textContent).not.toContain(ID);
      cleanup();
      render(<Inspector {...props} item={only({ bot_caller: 'someone' })} />);
      expect((screen.getByText(table['det.caller'] as string).closest('div') as HTMLElement).textContent).toContain('someone');
    });

    it('has no Bot call block on a visit', () => {
      const { container } = render(<Inspector {...props} item={visit} />);
      expect(screen.queryByText(table['det.group_bot'] as string)).toBeNull();
      expect(blocks(container)).toHaveLength(2);
    });
  });
});
