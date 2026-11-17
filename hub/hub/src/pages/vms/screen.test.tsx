// Vitest: the Screen tab of one VM (fixtures.screen.ts). The frame is drawn only for an address the Hub built itself,
// under core's display-frame rules; a screen that cannot be shown says why and draws no frame; a key press is one
// request, a refusal says so, and a press whose answer is not known is held and never sent again.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { DISPLAY_FRAME_SANDBOX, displayFrameAllow, heldChanges } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VM_LOCK } from './changes';
import { INPUT_LOCK } from './create';
import './fixtures'; // first: the state files below are loaded by it (an import cycle the other way round)
import { keysLog } from './fixtures.screen';
import page from './page';
import { DISPLAY_MAX, displayOk, screenAddress } from './parts/Screen';
import strings from './strings.en.json';

const mocked = vi.hoisted(() => ({ framed: false }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), isFramed: () => mocked.framed }));

const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const TAB = '/vms/web-1?tab=screen';
const frame = () => document.querySelector('iframe');
const keyButton = (k: 'ctrlAltDel' | 'enter') => screen.findByRole('button', { name: strings[`screen.keys.${k}`] }, WAIT);
const soft = (b: HTMLElement) => b.getAttribute('aria-disabled') === 'true' || (b as HTMLButtonElement).disabled;

beforeEach(() => {
  mocked.framed = false;
  keysLog.length = 0;
});

describe('the Screen tab: the frame', () => {
  it('shows a running VM\'s screen in a frame the Hub built, under the display-frame rules', async () => {
    await renderPage(page, { state: 'screen-keys-ok', path: TAB });
    await keyButton('ctrlAltDel');
    await waitFor(() => expect(frame()).not.toBeNull(), WAIT);
    const f = frame()!;
    const src = f.getAttribute('src') ?? '';
    expect(src).toMatch(/^https:\/\//);
    expect(src).toContain('7001');
    expect(src).not.toMatch(/token|key=|auth/i);
    expect(f.getAttribute('sandbox')).toBe(DISPLAY_FRAME_SANDBOX);
    expect(f.getAttribute('allow')).toBe(displayFrameAllow([src]));
    expect(f.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(f.getAttribute('title')).toBe(say('screen.frame', { vm: 'web-1' }));
    expect(screen.getByRole('button', { name: strings['screen.leave'] })).toBeInTheDocument();
  });

  it('a VM without a screen says so: no frame, no keys', async () => {
    await renderPage(page, { state: 'screen-headless', path: TAB });
    expect(await screen.findByText(strings['screen.none.headless'], undefined, WAIT)).toBeInTheDocument();
    expect(frame()).toBeNull();
    expect(screen.queryByRole('button', { name: strings['screen.keys.ctrlAltDel'] })).toBeNull();
  });

  it('a stopped VM says its screen shows while it runs: no frame, keys off with the reason', async () => {
    await renderPage(page, { state: 'screen-keys-ok', path: '/vms/win11?tab=screen' });
    expect(await screen.findByText(strings['screen.none.notRunning'], undefined, WAIT)).toBeInTheDocument();
    expect(frame()).toBeNull();
    const b = await keyButton('ctrlAltDel');
    expect(soft(b)).toBe(true);
    await userEvent.click(b);
    await new Promise((r) => setTimeout(r, 200));
    expect(keysLog).toEqual([]);
  });

  it('a paused VM still shows its screen; keys are not sent', async () => {
    await renderPage(page, { state: 'screen-paused', path: TAB });
    const b = await keyButton('enter');
    await waitFor(() => expect(frame()).not.toBeNull(), WAIT);
    expect(soft(b)).toBe(true);
    await userEvent.click(b);
    await new Promise((r) => setTimeout(r, 200));
    expect(keysLog).toEqual([]);
  });

  it('inside another page: no frame, the reason, and no key is sent', async () => {
    mocked.framed = true;
    await renderPage(page, { state: 'screen-keys-ok', path: TAB });
    expect(await screen.findByText(strings['screen.none.framed'], undefined, WAIT)).toBeInTheDocument();
    expect(frame()).toBeNull();
    const b = await keyButton('ctrlAltDel');
    expect(soft(b)).toBe(true);
    await userEvent.click(b);
    await new Promise((r) => setTimeout(r, 200));
    expect(keysLog).toEqual([]);
  });
});

describe('the screen address', () => {
  it('is built only for a display number a VM can have (1 to 9999)', () => {
    expect(DISPLAY_MAX).toBe(9999);
    expect([1, 7001, 9999].map(displayOk)).toEqual([true, true, true]);
    expect([0, -1, 7.5, 10000, 65535, null].map(displayOk)).toEqual([false, false, false, false, false, false]);
    expect(screenAddress({ target: null }, 7001)).toBe('');
  });
});

describe('the Screen tab: keys', () => {
  it('one press is one request with the keys', async () => {
    await renderPage(page, { state: 'screen-keys-ok', path: TAB });
    await userEvent.click(await keyButton('ctrlAltDel'));
    await waitFor(() => expect(keysLog).toEqual([{ keys: ['ctrl', 'alt', 'delete'] }]), WAIT);
    await userEvent.click(await keyButton('enter'));
    await waitFor(() => expect(keysLog).toEqual([{ keys: ['ctrl', 'alt', 'delete'] }, { keys: ['ret'] }]), WAIT);
    expect(heldChanges(INPUT_LOCK)).toEqual([]);
  });

  it('while the list gives the name to another VM, no key is sent: it could reach that VM', async () => {
    await renderPage(page, { state: 'screen-renamed', path: TAB });
    await waitFor(() => expect(frame()).not.toBeNull(), WAIT);
    await new Promise((r) => setTimeout(r, 500)); // the list read that names the other VM
    await userEvent.click(await keyButton('ctrlAltDel'));
    expect(await screen.findByText(strings['screen.keys.unsure'], undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(await keyButton('enter'));
    await new Promise((r) => setTimeout(r, 300));
    expect(keysLog).toEqual([]);
  });

  it('a refusal says the keys were not sent, and nothing is held', async () => {
    await renderPage(page, { state: 'screen-keys-refused', path: TAB });
    await userEvent.click(await keyButton('enter'));
    expect(await screen.findByText(strings['screen.keys.failed'], { exact: false }, WAIT)).toBeInTheDocument();
    expect(keysLog).toHaveLength(1);
    expect(heldChanges(INPUT_LOCK)).toEqual([]);
  });

  it('a press whose answer is not known is held under the VM\'s input lock and never sent again', async () => {
    await renderPage(page, { state: 'screen-keys-lost', path: TAB });
    await userEvent.click(await keyButton('ctrlAltDel'));
    expect(await screen.findByText(say('screen.keys.heldText', { keys: strings['screen.keys.ctrlAltDel'], vm: 'web-1' }), { exact: false }, WAIT)).toBeInTheDocument();
    const held = heldChanges(INPUT_LOCK);
    expect(held).toHaveLength(1);
    expect(held[0]!.identity).toMatchObject({ vmId: '0195c0de00000001', what: 'keys', chord: 'ctrlAltDel' });
    // The VM's change lock (Stop, Power off) holds nothing.
    expect(heldChanges(VM_LOCK)).toEqual([]);
    const again = await keyButton('ctrlAltDel');
    expect(soft(again)).toBe(true);
    await userEvent.click(again);
    await userEvent.click(await keyButton('enter'));
    await new Promise((r) => setTimeout(r, 300));
    expect(keysLog).toHaveLength(1);
  });
});
