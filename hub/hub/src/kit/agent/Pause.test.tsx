// PauseControl and PauseBand: the one description, the paused strip with Resume, the band in an open
// conversation, "may be paused" after a lost change, and the polling a mounted surface keeps.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { agent } from '@core';
import { PauseBand, PauseControl, usePauseDescription, usePauseToggle } from './Pause';
import { createPauseStore, type PauseStore } from './pause';

type Answer = Awaited<ReturnType<agent.PauseApi['get']>>;
const st = (paused: boolean, gen: number) => ({ paused, since_ms: paused ? 1000 : 0, gen });
const ok = (b: unknown): Answer => ({ ok: true, body: b });
const err = (kind: 'pending' | 'failed', status = 0, code = ''): Answer => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const DESC = 'Pausing holds every agent on atlas, in every realm, before its next step. Messages you send are taken and wait. A step already running finishes. Shell jobs keep running. Nothing is cancelled.';

let getA: Answer, setA: Answer, calls: string[], store: PauseStore;
beforeEach(() => {
  vi.useFakeTimers();
  getA = ok(st(false, 1)); setA = ok(st(true, 2)); calls = [];
  store = createPauseStore({ api: { get: () => { calls.push('get'); return Promise.resolve(getA); }, set: (p) => { calls.push(`set ${p}`); return Promise.resolve(setA); } } });
});
afterEach(() => { store.reset(); vi.useRealTimers(); });
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });

describe('PauseControl', () => {
  it('running: a Pause button described by the one published text; pressing sends one PUT and turns the foot to the paused strip with Resume', async () => {
    render(<PauseControl store={store} computer="atlas" />);
    await flush();
    const b = screen.getByRole('button', { name: /Pause agents/ });
    expect(b).toHaveAccessibleDescription(DESC);
    fireEvent.click(b);
    await flush();
    expect(calls).toContain('set true');
    expect(screen.getByText('Paused · turns wait at their next step')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });
  it('paused: Resume sends the PUT back', async () => {
    getA = ok(st(true, 3)); setA = ok(st(false, 4));
    render(<PauseControl store={store} computer="atlas" />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await flush();
    expect(calls).toContain('set false');
    expect(screen.getByRole('button', { name: /Pause agents/ })).toBeInTheDocument();
  });
  it('a lost answer reads "May be paused" with Check again, never paused and never failed; Check again reads', async () => {
    render(<PauseControl store={store} computer="atlas" />);
    await flush();
    setA = err('pending'); getA = err('pending');
    fireEvent.click(screen.getByRole('button', { name: /Pause agents/ }));
    await flush();
    expect(screen.getByText('May be paused')).toBeInTheDocument();
    expect(screen.queryByText(/Paused ·/)).toBeNull();
    expect(calls.filter((c) => c.startsWith('set')).length).toBe(1);
    getA = ok(st(true, 9));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await flush();
    expect(screen.getByText('Paused · turns wait at their next step')).toBeInTheDocument();
    expect(screen.queryByText('May be paused')).toBeNull();
  });
  it('polls every 30 s while mounted and stops when it unmounts', async () => {
    const r = render(<PauseControl store={store} computer="atlas" />);
    await flush();
    expect(calls).toEqual(['get']);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(calls).toEqual(['get', 'get']);
    r.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(90000); });
    expect(calls.length).toBe(2);
  });
  it('event.pause_state moves the foot', async () => {
    render(<PauseControl store={store} computer="atlas" />);
    await flush();
    act(() => store.apply({ paused: true, sinceMs: 5, gen: 7 }));
    expect(screen.getByText('Paused · turns wait at their next step')).toBeInTheDocument();
    act(() => store.apply({ paused: false, sinceMs: 0, gen: 8 }));
    expect(screen.queryByText(/Paused ·/)).toBeNull();
  });
});

describe('PauseBand', () => {
  it('nothing while running; paused: a warn band with Resume; resuming it removes the band', async () => {
    getA = ok(st(true, 3)); setA = ok(st(false, 4));
    const { container } = render(<PauseBand store={store} computer="atlas" />);
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Agents on atlas are paused. Messages you send are taken and wait for Resume.');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await flush();
    expect(container.textContent).toBe('');
  });
  it('a lost change reads "may be paused", not paused; a refused change says nothing changed', async () => {
    render(<PauseBand store={store} computer="atlas" />);
    await flush();
    setA = err('pending'); getA = err('pending');
    act(() => { void store.set(true); });
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/may be paused/);
    store.reset();
    await flush();
    setA = err('failed', 400, 'bad_request'); getA = ok(st(false, 1));
    act(() => { void store.set(true); });
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('The agent refused the change, so nothing changed (bad_request).');
  });
});

describe('the one description', () => {
  function Probe({ computer }: { computer: string }) { return <p>{usePauseDescription(computer)}</p>; }
  it('is the published sentence with the computer name', () => {
    render(<Probe computer="atlas" />);
    expect(screen.getByText(DESC)).toBeInTheDocument();
  });
});

describe('a refused Resume', () => {
  it('keeps the paused band and its Resume beside the refusal', async () => {
    getA = ok(st(true, 3)); setA = err('failed', 403, 'forbidden');
    render(<PauseBand store={store} computer="atlas" />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await flush();
    const band = screen.getByRole('alert');
    expect(band).toHaveTextContent('Agents on atlas are paused.');
    expect(band).toHaveTextContent('The agent refused the change, so nothing changed (forbidden).');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
  });
  it('a read that answers afterwards clears the old refusal', async () => {
    getA = ok(st(true, 3)); setA = err('failed', 403, 'forbidden');
    render(<PauseBand store={store} computer="atlas" />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await flush();
    await act(async () => { await store.refresh(); });
    expect(screen.getByRole('alert')).not.toHaveTextContent('refused');
  });
});

// Pause and Resume keep focus while their change is on its way.
describe('PauseControl: the pressed button keeps focus while its change is pending', () => {
  it('Pause: pending is aria-disabled and focused, never disabled; a second press sends nothing', async () => {
    let release: (a: Answer) => void = () => {};
    store = createPauseStore({ api: { get: () => Promise.resolve(getA), set: (p) => { calls.push(`set ${p}`); return new Promise<Answer>((r) => { release = r; }); } } });
    render(<PauseControl store={store} computer="atlas" />);
    await flush();
    const b = screen.getByRole('button', { name: /Pause agents|Pausing/ }) as HTMLButtonElement;
    b.focus();
    fireEvent.click(b);
    await flush();
    const busy = screen.getByRole('button', { name: /Pausing/ }) as HTMLButtonElement;
    expect(busy.disabled).toBe(false);
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(busy);
    fireEvent.click(busy);
    expect(calls.filter((c) => c === 'set true')).toHaveLength(1);
    release(setA); await flush();
  });
});

// The AI foot is quiet (no Pause button while running) and offers the pause in its gear menu through
// usePauseToggle; Rules & safety keeps the full control. Both reach the store's one change.
function MenuItem({ store: st }: { store: PauseStore }) {
  const t = usePauseToggle(st);
  return t ? <button type="button" data-item={t.kind} disabled={t.isDisabled} onClick={t.run}>{t.label}</button> : <span data-item="none" />;
}

describe('usePauseToggle and the quiet foot', () => {
  it('running: the quiet foot shows no button; the menu item pauses through the same change as the full control, one at a time', async () => {
    const { container } = render(
      <>
        <div data-testid="foot"><PauseControl store={store} computer="atlas" rail quiet /></div>
        <MenuItem store={store} />
        <div data-testid="rules"><PauseControl store={store} computer="atlas" /></div>
      </>,
    );
    await flush();
    expect(screen.getByTestId('foot').querySelector('[data-pause="running"]')).not.toBeNull();
    expect(screen.getByTestId('foot').querySelector('button')).toBeNull();
    const item = container.querySelector<HTMLButtonElement>('[data-item="pause"]')!;
    expect(item.textContent).toBe('Pause agents');
    const setSpy = vi.spyOn(store, 'set');
    fireEvent.click(item);
    await flush();
    expect(setSpy).toHaveBeenCalledWith(true);
    expect(calls.filter((c) => c === 'set true').length).toBe(1);
    // Paused: the foot shows its strip with Resume, the item turns Resume, and both send the same change back.
    expect(screen.getByTestId('foot').querySelector('[data-pause="paused"]')).not.toBeNull();
    expect(container.querySelector('[data-item="resume"]')!.textContent).toBe('Resume');
    setA = ok(st(false, 5));
    fireEvent.click(container.querySelector('[data-item="resume"]')!);
    await flush();
    expect(setSpy).toHaveBeenLastCalledWith(false);
    expect(calls.filter((c) => c.startsWith('set')).length).toBe(2);
  });
  it('a change in flight disables the item and the full control alike: a second press anywhere sends nothing', async () => {
    let release!: () => void;
    const slow = createPauseStore({ api: { get: () => Promise.resolve(ok(st(false, 1))), set: () => { calls.push('slow set'); return new Promise((r) => { release = () => r(ok(st(true, 2))); }); } } });
    const { container } = render(
      <>
        <MenuItem store={slow} />
        <div data-testid="rules"><PauseControl store={slow} computer="atlas" /></div>
      </>,
    );
    await flush();
    fireEvent.click(container.querySelector('[data-item="pause"]')!);
    await flush();
    expect((container.querySelector('[data-item="pause"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-item="pause"]')!.textContent).toBe('Pausing…');
    fireEvent.click(screen.getByTestId('rules').querySelector('button')!);
    await flush();
    expect(calls.filter((c) => c === 'slow set').length).toBe(1);
    release();
    await flush();
    slow.reset();
  });
  it('before the first read answers the toggle is not known (a menu offers nothing: the computer may already be paused)', async () => {
    let answer!: (a: Answer) => void;
    const first = createPauseStore({ api: { get: () => new Promise((r) => { answer = r; }), set: () => Promise.resolve(ok(st(true, 2))) } });
    const seen: (boolean | null)[] = [];
    function Probe() {
      const t = usePauseToggle(first);
      seen.push(t ? t.known : null);
      return null;
    }
    render(<><Probe /><PauseControl store={first} computer="atlas" rail quiet /></>);
    await flush();
    expect(seen.at(-1)).toBe(false);
    answer(ok(st(true, 3)));
    await flush();
    expect(seen.at(-1)).toBe(true);
    first.reset();
  });
  it('unknown (a lost answer): no item; the quiet foot shows "May be paused" with Check again', async () => {
    const { container } = render(
      <>
        <div data-testid="foot"><PauseControl store={store} computer="atlas" rail quiet /></div>
        <MenuItem store={store} />
      </>,
    );
    await flush();
    setA = err('pending'); getA = err('pending');
    fireEvent.click(container.querySelector('[data-item="pause"]')!);
    await flush();
    expect(container.querySelector('[data-item="none"]')).not.toBeNull();
    expect(screen.getByText('May be paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });
});

describe('PauseControl describedBy: the description where the host shows it', () => {
  it('the Pause button is described by the host\'s visible text, and its own screen-reader copy is left out: the text is read once', async () => {
    render(<><span id="host-help">{DESC}</span><PauseControl store={store} computer="atlas" describedBy="host-help" /></>);
    await flush();
    const b = screen.getByRole('button', { name: /Pause agents/ });
    expect(b).toHaveAttribute('aria-describedby', 'host-help');
    expect(b).toHaveAccessibleDescription(DESC);
    expect(screen.getAllByText(DESC)).toHaveLength(1);
  });
  it('without it (the rail foot) the button keeps its own screen-reader description', async () => {
    render(<PauseControl store={store} computer="atlas" />);
    await flush();
    const b = screen.getByRole('button', { name: /Pause agents/ });
    expect(b.getAttribute('aria-describedby')).not.toBe('host-help');
    expect(b).toHaveAccessibleDescription(DESC);
    expect(screen.getAllByText(DESC)).toHaveLength(1);
  });
});

