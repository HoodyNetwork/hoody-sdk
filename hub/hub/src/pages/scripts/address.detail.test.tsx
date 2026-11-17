// Vitest at the page: the address in a script's detail says what it is and shows the whole address (the computer's Exec
// address, the `exec-1` part readable, the ids masked) with the path and Copy; a pattern is labelled as a pattern with the
// same masked origin. Replaced: the overview (one computer with a plain script and a pattern one); the rest runs.
import { renderPage, screen, within } from '@app/testing';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

const ID = 'c0a7150000000000000000a1';
const PROJECT = '0123456789abcdef01234567';
vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const { toItems } = await import('./logic');
  return {
    ...real,
    useOverview: () => {
      const data = useMemo(() => ({
        computers: [{
          id: ID, name: 'atlas', handle: 'a.0000', state: 'on', serverName: 'n1', realmIds: [], err: null,
          origin: `https://${PROJECT}-${ID}-exec-1.n1.example`,
          caps: { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true },
          agent: { templates: true, writer: true, writerOwner: 'fp1', guardedDelete: true }, agentRealm: 'global',
          rows: [{ path: 'default/1/hello.ts', isDirectory: false }, { path: 'default/1/users/[id].ts', isDirectory: false }],
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

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };
const open = (path: string) => renderPage(page, { state: 'many', path });

describe('the address in the detail', () => {
  it('says what it is and shows the whole masked address, with the path, plus Copy', async () => {
    open('/scripts?sel=a.0000~hello.ts');
    const shown = await screen.findByText('https://0123…4567-c0a7…00a1-exec-1.n1.example/hello', undefined, SLOW);
    expect(shown).toBeTruthy();
    expect(screen.getAllByText(strings['address.what']).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: strings['address.copyWhat'].replace('{{what}}', strings['fact.address']) })).toBeTruthy();
  });

  it('a pattern is labelled and shown as a pattern with the same masked origin', async () => {
    open(`/scripts?sel=a.0000~${encodeURIComponent('users/[id].ts')}`);
    expect(await screen.findByText('https://0123…4567-c0a7…00a1-exec-1.n1.example/users/:id', undefined, SLOW)).toBeTruthy();
    expect(within(document.body).getAllByText(strings['fact.addressPattern']).length).toBeGreaterThan(0);
  });
});
