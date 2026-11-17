// Item 99: New browser with options. Add reads first and sends one start; a running browser is never started again
// with options it would ignore; an unknown start is read back, never resent on its own; nothing secret is kept.
import { answers, boardFixtureRoute, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer } from '@core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { Activity } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { BrowserForm } from './BrowserForm';

const START = '/api/v1/browser/start';
const DEVTOOLS = '/api/v1/browser/devtools-url';
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;

const starts: Array<Record<string, string>> = [];
const reads: Array<Record<string, string>> = [];
let up: () => FixtureAnswer = () => answers.refused(404, 'NOT_FOUND');
let start: () => FixtureAnswer = () => answers.ok({ sessionId: 's' });
const onPick = vi.fn();
const onBack = vi.fn();

beforeEach(() => {
  starts.length = 0; reads.length = 0; onPick.mockReset(); onBack.mockReset();
  up = () => answers.refused(404, 'NOT_FOUND');
  start = () => answers.ok({ sessionId: 's' });
  bootFixtureCore({
    rules: [
      reply(boardFixtureRoute('browser', 'GET', DEVTOOLS), (req) => { reads.push({ ...req.query }); return up(); }),
      reply(boardFixtureRoute('browser', 'GET', START), (req) => { starts.push({ ...req.query }); return start(); }),
    ],
  });
});
afterEach(() => { cleanup(); });

const view = () => render(<BrowserForm computer={computer} taken={[1]} max={7500} onPick={onPick} onBack={onBack} />);
const startButton = (n: number) => screen.getByRole('button', { name: `Start browser-${n}` });

describe('BrowserForm: one start, with only what changed', () => {
  it('nothing changed: a read of browser-2, then one start with the kit\'s defaults; the pick is its display', async () => {
    const user = userEvent.setup();
    view();
    await user.click(startButton(2));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(reads).toEqual([{ start: 'false' }]);
    expect(starts).toEqual([{ start: 'true', showBrowser: 'true' }]);
    expect(onPick).toHaveBeenCalledWith({ project: computer.project_id, computer: computer.id, program: 'browser', session: 2, view: 'display' });
  });

  it('a proxy with its password: sent once in the start; the tile keeps neither', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: /^Network/ }));
    await user.type(screen.getByRole('textbox', { name: 'Proxy address' }), 'socks5://10.0.0.2:1080');
    await user.type(screen.getByRole('textbox', { name: 'Proxy user' }), 'me');
    await user.type(screen.getByLabelText('Proxy password'), 'pw-secret');
    await user.click(startButton(2));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(starts).toEqual([{ start: 'true', showBrowser: 'true', proxyServer: 'socks5://10.0.0.2:1080', proxyUsername: 'me', proxyPassword: 'pw-secret' }]);
    expect(JSON.stringify(onPick.mock.calls)).not.toContain('pw-secret');
  });

  it('a field core would refuse: its folded section opens and names it; nothing is read or sent', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: /^Network/ }));
    await user.type(screen.getByRole('textbox', { name: 'Proxy address' }), 'ftp://x');
    await user.click(screen.getByRole('button', { name: /^Network/ }));
    expect(screen.getByRole('button', { name: /^Network/ })).toHaveAttribute('aria-expanded', 'false');
    await user.click(startButton(2));
    expect(screen.getByRole('button', { name: /^Network/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Start with http://, https://, socks5:// or socks5h://.')).toBeTruthy();
    expect([reads.length, starts.length]).toEqual([0, 0]);
  });

  it('Firefox: the Chromium-only options are disabled with why, and the start names the engine without stealth', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: /Engine/ }));
    await user.click(await screen.findByRole('option', { name: 'Firefox' }));
    expect(screen.getByRole('switch', { name: 'Stealth' })).toBeDisabled();
    expect(screen.getAllByText('Chromium only.').length).toBeGreaterThan(0);
    await user.click(startButton(2));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(starts).toEqual([{ start: 'true', showBrowser: 'true', browser: 'firefox' }]);
  });
});

describe('BrowserForm: never options a running browser would ignore', () => {
  it('browser-2 already runs: nothing is sent, and the next Start goes to browser-3', async () => {
    const user = userEvent.setup();
    up = () => answers.ok({ webSocketDebuggerUrl: null, devtoolsHttpUrl: null });
    view();
    await user.click(startButton(2));
    expect(await screen.findByText(/browser-2 is already running, so its options can't change/)).toBeTruthy();
    expect(starts).toHaveLength(0);
    up = () => answers.refused(404, 'NOT_FOUND');
    await user.click(startButton(3));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ session: 3 })));
    expect(starts).toHaveLength(1);
  });

  it('the read fails: nothing is sent, Start comes back on the same number', async () => {
    const user = userEvent.setup();
    up = () => answers.pending5xx(503);
    view();
    await user.click(startButton(2));
    expect(await screen.findByText(/Couldn't check whether browser-2 is running, so nothing was sent/)).toBeTruthy();
    expect(starts).toHaveLength(0);
    expect(startButton(2)).toBeEnabled();
  });
});

describe('BrowserForm: an unknown start is read back, never resent on its own', () => {
  it('Check again finds it running: the pick, with one start sent', async () => {
    const user = userEvent.setup();
    start = () => answers.pending5xx();
    view();
    await user.click(startButton(2));
    expect(await screen.findByText(/Starting browser-2 may have gone through/)).toBeTruthy();
    expect(startButton(2)).toBeDisabled();
    up = () => answers.ok({ devtoolsHttpUrl: 'https://x-cdp-2.example/json/version' });
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ session: 2 })));
    expect(starts).toHaveLength(1);
  });

  it('Check again finds nothing yet: still unknown; only a press starts that same number again, with no read first', async () => {
    const user = userEvent.setup();
    start = () => answers.pending5xx();
    view();
    await user.click(startButton(2));
    await screen.findByText(/Starting browser-2 may have gone through/);
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(/browser-2 isn't running yet/)).toBeTruthy();
    expect(starts).toHaveLength(1);
    const readsBefore = reads.length;
    start = () => answers.ok({ sessionId: 's' });
    await user.click(startButton(2));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ session: 2 })));
    expect([starts.length, reads.length]).toEqual([2, readsBefore]);
  });

  it('a second try refused settles nothing about the first: still unknown, with Check again', async () => {
    const user = userEvent.setup();
    start = () => answers.pending5xx();
    view();
    await user.click(startButton(2));
    await screen.findByText(/Starting browser-2 may have gone through/);
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    await screen.findByText(/browser-2 isn't running yet/);
    start = () => ({ status: 400, body: { error: 'x', code: 'VALIDATION_ERROR' } });
    await user.click(startButton(2));
    expect(await screen.findByText(/The second try did not go through.*The first start of browser-2 may still land/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a refusal says why (the kit\'s code) and Start comes back', async () => {
    const user = userEvent.setup();
    start = () => ({ status: 400, body: { error: 'bad', code: 'VALIDATION_ERROR' } });
    view();
    await user.click(startButton(2));
    expect(await screen.findByText('The browser could not start (VALIDATION_ERROR).')).toBeTruthy();
    expect(startButton(2)).toBeEnabled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a refusal offers its Details (status, code, route) and they never carry the proxy password', async () => {
    const user = userEvent.setup();
    start = () => ({ status: 400, body: { error: 'bad', code: 'VALIDATION_ERROR' } });
    view();
    await user.click(screen.getByRole('button', { name: /^Network/ }));
    await user.type(screen.getByRole('textbox', { name: 'Proxy address' }), 'socks5://10.0.0.2:1080');
    await user.type(screen.getByLabelText('Proxy password'), 'pw-secret');
    await user.click(startButton(2));
    await screen.findByText('The browser could not start (VALIDATION_ERROR).');
    await user.click(screen.getByRole('button', { name: 'Details' }));
    const facts = document.body.textContent ?? '';
    expect(facts).toMatch(/Status\s*400/);
    expect(facts).toMatch(/Code\s*VALIDATION_ERROR/);
    expect(facts).toContain('/api/v1/browser/start');
    expect(facts).not.toContain('pw-secret');
  });
});

describe('BrowserForm: the form', () => {
  it('paired fields share one row (width + height, latitude + longitude), and the duplicate "only when it starts" note is gone', async () => {
    const user = userEvent.setup();
    view();
    expect(screen.queryByText(/A browser that is already running keeps its own/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Identity/ }));
    // The NumberField's input (its step buttons carry the label too).
    const rowOf = (label: string) => screen.getByRole('textbox', { name: new RegExp(`^${label}`) }).closest('[class*="j_start"]');
    expect(rowOf('Window width')).not.toBeNull();
    expect(rowOf('Window width')).toBe(rowOf('Window height'));
    expect(rowOf('Latitude')).not.toBeNull();
    expect(rowOf('Latitude')).toBe(rowOf('Longitude'));
    expect(rowOf('Latitude')).not.toBe(rowOf('Window width'));
    await act(async () => {});
  });

  it('Back goes back; the fingerprint profile names the two shipped ones', async () => {
    const user = userEvent.setup();
    view();
    const fp = screen.getByRole('textbox', { name: 'Fingerprint profile' });
    expect(within(fp.closest('div')!.parentElement!).getByText(/Shipped: default and kiosk-1080p/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    await act(async () => {});
  });

  it('the number stays in the browser range: with 1 and 7500 held, Start browser-2', () => {
    render(<BrowserForm computer={computer} taken={[1, 7500]} max={7500} onPick={onPick} onBack={onBack} />);
    expect(startButton(2)).toBeTruthy();
  });

  it('past the range\'s last number the lowest free one; a read finding it running moves on, and a full range says so', async () => {
    const user = userEvent.setup();
    up = () => answers.ok({ devtoolsHttpUrl: null });
    render(<BrowserForm computer={computer} taken={[1, 3]} max={3} onPick={onPick} onBack={onBack} />);
    await user.click(startButton(2));
    expect(await screen.findByText(/no free browser number left/)).toBeTruthy();
    expect(starts).toHaveLength(0);
  });

  it('Firefox: extension folders are disabled with why', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: /^Extensions/ }));
    await user.click(screen.getByRole('button', { name: /Engine/ }));
    await user.click(await screen.findByRole('option', { name: 'Firefox' }));
    expect(screen.getByRole('textbox', { name: 'Extension folders on the computer' })).toBeDisabled();
  });

  it('a kept Board hidden and shown again: the proxy password is wiped', async () => {
    const user = userEvent.setup();
    const at = (on: boolean) => <Activity mode={on ? 'visible' : 'hidden'}><BrowserForm computer={computer} taken={[1]} max={7500} onPick={onPick} onBack={onBack} /></Activity>;
    const v = render(at(true));
    await user.click(screen.getByRole('button', { name: /^Network/ }));
    await user.type(screen.getByRole('textbox', { name: 'Proxy address' }), 'socks5://10.0.0.2:1080');
    await user.type(screen.getByLabelText('Proxy password'), 'pw-secret');
    expect(screen.getByLabelText('Proxy password')).toHaveValue('pw-secret');
    v.rerender(at(false));
    await act(async () => {});
    v.rerender(at(true));
    await act(async () => {});
    expect(screen.getByLabelText('Proxy password')).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Proxy address' })).toHaveValue('socks5://10.0.0.2:1080');
  });

  it('keyboard: focus lands in the form, Tab reaches the folded sections and Enter opens one', async () => {
    const user = userEvent.setup();
    view();
    expect(document.querySelector('form')!.contains(document.activeElement)).toBe(true);
    const identity = screen.getByRole('button', { name: /^Identity/ });
    for (let i = 0; i < 12 && document.activeElement !== identity; i++) await user.tab();
    expect(document.activeElement).toBe(identity);
    await user.keyboard('{Enter}');
    expect(identity).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'User agent' })).toBeTruthy();
  });

  it('an unknown start, then the kept Board hidden and shown again: the retry sends only what the field shows (no password)', async () => {
    const user = userEvent.setup();
    start = () => answers.pending5xx();
    const at = (on: boolean) => <Activity mode={on ? 'visible' : 'hidden'}><BrowserForm computer={computer} taken={[1]} max={7500} onPick={onPick} onBack={onBack} /></Activity>;
    const v = render(at(true));
    await user.click(screen.getByRole('button', { name: /^Network/ }));
    await user.type(screen.getByRole('textbox', { name: 'Proxy address' }), 'socks5://10.0.0.2:1080');
    await user.type(screen.getByLabelText('Proxy password'), 'pw-secret');
    await user.click(startButton(2));
    await screen.findByText(/Starting browser-2 may have gone through/);
    expect(starts[0]?.proxyPassword).toBe('pw-secret');
    v.rerender(at(false));
    await act(async () => {});
    v.rerender(at(true));
    await act(async () => {});
    expect(screen.getByLabelText('Proxy password')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    await screen.findByText(/browser-2 isn't running yet/);
    start = () => answers.ok({ sessionId: 's' });
    await user.click(startButton(2));
    await vi.waitFor(() => expect(starts).toHaveLength(2));
    expect(starts[1]).toEqual({ start: 'true', showBrowser: 'true', proxyServer: 'socks5://10.0.0.2:1080' });
  });

  it('no free number left: says so, nothing to start', () => {
    render(<BrowserForm computer={computer} taken={[1, 2, 3]} max={3} onPick={onPick} onBack={onBack} />);
    expect(screen.getByText(/no free browser number left/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull();
  });
});
