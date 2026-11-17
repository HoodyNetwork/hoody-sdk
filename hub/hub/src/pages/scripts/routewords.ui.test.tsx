// Vitest at the page: a script file named after a route pattern ([[...path]].ts) is never shown as its bracket name or as
// `/[[...path]]`. The list says it in words (name) and as the real pattern (address, with the file in the tooltip); the detail
// header and the Overview address say the same; an author's @label still wins as the name; search finds a script by its pattern.
// Replaced: the overview (one computer with these files); the rest of the page runs.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const { toItems } = await import('./logic');
  const file = (p: string, label?: string) => ({ path: `default/1/${p}`, isDirectory: false, ...(label ? { magicComments: { label } } : {}) });
  return {
    ...real,
    useOverview: () => {
      const data = useMemo(() => ({
        computers: [{
          id: 'c0a7150000000000000000a1', name: 'atlas', handle: 'a.0000', state: 'on', serverName: 'n1', realmIds: [], origin: 'https://x-exec-1.example', err: null,
          caps: { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true },
          agent: {}, agentRealm: 'global',
          rows: [file('[[...path]].ts'), file('docs/[...slug].ts'), file('users/[id].ts'), file('shop/[[...rest]].ts'), file('hello.ts'), file('items/[sku].ts', 'Item lookup'), file('solo/[...slug]/edit.ts'), file('org/[org]/[id].ts'), file('guides/.ts')],
          summary: {}, instances: {}, aliases: [], deleted: [],
        } as never],
      }), []);
      const items = useMemo(() => toItems(data.computers), [data]);
      return { data, items, isPending: false, isError: false, error: null, refetch: async () => ({ 'a.0000': [] as string[] }) };
    },
  };
});

import page from './page';
import strings from './strings.en.json';

const open = (path = '/scripts') => renderPage(page, { state: 'many', path });
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement;

describe('the Scripts list says a route file in words', () => {
  it('names each pattern by what it answers, never by the bracket name', async () => {
    open();
    for (const n of ['Every other address', 'Every address below /docs (one or more parts)', 'Users by id', 'Every address under /shop', 'Hello', 'Item lookup', 'Edit', 'Address /org/:org/:id', 'Guides']) {
      expect(await screen.findByText(n)).toBeTruthy();
    }
    expect(screen.queryByText(/\[\[?\.\.\./)).toBeNull();
    expect(screen.queryByText('/[[...path]]')).toBeNull();
  });

  it('shows the real pattern in the Address column, with the file in the tooltip', async () => {
    open();
    const tr = await rowOf('Every other address');
    const addr = within(tr).getByText('/*');
    expect(addr.getAttribute('title')).toContain('[[...path]].ts');
    expect(addr.getAttribute('title')).toContain('zero or more parts');
    expect(within(await rowOf('Users by id')).getByText('/users/:id').getAttribute('title')).toContain('one part');
    expect(within(await rowOf('Hello')).getByText('/hello').getAttribute('title')).toBe('From the file hello.ts.');
  });

  it('shows a file named only by its extension as its folder', async () => {
    open();
    expect(within(await rowOf('Guides')).getByText('/guides')).toBeTruthy();
  });

  it('says a file exec never serves is not served, not an address', async () => {
    open();
    const tr = await rowOf('Edit');
    const cell = within(tr).getByText(strings['route.notServed']);
    expect(cell.getAttribute('title')).toContain('Not served');
    expect(within(tr).queryByText(/\*/)).toBeNull();
  });

  it('finds a script by its pattern or its file route', async () => {
    open();
    await screen.findByText('Hello');
    await userEvent.type(screen.getByRole('searchbox'), '/users/:id');
    expect(await screen.findByText('Users by id')).toBeTruthy();
    expect(screen.queryByText('Hello')).toBeNull();
  });
});

const settings = (rel: string) => `/scripts?sel=a.0000~${encodeURIComponent(rel)}&tab=settings`;

describe('the delete confirmation says the address in words', () => {
  it('names the pattern, not the bracket route', async () => {
    open(settings('[[...path]].ts'));
    await userEvent.click(await screen.findByRole('button', { name: strings['delete.action'] }));
    expect(await screen.findByText(/^\/\* stops answering\./)).toBeTruthy();
    expect(screen.queryByText(/\[\[\.\.\./)).toBeNull();
  });
  it('names the file when exec serves no address from it', async () => {
    open(settings('solo/[...slug]/edit.ts'));
    await userEvent.click(await screen.findByRole('button', { name: strings['delete.action'] }));
    expect(await screen.findByText(/^solo\/\[\.\.\.slug\]\/edit\.ts is not served/)).toBeTruthy();
  });
});

describe('the copy entry says what it copies', () => {
  const entries = async (name: string) => {
    const row = await rowOf(name);
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    return screen.findAllByRole('menuitem');
  };
  it('a row of a pattern offers Copy address pattern, a plain one Copy address, a file that is not served none', async () => {
    open();
    expect((await entries('Every other address')).map((e) => e.textContent)).toContain(strings['menu.copyPattern']);
    await userEvent.keyboard('{Escape}');
    expect((await entries('Hello')).map((e) => e.textContent)).toContain(strings['menu.copy']);
    await userEvent.keyboard('{Escape}');
    const all = (await entries('Edit')).map((e) => e.textContent);
    expect(all).not.toContain(strings['menu.copy']);
    expect(all).not.toContain(strings['menu.copyPattern']);
  });
  it('the detail menu of a pattern says pattern too', async () => {
    open('/scripts?sel=a.0000~%5B%5B...path%5D%5D.ts');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect((await screen.findAllByRole('menuitem')).map((e) => e.textContent)).toContain(strings['menu.copyPattern']);
  });
});

describe('the detail menu of a file that is not served', () => {
  it('offers no copy', async () => {
    open('/scripts?sel=a.0000~solo%2F%5B...slug%5D%2Fedit.ts');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    const all = (await screen.findAllByRole('menuitem')).map((e) => e.textContent);
    expect(all).not.toContain(strings['menu.copy']);
    expect(all).not.toContain(strings['menu.copyPattern']);
  });
});

describe('the detail says it the same way', () => {
  it('titles the page in words and shows the pattern, not the bracket route', async () => {
    open('/scripts?sel=a.0000~%5B%5B...path%5D%5D.ts');
    expect((await screen.findAllByText('Every other address')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[\[\.\.\.path\]\]\.ts[^\s]/)).toBeNull();
    expect(screen.queryByText('/[[...path]]')).toBeNull();
    expect(screen.getAllByText('https://x-exec-1.example/*').length).toBeGreaterThan(0);
  });
  it('labels the copy of a pattern as a pattern, and a plain address as an address', async () => {
    open('/scripts?sel=a.0000~%5B%5B...path%5D%5D.ts');
    expect((await screen.findAllByText(strings['fact.addressPattern'])).length).toBeGreaterThan(0);
  });
  it('plain files keep Address; a file that is not served shows no address to copy', async () => {
    open('/scripts?sel=a.0000~hello.ts');
    expect((await screen.findAllByText(strings['fact.address'])).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['fact.addressPattern'])).toBeNull();
  });
  it('a file that is not served has no address field at all', async () => {
    open('/scripts?sel=a.0000~solo%2F%5B...slug%5D%2Fedit.ts');
    expect((await screen.findAllByText(strings['route.notServed'])).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['fact.address'])).toBeNull();
    expect(screen.queryByText(strings['fact.addressPattern'])).toBeNull();
  });
});
