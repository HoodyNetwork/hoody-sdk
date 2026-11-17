// Vitest: Board > Add a program > Virtual machine. What each kind of server is told, never a launch,
// never a dead button, never "coming soon"; a server that can run VMs gets the way to the VMs page for its computer.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore, chooseNoComputer, CoreQueryProvider, rememberedComputerId } from '@core';
import { render } from '@testing-library/react';
import { computerOf, vmSupportOf, type BoardComputer, type VmSupport } from './computers';
import { Picker } from './parts/Picker';
import { VM_SYSTEMS } from './parts/VmCard';
import { resetBoardsForTests } from './data';
import { findTile, toKind } from './parts/browse.testkit';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

// Whether this load serves the Market and the VMs pages (usePageLink answers null when it does not), and where the
// card's buttons went.
const L = vi.hoisted(() => ({ market: true, vms: true, went: [] as string[] }));
vi.mock('@kit', async (orig) => {
  const real = await orig<Record<string, unknown> & { usePageLink: (id: string) => unknown }>();
  return {
    ...real,
    useGo: () => (to: string) => void L.went.push(to),
    usePageLink: (id: string) => ((id === 'market' && !L.market) || (id === 'vms' && !L.vms) ? null : real.usePageLink(id)),
  };
});

beforeEach(() => {
  resetBoardsForTests();
  L.market = true;
  L.vms = true;
  L.went = [];
});

const server = (s: Record<string, unknown>) => ({ id: 'c1', name: 'atlas', status: 'running', project_id: 'p', server: { name: 'n12', ...s } });

describe('vmSupportOf: the server snapshot of a computers row', () => {
  it('a free or paid slice is shared, whatever kvm_supported says', () => {
    expect(vmSupportOf(server({ is_free: true, kvm_supported: true }))).toBe('shared');
    expect(vmSupportOf(server({ is_free: false, paid_subserver: true, kvm_supported: true }))).toBe('shared');
    // No is_free: core's plan kind reads a server it knows nothing of as free (the top bar's rule).
    expect(vmSupportOf(server({}))).toBe('shared');
  });
  it('bare metal reads its last KVM check: true ready, false none, null or absent unchecked', () => {
    expect(vmSupportOf(server({ is_free: false, kvm_supported: true }))).toBe('ready');
    expect(vmSupportOf(server({ is_free: false, kvm_supported: false }))).toBe('none');
    expect(vmSupportOf(server({ is_free: false, kvm_supported: null }))).toBe('unchecked');
    expect(vmSupportOf(server({ is_free: false }))).toBe('unchecked');
    expect(vmSupportOf(server({ is_free: false, kvm_supported: 'yes' }))).toBe('unchecked');
  });
  it('a row without a server is unknown, and computerOf carries the reading', () => {
    expect(vmSupportOf({ id: 'c1', name: 'atlas' })).toBe('unknown');
    expect(vmSupportOf({ id: 'c1', server: null })).toBe('unknown');
    expect(computerOf(server({ is_free: false, kvm_supported: true }))?.vm).toBe('ready');
  });
});

describe('Add a program: Virtual machine', () => {
  const atlasOf = (vm: VmSupport, status = 'running'): BoardComputer => ({ id: 'c1', name: 'atlas', project_id: 'p', server_name: 'n12', status, vm });
  const at = (rows: BoardComputer[] | null, programsOnly = false, o: { failed?: boolean; complete?: boolean } = {}) => (
    <CoreQueryProvider><Picker computers={rows} failed={o.failed ?? false} complete={o.complete ?? true} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} programsOnly={programsOnly} /></CoreQueryProvider>
  );
  async function open(vm: VmSupport, status = 'running', programsOnly = false) {
    bootFixtureCore({ rules: [] });
    await act(async () => { chooseNoComputer(); });
    const user = userEvent.setup();
    const r = render(at([atlasOf(vm, status)], programsOnly));
    // A page that opens programs only keeps its steps a list of options; Add a program draws tiles.
    await user.click(await screen.findByRole(programsOnly ? 'option' : 'row', { name: /^atlas/ }));
    return Object.assign(user, { r });
  }
  /** The current step's name in the crumbs: the title focus goes to. */
  const stepTitle = (name: string) => screen.getByText(name, { selector: '[aria-current="step"]' });
  const systems = () => within(screen.getByRole('list', { name: 'Systems a virtual machine can run' })).getAllByRole('listitem').map((li) => li.textContent);
  /** The card's own buttons past Back (the crumbs are the panel's). */
  const ways = () => screen.getAllByRole('button').map((b) => b.textContent).filter((x) => x && !/^Back|^atlas|^All computers/.test(x));

  it('on a shared server: the selling point, the systems, bare metal needed, a way to the Market; never "coming soon"', async () => {
    const user = await open('shared');
    const row = await findTile(/^Virtual machine/);
    expect(row).toHaveTextContent('Run full virtual machines: Linux, Windows, Android');
    // The row's systems are the card's: one array.
    expect(row).toHaveTextContent(VM_SYSTEMS.join(', '));
    await user.click(row);
    expect(await screen.findByRole('heading', { name: 'Run full virtual machines' })).toBeInTheDocument();
    expect(systems()).toEqual([...VM_SYSTEMS]);
    expect(screen.getByText('atlas runs on a shared server. Full virtual machines need a rented bare-metal server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See bare-metal servers' })).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/coming soon/i);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await findTile(/^Virtual machine/)).toBeInTheDocument();
  });

  it('on bare metal that can run VMs: says so, with the systems, and its one button opens the VMs page for this computer; never "coming soon"', async () => {
    const user = await open('ready');
    const row = await findTile(/^Virtual machine/);
    expect(row).toHaveTextContent("This computer's server can run them");
    await user.click(row);
    expect(await screen.findByRole('heading', { name: 'This server can run virtual machines' })).toBeInTheDocument();
    expect(screen.getByText('Full virtual machines run inside atlas. Create and manage them on the VMs page.')).toBeInTheDocument();
    expect(systems()).toEqual([...VM_SYSTEMS]);
    expect(document.body.textContent).not.toMatch(/coming soon|available to start yet/i);
    expect(screen.queryByRole('button', { name: 'See bare-metal servers' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    // One way forward and nothing else: no Market here, nothing that starts a VM.
    expect(ways()).toEqual(['Open VMs']);
    // The VMs page shows the top bar's computer: no computer is chosen yet, and the press makes atlas that one first.
    expect(rememberedComputerId()).toBeNull();
    expect(L.went).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Open VMs' }));
    expect(rememberedComputerId()).toBe('c1');
    expect(L.went).toEqual(['/vms']);
  });

  it('a load that does not serve the VMs page: the card says so, with Back only (never a dead button)', async () => {
    L.vms = false;
    const user = await open('ready');
    const row = await findTile(/^Virtual machine/);
    expect(row).toHaveTextContent("This computer's server can run them");
    await user.click(row);
    expect(await screen.findByRole('heading', { name: 'This server can run virtual machines' })).toBeInTheDocument();
    expect(screen.getByText("Full virtual machines can run inside atlas. This Hub doesn't show the VMs page.")).toBeInTheDocument();
    expect(systems()).toEqual([...VM_SYSTEMS]);
    expect(document.body.textContent).not.toMatch(/coming soon|Create and manage/i);
    expect(ways()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(L.went).toEqual([]);
  });

  it('on bare metal not checked recently: says so, no promise and no systems list', async () => {
    const user = await open('unchecked');
    await user.click(await findTile(/^Virtual machine/));
    expect(await screen.findByText("atlas is on a bare-metal server whose support for virtual machines hasn't been checked recently.")).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Systems a virtual machine can run' })).toBeNull();
    expect(ways()).toEqual([]);
    expect(document.body.textContent).not.toMatch(/coming soon/i);
  });

  it('on bare metal without KVM: the selling point and bare metal that supports them', async () => {
    const user = await open('none', 'stopped');
    await user.click(await findTile(/^Virtual machine/));
    expect(await screen.findByRole('heading', { name: 'Run full virtual machines' })).toBeInTheDocument();
    expect(screen.getByText(/needs? a rented bare-metal server that supports them/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/coming soon/i);
  });

  it('a page that opens programs only never offers it', async () => {
    await open('ready', 'running', true);
    expect(await screen.findByRole('option', { name: /^Terminal/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Virtual machine/ })).toBeNull();
  });

  it('where support is not known the row promises nothing; the card says what is not known', async () => {
    for (const vm of ['unchecked', 'unknown'] as const) {
      const user = await open(vm);
      const row = await findTile(/^Virtual machine/);
      expect(row).toHaveTextContent("Whether this computer's server can run them");
      expect(row.textContent).not.toMatch(/Linux|Windows|Android|coming soon/i);
      if (vm === 'unknown') {
        await user.click(row);
        expect(await screen.findByText("Whether atlas's server can run virtual machines isn't known.")).toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Systems a virtual machine can run' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'See bare-metal servers' })).toBeNull();
      }
      user.r.unmount();
    }
  });

  it('a load that does not serve the Market: the card keeps its words, with Back only (never a dead button)', async () => {
    L.market = false;
    const user = await open('shared');
    await user.click(await findTile(/^Virtual machine/));
    expect(await screen.findByRole('heading', { name: 'Run full virtual machines' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See bare-metal servers' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('a stopped computer still offers it, under More; its Apps offer to start the computer', async () => {
    await open('shared', 'stopped');
    expect(within(await screen.findByRole('grid', { name: 'More' })).getByRole('row', { name: /^Virtual machine/ })).toBeInTheDocument();
    toKind('Apps');
    expect(within(screen.getByRole('group', { name: 'Apps' })).getByText('Start it to launch apps.')).toBeInTheDocument();
  });

  it("picking it moves the focus to the step's title (the row that had it is gone); a later read leaves a crumb the person focused", async () => {
    const user = await open('ready');
    await user.click(await findTile(/^Virtual machine/));
    await waitFor(() => expect(stepTitle('Virtual machine')).toHaveFocus());
    const crumb = screen.getByRole('button', { name: 'Back to atlas' });
    crumb.focus();
    user.r.rerender(at([{ ...atlasOf('ready') }]));
    await act(async () => { await new Promise((x) => setTimeout(x, 0)); });
    expect(crumb).toHaveFocus();
  });

  it('Backspace goes back a step, as on the lists', async () => {
    const user = await open('shared');
    await user.click(await findTile(/^Virtual machine/));
    // On the focused Back button too (the card has no field, so Backspace is the panel's).
    (await screen.findByRole('button', { name: 'Back' })).focus();
    await user.keyboard('{Backspace}');
    expect(await findTile(/^Virtual machine/)).toBeInTheDocument();
  });

  it('the computer leaves the list while the card is open: says so (or that it is not known) and offers the choice again', async () => {
    const user = await open('shared');
    await user.click(await findTile(/^Virtual machine/));
    await screen.findByRole('heading', { name: 'Run full virtual machines' });
    user.r.rerender(at([]));
    expect(await screen.findByText("That computer isn't in your list any more, so its server can't be checked here.")).toBeInTheDocument();
    user.r.rerender(at([], false, { complete: false }));
    expect(await screen.findByText("That computer isn't among the first 100 computers read, so it can't be checked here.")).toBeInTheDocument();
    user.r.rerender(at([], false, { failed: true }));
    expect(await screen.findByText('The computers could not be read.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose a computer' }));
    expect(await screen.findByRole('searchbox', { name: 'Search computers' })).toBeInTheDocument();
    // The press removed the button that had the focus: the new view's title takes it, never the page.
    await waitFor(() => expect(stepTitle('Choose a computer')).toHaveFocus());
  });
  it("the computer leaves while a card control has the focus: the notice moves it to the step's title, once; a later read leaves a crumb", async () => {
    const user = await open('shared');
    await user.click(await findTile(/^Virtual machine/));
    (await screen.findByRole('button', { name: 'Back' })).focus();
    user.r.rerender(at([]));
    await waitFor(() => expect(stepTitle('Virtual machine')).toHaveFocus());
    const crumb = screen.getAllByRole('button', { name: /^Back to / })[0]!;
    crumb.focus();
    user.r.rerender(at([]));
    await act(async () => { await new Promise((x) => setTimeout(x, 0)); });
    expect(crumb).toHaveFocus();
  });
  it("the focused Market button goes away with a later read: the focus moves to the step's title, and Backspace still goes back", async () => {
    const user = await open('shared');
    await user.click(await findTile(/^Virtual machine/));
    const market = await screen.findByRole('button', { name: 'See bare-metal servers' });
    market.focus();
    user.r.rerender(at([atlasOf('unknown')]));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'See bare-metal servers' })).toBeNull());
    await waitFor(() => expect(stepTitle('Virtual machine')).toHaveFocus());
    await user.keyboard('{Backspace}');
    expect(await findTile(/^Virtual machine/)).toBeInTheDocument();
  });

  it('the systems come from one array: one added there shows in the row and on the card (Mac is held as a one-line add)', async () => {
    const list = VM_SYSTEMS as string[];
    list.push('macOS');
    try {
      const user = await open('shared');
      const row = await findTile(/^Virtual machine/);
      expect(row).toHaveTextContent('Run full virtual machines: Linux, Windows, Android, macOS');
      await user.click(row);
      expect(systems()).toEqual(['Linux', 'Windows', 'Android', 'macOS']);
    } finally {
      list.pop();
    }
  });
});
