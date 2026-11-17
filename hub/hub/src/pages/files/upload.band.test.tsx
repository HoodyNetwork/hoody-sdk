// The band's upload lines (Upload.tsx HeldUploads) from a held batch, this tab's batches played: what is
// offered at each point (Continue never at the 10-unknown cap; Dismiss only for files never sent).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@app/testing';
import type * as Data from './data';
import type * as Run from './uploadRun';
import us from './Upload.strings.en.json';

const held: { current: Data.HeldUpload[] } = { current: [] };
const mine: { current: Run.Batch[] } = { current: [] };
const canChange = { on: true };
vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), useUploadsOn: () => held.current, useCanChange: () => canChange.on }));
vi.mock('./uploadRun', async (orig) => ({ ...(await orig<typeof Run>()), useBatches: () => mine.current, useCheckNotes: () => [] }));
const { HeldUploads, resultWords } = await import('./Upload');
const C = { id: 'c1', name: 'atlas' } as never;
const entry = (k: number) => ({ id: `e${k}`, path: `/tmp/u${k}`, size: 1, sha256: 'a'.repeat(64), phase: 'unknown' as const });
const hold = (files: number, left = 0) => ({ hold: { id: 'h', inFlight: false, metaVersion: 1 }, meta: { v: 1 as const, batch: 'b1', computer: 'c1', computerName: 'atlas', folder: '/tmp', left, files: Array.from({ length: files }, (_, k) => entry(k)) } }) as never;
const batch = (notSent: number): Run.Batch => ({ id: 'b1', computer: 'c1', computerName: 'atlas', folder: '/tmp', phase: 'paused', items: Array.from({ length: notSent }, (_, i) => ({ i, as: `n${i}`, size: 1, state: 'notSent' as const, code: 'STOPPED' })) });

beforeEach(() => { held.current = []; mine.current = []; canChange.on = true; });

describe('HeldUploads', () => {
  it('unknown files and files this tab can send: Check again, Continue and Stop tracking', () => {
    held.current = [hold(1)]; mine.current = [batch(2)];
    render(<HeldUploads c={C} />);
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: us.continue })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: us.stop })).toBeInTheDocument();
    expect(screen.getByText(us['held.paused_other'].replace('{{count}}', '2').replace('{{folder}}', '/tmp'))).toBeInTheDocument();
  });
  it('changes off for this session: no Continue, on the held batch or on files this tab still has', () => {
    canChange.on = false;
    held.current = [hold(1)]; mine.current = [batch(2)];
    const { unmount } = render(<HeldUploads c={C} />);
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: us.continue })).toBeNull();
    unmount();
    held.current = [];
    render(<HeldUploads c={C} />);
    expect(screen.getByText(us['held.paused_other'].replace('{{count}}', '2').replace('{{folder}}', '/tmp'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: us.continue })).toBeNull();
  });
  it('a batch refused because changes are off says so (not the overlap words)', () => {
    const t = ((k: string) => (us as Record<string, string>)[k] ?? k) as never;
    expect(resultWords(t, { ...batch(1), phase: 'notSent', code: 'CHANGES_OFF' })).toBe(us['result.off']);
    expect(resultWords(t, { ...batch(1), phase: 'notSent', code: 'HELD_OVERLAP' })).not.toBe(us['result.off']);
  });
  it('at 10 unknown: no Continue, the words say check first', () => {
    held.current = [hold(10)]; mine.current = [batch(2)];
    render(<HeldUploads c={C} />);
    expect(screen.queryByRole('button', { name: us.continue })).toBeNull();
    expect(screen.getByText(us['held.tooMany'])).toBeInTheDocument();
  });
  it('after a reload (no batch in this tab): files never sent read pick them again; no Continue', () => {
    held.current = [hold(1, 3)];
    render(<HeldUploads c={C} />);
    expect(screen.queryByRole('button', { name: us.continue })).toBeNull();
    expect(screen.getByText(us['held.left_other'].replace('{{count}}', '3'))).toBeInTheDocument();
  });
  it('only files never sent: Dismiss (no warning), no Check again', () => {
    held.current = [hold(0, 2)];
    render(<HeldUploads c={C} />);
    expect(screen.getByRole('button', { name: us.dismiss })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: us.stop })).toBeNull();
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
  });
  it('a send out in another tab: one line, nothing to press', () => {
    held.current = [{ ...(hold(1) as object), hold: { id: 'h', inFlight: 'elsewhere', metaVersion: 1 } } as never];
    render(<HeldUploads c={C} />);
    expect(screen.getByText(us['held.elsewhere'].replace('{{folder}}', '/tmp'))).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('a running upload counts its files: "0 of 1 file", "0 of 2 files"', () => {
    const running = (n: number): Run.Batch => ({ ...batch(0), phase: 'running', items: Array.from({ length: n }, (_, i) => ({ i, as: `n${i}`, size: 1, state: 'sending' as const })) });
    mine.current = [running(1)];
    const { unmount } = render(<HeldUploads c={C} />);
    expect(screen.getByText('Uploading to /tmp: 0 of 1 file.')).toBeInTheDocument();
    unmount();
    mine.current = [running(2)];
    render(<HeldUploads c={C} />);
    expect(screen.getByText('Uploading to /tmp: 0 of 2 files.')).toBeInTheDocument();
  });
});
