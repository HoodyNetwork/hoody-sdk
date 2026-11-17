// Vitest: a VM's power changes and its delete over their fixture states, on the list and on a VM's own screen. Each
// case proves the outcome mapping by what was sent (changeLog) and what the page then says: a done change shows in
// the VM's state; a lost answer is held, never shown as done or refused, never sent again, and freed only by a read
// that proves it or by Stop tracking; a refusal reads as a refusal; a question is bound to the VM that opened it.
import { act, isOff, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { heldChanges } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
// fixtures.ts first: it imports fixtures.power and calls its states(), so it must start the cycle.
import { requestLog } from './fixtures';
import { VM_LOCK } from './changes';
import { changeLog, failPowerDetail, failPowerList, replacePowerVm, resetPowerFixtures } from './fixtures.power';
import page from './page';
import { isVmUnsure } from './parts/unsure';
import strings from './strings.en.json';

const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const CHECK = 'Check again';
const STOP_TRACKING = 'Stop tracking';
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  resetPowerFixtures();
  changeLog.length = 0;
  requestLog.length = 0;
});

let readAgain: () => Promise<void> = async () => undefined;
/** The list narrowed to one VM, so its row is on screen whatever the sort. Returns once the row's own read answered:
 *  a row offers its actions only then. */
const listOf = async (state: string, vm: string) => {
  const r = await renderPage(page, { state, path: `/vms?q=${vm}` });
  // Every read on screen asked again now, as their own pace would later.
  readAgain = async () => { await act(async () => { await r.queryClient.invalidateQueries(); }); };
  const table = await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
  await within(table).findByText(vm, undefined, WAIT);
  await waitFor(() => expect(requestLog.some((q) => q.route === 'vm' && q.path.endsWith(`/vms/${vm}`))).toBe(true), WAIT);
  await settle(100);
  return table;
};
const button = (name: string) => screen.findByRole('button', { name }, WAIT);
const rowState = async (table: HTMLElement, word: string) => waitFor(() => expect(within(table).getByText(word)).toBeInTheDocument(), WAIT);
const openRowMenu = async (table: HTMLElement) => userEvent.click(within(table).getByRole('button', { name: 'Row actions' }));
const dialogOf = async (title: string) => screen.findByRole('alertdialog', { name: title }, WAIT).catch(() => screen.findByRole('dialog', { name: title }, WAIT));

describe('the list: each row offers the action its state calls for', () => {
  it('stopped: Start. running: Shut down. paused: Resume. not created: Remove from the list. being created: nothing', async () => {
    await renderPage(page, { state: 'power-ok' });
    const table = await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
    await within(table).findByText('web-1', undefined, WAIT);
    expect(within(table).getByRole('button', { name: say('power.named.stop', { vm: 'web-1' }) })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: say('power.named.resume', { vm: 'db-1' }) })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: say('power.named.start', { vm: 'batch' }) })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: say('delete.remove.named', { vm: 'import-1' }) })).toBeInTheDocument();
    for (const op of ['start', 'stop', 'resume', 'forceStop'] as const) expect(within(table).queryByRole('button', { name: say(`power.named.${op}`, { vm: 'build' }) })).toBeNull();
    // A failed create never offers Start.
    expect(within(table).queryByRole('button', { name: say('power.named.start', { vm: 'import-1' }) })).toBeNull();
  });

  it('reads memory, CPUs and disk of the rows on screen, each VM on its own', async () => {
    const table = await listOf('power-ok', 'win11');
    expect(await within(table).findByText('64 GB', undefined, WAIT).catch(() => within(table).findByText(/64(\.0)? Gi?B/, undefined, WAIT))).toBeInTheDocument();
  });
});

describe('the list: power', () => {
  it('Start is sent once and the row then reads Running', async () => {
    const table = await listOf('power-ok', 'win11');
    await userEvent.click(await button(say('power.named.start', { vm: 'win11' })));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'start', name: 'win11' }]), WAIT);
    await rowState(table, strings['state.running']);
    expect(await button(say('power.named.stop', { vm: 'win11' }))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CHECK })).toBeNull();
    expect(heldChanges(VM_LOCK)).toEqual([]);
  });

  it('a lost answer of a change that applied is held, then freed by the read that shows it; nothing is sent twice', async () => {
    const table = await listOf('power-lost-applied', 'web-1');
    await userEvent.click(await button(say('power.named.stop', { vm: 'web-1' })));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'stop', name: 'web-1' }]), WAIT);
    // Proved by a read (the flow's own, or Check again): the hold goes and the row reads Stopped.
    await waitFor(() => expect(heldChanges(VM_LOCK)).toEqual([]), { timeout: 15000 });
    await rowState(table, strings['state.stopped']);
    await waitFor(() => expect(screen.queryByText(say('power.held.stop', { vm: 'web-1' }))).toBeNull(), WAIT);
    expect(changeLog).toHaveLength(1);
  }, 30000);

  it('a lost answer of a change that did not apply stays held: never done, never refused, never resent; Check again only reads', async () => {
    const table = await listOf('power-lost', 'web-1');
    await userEvent.click(await button(say('power.named.stop', { vm: 'web-1' })));
    expect(await screen.findByText(say('power.held.stop', { vm: 'web-1' }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(say('power.failed.stop', { vm: 'web-1' }))).toBeNull();
    expect(within(table).getByText(strings['state.running'])).toBeInTheDocument();
    // While it is held, no other change of this VM can be sent: its action says why and does nothing.
    const again = within(table).getByRole('button', { name: say('power.named.stop', { vm: 'web-1' }) });
    expect(isOff(again)).toBe(true);
    await userEvent.click(again);
    await userEvent.click(await button(CHECK));
    expect(await screen.findByText(strings['power.note.notYet'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByText(say('power.held.stop', { vm: 'web-1' }))).toBeInTheDocument();
    expect(changeLog).toEqual([{ op: 'stop', name: 'web-1' }]);
    expect(heldChanges(VM_LOCK)).toHaveLength(1);
    // The person's own Stop tracking, after the question, frees exactly this hold and sends nothing.
    await userEvent.click(await button(STOP_TRACKING));
    const ask = await dialogOf('Stop tracking this?');
    await userEvent.click(within(ask).getByRole('button', { name: 'Stop tracking anyway' }));
    await waitFor(() => expect(heldChanges(VM_LOCK)).toEqual([]), WAIT);
    await waitFor(() => expect(screen.queryByText(say('power.held.stop', { vm: 'web-1' }))).toBeNull(), WAIT);
    expect(changeLog).toHaveLength(1);
    await waitFor(() => expect(isOff(within(table).getByRole('button', { name: say('power.named.stop', { vm: 'web-1' }) }))).toBe(false), WAIT);
  }, 30000);

  it('a refusal reads as a refusal with its reason, holds nothing, and the action comes back', async () => {
    const table = await listOf('power-refused', 'win11');
    await userEvent.click(await button(say('power.named.start', { vm: 'win11' })));
    expect(await screen.findByText(`${say('power.failed.start', { vm: 'win11' })} ${strings['power.code.BadState']}`, undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(VM_LOCK)).toEqual([]);
    expect(screen.queryByRole('button', { name: CHECK })).toBeNull();
    expect(within(table).getByText(strings['state.stopped'])).toBeInTheDocument();
    expect(isOff(within(table).getByRole('button', { name: say('power.named.start', { vm: 'win11' }) }))).toBe(false);
    expect(changeLog).toHaveLength(1);
  });

  it('a start the computer answers with "not enough memory" under a 5xx is held with that reason, not shown as refused', async () => {
    await listOf('power-reported', 'win11');
    await userEvent.click(await button(say('power.named.start', { vm: 'win11' })));
    const text = `${say('power.held.start', { vm: 'win11' })} ${say('power.reported', { reason: strings['power.code.MemoryExceedsCgroup'] })}`;
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(say('power.failed.start', { vm: 'win11' }), { exact: false })).toBeNull();
    expect(heldChanges(VM_LOCK)).toHaveLength(1);
    await userEvent.click(await button(CHECK));
    await settle();
    // Stopped with no new run proves nothing: still held, still one request.
    expect(heldChanges(VM_LOCK)).toHaveLength(1);
    expect(changeLog).toEqual([{ op: 'start', name: 'win11' }]);
  }, 30000);

  it('KVM off: Start stays visible with the reason and sends nothing', async () => {
    const table = await listOf('kvm-off', 'win11');
    const start = await within(table).findByRole('button', { name: say('power.named.start', { vm: 'win11' }) }, WAIT);
    await waitFor(() => expect(isOff(start)).toBe(true), WAIT);
    await userEvent.click(start);
    await settle(200);
    expect(changeLog).toEqual([]);
  });

  it('a VM too large for the memory left: Start is held back before anything is sent', async () => {
    const table = await listOf('power-ok', 'batch');
    const start = await within(table).findByRole('button', { name: say('power.named.start', { vm: 'batch' }) }, WAIT);
    await waitFor(() => expect(isOff(start)).toBe(true), WAIT);
    await userEvent.click(start);
    await settle(200);
    expect(changeLog).toEqual([]);
  });
});

describe('the list: a start is proved by that VM\'s own read', () => {
  it('a lost answer of a start that applied is freed although another VM on screen cannot be read', async () => {
    await renderPage(page, { state: 'power-lost-applied', path: '/vms' });
    const table = await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
    await within(table).findByText('web-1', undefined, WAIT);
    const start = await button(say('power.named.start', { vm: 'win11' }));
    await waitFor(() => expect(isOff(start)).toBe(false), WAIT);
    failPowerDetail('web-1');
    await userEvent.click(start);
    await waitFor(() => expect(changeLog).toEqual([{ op: 'start', name: 'win11' }]), WAIT);
    await waitFor(() => expect(heldChanges(VM_LOCK)).toEqual([]), { timeout: 15000 });
    expect(await button(say('power.named.stop', { vm: 'win11' }))).toBeInTheDocument();
    expect(changeLog).toHaveLength(1);
  }, 40000);
});

describe('the list: delete', () => {
  const askDelete = async (table: HTMLElement, vm: string) => {
    await openRowMenu(table);
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${say('power.named.delete', { vm })}`) }, WAIT));
    return dialogOf(say('delete.ask.title', { vm }));
  };

  it('asks first, arms only once the name is typed, sends one delete, and the row goes', async () => {
    const table = await listOf('power-ok', 'win11');
    const dialog = await askDelete(table, 'win11');
    expect(within(dialog).getByText(say('delete.ask.body', { vm: 'win11', name: 'atlas' }))).toBeInTheDocument();
    const go = within(dialog).getByRole('button', { name: strings['delete.ask.go'] });
    expect(isOff(go)).toBe(true);
    expect(changeLog).toEqual([]);
    await userEvent.type(within(dialog).getByRole('textbox'), 'win11');
    await waitFor(() => expect(isOff(go)).toBe(false), WAIT);
    await userEvent.click(go);
    await waitFor(() => expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]), WAIT);
    await waitFor(() => expect(within(table).queryByText('win11')).toBeNull(), WAIT);
    expect(heldChanges(VM_LOCK)).toEqual([]);
  }, 30000);

  it('cancel sends nothing', async () => {
    const table = await listOf('power-ok', 'win11');
    const dialog = await askDelete(table, 'win11');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await settle(200);
    expect(changeLog).toEqual([]);
    expect(within(table).getByText('win11')).toBeInTheDocument();
  });

  it('the question is bound to the VM that opened it: when another VM takes the name, it closes and sends nothing', async () => {
    const table = await listOf('power-ok', 'win11');
    await askDelete(table, 'win11');
    replacePowerVm('win11');
    await waitFor(() => expect(screen.queryByText(say('delete.ask.title', { vm: 'win11' }))).toBeNull(), { timeout: 40000 });
    expect(changeLog).toEqual([]);
  }, 60000);

  it('a lost answer of a delete that applied is held, then proved by the list no longer holding the VM', async () => {
    const table = await listOf('power-lost-applied', 'win11');
    const dialog = await askDelete(table, 'win11');
    await userEvent.type(within(dialog).getByRole('textbox'), 'win11');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.ask.go'] }));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]), WAIT);
    await waitFor(() => expect(heldChanges(VM_LOCK)).toEqual([]), { timeout: 15000 });
    await waitFor(() => expect(within(table).queryByText('win11')).toBeNull(), WAIT);
    expect(changeLog).toHaveLength(1);
  }, 40000);

  it('a lost answer of a delete that did not apply stays held and says the VM is still listed; never "deleted"', async () => {
    const table = await listOf('power-lost', 'win11');
    const dialog = await askDelete(table, 'win11');
    await userEvent.type(within(dialog).getByRole('textbox'), 'win11');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.ask.go'] }));
    expect(await screen.findByText(say('power.held.delete', { vm: 'win11' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(await button(CHECK));
    expect(await screen.findByText(strings['delete.note.notYet'], undefined, WAIT)).toBeInTheDocument();
    expect(within(table).getByText('win11')).toBeInTheDocument();
    expect(heldChanges(VM_LOCK)).toHaveLength(1);
    expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]);
  }, 40000);

  it('a VM that was not created is removed after a plain question (no name to type)', async () => {
    await listOf('power-ok', 'import-1');
    await userEvent.click(await button(say('delete.remove.named', { vm: 'import-1' })));
    const dialog = await dialogOf(say('delete.remove.title', { vm: 'import-1' }));
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.remove.go'] }));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'delete', name: 'import-1' }]), WAIT);
  });

  it('a row whose own read names another VM offers no action: neither Start nor Delete is sent by its name', async () => {
    failPowerDetail('win11', 'other');
    const table = await listOf('power-ok', 'win11');
    const start = await button(say('power.named.start', { vm: 'win11' }));
    expect(isOff(start)).toBe(true);
    await openRowMenu(table);
    const item = await screen.findByRole('menuitem', { name: new RegExp(`^${say('power.named.delete', { vm: 'win11' })}`) }, WAIT);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(within(item).getByText(strings['power.why.unread'])).toBeInTheDocument();
    expect(changeLog).toEqual([]);
  });

  it('a row whose own read fails offers no action; once it reads again, its actions come back', async () => {
    failPowerDetail('win11', 'down');
    const table = await listOf('power-ok', 'win11');
    const start = await button(say('power.named.start', { vm: 'win11' }));
    await waitFor(() => expect(isOff(start)).toBe(true), WAIT);
    await userEvent.click(start);
    await openRowMenu(table);
    const item = await screen.findByRole('menuitem', { name: new RegExp(`^${say('power.named.delete', { vm: 'win11' })}`) }, WAIT);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(within(item).getByText(strings['power.why.unread'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(changeLog).toEqual([]);
    failPowerDetail(null);
    await readAgain();
    await waitFor(() => expect(isOff(within(table).getByRole('button', { name: say('power.named.start', { vm: 'win11' }) }))).toBe(false), WAIT);
  }, 30000);

  for (const how of ['down', 'gone'] as const) {
    it(`delete asked, then the row's own read ${how === 'down' ? 'fails' : 'answers "not there"'} while the list still holds the VM: the question closes and nothing is sent`, async () => {
      const table = await listOf('power-ok', 'win11');
      const dialog = await askDelete(table, 'win11');
      await userEvent.type(within(dialog).getByRole('textbox'), 'win11');
      failPowerDetail('win11', how);
      await readAgain();
      await waitFor(() => expect(screen.queryByText(say('delete.ask.title', { vm: 'win11' }))).toBeNull(), WAIT);
      expect(within(table).getByText('win11')).toBeInTheDocument();
      expect(changeLog).toEqual([]);
    }, 30000);
  }

  it('delete asked, then the list read fails (its rows kept): the question closes, and no row offers an action', async () => {
    await askDelete(await listOf('power-ok', 'win11'), 'win11');
    failPowerList(true);
    await readAgain();
    await waitFor(() => expect(screen.queryByText(say('delete.ask.title', { vm: 'win11' }))).toBeNull(), WAIT);
    // The kept rows are drawn again under the failed read: read the table as it is now.
    const kept = await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
    expect(within(kept).getByText('win11')).toBeInTheDocument();
    const start = within(kept).getByRole('button', { name: say('power.named.start', { vm: 'win11' }) });
    await waitFor(() => expect(isOff(start)).toBe(true), WAIT);
    await userEvent.click(start);
    await settle(200);
    expect(changeLog).toEqual([]);
  }, 30000);

  it('a running VM offers Delete only with the reason it cannot be sent', async () => {
    const table = await listOf('power-ok', 'web-1');
    await openRowMenu(table);
    const item = await screen.findByRole('menuitem', { name: new RegExp(`^${say('power.named.delete', { vm: 'web-1' })}`) }, WAIT);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(within(item).getByText(strings['power.why.running'])).toBeInTheDocument();
  });
});

describe('one VM\'s screen', () => {
  const open = async (state: string, vm: string) => {
    await renderPage(page, { state, path: `/vms/${vm}` });
    await screen.findByRole('heading', { level: 1, name: vm }, WAIT);
  };

  it('the list read fails while the VM\'s own read still agrees: the main action is off and refused, and the tabs refuse to send', async () => {
    const r = await renderPage(page, { state: 'power-ok', path: '/vms/win11' });
    await screen.findByRole('heading', { level: 1, name: 'win11' }, WAIT);
    await waitFor(async () => expect(isOff(await button(strings['power.start']))).toBe(false), WAIT);
    expect(isVmUnsure('win11')).toBe(false);
    failPowerList(true);
    await act(async () => { await r.queryClient.invalidateQueries(); });
    await waitFor(() => expect(isVmUnsure('win11')).toBe(true), WAIT);
    const start = await button(strings['power.start']);
    expect(isOff(start)).toBe(true);
    await userEvent.click(start);
    await settle(200);
    expect(changeLog).toEqual([]);
  }, 30000);

  it('has its tabs, with Overview first', async () => {
    await open('power-ok', 'win11');
    const tabs = await screen.findAllByRole('tab', undefined, WAIT);
    expect(tabs[0]).toHaveTextContent(strings['tab.overview']);
    expect(await screen.findByText(strings['vm.fact.memory'], undefined, WAIT)).toBeInTheDocument();
  });

  it('a running VM read without its settings says they could not be read, never that it is being created', async () => {
    await open('power-nospec', 'web-1');
    expect(await screen.findByText(strings['vm.note.unread'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(strings['vm.note.creating'])).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });

  it('stopped: Start is the main action; pressed once it is sent once and the VM reads Running with Shut down', async () => {
    await open('power-ok', 'win11');
    await userEvent.click(await button(strings['power.start']));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'start', name: 'win11' }]), WAIT);
    expect(await button(strings['power.stop'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['power.start'] })).toBeNull();
  });

  it('paused: Resume; running: Pause is in the menu and is sent once', async () => {
    await open('power-ok', 'web-1');
    await button(strings['power.stop']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['power.pause'] }, WAIT));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'pause', name: 'web-1' }]), WAIT);
    expect(await button(strings['power.resume'])).toBeInTheDocument();
  });

  it('a VM that stopped answering says so and offers only Power off, asked first', async () => {
    await open('power-ok', 'stuck');
    expect(await screen.findByText(strings['vm.stalled'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['power.stop'] })).toBeNull();
    await userEvent.click(await button(strings['power.forceStop']));
    const dialog = await dialogOf(say('power.ask.forceStop.title', { vm: 'stuck' }));
    expect(changeLog).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['power.forceStop'] }));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'forceStop', name: 'stuck' }]), WAIT);
    expect(await button(strings['power.start'])).toBeInTheDocument();
  });

  it('a reset whose answer is lost is held with its own words and no read frees it', async () => {
    await open('power-lost', 'web-1');
    await button(strings['power.stop']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['power.reset']}`) }, WAIT));
    const dialog = await dialogOf(say('power.ask.reset.title', { vm: 'web-1' }));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['power.reset'] }));
    expect(await screen.findByText(say('power.held.reset', { vm: 'web-1' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(await button(CHECK));
    await settle();
    expect(screen.getByText(say('power.held.reset', { vm: 'web-1' }))).toBeInTheDocument();
    expect(changeLog).toEqual([{ op: 'reset', name: 'web-1' }]);
    // The held reset blocks Shut down from the Hub until the person stops tracking it.
    expect(isOff(screen.getByRole('button', { name: strings['power.stop'] }))).toBe(true);
  }, 30000);

  it('a shut-down whose answer is lost, after which another VM holds the name: held as "that VM is no longer here", and the new VM is not blocked', async () => {
    await open('power-replaced', 'web-1');
    await userEvent.click(await button(strings['power.stop']));
    expect(await screen.findByText(say('power.held.stop', { vm: 'web-1' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(await button(CHECK));
    expect(await screen.findByText(strings['power.note.gone'], undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(VM_LOCK)).toHaveLength(1);
    // The VM now under this name is another one: its Start is its own.
    const start = await button(strings['power.start']);
    expect(isOff(start)).toBe(false);
    expect(changeLog).toEqual([{ op: 'stop', name: 'web-1' }]);
  }, 30000);

  it('delete: asked with the name typed, sent once, then the list shows without the VM', async () => {
    await open('power-ok', 'win11');
    await button(strings['power.start']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['power.delete']}`) }, WAIT));
    const dialog = await dialogOf(say('delete.ask.title', { vm: 'win11' }));
    await userEvent.type(within(dialog).getByRole('textbox'), 'win11');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.ask.go'] }));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]), WAIT);
    const table = await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
    await within(table).findByText('web-1', undefined, WAIT);
    expect(within(table).queryByText('win11')).toBeNull();
  }, 30000);

  it('delete whose answer is lost: the VM then reads "not there", the delete stays held until the list proves it, then the list shows', async () => {
    await open('power-lost-applied', 'win11');
    await button(strings['power.start']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['power.delete']}`) }, WAIT));
    const dialog = await dialogOf(say('delete.ask.title', { vm: 'win11' }));
    await userEvent.type(within(dialog).getByRole('textbox'), 'win11');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.ask.go'] }));
    await waitFor(() => expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]), WAIT);
    await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, { timeout: 20000 });
    await waitFor(() => expect(heldChanges(VM_LOCK)).toEqual([]), WAIT);
    expect(changeLog).toHaveLength(1);
  }, 40000);

  it('delete asked, then the VM\'s own read fails while the list gives its name to another VM: the question closes and nothing is sent', async () => {
    await open('power-ok', 'win11');
    await button(strings['power.start']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['power.delete']}`) }, WAIT));
    await dialogOf(say('delete.ask.title', { vm: 'win11' }));
    failPowerDetail('win11');
    replacePowerVm('win11');
    await waitFor(() => expect(screen.queryByText(say('delete.ask.title', { vm: 'win11' }))).toBeNull(), { timeout: 40000 });
    // The older answer still shows; its actions say why they wait and send nothing, and the tabs are told.
    await waitFor(() => expect(isVmUnsure('win11')).toBe(true), WAIT);
    const main = await button(strings['power.start']);
    expect(isOff(main)).toBe(true);
    await userEvent.click(main);
    await settle();
    expect(changeLog).toEqual([]);
  }, 60000);

  it('the VM then reads "not there": the action left on screen is off and sends nothing', async () => {
    await open('power-ok', 'win11');
    await button(strings['power.start']);
    failPowerDetail('win11', 'gone');
    await screen.findByText(say('vm.missing.title', { vm: 'win11', name: 'atlas' }), undefined, { timeout: 40000 });
    for (const b of screen.queryAllByRole('button', { name: strings['power.start'] })) {
      expect(isOff(b)).toBe(true);
      await userEvent.click(b);
    }
    await settle();
    expect(changeLog).toEqual([]);
  }, 60000);

  it('a VM whose run failed offers Power off too: it can read failed while it still runs', async () => {
    await open('power-ok', 'batch');
    await button(strings['power.start']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['power.forceStop']}`) }, WAIT)).toBeInTheDocument();
  });

  it('a VM whose run failed shows its problem in this page\'s words, never the program\'s own text', async () => {
    await open('power-ok', 'batch');
    expect(await screen.findByText(say('vm.fault', { reason: strings['power.code.MemoryExceedsCgroup'] }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/33024 MiB/)).toBeNull();
  });

  it('a VM that needs repair says so and offers no power action', async () => {
    await open('power-ok', 'ghost');
    expect(await screen.findByText(strings['vm.orphaned'], undefined, WAIT)).toBeInTheDocument();
    for (const op of ['start', 'stop', 'resume', 'forceStop'] as const) expect(screen.queryByRole('button', { name: strings[`power.${op}`] })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('a VM being created shows how far it is and offers nothing; one not created offers only its removal', async () => {
    await open('power-ok', 'build');
    expect(await screen.findByText(strings['vm.progress'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['power.start'] })).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });
});
