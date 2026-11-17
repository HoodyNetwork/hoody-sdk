// Vitest: links.newProgram (`?new=1`) opens New program on the Running
// tab once the page shows a computer, and the key is taken out of the URL (replace), so Back, a reload or closing the
// drawer never opens it again. Without the key nothing opens. The ask is bound to the account, realm and computer shown
// when it landed and to the Running tab: landing with no computer, or on the Apps tab, drops it for good.
import { chooseComputer, fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { links } from './links';
import page from './page';
import sbStrings from './sandbox/strings.en.json';

const search = (r: Awaited<ReturnType<typeof renderPage>>) => r.router.state.location.search as Record<string, unknown>;

describe('programs: the New program link', () => {
  it('is /programs?new=1', () => {
    expect(links.newProgram).toBe('/programs?new=1');
  });

  it('opens the New program drawer once, and drops the key from the URL', async () => {
    const r = await renderPage(page, { state: 'many', path: links.newProgram });
    const dlg = await screen.findByRole('dialog', { name: sbStrings['np.title'] }, { timeout: 8000 });
    expect(dlg).toBeInTheDocument();
    await waitFor(() => expect(search(r).new).toBeUndefined());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: sbStrings['np.title'] })).toBeNull());
    await screen.findByRole('button', { name: sbStrings['np.new'] });
    expect(screen.queryByRole('dialog', { name: sbStrings['np.title'] })).toBeNull();
  }, 30000);

  it('opens nothing without the key', async () => {
    await renderPage(page, { state: 'many' });
    await screen.findByRole('button', { name: sbStrings['np.new'] }, { timeout: 8000 });
    expect(screen.queryByRole('dialog', { name: sbStrings['np.title'] })).toBeNull();
  });

  it('landing with no computer shown drops the ask: choosing a computer afterwards opens nothing', async () => {
    const r = await renderPage(page, { state: 'many', path: links.newProgram, computer: false });
    await waitFor(() => expect(search(r).new).toBeUndefined(), { timeout: 8000 });
    act(() => void chooseComputer(fixtureWorld.current));
    await screen.findByRole('button', { name: sbStrings['np.new'] }, { timeout: 8000 });
    expect(screen.queryByRole('dialog', { name: sbStrings['np.title'] })).toBeNull();
  }, 30000);

  it('landing on the Apps tab drops the ask: the Running tab afterwards opens nothing', async () => {
    const r = await renderPage(page, { state: 'many', path: `${links.newProgram}&tab=apps` });
    await waitFor(() => expect(search(r).new).toBeUndefined(), { timeout: 8000 });
    expect(screen.queryByRole('dialog', { name: sbStrings['np.title'] })).toBeNull();
    await act(async () => { await r.router.navigate({ href: links.list } as never); });
    await screen.findByRole('button', { name: sbStrings['np.new'] }, { timeout: 8000 });
    expect(screen.queryByRole('dialog', { name: sbStrings['np.title'] })).toBeNull();
  }, 30000);
});
