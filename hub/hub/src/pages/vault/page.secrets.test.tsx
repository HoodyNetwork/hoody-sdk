// Vitest: what the vault page keeps after the person moved on, and the presses that must clear or wait.
// Every HeldSecret the page makes is tracked (core's holdSecret, wrapped); a value read or a decrypt that
// finishes after the entry closed, or after the value was hidden, must leave no live hold behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type { HeldSecret } from '@core';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { FIXTURE_PASSWORD, REALM_A, requestLog, resetFixtureVaults } from './fixtures';

const track = vi.hoisted(() => ({ made: [] as HeldSecret[], dropped: new Set<HeldSecret>(), gate: null as Promise<void> | null, decrypts: [] as Promise<boolean>[] }));

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));
vi.mock('@core', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const hold = m.holdSecret as (v: unknown, ctx: unknown) => HeldSecret | null;
  return {
    ...m,
    holdSecret: (v: unknown, ctx: unknown) => {
      const h = hold(v, ctx);
      if (h) {
        track.made.push(h);
        h.onDrop(() => track.dropped.add(h));
      }
      return h;
    },
  };
});
vi.mock('./crypto', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const decrypt = m.decrypt as (env: string, pw: string) => Promise<string>;
  return {
    ...m,
    decrypt: (env: string, pw: string) => {
      const run = (async () => {
        if (track.gate) await track.gate;
        return decrypt(env, pw);
      })();
      // Only whether it succeeded is kept: the plaintext never reaches the tracker.
      track.decrypts.push(run.then(() => true, () => false));
      return run;
    },
  };
});

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  track.made.length = 0;
  track.dropped.clear();
  track.gate = null;
  track.decrypts.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const live = () => track.made.filter((h) => !track.dropped.has(h));
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
// Waits until every decrypt started so far has settled and checks each one succeeded (a late plaintext is
// what these tests guard against, so a failed decrypt would prove nothing), then lets the page finish.
async function decryptsSettled() {
  expect(track.decrypts.length).toBeGreaterThan(0);
  let ok: boolean[] = [];
  await act(async () => {
    ok = await Promise.all(track.decrypts);
  });
  expect(ok.every(Boolean)).toBe(true);
  await pause(0);
}
function gate(): () => void {
  let open = () => {};
  track.gate = new Promise<void>((r) => {
    open = r;
  });
  return () => open();
}

describe('nothing is kept after the person moved on', () => {
  it('a value read that answers after the entry closed leaves no live hold', async () => {
    const { router } = await renderPage(page, { state: 'slowRead', path: `/vault?sel=github-token` });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await act(async () => {
      await router.navigate({ to: '/vault' as never, search: { in: REALM_A, sel: 'deploy.notes' } as never });
    });
    await pause(700);
    expect(requestLog.some((r) => r.method === 'GET' && r.path === '/vault/keys/github-token')).toBe(true);
    expect(live()).toEqual([]);
  });

  it('a decrypt that finishes after Cancel keeps no plaintext', async () => {
    await renderPage(page, { path: `/vault?sel=db-password` });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    const release = gate();
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    // Nothing is on screen yet, so the way out is Cancel (the same drop as hiding the value).
    await userEvent.click(screen.getByRole('button', { name: strings['value.cancel'] }));
    release();
    await decryptsSettled();
    expect(screen.queryByRole('button', { name: strings['value.hideEye'] })).toBeNull();
    expect(live()).toEqual([]);
  });

  it('a decrypt that finishes after the entry closed keeps no plaintext', async () => {
    const { router } = await renderPage(page, { path: `/vault?sel=db-password` });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    const release = gate();
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    await act(async () => {
      await router.navigate({ to: '/vault' as never, search: { in: REALM_A } as never });
    });
    release();
    await decryptsSettled();
    expect(live()).toEqual([]);
  });
});

describe('presses that clear or wait', () => {
  it('a refused Save clears both passwords and still says why', async () => {
    await renderPage(page, { path: `/vault` });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'ci-token');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-value-ci');
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) }));
    await userEvent.type(screen.getByLabelText(strings['edit.password']), 'pw-one-xyz');
    await userEvent.type(screen.getByLabelText(strings['edit.repeat']), 'pw-two-xyz');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    expect(await screen.findByText(strings['password.mismatch'])).toBeInTheDocument();
    expect((screen.getByLabelText(strings['edit.password']) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(strings['edit.repeat']) as HTMLInputElement).value).toBe('');
    expect(requestLog.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('during a save Retry-After no password can be kept and nothing is sent again', async () => {
    await renderPage(page, { state: 'rateLimited', path: `/vault` });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'ci-token');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-value-ci');
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) }));
    await userEvent.type(screen.getByLabelText(strings['edit.password']), 'pw-same-xyz');
    await userEvent.type(screen.getByLabelText(strings['edit.repeat']), 'pw-same-xyz');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    const wait = await screen.findByRole('button', { name: /Wait \d+ s/ });
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
    // The wait locks the form: the passwords cannot be typed again, Save and Enter do nothing.
    const pw = screen.getByLabelText(strings['edit.password']) as HTMLInputElement;
    const again = screen.getByLabelText(strings['edit.repeat']) as HTMLInputElement;
    await userEvent.type(pw, 'pw-later-xyz');
    await userEvent.type(again, 'pw-later-xyz{Enter}');
    expect(wait).toBeDisabled();
    await userEvent.click(wait);
    expect(pw.value).toBe('');
    expect(again.value).toBe('');
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });

  it('a 429 on Clear makes Clear wait out the Retry-After, with a countdown', async () => {
    await renderPage(page, { state: 'rateLimited', path: `/vault` });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.clear'] }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.type(within(dlg).getByRole('textbox'), 'Personal');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['clear.confirm'] }));
    expect(await screen.findByText(/Wait \d+ seconds/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['action.more'] }));
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings['action.clear']) })).toHaveAttribute('aria-disabled', 'true');
    expect(requestLog.filter((r) => r.method === 'DELETE' && r.path === '/vault')).toHaveLength(1);
  });

  it('an entry named `new` opens Replace, not New', async () => {
    await renderPage(page, { state: 'withNew', path: `/vault?sel=new` });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.replace'] }));
    const drawer = await screen.findByRole('dialog', { name: new RegExp(strings['edit.replaceTitle']) });
    expect(screen.queryByLabelText(strings['edit.name'])).toBeNull();
    // The entry's own Value field stays beside the drawer: type into the drawer's.
    await userEvent.type(within(drawer).getByLabelText(strings['edit.value']), 'fixture-new-value-0002');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1));
    expect(requestLog.find((r) => r.method === 'PUT')!.path).toBe('/vault/keys/new');
  });

  it('Clear in Global does not say Global entries stay', async () => {
    await renderPage(page, { path: '/vault', realm: 'all' });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.clear'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg.textContent).not.toMatch(/Global stay/);
    expect(dlg).toHaveTextContent('Every entry of Global is removed');
  });
});
