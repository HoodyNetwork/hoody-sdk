// New program, Advanced and the sandbox: a program kept may carry a working folder, description, startsecs, log
// settings and a sandbox block (the Sandbox panel's own fields, one component, judged against the draft). Only what
// was set is sent; the Hub's checks are the daemon's and run before any send; a section with a marked field opens;
// a daemon text holding an entered environment value is withheld, in the drawer and in a toast.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type * as Kit from '@kit';
import { bootFixtureCore, queryClient, type FixtureRequest, type Target } from '@core';
import { resetAttempts } from '@core/attempts';
import { snapshot } from '@core/ctx';
import { resetChanges } from '@core/changes';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { opsStore } from '../parts/ops';
import page from '../page';
import { sendAdd } from './add';
import { EMPTY_ADD } from './addform';
import { EMPTY_ADVANCED, draftFacts } from './advanced';
import { sandboxRulesFor } from './fixtures';
import { EMPTY_FORM, applyPreset, toBlock } from './form';
import { statusSamples } from './samples';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import strings from './strings.en.json';
import type { sandboxRoutes as SandboxRoutes } from './routes';
import type * as FieldsModule from './SandboxFields';

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
  /** The props the drawer last gave SandboxFields (its handlers, reached directly past the held controls). */
  fields: null as null | { set: (k: 'maxPids') => (v: string) => void; onPreset: (p: 'noNetwork') => void },
}));

// Both drawers render the one fields component: marked here, so each test can see whose fields it is.
vi.mock('./SandboxFields', async (orig) => {
  const real = await orig<typeof FieldsModule>();
  const Marked = (p: Parameters<typeof real.SandboxFields>[0]) => {
    w.fields = p as unknown as NonNullable<typeof w.fields>;
    return (
      <div data-sb-fields>
        <real.SandboxFields {...p} />
      </div>
    );
  };
  return { ...real, SandboxFields: Marked };
});

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
  w.fields = null;
});


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

const t = makeT(strings);
const preset = (p: 'noNetwork' | 'limits') => t('sb.ed.applyPreset', { preset: t(`sb.ed.preset.${p}`) });

describe('New program: Advanced', () => {
  it('is closed at first, and a plain add sends none of its fields', async () => {
    const { dlg } = await openDrawer();
    expect(within(dlg).getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-expanded', 'false');
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    const body = w.adds[0]?.body as Record<string, unknown>;
    for (const k of ['description', 'directory', 'environment', 'delay_seconds', 'logs_enabled', 'log_max_bytes', 'log_backups', 'sandbox']) expect(body).not.toHaveProperty(k);
  });

  it('sends what was set, under the daemon names', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Advanced' }));
    await userEvent.type(within(dlg).getByRole('textbox', { name: /^Working folder/ }), '/srv/app');
    await userEvent.type(within(dlg).getByRole('textbox', { name: /^Description/ }), 'My API');
    await userEvent.type(within(dlg).getByRole('textbox', { name: /^Startup time \(seconds\)/ }), '5');
    await userEvent.type(within(dlg).getByRole('textbox', { name: /^Log size limit/ }), '20');
    await userEvent.type(within(dlg).getByRole('textbox', { name: /^Older logs to keep/ }), '3');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    expect(w.adds[0]?.body).toMatchObject({ name: 'my-app', directory: '/srv/app', description: 'My API', delay_seconds: 5, log_max_bytes: 20 * 1048576, log_backups: 3 });
  });

  it('logs off sends logs_enabled false and hides the size fields', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'x' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Advanced' }));
    await userEvent.click(within(dlg).getByRole('switch', { name: /^Keep its output in log files/ }));
    expect(within(dlg).queryByRole('textbox', { name: /^Log size limit/ })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    const body = w.adds[0]?.body as Record<string, unknown>;
    expect(body.logs_enabled).toBe(false);
    expect(body).not.toHaveProperty('log_max_bytes');
  });

  it('a field the daemon would refuse stops the send, and its closed section opens to show it', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'x' });
    const adv = within(dlg).getByRole('button', { name: 'Advanced' });
    await userEvent.click(adv);
    await userEvent.type(within(dlg).getByRole('textbox', { name: /^Working folder/ }), 'srv/app');
    await userEvent.click(adv);
    expect(adv).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(adv).toHaveAttribute('aria-expanded', 'true');
    expect(within(dlg).getByText('Start with /, like /home/user/app.')).toBeVisible();
    expect(w.adds).toHaveLength(0);
  });

  it('a run once shows neither section and sends none of it', async () => {
    const { dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('radio', { name: /^Run once/ }));
    expect(within(dlg).queryByRole('button', { name: 'Advanced' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: /^Limit what this program can do/ })).toBeNull();
  });
});

describe('New program: the sandbox', () => {
  it('a preset sends the Sandbox panel block for the draft', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: /^Limit what this program can do/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: preset('noNetwork') }));
    expect(within(dlg).getByText('This program will start inside a sandbox.')).toBeVisible();
    // The line is the fold's own (its one muted line), so it still shows with the fold closed; never a loose line in the body.
    const fold = within(dlg).getByRole('button', { name: /^Limit what this program can do/ });
    expect(within(fold).getByText('This program will start inside a sandbox.')).toBeInTheDocument();
    expect(within(dlg).getAllByText('This program will start inside a sandbox.')).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    const facts = draftFacts({ ...EMPTY_ADD, name: 'my-app', command: 'node server.js' }, EMPTY_ADVANCED);
    const block = toBlock(applyPreset(EMPTY_FORM, 'noNetwork', facts));
    expect(block).not.toBeNull();
    expect((w.adds[0]?.body as Record<string, unknown>).sandbox).toEqual(block);
  });

  it('runs as root: the daemon refuses a sandbox, so nothing is sent and the reason shows', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'x' });
    const user = within(dlg).getByRole('textbox', { name: /^Run as/ });
    await userEvent.clear(user);
    await userEvent.type(user, 'root');
    const sbBtn = within(dlg).getByRole('button', { name: /^Limit what this program can do/ });
    await userEvent.click(sbBtn);
    await userEvent.click(within(dlg).getByRole('button', { name: preset('limits') }));
    await userEvent.click(sbBtn);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(sbBtn).toHaveAttribute('aria-expanded', 'true');
    expect(within(dlg).getByText(t('sb.err.root'))).toBeVisible();
    expect(w.adds).toHaveLength(0);
  });

  it('a sandbox form that restricts nothing sends no block', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'x' });
    await userEvent.click(within(dlg).getByRole('button', { name: /^Limit what this program can do/ }));
    expect(within(dlg).queryByText('This program will start inside a sandbox.')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    expect(w.adds[0]?.body).not.toHaveProperty('sandbox');
  });
});

// What was sent is what stays shown. Every sandbox and Advanced control is held for
// the whole send, so an edit cannot change the shown policy after the press; a refusal frees them, unchanged.
describe('New program: the send holds every field', () => {
  async function pendingSend() {
    let answer: (a: Ans) => void = () => undefined;
    w.add = () => new Promise<Ans>((res) => (answer = res));
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Advanced' }));
    await userEvent.click(within(dlg).getByRole('button', { name: /^Limit what this program can do/ }));
    // Advanced network is a section of its own inside the sandbox part, no disclosure to open.
    expect(within(dlg).getByRole('heading', { name: t('sb.ed.advanced') })).toBeVisible();
    await userEvent.click(within(dlg).getByRole('button', { name: /^Adding|^Add program/ }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    return { dlg, answer: (a: Ans) => answer(a) };
  }
  const held = (dlg: HTMLElement) => ({
    readOnly: within(dlg).getByRole('switch', { name: t('sb.ed.readOnlyRoot') }),
    pids: within(dlg).getByRole('textbox', { name: new RegExp(`^${t('sb.ed.maxPids')}`) }),
    rate: within(dlg).getByRole('textbox', { name: new RegExp(`^${t('sb.ed.rate')}`) }),
    none: within(dlg).getByRole('radio', { name: new RegExp(`^${t('sb.ed.mode.none')}`) }),
    preset: within(dlg).getByRole('button', { name: preset('noNetwork') }),
    folder: within(dlg).getByRole('textbox', { name: /^Working folder/ }),
    envAdd: within(dlg).getByRole('button', { name: t('np.envAdd') }),
  });

  it('while the add is unanswered nothing can be changed, and the sandbox line never appears; success closes the drawer', async () => {
    const { dlg, answer } = await pendingSend();
    const c = held(dlg);
    for (const el of [c.readOnly, c.pids, c.rate, c.none, c.folder]) expect(el).toBeDisabled();
    expect(c.preset).toBeDisabled();
    expect(c.envAdd).toBeDisabled();
    await userEvent.click(c.readOnly);
    await userEvent.type(c.pids, '50');
    expect(c.readOnly).not.toBeChecked();
    expect(c.pids).toHaveValue('');
    expect(within(dlg).queryByText(t('np.sb.on'))).toBeNull();
    expect(w.adds[0]?.body).not.toHaveProperty('sandbox');
    w.extra.push({ id: 21, name: 'my-app', status: 'stopped', states_known: true, hoody_kit: false, instances: [] });
    answer({ status: 200, body: { success: true, program: { id: 21, name: 'my-app', command: 'node server.js' } } });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New program' })).toBeNull());
    expect(w.adds).toHaveLength(1);
  });

  it('the handlers change nothing during the send either (a change or a preset reaching them past the held controls)', async () => {
    const { dlg, answer } = await pendingSend();
    const f = w.fields;
    expect(f).not.toBeNull();
    await act(async () => {
      f?.set('maxPids')('50');
      f?.onPreset('noNetwork');
    });
    expect(held(dlg).pids).toHaveValue('');
    expect(within(dlg).queryByText(t('np.sb.on'))).toBeNull();
    answer({ status: 400, body: { success: false, error: 'command not allowed' } });
    await waitFor(() => expect(held(dlg).pids).toBeEnabled());
    expect(held(dlg).pids).toHaveValue('');
    expect(within(dlg).queryByText(t('np.sb.on'))).toBeNull();
  });

  it('a refusal frees the fields, with what was shown at the press still shown', async () => {
    const { dlg, answer } = await pendingSend();
    await userEvent.type(held(dlg).pids, '50');
    answer({ status: 400, body: { success: false, error: 'command not allowed' } });
    await waitFor(() => expect(held(dlg).pids).toBeEnabled());
    const c = held(dlg);
    expect(c.pids).toHaveValue('');
    expect(c.readOnly).toBeEnabled();
    expect(c.readOnly).not.toBeChecked();
    expect(c.preset).toBeEnabled();
    expect(within(dlg).queryByText(t('np.sb.on'))).toBeNull();
    expect(w.adds).toHaveLength(1);
  });
});

// A submit opens every section holding a marked field, the sandbox part (its Advanced
// network a section of its own) and Advanced (for the sandbox's refusal of the working folder) included,
// and focus goes to the first marked field.
describe('New program: a submit shows every marked field', () => {
  async function collapsedNetwork(field: 'rate' | 'ingressFrom', value: string) {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'x' });
    // A declared port: inbound limits need one, so the only marked field is the one under test.
    await userEvent.click(within(dlg).getByRole('radio', { name: t('np.ports.one') }));
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${t('np.port')}`) }), '8080');
    const net = within(dlg).getByRole('button', { name: /^Limit what this program can do/ });
    await userEvent.click(net);
    const box = within(dlg).getByRole('textbox', { name: new RegExp(`^${t(`sb.ed.${field}`)}`) });
    await userEvent.type(box, value);
    await userEvent.click(net);
    expect(net).toHaveAttribute('aria-expanded', 'false');
    expect(box).not.toBeVisible();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    return { dlg, net, box };
  }

  it('a connection rate inside a closed sandbox part: it opens, the error shows and the field has focus', async () => {
    const { dlg, net, box } = await collapsedNetwork('rate', 'fast');
    expect(net).toHaveAttribute('aria-expanded', 'true');
    expect(box).toBeVisible();
    expect(within(dlg).getByText(t('sb.err.rate'))).toBeVisible();
    expect(box).toHaveFocus();
    expect(w.adds).toHaveLength(0);
  });

  it('an accepted-from list inside a closed sandbox part: it opens, the error shows and the field has focus', async () => {
    const { dlg, net, box } = await collapsedNetwork('ingressFrom', 'nope');
    expect(net).toHaveAttribute('aria-expanded', 'true');
    expect(box).toBeVisible();
    expect(within(dlg).getByText(t('sb.err.cidr', { item: 'nope' }))).toBeVisible();
    expect(box).toHaveFocus();
    expect(w.adds).toHaveLength(0);
  });

  it('a working folder the sandbox refuses: closed Advanced opens, the folder is marked and has focus', async () => {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'x' });
    const adv = within(dlg).getByRole('button', { name: 'Advanced' });
    await userEvent.click(adv);
    const folder = within(dlg).getByRole('textbox', { name: /^Working folder/ });
    await userEvent.type(folder, '/run/user/1000');
    await userEvent.click(adv);
    await userEvent.click(within(dlg).getByRole('button', { name: /^Limit what this program can do/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: preset('noNetwork') }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(adv).toHaveAttribute('aria-expanded', 'true');
    expect(folder).toBeVisible();
    expect(folder).toHaveAttribute('aria-invalid', 'true');
    expect(within(dlg).getAllByText(t('sb.err.runUser'))[0]).toBeVisible();
    expect(folder).toHaveFocus();
    expect(w.adds).toHaveLength(0);
  });
});

describe('New program: the environment note', () => {
  it('says where the values can be read, under the rows', async () => {
    const { dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Advanced' }));
    await userEvent.click(within(dlg).getByRole('button', { name: t('np.envAdd') }));
    const note = within(dlg).getByText(t('np.env.d'));
    const row = within(dlg).getByRole('textbox', { name: t('np.envKey', { n: 1 }) });
    expect(note.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe('the Sandbox panel editor and New program render the same fields component', () => {
  const rowOf = (): ProgramRow => ({ key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'] });

  it('both drawers hold the one SandboxFields, presets inside it', async () => {
    resetChanges();
    resetSandboxNotesForTests();
    bootFixtureCore({ rules: sandboxRulesFor({ status: { '7': statusSamples.none }, sent: [] }) });
    queryClient.clear();
    const panel = render(
      <QueryClientProvider client={queryClient}>
        <SandboxPanel row={rowOf()} />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
    const ed = await screen.findByRole('dialog');
    const edFields = ed.querySelector('[data-sb-fields]') as HTMLElement;
    expect(edFields).not.toBeNull();
    expect(within(edFields).getByRole('button', { name: preset('limits') })).toBeInTheDocument();
    panel.unmount();

    const { dlg } = await openDrawer();
    await userEvent.click(within(dlg).getByRole('button', { name: /^Limit what this program can do/ }));
    const npFields = dlg.querySelector('[data-sb-fields]') as HTMLElement;
    expect(npFields).not.toBeNull();
    expect(within(npFields).getByRole('button', { name: preset('limits') })).toBeInTheDocument();
  });
});

describe('New program: an entered environment value is never shown back', () => {
  const extra = { body: { environment: { K: 'tok-SECRET-9' } }, env: [{ name: 'K', value: 'tok-SECRET-9' }] };

  it('a refusal holding the value is withheld; the value still went in the body', async () => {
    await renderPage(page, { state: 'many' });
    w.add = () => ({ status: 400, body: { success: false, error: 'Invalid value tok-SECRET-9 for K' } });
    const out = await sendAdd({ ...EMPTY_ADD, name: 'job', command: 'x' }, snapshot().target as Target, extra);
    expect(out).toEqual({ kind: 'refused', text: '', tooLarge: false, withheld: true });
    expect((w.adds[0]?.body as Record<string, unknown>).environment).toEqual({ K: 'tok-SECRET-9' });
  });

  it('saved but NOT applied holding the value: still added (the row opens), its text withheld', async () => {
    await renderPage(page, { state: 'many' });
    w.add = () => ({ status: 400, body: { success: false, error: 'program 21 saved but NOT applied: K=tok-SECRET-9' } });
    const out = await sendAdd({ ...EMPTY_ADD, name: 'job', command: 'x' }, snapshot().target as Target, extra);
    expect(out).toEqual({ kind: 'doneProblem', key: 'prog:21', name: 'job', text: '', withheld: true });
  });

  it('a refusal naming only the variable keeps the computer’s words', async () => {
    await renderPage(page, { state: 'many' });
    w.add = () => ({ status: 400, body: { success: false, error: 'Invalid environment variable value for K: it begins or ends with a quote' } });
    const out = await sendAdd({ ...EMPTY_ADD, name: 'job', command: 'x' }, snapshot().target as Target, extra);
    expect(out).toEqual({ kind: 'refused', text: 'Invalid environment variable value for K: it begins or ends with a quote', tooLarge: false });
  });
});

describe('New program: environment rows', () => {
  async function withVar(dlg: HTMLElement, name: string, value: string) {
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add variable' }));
    const n = within(dlg).getAllByRole('textbox', { name: /^Variable \d+ name$/ }).length;
    await userEvent.type(within(dlg).getByRole('textbox', { name: `Variable ${n} name` }), name);
    await userEvent.type(within(dlg).getByLabelText(`Variable ${n} value`), value);
  }
  async function keep() {
    const { dlg } = await openDrawer();
    await fill(dlg, { name: 'my-app', command: 'node server.js' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Advanced' }));
    return dlg;
  }

  it('the rows go as the environment map; values are masked and the help says where they can be read', async () => {
    const dlg = await keep();
    expect(within(dlg).getByText("Values are kept in the program's settings and can be read there and in its logs.")).toBeVisible();
    await withVar(dlg, 'TOKEN', 'tok-SECRET-9');
    await withVar(dlg, 'PORT', '8080');
    expect(within(dlg).getByLabelText('Variable 1 value')).toHaveAttribute('type', 'password');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.adds).toHaveLength(1));
    expect((w.adds[0]?.body as Record<string, unknown>).environment).toEqual({ TOKEN: 'tok-SECRET-9', PORT: '8080' });
  });

  it('a value the daemon would refuse stops the send; the problem names the variable, never the value', async () => {
    const dlg = await keep();
    await withVar(dlg, 'QUERY', 'select 1 ; drop-me');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(within(dlg).getByText('QUERY: the value has a space before ; or #, which would cut it short.')).toBeVisible();
    expect(dlg.textContent).not.toContain('drop-me');
    expect(w.adds).toHaveLength(0);
  });

  it('with a sandbox, a loader variable is refused on its row', async () => {
    const dlg = await keep();
    await withVar(dlg, 'LD_PRELOAD', '/x.so');
    await userEvent.click(within(dlg).getByRole('button', { name: /^Limit what this program can do/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: preset('limits') }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(within(dlg).getByText('LD_PRELOAD could change how programs load, which a sandbox refuses.')).toBeVisible();
    expect(w.adds).toHaveLength(0);
  });

  it('a refusal holding a value shows the withheld line in the drawer, never the value', async () => {
    const dlg = await keep();
    await withVar(dlg, 'TOKEN', 'tok-SECRET-9');
    w.add = () => ({ status: 400, body: { success: false, error: 'refused because tok-SECRET-9 is bad' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    expect(await within(dlg).findByText("Its answer isn't shown because it held one of your environment values.")).toBeVisible();
    expect(dlg.textContent).not.toContain('tok-SECRET-9');
  });

  it('saved but NOT applied holding a value: added, the toast withholds the text', async () => {
    const dlg = await keep();
    await withVar(dlg, 'TOKEN', 'tok-SECRET-9');
    w.add = () => ({ status: 400, body: { success: false, error: 'program 21 saved but NOT applied: tok-SECRET-9' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add program' }));
    await waitFor(() => expect(w.toasts).toHaveLength(1));
    expect(w.toasts[0]).toEqual({ title: "my-app was added, but its settings aren't applied yet, so it isn't running.", tone: 'warn', body: "Its answer isn't shown because it held one of your environment values." });
  });
});
