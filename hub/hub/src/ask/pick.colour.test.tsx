// Ask's Pick a computer menu draws each computer's colour mark in the row's lead place,
// as the top bar's computer switch does. A colour that is not a hex value draws none; the row's name is unchanged.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { PagesProvider } from '../shell/pageLinks';
import { PickComputer } from './AskPanel';

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');

describe('Pick a computer menu: computer colours', () => {
  it('each row draws its computer’s mark; a hostile or missing colour draws none; names unchanged', async () => {
    const data: ShellData = {
      realms: [], realmId: 'r1', setComputer: () => {},
      computers: [{ id: 'c1', name: 'atlas', location: 'Singapore · sg-2', color: '#3b82f6' }, { id: 'c2', name: 'cedar', color: 'red;x:url(y)' }, { id: 'c3', name: 'dune' }],
    };
    const router = createRouter({ routeTree: createRootRoute({ component: () => <PagesProvider pages={[pg('computers')]}><ShellDataProvider value={data}><PickComputer /></ShellDataProvider></PagesProvider> }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Pick a computer/ })); });
    const atlas = screen.getByRole('menuitem', { name: 'atlas · Singapore · sg-2' });
    expect(markIn(atlas)?.dataset.computerColor).toBe('#3B82F6');
    expect(markIn(screen.getByRole('menuitem', { name: 'cedar' }))).toBeNull();
    expect(markIn(screen.getByRole('menuitem', { name: 'dune' }))).toBeNull();
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style') ?? '').not.toContain('url(');
  });
});
