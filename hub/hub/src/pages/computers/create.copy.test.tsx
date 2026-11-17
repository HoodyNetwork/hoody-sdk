// Get a computer → "Start from": the form's first choice is a new computer or a copy of one of yours.
// A copy is picked with the kit computer picker in this same drawer and sent with Make copy (Copy's own form and
// runner): no second drawer, no question, and the new form's values wait unchanged behind it. Copying needs the
// right to copy and a computer to copy; an unknown outcome shows Held here and is never sent again (C9).
import { definePage } from '@kit';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { CreateDrawer } from './parts/CreateDrawer';
import { computers, copySends } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import type { Computer, Server } from './types';

const src = computers[0]!;
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function openCreate(state?: string) {
  await renderPage(page, { path: '/computers', ...(state ? { state } : {}) });
  // The first render of a run also loads the page's parts; on a busy host that alone can pass 8 s.
  await userEvent.click((await screen.findAllByRole('button', { name: strings['action.get'] }, { timeout: 30000 }))[0] as HTMLElement);
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
}
const from = (d: HTMLElement) => within(d).getByRole('radiogroup', { name: strings['create.from'] });
const option = (d: HTMLElement, key: 'create.fromNew' | 'create.fromCopy') => within(from(d)).getByRole('radio', { name: new RegExp(`^${esc(strings[key])}`) });
const pickerButton = (d: HTMLElement) => within(d).getByRole('button', { name: new RegExp(`${esc(strings['create.copyFrom'])}$`) });
async function chooseCopy(d: HTMLElement, c: Computer = src) {
  await userEvent.click(option(d, 'create.fromCopy'));
  await userEvent.click(pickerButton(d));
  await userEvent.click((await screen.findAllByRole('radio', { name: new RegExp(`^${esc(c.name)}`) })).at(-1) as HTMLElement);
  await waitFor(() => expect((within(d).getByLabelText(strings['field.name']) as HTMLInputElement).value).toBe(`${c.name}-copy`));
}
const makeCopy = (d: HTMLElement) => within(d).getByRole('button', { name: strings['copyd.go'] });
const n1 = (k: string) => k.replace('{{n}}', '1');

beforeEach(() => {
  copySends.length = 0;
});

describe('Get a computer: Start from', () => {
  it('the first choice, above the name: a new computer is picked; the old copy step is gone', async () => {
    const d = await openCreate();
    const group = from(d);
    expect(group.compareDocumentPosition(within(d).getByLabelText(strings['field.name'])) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(option(d, 'create.fromNew')).toBeChecked();
    expect(option(d, 'create.fromCopy')).not.toBeChecked();
    expect(within(d).queryByRole('button', { name: /Copy one of your computers/ })).toBeNull();
    expect(within(d).getByRole('button', { name: strings['create.go'] })).toBeInTheDocument();
  }, 90000);

  it('a copy: nothing to send until a computer is picked; the new-computer fields leave', async () => {
    const d = await openCreate();
    await userEvent.click(option(d, 'create.fromCopy'));
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    expect(within(d).queryByLabelText(strings['field.name'])).toBeNull();
    expect(within(d).queryByRole('radiogroup', { name: strings['create.color'] })).toBeNull();
    expect(within(d).queryByRole('button', { name: new RegExp(`^${strings['create.more']}`) })).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['create.go'] })).toBeNull();
    expect(makeCopy(d)).toBeDisabled();
    expect(pickerButton(d)).toHaveTextContent(strings['create.copyFromPick']);
  }, 90000);

  it('picking a computer fills the copy; Make copy sends one copy of it from this drawer, which then closes', async () => {
    const d = await openCreate();
    await chooseCopy(d);
    expect(screen.queryByRole('dialog', { name: strings['copyd.title'].replace('{{name}}', src.name) })).toBeNull();
    // The plate says what the copy starts with.
    expect(within(d).getByText(strings['create.sum.filesSame'].replace('{{name}}', src.name))).toBeInTheDocument();
    await waitFor(() => expect(makeCopy(d)).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(makeCopy(d));
    await waitFor(() => expect(copySends).toHaveLength(1));
    expect(copySends[0]).toMatchObject({ name: `${src.name}-copy`, target_project_id: src.project_id });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull(), { timeout: 8000 });
    expect(copySends).toHaveLength(1);
  }, 90000);

  it('going back to a new computer keeps what was typed there, and nothing ever asks', async () => {
    const d = await openCreate();
    const name = within(d).getByLabelText(strings['field.name']) as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'kept-name');
    await chooseCopy(d);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await userEvent.click(option(d, 'create.fromNew'));
    expect((within(d).getByLabelText(strings['field.name']) as HTMLInputElement).value).toBe('kept-name');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(copySends).toHaveLength(0);
  }, 90000);

  it('while the copy is being sent the choice and the picker are locked', async () => {
    const d = await openCreate('copySlow');
    await chooseCopy(d);
    await waitFor(() => expect(makeCopy(d)).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(makeCopy(d));
    await waitFor(() => expect(copySends).toHaveLength(1));
    expect(option(d, 'create.fromNew')).toBeDisabled();
    expect(pickerButton(d)).toBeDisabled();
    // What the copy sent is locked too: a change would show but never be sent.
    const name = within(d).getByLabelText(strings['field.name']) as HTMLInputElement;
    expect(name).toBeDisabled();
    await userEvent.type(name, 'x');
    expect(name.value).toBe(`${src.name}-copy`);
    expect(within(d).getByRole('button', { name: new RegExp(`${esc(strings['field.server'])}$`) })).toBeDisabled();
    expect(within(d).getByRole('button', { name: new RegExp(`${esc(strings['field.project'])}$`) })).toBeDisabled();
  }, 90000);

  it('a copy whose answer was lost shows Held here: not said done or failed, the choice stays locked, Make copy cannot send again', async () => {
    // cedar, as held-footer.test.tsx's Copy: pendingOps answers its copy "may have gone through".
    const cedar = computers.find((c) => c.name === 'cedar')!;
    const d = await openCreate('pendingOps');
    await chooseCopy(d, cedar);
    await waitFor(() => expect(makeCopy(d)).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(makeCopy(d));
    expect(await within(d).findByText(strings['held.copy'].replace('{{name}}', `${cedar.name}-copy`), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByLabelText(strings['field.name'])).toBeNull();
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    expect(option(d, 'create.fromNew')).toBeDisabled();
    expect(pickerButton(d)).toBeDisabled();
    expect(within(d).queryByRole('button', { name: strings['create.go'] })).toBeNull();
    const go = within(d).queryByRole('button', { name: strings['copyd.go'] });
    if (go) expect(go).toBeDisabled();
  }, 90000);

  it('a held copy with a typed name closes without asking to discard it (it was sent)', async () => {
    const cedar = computers.find((c) => c.name === 'cedar')!;
    const d = await openCreate('pendingOps');
    await chooseCopy(d, cedar);
    const name = within(d).getByLabelText(strings['field.name']);
    await userEvent.clear(name);
    await userEvent.type(name, 'cedar-twin');
    await waitFor(() => expect(makeCopy(d)).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(makeCopy(d));
    expect(await within(d).findByText(strings['held.copy'].replace('{{name}}', 'cedar-twin'), {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  }, 90000);

  it('environment variables survive a copy shown and left: what is shown is what is sent', async () => {
    const d = await openCreate();
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
    await userEvent.click(within(d).getByRole('button', { name: strings['create.envAdd'] }));
    await userEvent.type(within(d).getByLabelText(n1(strings['create.envKey'])), 'FOO');
    await userEvent.type(within(d).getByLabelText(n1(strings['create.envValue'])), 'bar');
    await chooseCopy(d);
    await userEvent.click(option(d, 'create.fromNew'));
    expect(within(d).getByLabelText(n1(strings['create.envKey']))).toHaveValue('FOO');
    expect(within(d).getByLabelText(n1(strings['create.envValue']))).toHaveValue('bar');
    // Folding More options and opening it again shows the same row.
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['create.more']) }));
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['create.more']) }));
    expect(within(d).getByLabelText(n1(strings['create.envKey']))).toHaveValue('FOO');
  }, 90000);

  it('New project from a copy returns to Get a computer still copying the same computer', async () => {
    const d = await openCreate('projectOutsideOnly');
    await chooseCopy(d);
    await userEvent.click(await within(d).findByRole('button', { name: strings['create.newProject'] }, { timeout: 8000 }));
    expect(await screen.findByRole('dialog', { name: strings['projd.newTitle'] })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['projd.newTitle'] })).toBeNull());
    const back = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    expect(option(back, 'create.fromCopy')).toBeChecked();
    expect(pickerButton(back)).toHaveTextContent(src.name);
    expect((within(back).getByLabelText(strings['field.name']) as HTMLInputElement).value).toBe(`${src.name}-copy`);
    expect(copySends).toHaveLength(0);
  }, 90000);

  it('closing drops the choice: Get a computer opens again on a new computer', async () => {
    const d = await openCreate();
    await chooseCopy(d);
    await userEvent.click(within(d).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull());
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.get'] }))[0] as HTMLElement);
    const again = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    expect(option(again, 'create.fromNew')).toBeChecked();
    expect(within(again).queryByRole('button', { name: strings['copyd.go'] })).toBeNull();
  }, 90000);

  it('New project from a copy asks first when the new form holds an edit (leaving drops it)', async () => {
    const d = await openCreate('projectOutsideOnly');
    const name = within(d).getByLabelText(strings['field.name']) as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'kept-name');
    await chooseCopy(d);
    await userEvent.click(await within(d).findByRole('button', { name: strings['create.newProject'] }, { timeout: 8000 }));
    const ask = await screen.findByRole('alertdialog', { name: strings['create.newProjectAskTitle'] });
    expect(ask).toHaveTextContent(strings['create.copyNewProjectAskBody'].replace('{{name}}', src.name));
    expect(screen.queryByRole('dialog', { name: strings['projd.newTitle'] })).toBeNull();
  }, 90000);
});

describe('Get a computer: no copy to offer', () => {
  const servers: Server[] = [{ id: 's1', name: 'paris-1', place: 'Paris, France', cc: 'FR', cpu: 4, ram: 8, disk: 80, free: false, days: null, status: 'active', cap: null }];
  async function mount(props: { canCopy?: boolean; computers?: readonly Computer[] }) {
    const Harness = () => (
      <CreateDrawer isOpen servers={servers} serversError={false} projects={undefined} realms={undefined} onClose={() => {}} onDone={() => {}} {...props} />
    );
    const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
    await renderPage(p, { path: '/computers' });
    return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
  }

  it('without the right to copy there is no Start from, only the new form', async () => {
    const d = await mount({ canCopy: false, computers });
    expect(within(d).queryByRole('radiogroup', { name: strings['create.from'] })).toBeNull();
    expect(within(d).getByLabelText(strings['field.name'])).toBeInTheDocument();
  }, 90000);

  it('with no computer to copy there is no Start from either', async () => {
    const d = await mount({ canCopy: true, computers: [] });
    expect(within(d).queryByRole('radiogroup', { name: strings['create.from'] })).toBeNull();
  }, 90000);

  it('a picked computer the list loses stays picked: its copy form and Make copy remain', async () => {
    const Harness = () => {
      const [list, setList] = useState<readonly Computer[]>(computers);
      return (
        <>
          <button type="button" onClick={() => setList([])}>drop-list</button>
          <output data-testid="listed">{list.length}</output>
          <CreateDrawer isOpen servers={servers} serversError={false} projects={undefined} realms={undefined} onClose={() => {}} onDone={() => {}} canCopy computers={list} />
        </>
      );
    };
    const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
    await renderPage(p, { path: '/computers' });
    const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    await chooseCopy(d);
    // The drawer is modal: the harness's own button is pressed directly.
    act(() => { fireEvent.click(screen.getByText('drop-list')); });
    await waitFor(() => expect(screen.getByTestId('listed')).toHaveTextContent('0'));
    expect(pickerButton(d)).toHaveTextContent(src.name);
    expect((within(d).getByLabelText(strings['field.name']) as HTMLInputElement).value).toBe(`${src.name}-copy`);
    expect(makeCopy(d)).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['create.go'] })).toBeNull();
  }, 90000);

  it('with both, Start from is offered', async () => {
    const d = await mount({ canCopy: true, computers });
    expect(within(d).getByRole('radiogroup', { name: strings['create.from'] })).toBeInTheDocument();
  }, 90000);
});
