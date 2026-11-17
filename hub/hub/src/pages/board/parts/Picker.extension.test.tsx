// Vitest: "VS Code extension" (a tile under "More" of a running computer's step) lists the
// editor's extensions (that step keeps its list of options) and adds a code tile on the extension-only view, named after the extension; a typed
// PUBLISHER.NAME stays possible; nothing is offered for a stopped computer or a programs-only picker.
import { answers, boardFixtureRoute, bootFixtureCore, CoreQueryProvider, reply, type FixtureAnswer } from '@core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { EXTENSIONS_PATH } from '../codeExtensions';
import type { Tile } from '../model/boards';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';
import { queryTile, tile } from './browse.testkit';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const inst = (publisher: string, name: string, status = 'running') => ({ logicalKey: (publisher + '.' + name).toLowerCase(), publisher, name, stagedVersion: null, installedVersion: '1.0.0', status, reason: '', installedOnly: true });
const LIST = {
  instance: { id: 1, state: 'running', startedAt: null },
  observed: { status: 'ok', scope: 'instance', instanceId: 1, extensions: [inst('ms-python', 'python'), inst('esbenp', 'prettier-vscode'), inst('bad', 'broken', 'failed')] },
  desired: { status: 'ok', scope: 'shared-across-instances', extensions: [{ status: 'ok', publisher: 'golang', name: 'go' }] },
  partial: false,
  message: '',
};
let reads = 0;
const boot = (answer: () => FixtureAnswer | Promise<FixtureAnswer> = () => answers.ok(LIST)) => {
  reads = 0;
  bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => { reads++; return answer(); })] });
};
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c1', 'atlas'), pc('c2', 'cedar', 'stopped')]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
const opt = (name: string) => screen.getByRole('option', { name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
async function toExtensions(user: ReturnType<typeof userEvent.setup>, computer = /atlas/) {
  await user.click(screen.getByRole('row', { name: computer }));
  await user.click(tile(new RegExp('^' + S['picker.extension'])));
}

afterEach(() => { cleanup(); });

describe('VS Code extension in the add menu', () => {
  it('sits first in "More" of a running computer', async () => {
    boot();
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    const more = within(screen.getByRole('grid', { name: S['picker.more'] })).getAllByRole('row').map((o) => o.getAttribute('aria-label') ?? '');
    expect(more[0]).toMatch(new RegExp('^' + S['picker.extension']));
    expect(reads).toBe(0);
  });

  it('is not offered for a stopped computer or a programs-only picker', async () => {
    boot();
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /cedar/ }));
    expect(queryTile(new RegExp('^' + S['picker.extension']))).toBeNull();
    cleanup();
    render(picker({ programsOnly: true }));
    // A programs-only picker keeps its lists of options (no frame of tiles).
    await user.click(screen.getByRole('option', { name: /^atlas/ }));
    await screen.findByRole('option', { name: new RegExp('^' + S['program.terminal']) });
    expect(queryTile(new RegExp('^' + S['picker.extension']))).toBeNull();
    expect(screen.queryByRole('option', { name: new RegExp('^' + S['picker.extension']) })).toBeNull();
  });

  it('lists the extensions by name with their publisher and notes, then Other extension…, and the search narrows them', async () => {
    boot();
    const user = userEvent.setup();
    render(picker({}));
    await toExtensions(user);
    await screen.findByRole('option', { name: /prettier-vscode/ });
    const names = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(names).toEqual([
      expect.stringMatching(/^brokenbad.*Did not install$/),
      expect.stringMatching(/^gogolang.*Installs at next start$/),
      'prettier-vscodeesbenp',
      'pythonms-python',
      S['picker.extensionOther']! + S['picker.extensionOtherDesc']!,
    ]);
    const search = screen.getByRole('searchbox', { name: S['picker.searchExtensions'] });
    expect(search).toHaveFocus();
    await user.type(search, 'esbenp');
    expect(screen.getAllByRole('option').map((o) => o.textContent ?? '')).toEqual(['prettier-vscodeesbenp', S['picker.extensionOther']! + S['picker.extensionOtherDesc']!]);
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText(S['picker.noExtensionMatch']!.replace('{{q}}', 'zzz'))).toBeInTheDocument();
    expect(reads).toBe(1);
  });

  it('a picked extension adds a code tile on code-1, extension view, named after it', async () => {
    boot();
    const onPick = vi.fn<(t: Tile) => void>();
    const user = userEvent.setup();
    render(picker({ onPick }));
    await toExtensions(user);
    await user.click(await screen.findByRole('option', { name: /^python/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({ project: 'p1', computer: 'c1', program: 'code', session: 1, view: 'extension', params: { extension: 'ms-python.python' }, name: 'python' });
  });

  it('Enter on the active row picks it, as a click does', async () => {
    boot();
    const onPick = vi.fn<(t: Tile) => void>();
    const user = userEvent.setup();
    render(picker({ onPick }));
    await toExtensions(user);
    await screen.findByRole('option', { name: /prettier-vscode/ });
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ program: 'code', view: 'extension', params: { extension: 'esbenp.prettier-vscode' }, name: 'prettier-vscode' }));
  });

  it('a failed read says so with Try again, and Other extension… stays offered', async () => {
    let fail = true;
    boot(() => (fail ? answers.refused(500, 'internal-error') : answers.ok(LIST)));
    const user = userEvent.setup();
    render(picker({}));
    await toExtensions(user);
    expect(await screen.findByText(S['picker.extensionsFailed']!)).toBeInTheDocument();
    expect(opt(S['picker.extensionOther']!)).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('option', { name: /^python/ })).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('an empty list says none are installed, and still offers Other extension…', async () => {
    boot(() => answers.ok({ ...LIST, observed: { ...LIST.observed, extensions: [] }, desired: { ...LIST.desired, extensions: [] } }));
    const user = userEvent.setup();
    render(picker({}));
    await toExtensions(user);
    expect(await screen.findByText(S['picker.noExtensions']!)).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('a typed id is checked as PUBLISHER.NAME, then adds its tile named after its NAME part or the given name', async () => {
    boot();
    const onPick = vi.fn<(t: Tile) => void>();
    const user = userEvent.setup();
    render(picker({ onPick }));
    await toExtensions(user);
    await user.click(opt(S['picker.extensionOther']!));
    const id = await screen.findByRole('textbox', { name: S['picker.extensionIdLabel'] });
    expect(id).toHaveFocus();
    await user.type(id, 'python{Enter}');
    expect(await screen.findByText(S['picker.extensionIdBad']!)).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
    await user.clear(id);
    await user.type(id, ' redhat.vscode-yaml {Enter}');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith({ project: 'p1', computer: 'c1', program: 'code', session: 1, view: 'extension', params: { extension: 'redhat.vscode-yaml' }, name: 'vscode-yaml' });
  });

  it('the typed form takes a name, and Back returns to the list', async () => {
    boot();
    const onPick = vi.fn<(t: Tile) => void>();
    const user = userEvent.setup();
    render(picker({ onPick }));
    await toExtensions(user);
    await user.click(opt(S['picker.extensionOther']!));
    await user.click(screen.getByRole('button', { name: S['picker.backStep'] }));
    expect(await screen.findByRole('searchbox', { name: S['picker.searchExtensions'] })).toBeInTheDocument();
    await user.click(opt(S['picker.extensionOther']!));
    await user.type(await screen.findByRole('textbox', { name: S['picker.extensionIdLabel'] }), 'redhat.vscode-yaml');
    await user.type(screen.getByRole('textbox', { name: S['picker.nameLabel'] }), 'YAML');
    await user.click(screen.getByRole('button', { name: S['picker.add'] }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ params: { extension: 'redhat.vscode-yaml' }, name: 'YAML' }));
  });

  it('the crumbs name the computer and the step; Backspace in an empty search goes back to the computer\'s step', async () => {
    boot();
    const user = userEvent.setup();
    render(picker({}));
    await toExtensions(user);
    const crumbs = screen.getByRole('navigation', { name: S['picker.title'] });
    expect(within(crumbs).getByRole('button', { name: /atlas/ })).toBeInTheDocument();
    expect(within(crumbs).getByText(S['picker.extensionStep']!)).toHaveAttribute('aria-current', 'step');
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(screen.getByRole('heading', { name: new RegExp('^' + S['picker.more'] + ' · \\d+$') })).toBeInTheDocument());
  });

  it('a computer that stops while the list is open says so; the typed form stays', async () => {
    boot();
    const user = userEvent.setup();
    const { rerender } = render(picker({}));
    await toExtensions(user);
    await screen.findByRole('option', { name: /^python/ });
    rerender(picker({ computers: [pc('c1', 'atlas', 'stopped')] }));
    expect(await screen.findByText(S['picker.extensionsStopped']!.replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    expect(screen.getAllByRole('option').map((o) => o.textContent ?? '')).toEqual([S['picker.extensionOther']! + S['picker.extensionOtherDesc']!]);
  });
  // Installation facts read in part, and the kit's 503 body.
  it('an unreadable installed section never says none are installed: it says the list is incomplete, with Try again', async () => {
    let half = true;
    boot(() => answers.ok(half ? { ...LIST, observed: { status: 'unavailable', scope: 'instance', instanceId: 1, reason: 'x' }, desired: { ...LIST.desired, extensions: [] }, partial: true } : LIST));
    const user = userEvent.setup();
    render(picker({}));
    await toExtensions(user);
    expect(await screen.findByText(S['picker.extensionsIncomplete']!)).toBeInTheDocument();
    expect(screen.queryByText(S['picker.noExtensions']!)).toBeNull();
    expect(opt(S['picker.extensionOther']!)).toBeInTheDocument();
    half = false;
    await user.click(screen.getByRole('button', { name: S['picker.extensionsTryAgain'] }));
    expect(await screen.findByRole('option', { name: /^python/ })).toBeInTheDocument();
    expect(screen.queryByText(S['picker.extensionsIncomplete']!)).toBeNull();
    expect(reads).toBe(2);
  });

  it('the kit\'s 503 list body shows its installed extensions, says the list is incomplete, and a search miss is not "none installed"', async () => {
    boot(() => ({ status: 503, body: { ...LIST, desired: { status: 'unavailable', scope: 'shared-across-instances', reason: 'x' }, partial: true } }));
    const user = userEvent.setup();
    render(picker({}));
    await toExtensions(user);
    expect(await screen.findByRole('option', { name: /^python/ })).toBeInTheDocument();
    expect(screen.getByText(S['picker.extensionsIncomplete']!)).toBeInTheDocument();
    expect(screen.queryByText(S['picker.extensionsFailed']!)).toBeNull();
    await user.type(screen.getByRole('searchbox', { name: S['picker.searchExtensions'] }), 'zzz');
    expect(await screen.findByText(S['picker.noExtensionMatch']!.replace('{{q}}', 'zzz'))).toBeInTheDocument();
  });

  it('a computer that leaves the list says so and offers the choice again', async () => {
    boot();
    const user = userEvent.setup();
    const { rerender } = render(picker({}));
    await toExtensions(user);
    await screen.findByRole('option', { name: /^python/ });
    rerender(picker({ computers: [pc('c2', 'cedar', 'stopped')] }));
    expect(await screen.findByText(S['picker.extensionGone']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.appChooseAgain'] }));
    expect(await screen.findByRole('row', { name: /cedar/ })).toBeInTheDocument();
  });

  it('on a list that is not whole, a missing computer is not known to be gone', async () => {
    boot();
    const user = userEvent.setup();
    const { rerender } = render(picker({}));
    await toExtensions(user);
    await screen.findByRole('option', { name: /^python/ });
    rerender(picker({ computers: [pc('c2', 'cedar', 'stopped')], complete: false }));
    expect(await screen.findByText(S['picker.appUnknown']!)).toBeInTheDocument();
    expect(screen.queryByText(S['picker.extensionGone']!)).toBeNull();
  });
});
