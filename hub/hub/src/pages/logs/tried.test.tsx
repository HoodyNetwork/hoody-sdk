// Vitest: sentences on the Logs page that have to be true.
//  - A row that did not go well says what was tried ("Browser: tried to change"), never that it happened.
//  - With rows still on screen a computer that needs an update says so for "all of its logs"; a private computer's band
//    offers its Agent app, not "Try again"; offline offers Try again; Save this view says what a saved view keeps.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@app/testing';
import type { Snapshot } from './controller';
import { titleOf, type DataItem, type Tx } from './logic';
import { Notes, StateBox } from './parts/Bands';
import { SaveViewDialog } from './parts/Dialogs';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;
const tx = t as unknown as Tx;
const row = (method: string, status: number, serviceName = 'browser'): DataItem => ({ kind: 'kit', k: 'k', t: 0, row: { source: 'edge', kind: 'request', serviceName, method, status } } as unknown as DataItem);

describe('what a row says happened', () => {
  it('a row that went well keeps its verb', () => {
    expect(titleOf(row('PUT', 200), tx)).toBe('Browser: changed');
    expect(titleOf(row('GET', 304, 'files'), tx)).toBe('Files: opened');
  });
  it('a failed, refused or not-found row says what was tried', () => {
    expect(titleOf(row('PUT', 500), tx)).toBe('Browser: tried to change');
    expect(titleOf(row('DELETE', 404, 'agent'), tx)).toBe('Agent: tried to remove');
    expect(titleOf(row('GET', 403, 'files'), tx)).toBe('Files: tried to open');
    expect(titleOf(row('POST', 429, 'files'), tx)).toBe('Files: tried to send');
  });
});

const snapOf = (code: string): Snapshot => ({ err: { code }, items: [{ kind: 'changes', k: 'c1', t: 0, row: {} }], v: {} } as unknown as Snapshot);
const notes = (code: string, agent: string | null = null) => {
  const onRetry = vi.fn();
  render(<Notes t={t} snap={snapOf(code)} onRetry={onRetry} onResume={() => {}} onNewest={() => {}} onVisits={() => {}} onAgentUrl={agent} />);
  return onRetry;
};

describe('the band over rows that stayed after a failed read', () => {
  afterEach(cleanup);
  it('a computer that needs an update: "all of its logs", with rows under it', () => {
    notes('update');
    expect(screen.getByText(table['st.updateSome']!)).toBeInTheDocument();
    expect(screen.queryByText(table['st.update']!)).toBeNull();
  });
  it('private logs: the Agent app, not Try again', () => {
    notes('private', 'https://agent.example/');
    expect(screen.getByText(table['st.private'] + ' ' + table['st.restShown'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: table['act.agent'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: table['act.retry'] })).toBeNull();
  });
  it('private logs with no Agent address known: no button that changes nothing', () => {
    notes('private');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('offline', () => {
  afterEach(cleanup);
  it('offers Try again and promises nothing by itself', async () => {
    const onRetry = vi.fn();
    render(<StateBox t={t} err={{ code: 'offline' }} onRetry={onRetry} onAgentUrl={null} />);
    expect(table['st.offline']).not.toMatch(/show again/);
    screen.getByRole('button', { name: table['act.retry'] }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('Save this view', () => {
  afterEach(cleanup);
  it('says what is kept and what is not', () => {
    render(<SaveViewDialog t={t} logs={{ saveView: () => true } as never} isOpen onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText(table['v.saveHolds']!)).toBeInTheDocument();
    expect(table['v.saveHolds']).toMatch(/search/i);
    expect(table['v.saveHolds']).toMatch(/not kept/);
  });
});
