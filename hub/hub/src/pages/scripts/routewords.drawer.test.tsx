// Vitest on core's real change source: the Recently deleted drawer says a removed route file's address in words (never the bracket
// route), and the file itself when exec served no address from it.
import { CoreQueryProvider, queryClient } from '@core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, TARGET } from '@core/test/env';
import { DeletedDrawer } from './parts/DeletedDrawer';
import type { CompScripts } from './types';

const entry = (path: string) => ({ path, version: 1, retainedUntil: '2026-12-01T00:00:00Z' });
const comp: CompScripts = {
  id: 'c1', name: 'atlas.1111', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: null, agent: {} as never,
  rows: [], summary: {}, instances: {}, aliases: [],
  deleted: [entry('default/1/[[...path]].ts'), entry('default/1/users/[id].ts'), entry('default/1/hello.ts'), entry('default/1/solo/[...slug]/edit.ts')],
};

describe('the Recently deleted drawer', () => {
  it('shows the address pattern of each file, and the file when it served none', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    setTarget(TARGET);
    render(<DeletedDrawer isOpen comps={[comp]} onClose={() => undefined} onRestored={() => undefined} />, { wrapper: CoreQueryProvider });
    for (const t of ['/*', '/users/:id', '/hello', 'solo/[...slug]/edit.ts']) expect(await screen.findByText(t)).toBeTruthy();
    expect(screen.queryByText('/[[...path]]')).toBeNull();
    expect(screen.queryByText('/users/[id]')).toBeNull();
  });
});
