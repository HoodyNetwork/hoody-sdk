// A browser tile's DevTools. The address is read without starting the browser, never shown (the dialog offers
// Open DevTools and Copy only), and a browser that is not running says so.
import { answers, boardFixtureRoute, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer } from '@core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { cdpBase } from './browserStart';
import { DevToolsDialog } from './DevToolsDialog';

const DEVTOOLS = '/api/v1/browser/devtools-url';
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
const HTTP = 'https://p1-c1-cdp-4.computers.example/json/version';
const WS = 'wss://p1-c1-cdp-4.computers.example/devtools/browser/b6e7d6f4';

const reads: Array<Record<string, string>> = [];
let answer: () => FixtureAnswer = () => answers.ok({ webSocketDebuggerUrl: WS, devtoolsHttpUrl: HTTP });
beforeEach(() => {
  reads.length = 0;
  answer = () => answers.ok({ webSocketDebuggerUrl: WS, devtoolsHttpUrl: HTTP });
  bootFixtureCore({ rules: [reply(boardFixtureRoute('browser', 'GET', DEVTOOLS), (req) => { reads.push({ ...req.query }); return answer(); })] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const open = () => render(<DevToolsDialog target={{ computer, session: 4, name: 'browser-4' }} onClose={vi.fn()} />);

describe('DevToolsDialog', () => {
  it('reads with start=false; Open DevTools opens the cdp address in a new tab; the address is never shown', async () => {
    const user = userEvent.setup();
    const win = vi.spyOn(window, 'open').mockImplementation(() => null);
    open();
    const go = await screen.findByRole('button', { name: 'Open DevTools' });
    expect(reads).toEqual([{ start: 'false' }]);
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/cdp-4|containers\.example/);
    await user.click(go);
    expect(win).toHaveBeenCalledWith('https://p1-c1-cdp-4.computers.example/', '_blank', 'noopener,noreferrer');
  });

  it('not running: says so, nothing to open or copy', async () => {
    answer = () => answers.refused(404, 'NOT_FOUND');
    open();
    expect(await screen.findByText(/browser-4 is not running/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open DevTools' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy address' })).toBeNull();
  });

  it('a failed read says so and Try again reads again', async () => {
    const user = userEvent.setup();
    answer = () => answers.pending5xx(503);
    open();
    expect(await screen.findByText('The address could not be read.')).toBeTruthy();
    answer = () => answers.ok({ webSocketDebuggerUrl: WS, devtoolsHttpUrl: HTTP });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Open DevTools' })).toBeTruthy();
    expect(reads).toHaveLength(2);
  });

  it('a second opening shows nothing of the first: Reading, no Open or Copy, until its own read; a 404 then says not running', async () => {
    const target = { computer, session: 4, name: 'browser-4' };
    const v = render(<DevToolsDialog target={target} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open DevTools' });
    v.rerender(<DevToolsDialog target={null} onClose={vi.fn()} />);
    let answerNow: ((a: FixtureAnswer) => void) | null = null;
    bootFixtureCore({ rules: [reply(boardFixtureRoute('browser', 'GET', DEVTOOLS), () => new Promise<FixtureAnswer>((r) => { answerNow = r; }))] });
    v.rerender(<DevToolsDialog target={{ ...target }} onClose={vi.fn()} />);
    expect(screen.getByText('Reading the address…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open DevTools' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy address' })).toBeNull();
    await vi.waitFor(() => expect(answerNow).not.toBeNull());
    answerNow!(answers.refused(404, 'NOT_FOUND'));
    expect(await screen.findByText(/browser-4 is not running/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open DevTools' })).toBeNull();
  });

  it('a second opening whose read fails: Try again, never the first opening\'s address', async () => {
    const target = { computer, session: 4, name: 'browser-4' };
    const v = render(<DevToolsDialog target={target} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open DevTools' });
    v.rerender(<DevToolsDialog target={null} onClose={vi.fn()} />);
    answer = () => answers.pending5xx(503);
    v.rerender(<DevToolsDialog target={{ ...target }} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Open DevTools' })).toBeNull();
    expect(await screen.findByText('The address could not be read.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy address' })).toBeNull();
  });

  it('Copy address and Try again sit in a start-aligned row, never the centred tile-card actions', async () => {
    const user = userEvent.setup();
    answer = () => answers.pending5xx(503);
    open();
    const again = await screen.findByRole('button', { name: 'Try again' });
    expect(again.parentElement?.className).toMatch(/j_start/);
    expect(again.closest('[class*="cardActions"]')).toBeNull();
    answer = () => answers.ok({ webSocketDebuggerUrl: WS, devtoolsHttpUrl: HTTP });
    await user.click(again);
    const copy = await screen.findByRole('button', { name: 'Copy address' });
    expect(copy.closest('[class*="j_start"]')).not.toBeNull();
    // No centred tile-card wrapper anywhere around it, nested inside the row or outside it.
    expect(copy.closest('[class*="cardActions"]')).toBeNull();
  });

  it('an answer without an address (Firefox): says so', async () => {
    answer = () => answers.ok({ webSocketDebuggerUrl: null, devtoolsHttpUrl: null });
    open();
    expect(await screen.findByText(/gave no DevTools address/)).toBeTruthy();
  });
});

describe('cdpBase', () => {
  it('the origin of an http(s) or ws(s) address, as https or http; anything else none', () => {
    expect(cdpBase(HTTP)).toBe('https://p1-c1-cdp-4.computers.example/');
    expect(cdpBase(WS)).toBe('https://p1-c1-cdp-4.computers.example/');
    expect(cdpBase('ws://127.0.0.1:9222/devtools/browser/x')).toBe('http://127.0.0.1:9222/');
    expect([cdpBase('javascript:alert(1)'), cdpBase('file:///etc'), cdpBase(''), cdpBase(null), cdpBase('not a url')]).toEqual([null, null, null, null, null]);
  });
});
