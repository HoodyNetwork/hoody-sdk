// Create form wiring: the create form shows the kit SSH key help and offers "copy from an existing
// computer" (the page passes its computers; the copy is made in the same drawer); the Network tab shows the
// proxy section.
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';
import proxy from './parts/ConnectProxy.strings.en.json';
import kitSsh from '@kit/forms/SshKeyHelp.strings.en.json';

const openCreate = async () => {
  const b = await screen.findAllByRole('button', { name: strings['action.get'] }, { timeout: 8000 });
  await userEvent.click(b[0] as HTMLElement);
  return screen.findByRole('dialog');
};

describe('computers: create form and Network tab wiring', () => {
  it('the create form copies an existing computer in place: the picked one fills Make copy, no second drawer opens', async () => {
    await renderPage(page);
    const d = await openCreate();
    await userEvent.click(within(within(d).getByRole('radiogroup', { name: strings['create.from'] })).getByRole('radio', { name: new RegExp(`^${strings['create.fromCopy']}`) }));
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`${strings['create.copyFrom']}$`) }));
    const first = (await screen.findAllByRole('radio', { name: new RegExp(`^${computers[0]!.name}`) })).at(-1) as HTMLElement;
    await userEvent.click(first);
    await waitFor(() => expect((within(d).getByLabelText(strings['field.name']) as HTMLInputElement).value).toBe(`${computers[0]!.name}-copy`));
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    expect(screen.queryByRole('dialog', { name: strings['copyd.title'].replace('{{name}}', computers[0]!.name) })).toBeNull();
    expect(within(d).getByRole('button', { name: strings['copyd.go'] })).toBeInTheDocument();
  }, 40000);

  it('the create form has the SSH key help under the key field; a key made there is named for the computer and fills the field', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() }));
    try {
      await renderPage(page);
      const d = await openCreate();
      const name = within(d).getByLabelText(strings['field.name']);
      await userEvent.clear(name);
      await userEvent.type(name, 'orbit');
      await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['create.more'] ?? 'More') }));
      await userEvent.click(within(d).getByRole('button', { name: kitSsh['sshhelp.title'] }));
      await userEvent.click(within(d).getByRole('button', { name: kitSsh['sshhelp.make.go'] }));
      await userEvent.click(await within(d).findByRole('button', { name: kitSsh['sshhelp.made.download'] }));
      await userEvent.click(within(d).getByRole('button', { name: kitSsh['sshhelp.saved.use'] }));
      expect((within(d).getByLabelText(strings['create.ssh']) as HTMLTextAreaElement).value).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5\S+ hoody-orbit-[a-z0-9]{4}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 40000);

  it('the Network tab shows the proxy section', async () => {
    const c = computers.find((x) => x.status === 'running') ?? computers[0];
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=network` });
    expect(await screen.findByRole('heading', { name: proxy['proxy.title'].replace('{{name}}', c!.name) }, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);

  // A delete frees a slot on its server (computer_capacity): the servers list is read again, so a server shown
  // full before does not stay disabled in Get a computer or Copy.
  it('after a delete the servers list is read again', async () => {
    const c = computers.find((x) => x.status === 'running') ?? computers[0];
    const r = await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=ports` });
    const reads = () => r.queryClient.getQueryCache().findAll().filter((q) => JSON.stringify(q.queryKey).includes('"servers"')).reduce((n, q) => n + q.state.dataUpdateCount, 0);
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c!.name) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.delete'] }));
    const before = reads();
    expect(before).toBeGreaterThan(0);
    await userEvent.type(await screen.findByLabelText(`Type ${c!.name} to confirm`), c!.name);
    await userEvent.click(screen.getByRole('button', { name: strings['delete.go'] }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  }, 40000);
});
