// Vitest, in the fixture states: the Exec folder the scripts page shows. ?exec= picks it, a quiet "Folder N" tag says so, and the
// closed Advanced section at the foot of the list switches it. Only numbered folders open; a bad value is explained, never guessed.
import { describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const search = (router: { state: { location: { search: unknown } } }) => router.state.location.search as Record<string, unknown>;
const table = () => screen.findByRole('table', { name: strings.title }, { timeout: 5000 });
const openAdvanced = async () => userEvent.click(await screen.findByRole('button', { name: strings['folder.advanced'] }));
const field = () => screen.getByRole('textbox', { name: strings['folder.label'] });

describe('the script folder', () => {
  it('folder 1 shows no tag, and Advanced stays closed until opened', async () => {
    await renderPage(page);
    await within(await table()).findAllByRole('row', { name: /Weather lookup/ });
    expect(screen.queryByText('Folder 1')).toBeNull();
    expect(screen.queryByRole('textbox', { name: strings['folder.label'] })).toBeNull();
    await openAdvanced();
    expect((field() as HTMLInputElement).value).toBe('1');
    expect(screen.queryByRole('button', { name: strings['folder.back'] })).toBeNull();
    expect((screen.getByRole('button', { name: strings['folder.go'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('opening folder 3 puts it in the address; a number out of range or with letters is refused with a reason', async () => {
    const { router } = await renderPage(page, { state: 'folder3' });
    await table();
    await openAdvanced();
    // The field takes four characters at most, so 10000 cannot even be typed.
    await userEvent.clear(field());
    await userEvent.type(field(), '10000');
    expect((field() as HTMLInputElement).value).toBe('1000');
    for (const v of ['0', 'abc', '03', '-1']) {
      await userEvent.clear(field());
      await userEvent.type(field(), v);
      await userEvent.click(screen.getByRole('button', { name: strings['folder.go'] }));
      expect(await screen.findByText(strings['folder.invalid'])).toBeInTheDocument();
      expect(search(router).exec).toBeUndefined();
    }
    await userEvent.clear(field());
    await userEvent.type(field(), '3{Enter}');
    await vi.waitFor(() => expect(String(search(router).exec)).toBe('3'));
  });

  it("?exec=3 shows that folder's own scripts only, with its tag and its exclusive line, and Back returns to folder 1", async () => {
    const { router } = await renderPage(page, { state: 'folder3', path: '/scripts?exec=3' });
    const t = await table();
    await within(t).findAllByRole('row', { name: /Inventory count/ });
    expect(within(t).queryAllByRole('row', { name: /Weather lookup/ })).toEqual([]);
    expect(screen.getByText('Folder 3')).toBeInTheDocument();
    await openAdvanced();
    expect((field() as HTMLInputElement).value).toBe('3');
    expect(await screen.findByText(strings['folder.exclusive'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['folder.back'] }));
    await vi.waitFor(() => expect(search(router).exec).toBeUndefined());
    await within(await table()).findAllByRole('row', { name: /Weather lookup/ });
    expect(screen.queryByText('Folder 3')).toBeNull();
  });

  it('opening a script of folder 3 keeps the folder in the address', async () => {
    const { router } = await renderPage(page, { state: 'folder3', path: '/scripts?exec=3' });
    const t = await table();
    await within(t).findAllByRole('row', { name: /Inventory count/ });
    const row = within(t).getAllByRole('row').find((r) => /Inventory count/.test(r.textContent ?? ''));
    if (!row) throw new Error('no row');
    row.focus();
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => expect(String(search(router).sel ?? '')).toMatch(/~inventory\.ts$/));
    expect(String(search(router).exec)).toBe('3');
  });

  it('a folder the page cannot open is explained with Advanced open, and folder 1 shows meanwhile', async () => {
    await renderPage(page, { path: '/scripts?exec=shop' });
    await within(await table()).findAllByRole('row', { name: /Weather lookup/ });
    expect(screen.getByText(strings['folder.bad'].replace('{{name}}', 'shop'))).toBeInTheDocument();
    expect((field() as HTMLInputElement).value).toBe('1');
    expect(screen.queryByText(/^Folder \d/)).toBeNull();
  });

  it('an address changed to a folder the page cannot open opens Advanced then too', async () => {
    const { router } = await renderPage(page);
    await within(await table()).findAllByRole('row', { name: /Weather lookup/ });
    expect(screen.getByRole('button', { name: strings['folder.advanced'] })).toHaveAttribute('aria-expanded', 'false');
    await act(async () => { await router.navigate({ to: '/scripts' as never, search: { exec: 'shop' } as never }); });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: strings['folder.advanced'] })).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText(strings['folder.bad'].replace('{{name}}', 'shop'))).toBeInTheDocument();
  });

  it('folder 1 never reads the exclusive marker, and shows no exclusive line', async () => {
    await renderPage(page, { state: 'folder3' });
    await table();
    await openAdvanced();
    expect(screen.queryByText(strings['folder.exclusive'])).toBeNull();
  });
});
