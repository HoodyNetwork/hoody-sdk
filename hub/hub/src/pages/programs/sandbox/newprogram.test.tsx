// New program on the Programs page: the header's secondary beside Launch an app opens a drawer that
// keeps a program (programs/add) or runs one once (quick-start). Each send goes out once, held in core while its
// outcome is unknown: only a fresh list read proves it (a new program or temporary of the sent name, absent just
// before the send), and nothing sends it again meanwhile. A send that reached the computer closes the drawer and the
// page opens the new row. Refusals stay in the drawer with the computer's words. The list has no command, so Check
// never credits a send with a row someone else may have made.
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type * as Kit from '@kit';
import { bootFixtureCore, heldAttempts, type FixtureRequest, type Target } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget, snapshot } from '@core/ctx';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { opsStore } from '../parts/ops';
import page from '../page';
import { NewProgram } from './NewProgram';
import type { sandboxRoutes as SandboxRoutes } from './routes';
import sbStrings from './strings.en.json';

type Ans = { status: number; body: unknown };
const w = vi.hoisted(() => ({
  extra: [] as Record<string, unknown>[],
  temps: [] as Record<string, unknown>[],
  reads: 0,
  adds: [] as { route: string; body: unknown }[],
  add: null as null | ((req: unknown) => Ans | Promise<Ans>),
  quick: null as null | ((req: unknown) => Ans | Promise<Ans>),
  toasts: [] as { title: string; tone?: string; body?: string }[],
  /** While set, overview reads wait for it. */
  gate: null as null | Promise<void>,
}));

vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, showToast: (c: Parameters<typeof real.showToast>[0]) => (w.toasts.push({ title: c.title, ...(c.tone ? { tone: c.tone } : {}), ...(c.body ? { body: c.body } : {}) }), 'toast') };
});

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      // Imported here, at boot: data.ts, fixtures.ts and routes.ts import '@core' themselves.
      const rules = [
        real.reply(real.programRoutes.overview, async () => {
          const { many } = await import('../fixtures');
          w.reads++;
          if (w.gate) await w.gate;
          return real.answers.ok({ ...many, programs: [...many.programs, ...w.extra], temporary: [...(many.temporary ?? []), ...w.temps] });
        }),
      ];
      return real.bootFixtureCore({ ...o, rules: [...rules, ...addRules(real), ...(o.rules ?? [])] });
    },
  };
});

// The add and run-once answers: the test's own (w.add / w.quick), else accepted, and the new row joins the list.
function addRules(real: typeof Core) {
  return [
    real.reply(routesRef.add, async (req: FixtureRequest) => {
      const body = req.body as { name: string; command: string };
      w.adds.push({ route: 'add', body });
      if (w.add) return w.add(req);
      w.extra.push({ id: 21, name: body.name, status: 'stopped', states_known: true, hoody_kit: false, instances: [] });
      return real.answers.ok({ success: true, program: { id: 21, name: body.name, command: body.command, environment: { SECRET_LOOKING: 'never-shown' } } });
    }),
    real.reply(routesRef.quickStart, async (req: FixtureRequest) => {
      const body = req.body as { name: string };
      w.adds.push({ route: 'quickStart', body });
      if (w.quick) return w.quick(req);
      w.temps.push({ temporary_id: 'quick_1791370000000_7', name: body.name, status: 'running' });
      return real.answers.ok({ success: true, temporary_id: 'quick_1791370000000_7', name: body.name, status: 'starting', created_at: '2026-10-25T08:00:00Z' });
    }),
  ];
}
// routes.ts is read once the module graph is up (the mock factory may not import it at the top).
const routesRef: typeof SandboxRoutes = await import('./routes').then((m) => m.sandboxRoutes);

beforeEach(() => {
  opsStore.reset();
  // eslint-disable-next-line no-restricted-globals -- a held send persists in the browser's storage; each test starts with none
  localStorage.clear();
  resetAttempts();
  w.extra = [];
  w.temps = [];
  w.reads = 0;
  w.adds = [];
  w.add = null;
  w.quick = null;
  w.toasts = [];
  w.gate = null;
});

const otherComputer = (): Target => {
  const t = snapshot().target as Target;
  return { ...t, container: { ...t.container, id: `${t.container.id}-other` } };
};


const sel = (r: Awaited<ReturnType<typeof renderPage>>) => JSON.stringify(r.router.state.location.search);

async function openDrawer() {
  const r = await renderPage(page, { state: 'many' });
  await userEvent.click(await screen.findByRole('button', { name: 'New program' }));
  const dlg = await screen.findByRole('dialog', { name: 'New program' });
  return { r, dlg };
}
async function fill(dlg: HTMLElement, o: { name?: string; command?: string }) {
  if (o.name !== undefined) await userEvent.type(within(dlg).getByRole('textbox', { name: /^Name/ }), o.name);
  if (o.command !== undefined) await userEvent.type(within(dlg).getByRole('textbox', { name: /^Command/ }), o.command);
}

// The drawer's top text says what each of its two buttons does.
describe('New program: top text', () => {
  it('says what Add program and Run now do', async () => {
    const { dlg } = await openDrawer();
    expect(within(dlg).getByText('Add program keeps it. Run now starts it once.')).toBeInTheDocument();
  });
});

describe('New program: keep it', () => {
  it('sits beside Launch an app, which stays the primary', async () => {
    await renderPage(page, { state: 'many' });
    const add = await screen.findByRole('button', { name: 'New program' });
    expect(add).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Launch an app' }).length).toBeGreaterThan(0);
  });

  it('adds once with exactly the form, closes, opens the new program; the answer never reaches the page', async () => {
    const { r, dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(sel(r)).toContain('prog:21'));
    expect(w.adds).toEqual([{ route: 'add', body: { name: 'my-app', command: 'node server.js', user: 'user', autorestart: 'unexpected', boot: false } }]);
    expect(screen.queryByRole('dialog', { name: 'New program' })).toBeNull();
    expect(w.toasts).toContainEqual({ title: 'Added my-app.', tone: 'ok' });
    expect(document.body.textContent).not.toContain('never-shown');
    expect(heldAttempts()).toEqual([]);
  });

  it('sends nothing until the marked fields are fixed', async () => {
    const { dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(await within(dlg).findByText('Fix the marked fields first.')).toBeInTheDocument();
    await fill(dlg, { name: 'bad name', command: 'x' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(within(dlg).getByText(/Start with a letter or digit/)).toBeInTheDocument();
    expect(w.adds).toEqual([]);
  });

  it('a name the list already shows is not sent', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'web', command: 'node x.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(await within(dlg).findByText('This computer already has a program named web. Nothing was sent.')).toBeInTheDocument();
    expect(w.adds).toEqual([]);
    expect(heldAttempts()).toEqual([]);
  });

  it('Keep it / Run once are choice cards, and the range note is the First port field\'s own help (no loose line)', async () => {
    const { dlg } = await openDrawer();
    for (const name of [/^Keep it/, /^Run once/]) expect(within(dlg).getByRole('radio', { name }).closest('label')?.className ?? '').toMatch(/radioCard/);
    await userEvent.click(within(dlg).getByRole('radio', { name: 'A range: one copy per port' }));
    expect(within(dlg).getByRole('textbox', { name: 'First port' })).toHaveAccessibleDescription(sbStrings['np.range.d']);
    expect(within(dlg).getAllByText(sbStrings['np.range.d'])).toHaveLength(1);
  });

  it('Ports and When it stops are one segmented choice each, not a loose stack of radios', async () => {
    const { dlg } = await openDrawer();
    for (const name of ['Ports', 'When it stops']) {
      const group = within(dlg).getByRole('radiogroup', { name });
      expect(group.querySelector('input[type="radio"]')).toBeNull();
      expect(within(group).getAllByRole('radio')).toHaveLength(3);
      expect(within(dlg).getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(within(dlg).getByRole('radio', { name: 'Restart it after a failure' })).toBeChecked();
    await userEvent.click(within(dlg).getByRole('radio', { name: 'Leave it stopped' }));
    expect(within(dlg).getByRole('radio', { name: 'Leave it stopped' })).toBeChecked();
  });

  it("one port goes as ready_port; a range as port_range with its flag", async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'svc', command: 'node s.js' });
    await userEvent.click(within(dlg).getByRole('radio', { name: 'A range: one copy per port' }));
    await userEvent.type(within(dlg).getByRole('textbox', { name: 'First port' }), '8100');
    await userEvent.type(within(dlg).getByRole('textbox', { name: 'Last port' }), '8103');
    await userEvent.type(within(dlg).getByRole('textbox', { name: /^How the port is passed/ }), '-p');
    await userEvent.click(within(dlg).getByRole('switch', { name: /Start with the computer/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    expect(w.adds[0]?.body).toEqual({ name: 'svc', command: 'node s.js', user: 'user', autorestart: 'unexpected', boot: true, port_range: { start: 8100, end: 8103 }, port_param: '-p' });
  });

  it("a refusal stays in the drawer with the computer's words, and nothing is held", async () => {
    w.add = () => ({ status: 400, body: { success: false, error: 'User "user" does not exist on the system' } });
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(await within(dlg).findByText("The computer didn't add it.")).toBeInTheDocument();
    expect(within(dlg).getByText('User "user" does not exist on the system')).toBeInTheDocument();
    expect(heldAttempts()).toEqual([]);
  });

  it('saved but not applied: the program exists, so its row opens and the warning says so', async () => {
    w.add = () => ({ status: 400, body: { success: false, error: 'program 33 saved but NOT applied: the process manager refused it' } });
    const { r, dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(sel(r)).toContain('prog:33'));
    expect(w.toasts[0]).toMatchObject({ title: "my-app was added, but its settings aren't applied yet, so it isn't running.", tone: 'warn' });
    expect(heldAttempts()).toEqual([]);
  });
});

describe('New program: an unknown outcome', () => {
  it('is held, never sent twice; Check proves it only once the list shows it, then opens it', async () => {
    w.add = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const { r, dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    const band = (await within(dlg).findByText("We can't tell yet whether my-app was added.")).closest('[role="alert"]') as HTMLElement;
    expect(heldAttempts()).toHaveLength(1);
    expect(screen.queryByText(/didn't add/)).toBeNull();

    // The form starts over; the same program typed again is refused before it leaves.
    expect(within(dlg).getByRole('textbox', { name: /^Name/ })).toHaveValue('');
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(await within(dlg).findByText('An earlier send of my-app still has no answer, so nothing more was sent.')).toBeInTheDocument();
    expect(w.adds).toHaveLength(1);

    // Not in the list yet: still held.
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    expect(await within(band).findByText('Not in the list yet. The computer may still be working on it.')).toBeInTheDocument();
    expect(heldAttempts()).toHaveLength(1);

    // A program of the name shows up: it may be this send's or another client's (the list cannot say), and no resend
    // can add a second one now. Check frees the hold and opens it, worded as found, never as added.
    w.extra.push({ id: 22, name: 'my-app', status: 'stopped', states_known: true, hoody_kit: false, instances: [] });
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(sel(r)).toContain('prog:22'));
    expect(w.toasts).toEqual([{ title: 'A program named my-app is on this computer now. It may be from this send or from somewhere else.', tone: 'info' }]);
    expect(heldAttempts()).toEqual([]);
    expect(w.adds).toHaveLength(1);
  });

  it('compares whole names: a long name the page shortens for display is still found', async () => {
    w.add = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const long = `svc-${'a'.repeat(96)}`;
    const { r, dlg } = await openDrawer();
    await fill(dlg, { name: long, command: 'node s.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    const band = (await within(dlg).findByText(`We can't tell yet whether ${long} was added.`)).closest('[role="alert"]') as HTMLElement;
    // Another program whose name is only a prefix of it proves nothing.
    w.extra.push({ id: 23, name: long.slice(0, 80), status: 'stopped', states_known: true, hoody_kit: false, instances: [] });
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    expect(await within(band).findByText('Not in the list yet. The computer may still be working on it.')).toBeInTheDocument();
    w.extra.push({ id: 24, name: long, status: 'stopped', states_known: true, hoody_kit: false, instances: [] });
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(sel(r)).toContain('prog:24'));
    expect(heldAttempts()).toEqual([]);
  });

  it('a 400 with no readable text may be a post-save failure: held as unknown, never shown as refused', async () => {
    w.add = () => ({ status: 400, body: { success: false } });
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(await within(dlg).findByText("We can't tell yet whether my-app was added.")).toBeInTheDocument();
    expect(within(dlg).queryByText("The computer didn't add it.")).toBeNull();
    expect(heldAttempts()).toHaveLength(1);
  });

  it('survives closing the drawer; Dismiss asks first and only then stops tracking it', async () => {
    w.add = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await within(dlg).findByText("We can't tell yet whether my-app was added.");
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New program' })).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'New program' }));
    const again = await screen.findByRole('dialog', { name: 'New program' });
    const band = within(again).getByText("We can't tell yet whether my-app was added.").closest('[role="alert"]') as HTMLElement;
    await userEvent.click(within(band).getByRole('button', { name: 'Stop tracking' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Stop tracking this send?' });
    expect(heldAttempts()).toHaveLength(1);
    await userEvent.click(within(ask).getByRole('button', { name: 'Stop tracking anyway' }));
    await waitFor(() => expect(heldAttempts()).toEqual([]));
    expect(within(again).queryByText("We can't tell yet whether my-app was added.")).toBeNull();
  });
});

describe('New program: the held send is the kit held band', () => {
  it('one band: the sentence, one line under it, Check again and Stop tracking (no page-made rows)', async () => {
    w.add = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    const band = (await within(dlg).findByText("We can't tell yet whether my-app was added.")).closest('[role="alert"]') as HTMLElement;
    // The kit's two controls and its one line; nothing bold, nothing hand-placed.
    expect(within(band).getAllByRole('button').map((b) => b.textContent)).toEqual(['Check again', 'Stop tracking']);
    expect(band.querySelector('strong')).toBeNull();
    const note = band.querySelector('[data-held-note]') as HTMLElement;
    expect(note).toHaveTextContent(sbStrings['np.held.body']);
    // What a check said takes that line until the next one.
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(band.querySelector('[data-held-note]')).toHaveTextContent(sbStrings['np.check.notYet']));
    expect(band.querySelectorAll('[data-held-note]')).toHaveLength(1);
  });
});

describe('New program: run once, an unknown outcome', () => {
  it('a name the person typed may be another run: listed, the send stays held until Dismiss', async () => {
    w.quick = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const { r, dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('radio', { name: /^Run once/ }));
    await fill(dlg, { name: 'job', command: 'python job.py' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Run now' }));
    const band = (await within(dlg).findByText("We can't tell yet whether job started.")).closest('[role="alert"]') as HTMLElement;
    w.temps.push({ temporary_id: 'quick_1791370000000_8', name: 'job', status: 'running' });
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    expect(await within(band).findByText("A temporary program named job is listed, but it may be from somewhere else, so this send stays tracked. Stop tracking it once you're sure.")).toBeInTheDocument();
    expect(heldAttempts()).toHaveLength(1);
    expect(sel(r)).not.toContain('quick_1791370000000_8');
    expect(w.toasts).toEqual([]);
  });

  it("a Hub-made name is this send's: Check opens it, and a run the computer reports failed says it didn't start", async () => {
    w.quick = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const { r, dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('radio', { name: /^Run once/ }));
    await fill(dlg, { command: 'python job.py' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Run now' }));
    const made = String((w.adds[0]?.body as { name: string }).name);
    expect(made).toMatch(/^run-once-[a-z0-9]+-[a-z0-9]{8,}$/);
    const band = (await within(dlg).findByText(`We can't tell yet whether ${made} started.`)).closest('[role="alert"]') as HTMLElement;
    w.temps.push({ temporary_id: 'quick_1791370000000_5', name: made, status: 'failed' });
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(sel(r)).toContain('quick_1791370000000_5'));
    expect(w.toasts).toEqual([{ title: `${made} was created, but it didn't start.`, tone: 'warn' }]);
    expect(heldAttempts()).toEqual([]);
  });
});

describe('New program: run once, a start the list cannot tell', () => {
  it("a Hub-made name listed as stopped: freed and opened, worded as listed, never as started", async () => {
    w.quick = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const { r, dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('radio', { name: /^Run once/ }));
    await fill(dlg, { command: 'python job.py' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Run now' }));
    const made = String((w.adds[0]?.body as { name: string }).name);
    const band = (await within(dlg).findByText(`We can't tell yet whether ${made} started.`)).closest('[role="alert"]') as HTMLElement;
    w.temps.push({ temporary_id: 'quick_1791370000000_6', name: made, status: 'stopped' });
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(sel(r)).toContain('quick_1791370000000_6'));
    expect(w.toasts).toEqual([{ title: `${made} is listed; we can't tell yet whether it started.`, tone: 'info' }]);
    expect(heldAttempts()).toEqual([]);
  });
});

describe('New program: another computer meanwhile', () => {
  it('an answer that comes back after a computer switch is told, but opens nothing there', async () => {
    let answer!: (a: Ans) => void;
    w.add = () => new Promise<Ans>((res) => (answer = res));
    const { r, dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    act(() => setTarget(otherComputer()));
    await act(async () => answer({ status: 200, body: { success: true, program: { id: 21, name: 'my-app', command: 'node server.js' } } }));
    await waitFor(() => expect(w.toasts).toContainEqual({ title: 'Added my-app.', tone: 'ok' }));
    expect(sel(r)).not.toContain('prog:21');
  });

  it("the list refresh after an add opens the row only if the page is still on that computer", async () => {
    // The add answers and sets the gate: the page's refresh after it waits there.
    let open!: () => void;
    w.add = () => {
      w.gate = new Promise<void>((res) => (open = res));
      w.extra.push({ id: 21, name: 'my-app', status: 'stopped', states_known: true, hoody_kit: false, instances: [] });
      return { status: 200, body: { success: true, program: { id: 21, name: 'my-app', command: 'node server.js' } } };
    };
    const { r, dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.toasts).toContainEqual({ title: 'Added my-app.', tone: 'ok' }));
    // The first keep test opens prog:21 once the refresh lands; here the computer changes first.
    act(() => setTarget(otherComputer()));
    await act(async () => {
      w.gate = null;
      open();
      await new Promise((res) => setTimeout(res, 50));
    });
    expect(sel(r)).not.toContain('prog:21');
  });
});

describe("New program: a late result leaves the new computer's drawer alone", () => {
  async function mount() {
    const onAdded = vi.fn();
    bootFixtureCore(); // this file's boot (overview, add and quick-start rules): test-setup's ran without them
    render(<NewProgram target={snapshot().target as Target} onAdded={onAdded} />);
    await userEvent.click(screen.getByRole('button', { name: 'New program' }));
    return { onAdded, dlg: await screen.findByRole('dialog', { name: 'New program' }) };
  }
  async function draftOnOtherComputer() {
    act(() => setTarget(otherComputer()));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New program' })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'New program' }));
    const dlg = await screen.findByRole('dialog', { name: 'New program' });
    await fill(dlg, { name: 'draft-b', command: 'node b.js' });
    return dlg;
  }

  it('mounted without the start-time question (no page above it), the field keeps its whole help and shows no link', async () => {
    const { dlg } = await mount();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Advanced' }));
    expect(await within(dlg).findByText(sbStrings['np.startSecs.d'])).toBeInTheDocument();
    expect(within(dlg).queryByRole('link', { name: 'More about starts' })).toBeNull();
    // the Keep it / Run once link is the page's too: without it the choice shows its own help and no link
    expect(within(dlg).getByText(sbStrings['np.mode.keep.d'])).toBeInTheDocument();
    expect(within(dlg).getByText(sbStrings['np.mode.once.d'])).toBeInTheDocument();
    expect(within(dlg).queryByRole('link', { name: sbStrings['np.mode.more'] })).toBeNull();
  });

  it('a Check that lands after the switch is told, but keeps the draft and opens nothing', async () => {
    w.add = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    const { onAdded, dlg } = await mount();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    const band = (await within(dlg).findByText("We can't tell yet whether my-app was added.")).closest('[role="alert"]') as HTMLElement;
    let open!: () => void;
    w.gate = new Promise<void>((res) => (open = res));
    w.extra.push({ id: 22, name: 'my-app', status: 'stopped', states_known: true, hoody_kit: false, instances: [] });
    await userEvent.click(within(band).getByRole('button', { name: 'Check again' }));
    const b = await draftOnOtherComputer();
    await act(async () => {
      w.gate = null;
      open();
    });
    await waitFor(() => expect(w.toasts).toContainEqual({ title: 'A program named my-app is on this computer now. It may be from this send or from somewhere else.', tone: 'info' }));
    expect(screen.getByRole('dialog', { name: 'New program' })).toBe(b);
    expect(within(b).getByRole('textbox', { name: /^Name/ })).toHaveValue('draft-b');
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('a send that answers unknown after the switch keeps the draft too', async () => {
    let answer!: (a: Ans) => void;
    w.add = () => new Promise<Ans>((res) => (answer = res));
    const { onAdded, dlg } = await mount();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    const b = await draftOnOtherComputer();
    await act(async () => answer({ status: 502, body: { error: 'BAD_GATEWAY' } }));
    await waitFor(() => expect(heldAttempts()).toHaveLength(1));
    await act(async () => { await new Promise((res) => setTimeout(res, 50)); });
    expect(within(b).getByRole('textbox', { name: /^Name/ })).toHaveValue('draft-b');
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe('New program: StrictMode', () => {
  it('a send under StrictMode settles: the drawer closes and the row opens', async () => {
    const onAdded = vi.fn();
    bootFixtureCore(); // this file's boot (overview, add and quick-start rules): test-setup's ran without them
    render(
      <StrictMode>
        <NewProgram target={snapshot().target as Target} onAdded={onAdded} />
      </StrictMode>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New program' }));
    const dlg = await screen.findByRole('dialog', { name: 'New program' });
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('prog:21'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New program' })).toBeNull());
    expect(w.adds).toHaveLength(1);
  });
});

describe('New program: run once', () => {
  it('sends a quick-start with a made-up name, no ports or boot, and opens the temporary row', async () => {
    const { r, dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('radio', { name: /^Run once/ }));
    expect(within(dlg).queryByRole('radiogroup', { name: 'Ports' })).toBeNull();
    expect(within(dlg).queryByRole('switch', { name: /Start with the computer/ })).toBeNull();
    await fill(dlg, { command: 'python job.py' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(sel(r)).toContain('quick_1791370000000_7'));
    expect(w.adds).toHaveLength(1);
    const body = w.adds[0]?.body as Record<string, unknown>;
    expect(w.adds[0]?.route).toBe('quickStart');
    expect(body).toMatchObject({ command: 'python job.py', user: 'user', autorestart: 'false' });
    expect(String(body.name)).toMatch(/^run-once-[a-z0-9]+-[a-z0-9]+$/);
    expect(Object.keys(body).sort()).toEqual(['autorestart', 'command', 'name', 'user']);
  });

  it('created but did not start: its row opens with the warning', async () => {
    w.quick = () => ({ status: 400, body: { success: false, error: 'Directory /nope does not exist', temporary_id: 'quick_1791370000000_9' } });
    const { r, dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('radio', { name: /^Run once/ }));
    await fill(dlg, { name: 'job', command: 'python job.py' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(sel(r)).toContain('quick_1791370000000_9'));
    expect(w.toasts[0]).toMatchObject({ title: "job was created, but it didn't start.", tone: 'warn' });
  });
});
