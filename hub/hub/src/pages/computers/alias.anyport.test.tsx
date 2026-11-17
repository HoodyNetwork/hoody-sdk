// An alias needs nothing running. The Aliases section has its own Create alias, shown whatever listens and while the
// computer is stopped; it opens the alias drawer with no port, where the person types any port from 1 to 65535. The
// computer's listening web ports are shortcuts under the field: they fill it and never decide whether the alias can
// be made. The send is the same one a port row makes ({computer_id, program: 'http', port, alias}), and a port the
// listeners show as Hoody's is still refused when typed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import { classifyRuntime, fixtureWorld } from '@core';
import type * as Core from '@core';
import type * as dataModule from './data';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

// Alias creates as they were sent (the request body): a rule put before the page's own answers the create route (core's
// aliasRoutes.create, the route the page sends on) and records it. The page's fixtures are not edited.
const aliasSends = vi.hoisted(() => [] as { body: unknown }[]);
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      const rule = real.reply(real.aliasRoutes.create, (r) => {
        aliasSends.push({ body: r.body });
        const b = (r.body ?? {}) as { alias?: string; port?: number };
        return real.answers.ok({ data: { id: `sent-${aliasSends.length}`, alias: b.alias, url: `https://${b.alias}.example.test`, index: b.port, program: 'http', created_at: '2026-11-13T00:00:00Z' } });
      });
      return real.bootFixtureCore({ ...o, rules: [rule, ...(o.rules ?? [])] });
    },
  };
});

// What the drawer and the tab were given for a computer's listeners: `asked` records every useRuntime call; `mode`
// replaces the answer of a running computer.
const asked: { id: string | undefined; enabled: boolean }[] = [];
let mode: 'real' | 'mixed' | 'failed' | 'none' = 'real';
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useRuntime: (id: string | undefined, enabled: boolean) => {
      asked.push({ id, enabled });
      const q = real.useRuntime(id, enabled);
      if (!enabled || mode === 'real') return q;
      if (mode === 'failed') return { ...q, data: undefined, isError: true, error: new Error('read failed') };
      if (!q.data) return q;
      if (mode === 'none') return { ...q, data: { ...q.data, yours: [], system: [] } };
      // A web port of the person's own, a database port (not web), and a Hoody kit program's port.
      const rows = classifyRuntime({ network_services: [
        { port: 3000, program: 'node', protocol: 'tcp', ip: '0.0.0.0', path: '/home/me/app/node', args: 'node server.js' },
        { port: 5432, program: 'postgres', protocol: 'tcp', ip: '0.0.0.0', path: '/opt/pg/bin/postgres', args: 'postgres' },
        { port: 12002, program: '/hoody/plugins/', protocol: 'tcp', ip: '0.0.0.0', path: '/hoody/plugins/hoody-dom/hd', args: '/hoody/plugins/hoody-dom/hd serve' },
      ] });
      return { ...q, data: { ...q.data, yours: rows.yours, system: [7681] } };
    },
  };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar');
const ATLAS = '/computers?sel=atlas.00a1';
const CEDAR = '/computers?sel=cedar.00c3';
const portBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['aliasd.port'] }) as HTMLInputElement;
const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['aliasd.name'] }) as HTMLInputElement;
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['aliasd.go'] });
const aliasSection = async () => {
  const h = await screen.findByRole('heading', { name: strings['alias.title'] }, { timeout: 8000 });
  return h.closest('section') as HTMLElement;
};
const openAny = async (path: string) => {
  await renderPage(page, { path });
  return screen.findByRole('dialog', { name: strings['alias.make'] }, { timeout: 8000 });
};

beforeEach(() => {
  asked.length = 0;
  aliasSends.length = 0;
  mode = 'real';
});

describe('computers: an alias for any port, with nothing running', () => {
  it('the Aliases section offers Create alias when nothing listens, and it opens the drawer with a Port field', async () => {
    mode = 'none';
    await renderPage(page, { path: `${ATLAS}&tab=ports` });
    const sec = await aliasSection();
    await screen.findByText(strings['ports.empty'], undefined, { timeout: 8000 });
    await userEvent.click(within(sec).getByRole('button', { name: strings['alias.make'] }));
    const d = await screen.findByRole('dialog', { name: strings['alias.make'] });
    expect(portBox(d)).toHaveValue('');
    expect(d).toHaveTextContent(strings['aliasd.ledeAny']);
    // No port yet: nothing to send.
    expect(go(d)).toBeDisabled();
  }, 40000);

  it('a stopped computer: the section still offers it, no listener read is asked for, and a typed port can be sent', async () => {
    if (!cedar) throw new Error('no cedar');
    await renderPage(page, { path: `${CEDAR}&tab=ports` });
    await screen.findByText(interpolate(strings['ports.notRunning'], { name: 'cedar' }), undefined, { timeout: 8000 });
    const sec = await aliasSection();
    await userEvent.click(within(sec).getByRole('button', { name: strings['alias.make'] }));
    const d = await screen.findByRole('dialog', { name: strings['alias.make'] });
    await userEvent.type(portBox(d), '8080');
    await waitFor(() => expect(go(d)).toBeEnabled());
    // Never read while the computer is not running: the drawer does not wait for listeners that cannot answer.
    expect(asked.filter((a) => a.id === cedar.id).length).toBeGreaterThan(0);
    expect(asked.filter((a) => a.id === cedar.id && a.enabled)).toEqual([]);
    const name = nameBox(d).value;
    await userEvent.click(go(d));
    await waitFor(() => expect(aliasSends).toHaveLength(1));
    expect(aliasSends[0]!.body).toEqual({ computer_id: cedar.id, program: 'http', port: 8080, alias: name });
  }, 40000);

  it('a typed port nothing listens on is sent with the same body a port row sends', async () => {
    if (!atlas) throw new Error('no atlas');
    mode = 'none';
    const d = await openAny(links.alias('atlas.00a1'));
    await userEvent.type(portBox(d), '8080');
    await waitFor(() => expect(go(d)).toBeEnabled());
    const name = nameBox(d).value;
    await userEvent.click(go(d));
    await waitFor(() => expect(aliasSends).toHaveLength(1));
    expect(aliasSends[0]!.body).toEqual({ computer_id: atlas.id, program: 'http', port: 8080, alias: name });
    // One press, one send.
    await new Promise((r) => setTimeout(r, 300));
    expect(aliasSends).toHaveLength(1);
  }, 40000);

  it('only a whole port from 1 to 65535 can be sent; the first and the last are fine', async () => {
    mode = 'none';
    const d = await openAny(links.alias('atlas.00a1'));
    for (const bad of ['0', '65536', '80.5', 'abc', '-1', '123456']) {
      await userEvent.clear(portBox(d));
      await userEvent.type(portBox(d), bad);
      expect(go(d), bad).toBeDisabled();
      expect(d, bad).toHaveTextContent(strings['aliasd.portRule']);
    }
    for (const ok of ['1', '65535']) {
      await userEvent.clear(portBox(d));
      await userEvent.type(portBox(d), ok);
      await waitFor(() => expect(go(d), ok).toBeEnabled());
      expect(d, ok).not.toHaveTextContent(strings['aliasd.portRule']);
    }
    expect(aliasSends).toHaveLength(0);
  }, 40000);

  it('listening web ports are shortcuts that fill the field; a port not among them can still be sent', async () => {
    mode = 'mixed';
    const d = await openAny(links.alias('atlas.00a1'));
    const row = await within(d).findByRole('list', { name: strings['aliasd.listening'] });
    // The person's own web port only: not the database port, not the Hoody kit port, not Hoody's own.
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['3000']);
    await userEvent.click(within(row).getByRole('button', { name: '3000' }));
    expect(portBox(d)).toHaveValue('3000');
    await waitFor(() => expect(go(d)).toBeEnabled());
    await userEvent.clear(portBox(d));
    await userEvent.type(portBox(d), '9000');
    await waitFor(() => expect(go(d)).toBeEnabled());
    // A port the Hub does not call web (a database's) is the person's choice: no warning, not refused.
    await userEvent.clear(portBox(d));
    await userEvent.type(portBox(d), '5432');
    await waitFor(() => expect(go(d)).toBeEnabled());
    expect(d).not.toHaveTextContent(interpolate(strings['aliasd.kit'], { port: 5432 }));
  }, 40000);

  it('with the listeners unread (the read failed) there are no shortcuts, and a typed port can still be sent', async () => {
    mode = 'failed';
    const d = await openAny(links.alias('atlas.00a1'));
    expect(within(d).queryByRole('list', { name: strings['aliasd.listening'] })).toBeNull();
    await userEvent.type(portBox(d), '8080');
    await waitFor(() => expect(go(d)).toBeEnabled());
  }, 40000);

  it('a typed port the listeners show as Hoody\'s is refused in the field, and nothing is sent', async () => {
    mode = 'mixed';
    const d = await openAny(links.alias('atlas.00a1'));
    for (const port of [12002, 7681]) {
      await userEvent.clear(portBox(d));
      await userEvent.type(portBox(d), String(port));
      await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['aliasd.kit'], { port })));
      expect(go(d)).toBeDisabled();
    }
    // The field stays, so another port can be typed.
    await userEvent.clear(portBox(d));
    await userEvent.type(portBox(d), '8080');
    await waitFor(() => expect(go(d)).toBeEnabled());
    expect(aliasSends).toHaveLength(0);
  }, 40000);

  it('a typed port from the fixed list of Hoody kit ports is refused whatever the computer\'s state, listeners or not', async () => {
    // Stopped (no listeners are read), and running with nothing listening.
    for (const path of [links.alias('cedar.00c3'), links.alias('atlas.00a1')]) {
      mode = 'none';
      const view = await renderPage(page, { path });
      const d = await screen.findByRole('dialog', { name: strings['alias.make'] }, { timeout: 8000 });
      for (const port of [45, 3999]) {
        await userEvent.clear(portBox(d));
        await userEvent.type(portBox(d), String(port));
        await waitFor(() => expect(d, `${path} ${port}`).toHaveTextContent(interpolate(strings['aliasd.kit'], { port })));
        expect(go(d)).toBeDisabled();
      }
      await userEvent.clear(portBox(d));
      await userEvent.type(portBox(d), '8080');
      await waitFor(() => expect(go(d)).toBeEnabled());
      view.unmount();
    }
    expect(aliasSends).toHaveLength(0);
  }, 60000);

  it('a port row\'s drawer is unchanged: its port is fixed, with no Port field', async () => {
    await renderPage(page, { path: links.alias('atlas.00a1', 3000) });
    const d = await screen.findByRole('dialog', { name: interpolate(strings['aliasd.title'], { port: 3000 }) }, { timeout: 8000 });
    expect(within(d).queryByRole('textbox', { name: strings['aliasd.port'] })).toBeNull();
    expect(await within(d).findByRole('textbox', { name: strings['aliasd.name'] })).toBeInTheDocument();
  }, 40000);
});
