// The inspector's Start, Stop and Restart while a sandbox save of the same program is held: while the save is sending,
// pending or unknown (core's hold) or unclear (this tab's note), the three stay in place, off, with the reason beside
// them; they come back when the hold settles (a Check that proves it) or after the warned Dismiss. A hold of another
// program changes nothing. A range program's per-port actions (the Ports table's rows and its Start a port) wait the
// same way, with the reason said once in the Ports section.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, heldChanges, queryClient, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import page from '../page';
import { Detail } from '../parts/Detail';
import { SANDBOX_LOCK } from './data';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { putNote, resetSandboxNotesForTests } from './notes';
import strings from './strings.en.json';
import type * as Nav from '@kit/nav';

// Detail is rendered here without the page router (its Ports table is a kit DataTable, whose URL hooks need one):
// without a router the table's URL state is empty and its links go nowhere; with one (renderPage) every hook is real.
vi.mock('@kit/nav', async (orig) => {
  const real = await orig<typeof Nav>();
  const { useRouter } = await import('@tanstack/react-router');
  const useRouted = () => useRouter({ warn: false }) != null;
  return {
    ...real,
    useSearch: () => (useRouted() ? real.useSearch() : {}),
    useSearchParam: (name: string) => (useRouted() ? real.useSearchParam(name) : ([undefined, () => undefined] as ReturnType<typeof real.useSearchParam>)),
    useGo: () => (useRouted() ? real.useGo() : () => undefined),
  };
});

const t = makeT(strings);
const can = { start: true, stop: true, restart: true, boot: false, portStart: false };
const rowOf = (over: Partial<ProgramRow> = {}): ProgramRow => ({
  key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null,
  up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can, ...over,
});

function detail(w: SandboxWorld, row: ProgramRow = rowOf()) {
  bootFixtureCore({ rules: sandboxRulesFor(w) });
  queryClient.clear();
  const onAct = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <Detail row={row} op={undefined} confirm={null} onAct={onAct} onConfirm={() => {}} onCancelConfirm={() => {}} onCheck={() => {}} onDismiss={async () => false} />
    </QueryClientProvider>,
  );
  return onAct;
}
const st = (w: SandboxWorld) => w.status as Record<string, unknown>;
const at = (rowKey: string) => {
  const c = snapshot();
  const tg = c.target as Target;
  return `${c.account ?? '-'}|${c.realm}|${tg.project.id}/${tg.container.id}|${rowKey}`;
};
const three = () => ['Start web', 'Restart web', 'Stop web'].map((n) => screen.getByRole('button', { name: n }));
const reason = () => screen.queryByText(t('sb.actionsWait'));
function expectOff() {
  for (const b of three()) {
    expect(b).toBeDisabled();
    // The reason is each action's description, not a hidden control.
    expect(b).toHaveAccessibleDescription(t('sb.actionsWait'));
  }
  expect(reason()).toBeVisible();
}
function expectOn() {
  for (const b of three()) expect(b).toBeEnabled();
  expect(reason()).toBeNull();
}
async function addMemory() {
  await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
  const d = await screen.findByRole('dialog');
  await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), '64M');
  await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
}

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});
afterEach(() => resetSandboxNotesForTests());

describe("the inspector's Start, Stop and Restart wait for a held sandbox save of the same program", () => {
  it('off with the reason while sending and pending; back after the warned Dismiss', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    let answer!: (a: { status: number; body: unknown }) => void;
    w.edit = () => new Promise((r) => (answer = r));
    detail(w);
    await screen.findByRole('button', { name: t('sb.add') });
    expectOn();
    await addMemory();
    // Sending: no answer yet.
    await waitFor(() => expect(w.sent).toHaveLength(1));
    await waitFor(() => expectOff());
    // Pending: the answer never told (core holds it).
    answer({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1));
    await screen.findAllByRole('button', { name: /stop tracking/i });
    expectOff();
    await userEvent.click(screen.getAllByRole('button', { name: /stop tracking/i })[0] as HTMLElement);
    // The warning alone changes nothing.
    expectOff();
    await userEvent.click(await screen.findByRole('button', { name: t('sb.out.dismissOk') }));
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0));
    await waitFor(() => expectOn());
  });

  it('back as soon as a Check proves the held save', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    detail(w);
    await addMemory();
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1));
    await waitFor(() => expectOff());
    st(w)['7'] = statusFor({ process: { max_memory: '64M' } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0));
    await waitFor(() => expectOn());
  });

  it("an unclear save in this tab holds them; another program's does not", async () => {
    detail({ status: {}, sent: [] });
    await screen.findByRole('button', { name: t('sb.add') });
    putNote(at('prog:8'), { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    await new Promise((r) => setTimeout(r, 20));
    expectOn();
    putNote(at('prog:7'), { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    await waitFor(() => expectOff());
  });

  it("a range program's per-port actions wait too", async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A2' });
    const ports = () => screen.getByRole('table', { name: 'Ports of api' });
    const port = () => within(ports()).getAllByRole('button', { name: /^(Start|Restart|Stop) port \d+ of api$/ });
    await waitFor(() => expect(port().length).toBeGreaterThan(0));
    expect(port().every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    putNote(at('prog:2'), { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    // The kit's inline row action is soft-disabled with its reason (aria-disabled, described by the reason), not native
    // disabled: it stays focusable so the reason can be read.
    await waitFor(() => {
      for (const b of port()) expect(b).toHaveAttribute('aria-disabled', 'true');
    });
    for (const b of port()) expect(b).toHaveAccessibleDescription(expect.stringContaining(t('sb.actionsWait')));
    // The Ports section says why, once, above its table.
    const section = screen.getByRole('heading', { name: 'Ports' }).closest('section') as HTMLElement;
    // The section's visible line; the Start a port button's own screen-reader description (kit ReasonButton) aside.
    const startWhy = document.getElementById(within(section).getByRole('button', { name: 'Start a port' }).getAttribute('aria-describedby') ?? '');
    const shown = within(section).getAllByText(t('sb.actionsWait')).filter((l) => l !== startWhy);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toBeVisible();
    // A port row's menu actions are off too, each with the reason.
    const row = within(ports()).getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.trim() === '8000') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    const stop = within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Stop port 8000 of api' });
    expect(stop).toHaveAttribute('aria-disabled', 'true');
    expect(stop).toHaveAccessibleDescription(expect.stringContaining(t('sb.actionsWait')));
  });

  it('the boot switch and Start a port wait too, each with the reason; an open start dialog sends nothing', async () => {
    const onAct = detail(
      { status: {}, sent: [] },
      rowOf({ port: null, range: { start: 8001, end: 8003 } as ProgramRow['range'], can: { ...can, boot: true, portStart: true } }),
    );
    const boot = () => screen.getByRole('switch', { name: 'Start with the computer' });
    const startA = () => screen.getByRole('button', { name: 'Start a port' });
    const field = () => within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Start port' });
    const go = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Start port' });
    await screen.findByRole('button', { name: t('sb.add') });
    await userEvent.click(startA());
    await screen.findByRole('dialog');
    await userEvent.type(field(), '8002');
    expect(boot()).toBeEnabled();
    expect(go()).toBeEnabled();
    putNote(at('prog:7'), { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    await waitFor(() => expect(boot()).toBeDisabled());
    expect(boot()).toHaveAccessibleDescription(t('sb.actionsWait'));
    expect(go()).toBeDisabled();
    // Enter in the field sends nothing either.
    field().closest('form')?.requestSubmit();
    await new Promise((r) => setTimeout(r, 20));
    expect(onAct).not.toHaveBeenCalled();
    // Closed, the section's Start a port stays in place, off, described by the reason.
    // No click first: Escape from wherever focus is, as a keyboard user presses it.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(startA()).toHaveAttribute('aria-disabled', 'true');
    expect(startA()).toHaveAccessibleDescription(t('sb.actionsWait'));
  });
});

describe('the Start a port dialog closes on Escape at once', () => {
  it('opened from the section, Escape with no click first closes it and sends nothing', async () => {
    const onAct = detail(
      { status: {}, sent: [] },
      rowOf({ port: null, range: { start: 8001, end: 8003 } as ProgramRow['range'], can: { ...can, boot: true, portStart: true } }),
    );
    await screen.findByRole('button', { name: t('sb.add') });
    await userEvent.click(screen.getByRole('button', { name: 'Start a port' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onAct).not.toHaveBeenCalled();
  });
});

describe('the reason is written once per place, and every waiting control is described by it once', () => {
  const lineOf = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby') ?? '');

  it('a single-port program: one visible reason under the header actions; the boot switch points at it', async () => {
    detail({ status: {}, sent: [] }, rowOf({ can: { ...can, boot: true } }));
    const boot = () => screen.getByRole('switch', { name: 'Start with the computer' });
    await screen.findByRole('button', { name: t('sb.add') });
    putNote(at('prog:7'), { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    await waitFor(() => expect(boot()).toBeDisabled());
    expect(screen.getAllByText(t('sb.actionsWait'))).toHaveLength(1);
    expect(boot()).toHaveAccessibleDescription(t('sb.actionsWait'));
    expect(lineOf(boot())).toBe(reason());
  });

  it('a range program: one more visible reason in the Ports section; none of it once released', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A2' });
    const header = () => within(screen.getByRole('region', { name: 'Details' })).getByRole('button', { name: 'Restart all ports of api' });
    const ports = () => screen.getByRole('table', { name: 'Ports of api' });
    const portButtons = () => within(ports()).getAllByRole('button', { name: /^(Start|Restart) port \d+ of api$/ });
    await waitFor(() => expect(portButtons().length).toBeGreaterThan(0));
    putNote(at('prog:2'), { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    await waitFor(() => expect(header()).toBeDisabled());
    // The header's line + the Ports section's line.
    // The kit ReasonButton's screen-reader description of the soft-disabled Start a port is not a visible line.
    // So is each soft-disabled port button's own (kit inline row action).
    const why = new Set(
      [screen.getByRole('button', { name: 'Start a port' }), ...portButtons()].map((b) => document.getElementById(b.getAttribute('aria-describedby') ?? '')),
    );
    const lines = screen.getAllByText(t('sb.actionsWait')).filter((l) => !why.has(l));
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l).toBeVisible();
    const headLine = lineOf(header());
    expect(headLine).not.toBeNull();
    const portsLine = lines.find((l) => l !== headLine) as HTMLElement;
    expect(screen.getByRole('heading', { name: 'Ports' }).closest('section')?.contains(portsLine)).toBe(true);
    for (const b of portButtons()) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      // The kit's inline word action reads "<its whole name>. <reason>" (a short word's tip starts with the full name).
      expect(b.getAttribute('aria-describedby')).toBeTruthy();
      expect(document.getElementById(b.getAttribute('aria-describedby')!)?.textContent).toBe(`${b.getAttribute('aria-label') ?? ''}. ${t('sb.actionsWait')}`);
    }
    // The ports line sits with the port controls, after the header's.
    expect((headLine as HTMLElement).compareDocumentPosition(portsLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    resetSandboxNotesForTests();
    await waitFor(() => expect(header()).toBeEnabled());
    expect(screen.queryAllByText(t('sb.actionsWait'))).toHaveLength(0);
  });
});
