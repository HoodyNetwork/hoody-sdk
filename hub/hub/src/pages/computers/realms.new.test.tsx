// The Realms drawer offers New realm… beside Rename realms, under the realms page's own gate (as the shell's
// realm menu): only when this load serves the realms page, the session holds 'account' and no token pins it to one
// realm. It goes to the New realm page (/realms/new).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import type * as Kit from '@kit';
import type * as Core from '@core';
import page from './page';
import strings from './strings.en.json';

const gate = vi.hoisted(() => ({ served: true, account: true, pinned: null as string | null, go: null as null | ((to: string) => void) }));
vi.mock('@kit', async (importOriginal) => {
  const kit = await importOriginal<typeof Kit>();
  return {
    ...kit,
    useServedPageLink: (id: string) => (id === 'realms' ? (gate.served ? { kind: 'hub', href: '/realms/new' } : null) : kit.useServedPageLink(id)),
    useGo: () => {
      const go = kit.useGo();
      return (to: string) => (gate.go ? gate.go(to) : go(to));
    },
  };
});
vi.mock('@core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  return {
    ...core,
    useCan: (right: string) => (right === 'account' ? gate.account : core.useCan(right as never)),
    useRealms: () => ({ ...core.useRealms(), pinned: gate.pinned }),
  };
});

async function openDrawer() {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
  await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'atlas') }, { timeout: 30000 }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.realms'] }));
  const d = await screen.findByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) });
  expect(within(d).getByRole('checkbox', { name: /^Personal/ })).toBeInTheDocument();
  return d;
}

afterEach(() => {
  Object.assign(gate, { served: true, account: true, pinned: null, go: null });
});

describe('computers: New realm from the Realms drawer', { timeout: 60000 }, () => {
  // Without 'account' the computer menu offers no Realms… at all, so the drawer (and its New realm…) is out of reach.
  it('a session without account gets no Realms drawer to start from', async () => {
    gate.account = false;
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'atlas') }, { timeout: 30000 }));
    expect(await screen.findAllByRole('menuitem')).not.toHaveLength(0);
    expect(screen.queryByRole('menuitem', { name: strings['menu.realms'] })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New realm…' })).toBeNull();
  }, 40000);

  it('offers New realm… and goes to the New realm page', async () => {
    const go = vi.fn();
    gate.go = go;
    const d = await openDrawer();
    expect(strings['realmsd.newRealm']).toBe('New realm…');
    await userEvent.click(within(d).getByRole('button', { name: 'New realm…' }));
    expect(go).toHaveBeenCalledWith('/realms/new');
  }, 40000);

  it.each([
    ['the realms page is not served', { served: false }],
    ['a token pins the session to one realm', { pinned: 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
  ])('offers nothing when %s', async (_why, change) => {
    Object.assign(gate, change);
    const d = await openDrawer();
    expect(within(d).queryByRole('button', { name: 'New realm…' })).toBeNull();
  }, 40000);
});
