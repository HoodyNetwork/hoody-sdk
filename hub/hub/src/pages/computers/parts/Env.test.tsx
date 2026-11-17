// Overview > Environment variables: the form lists the names and never a saved value; a new variable, a new
// value and a removal are one send each, new values first; a wrong name is said and nothing is sent; a refused send
// stops the rest and the report names what was not sent; a lost answer is kept, never sent again, and Check again
// only reads; closing the form drops what was typed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import type * as Core from '@core';
import page from '../page';
import pageStrings from '../strings.en.json';
import strings from './Env.strings.en.json';
import { envRoutes, envStateOf, envTable, planOf, runSteps, scrubEnvValues, stepProved, type EnvStep } from './Env.pure';

// The fake API: the variables as they stand (with values, as a signed-in session gets them), every change as sent,
// and how a change of one name is answered. The routes are set before each render (a rule matches by identity).
const api = vi.hoisted(() => ({
  vars: {} as Record<string, string>,
  sends: [] as { method: string; key: string; body: unknown }[],
  mode: {} as Record<string, 'ok' | 'expired' | 'forbidden' | 'lost'>,
  reads: 0,
  routes: null as unknown,
}));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      type R = Parameters<typeof real.reply>[0];
      const routes = api.routes as { read: R; set: R; remove: R };
      const keyOf = (path: string) => decodeURIComponent(/\/env\/([^/?]+)$/.exec(path)?.[1] ?? '');
      const answer = () => real.answers.ok({ data: { environment_vars: { ...api.vars }, values_redacted: false, synced: true, env_sync: { pending: false } } });
      const refused = (key: string) => {
        const m = api.mode[key] ?? 'ok';
        return m === 'expired' ? real.answers.refused(409, 'COMPUTER_EXPIRED') : m === 'forbidden' ? real.answers.refused(403, 'FORBIDDEN') : m === 'lost' ? real.answers.pending5xx() : null;
      };
      const read = real.reply(routes.read, () => (api.reads++, answer()));
      const set = real.reply(routes.set, (r) => {
        const key = keyOf(r.path);
        api.sends.push({ method: 'PUT', key, body: r.body });
        const no = refused(key);
        if (no) return no;
        api.vars[key] = String((r.body as { value?: unknown } | null)?.value ?? '');
        return answer();
      });
      const remove = real.reply(routes.remove, (r) => {
        const key = keyOf(r.path);
        api.sends.push({ method: 'DELETE', key, body: null });
        const no = refused(key);
        if (no) return no;
        delete api.vars[key];
        return answer();
      });
      return real.bootFixtureCore({ ...o, rules: [read, set, remove, ...(o.rules ?? [])] });
    },
  };
});

const OVERVIEW = '/computers?sel=atlas.00a1';
const sent = () => api.sends.map((x) => `${x.method} ${x.key}`);
/** Opens the form from the Overview row and returns it. */
const openForm = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['env.edit'] }, { timeout: 8000 }));
  const d = await screen.findByRole('dialog', { name: interpolate(strings['env.drawer'], { name: 'atlas' }) });
  await waitFor(() => expect(within(d).getByText(strings['env.add.title'])).toBeInTheDocument());
  return d;
};
const start = async () => {
  await renderPage(page, { path: OVERVIEW });
  return openForm();
};
const save = (d: HTMLElement) => within(d).getByRole('button', { name: strings['env.save'] });
const newValue = (d: HTMLElement, name: string) => within(d).getByLabelText(interpolate(strings['env.newValue'], { name })) as HTMLInputElement;
/** Presses the "New value" button of a listed name (the names are listed in order). */
const askNewValue = async (d: HTMLElement, name: string) => {
  const order = Object.keys(api.vars).sort();
  const buttons = within(d).getAllByRole('button', { name: strings['env.replace'] });
  const b = buttons[order.indexOf(name)];
  if (!b) throw new Error(`no New value button for ${name}`);
  await userEvent.click(b);
};
const askRemove = (d: HTMLElement, name: string) => userEvent.click(within(d).getByRole('button', { name: interpolate(strings['env.remove'], { name }) }));
const addRow = async (d: HTMLElement, n: number, name: string, value: string) => {
  await userEvent.click(within(d).getByRole('button', { name: strings['env.add.more'] }));
  await userEvent.type(within(d).getByLabelText(interpolate(strings['env.add.key'], { n })), name);
  if (value) await userEvent.type(within(d).getByLabelText(interpolate(strings['env.add.value'], { n })), value);
};

beforeEach(() => {
  api.vars = { API_KEY: 'sekret-one', DB_URL: 'sekret-two' };
  api.sends.length = 0;
  api.mode = {};
  api.reads = 0;
  api.routes = envRoutes;
});

describe('computers: environment variables, the rules (pure)', () => {
  it('the routes: a secret read, one PUT and one DELETE per variable', () => {
    expect([envRoutes.read.method, envRoutes.read.path, envRoutes.read.secret]).toEqual(['GET', '/computers/:id/env', true]);
    expect([envRoutes.set.method, envRoutes.set.path, envRoutes.set.secret]).toEqual(['PUT', '/computers/:id/env/:key', true]);
    expect([envRoutes.remove.method, envRoutes.remove.path, envRoutes.remove.secret]).toEqual(['DELETE', '/computers/:id/env/:key', true]);
  });
  it('the scrub nulls every value and keeps the names; the page keeps names only', () => {
    const raw = { data: { environment_vars: { B: 'two', A: 'one' }, env_sync: { pending: true } } };
    scrubEnvValues(raw);
    expect(raw.data.environment_vars).toEqual({ A: null, B: null });
    expect(JSON.stringify(raw)).not.toContain('one');
    expect(envStateOf(raw, 'c1')).toEqual({ computer: 'c1', names: ['A', 'B'], syncing: true });
    // An answer without the map is a failed read, never "no variables".
    expect(() => envStateOf({ data: {} }, 'c1')).toThrow();
  });
  it('an answer whose map is not where it is expected fails the scrub, so core keeps none of it', () => {
    expect(() => scrubEnvValues({ data: {} })).toThrow();
    expect(() => scrubEnvValues({ data: { vars: { A: 'one' } } })).toThrow();
    expect(() => scrubEnvValues({ environment_vars: { A: 'one' } })).toThrow();
    expect(() => scrubEnvValues({ data: { environment_vars: ['one'] } })).toThrow();
    expect(() => scrubEnvValues(null)).toThrow();
    expect(() => scrubEnvValues({ data: { environment_vars: {} } })).not.toThrow();
  });
  it('a Save whose place ended sends nothing more: the rest is not sent', async () => {
    const steps: EnvStep[] = [{ act: 'set', name: 'A', value: 'v' }, { act: 'set', name: 'B', value: 'w' }, { act: 'remove', name: 'C' }];
    const went: string[] = [];
    let live = true;
    const report = await runSteps(steps, (st) => { went.push(st.name); live = false; return Promise.resolve({ outcome: 'done' }); }, () => live);
    expect(went).toEqual(['A']);
    expect(report).toEqual({ saved: ['A'], removed: [], stop: null, notSent: ['B', 'C'] });
    // A place already gone: nothing is sent at all.
    const none: string[] = [];
    expect(await runSteps(steps, (st) => { none.push(st.name); return Promise.resolve({ outcome: 'done' }); }, () => false)).toEqual({ saved: [], removed: [], stop: null, notSent: ['A', 'B', 'C'] });
    expect(none).toEqual([]);
  });
  it('a Save stops at the first send that does not end done, and says which', async () => {
    const steps: EnvStep[] = [{ act: 'set', name: 'A', value: 'v' }, { act: 'remove', name: 'B' }, { act: 'remove', name: 'C' }];
    const by = (m: Record<string, string>) => (st: EnvStep) => Promise.resolve({ outcome: m[st.name] ?? 'done', code: 'X' });
    expect(await runSteps(steps, by({}), () => true)).toEqual({ saved: ['A'], removed: ['B', 'C'], stop: null, notSent: [] });
    expect(await runSteps(steps, by({ B: 'pending' }), () => true)).toEqual({ saved: ['A'], removed: [], stop: { act: 'remove', name: 'B', kind: 'unknown', code: 'X' }, notSent: ['C'] });
    expect(await runSteps(steps, by({ A: 'failed' }), () => true)).toEqual({ saved: [], removed: [], stop: { act: 'set', name: 'A', kind: 'refused', code: 'X' }, notSent: ['B', 'C'] });
    expect(await runSteps(steps, by({ B: 'not_sent' }), () => true)).toEqual({ saved: ['A'], removed: [], stop: { act: 'remove', name: 'B', kind: 'notSent', code: 'X' }, notSent: ['B', 'C'] });
  });
  it('a plan: new values first, removals last; nothing asked = nothing to send', () => {
    expect(planOf(['A', 'B'], {}, [])).toEqual({ steps: [], problem: null });
    expect(planOf(['A', 'B'], { A: { kind: 'remove' }, B: { kind: 'replace', value: 'v2' } }, [{ key: 'C', value: 'v3' }, { key: '', value: '' }])).toEqual({
      steps: [{ act: 'set', name: 'B', value: 'v2' }, { act: 'set', name: 'C', value: 'v3', fresh: true }, { act: 'remove', name: 'A' }],
      problem: null,
    });
  });
  it('a listed variable named like an Object member is not an edit nobody asked for', () => {
    const names = ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf'];
    expect(planOf(names, {}, [])).toEqual({ steps: [], problem: null });
    // Asked of one of them, it is planned like any other name.
    const edits = Object.create(null) as Record<string, { kind: 'remove' } | { kind: 'replace'; value: string }>;
    // Through a string-typed key: `edits.constructor` would be typed as Object's own member.
    const put = (k: string, e: { kind: 'remove' } | { kind: 'replace'; value: string }) => { edits[k] = e; };
    put('constructor', { kind: 'remove' });
    put('__proto__', { kind: 'replace', value: 'v2' });
    expect(planOf(names, edits, [])).toEqual({ steps: [{ act: 'set', name: '__proto__', value: 'v2' }, { act: 'remove', name: 'constructor' }], problem: null });
  });
  it('both changes hold in every realm view (a computer is the same computer in each)', () => {
    expect(envTable.changes?.envSet?.acrossRealms).toBe(true);
    expect(envTable.changes?.envRemove?.acrossRealms).toBe(true);
    expect(envTable.changes?.envSet?.lock).toBe(envTable.changes?.envRemove?.lock);
  });
  it('what is wrong is named and then nothing is sent', () => {
    const bad = (rows: { key: string; value: string }[], edits = {}) => planOf(['A'], edits, rows);
    expect(bad([{ key: 'HOODY_X', value: 'v' }])).toEqual({ steps: [], problem: { code: 'envKeyReserved', name: 'HOODY_X' } });
    expect(bad([{ key: 'A', value: 'v' }])).toEqual({ steps: [], problem: { code: 'listed', name: 'A' } });
    expect(bad([{ key: 'B', value: 'v' }, { key: 'B', value: 'w' }])).toEqual({ steps: [], problem: { code: 'envDuplicate', name: 'B' } });
    expect(bad([{ key: 'B', value: '' }]).problem?.code).toBe('envValueEmpty');
    expect(bad([{ key: 'B', value: 'a#b' }]).problem?.code).toBe('envValueHash');
    expect(bad([{ key: 'B', value: 'a\nC=d' }]).problem?.code).toBe('envValueUnicode');
    expect(bad([{ key: ' B', value: 'v' }]).problem?.code).toBe('envKeyShape');
    expect(bad([{ key: '#B', value: 'v' }]).problem?.code).toBe('envKeyShape');
    expect(bad([], { A: { kind: 'replace', value: '' } }).problem).toEqual({ code: 'envValueEmpty', name: 'A' });
  });
  it('a lost send is shown only by what a read can tell', () => {
    const read = (names: string[]) => [[{ computer: 'c1', names, syncing: false }]];
    expect(stepProved({ computer: 'c1', act: 'remove', name: 'A' }, read(['B']))).toBe('applied');
    expect(stepProved({ computer: 'c1', act: 'remove', name: 'A' }, read(['A', 'B']))).toBeUndefined();
    expect(stepProved({ computer: 'c1', act: 'set', name: 'C', fresh: true }, read(['A', 'C']))).toBe('applied');
    expect(stepProved({ computer: 'c1', act: 'set', name: 'C', fresh: true }, read(['A']))).toBeUndefined();
    // A replaced value: the name was listed before and after, and values are never read.
    expect(stepProved({ computer: 'c1', act: 'set', name: 'A', fresh: false }, read(['A']))).toBeUndefined();
    // Another computer's read, or none, proves nothing.
    expect(stepProved({ computer: 'c1', act: 'remove', name: 'A' }, [[{ computer: 'c2', names: [], syncing: false }]])).toBeUndefined();
    expect(stepProved({ computer: 'c1', act: 'remove', name: 'A' }, [[]])).toBeUndefined();
  });
});

describe('computers: environment variables form', () => {
  it('lists the names, never a saved value; Save is off until something is asked', async () => {
    const d = await start();
    expect(d).toHaveTextContent('API_KEY');
    expect(d).toHaveTextContent('DB_URL');
    expect(document.body.textContent ?? '').not.toContain('sekret');
    expect([...document.querySelectorAll('input, textarea')].some((x) => (x as HTMLInputElement).value.includes('sekret'))).toBe(false);
    expect(save(d)).toBeDisabled();
    expect(api.sends).toEqual([]);
  }, 40000);

  it('a new variable is one PUT of that name with exactly {value}; the report names it and the typed value is gone', async () => {
    const d = await start();
    await addRow(d, 1, 'NEW_ONE', 'v-new');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(api.sends).toHaveLength(1));
    expect(api.sends[0]).toEqual({ method: 'PUT', key: 'NEW_ONE', body: { value: 'v-new' } });
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['env.rep.saved'], { names: 'NEW_ONE' })));
    expect(within(d).queryByLabelText(interpolate(strings['env.add.value'], { n: 1 }))).toBeNull();
    expect([...document.querySelectorAll('input, textarea')].some((x) => (x as HTMLInputElement).value.includes('v-new'))).toBe(false);
    expect(api.sends).toHaveLength(1);
  }, 40000);

  it('a new value and a removal: the PUT first, then the DELETE, one each', async () => {
    const d = await start();
    await askRemove(d, 'DB_URL');
    expect(d).toHaveTextContent(strings['env.willRemove']);
    await askNewValue(d, 'API_KEY');
    await userEvent.type(newValue(d, 'API_KEY'), 'v2');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(api.sends).toHaveLength(2));
    expect(api.sends[0]).toEqual({ method: 'PUT', key: 'API_KEY', body: { value: 'v2' } });
    expect(sent()).toEqual(['PUT API_KEY', 'DELETE DB_URL']);
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['env.rep.removed'], { names: 'DB_URL' })));
    expect(d).toHaveTextContent(interpolate(strings['env.rep.saved'], { names: 'API_KEY' }));
  }, 40000);

  it('a reserved name, and a name already set, are said under the rows and nothing is sent', async () => {
    const d = await start();
    await addRow(d, 1, 'HOODY_X', 'v');
    expect(d).toHaveTextContent(interpolate(strings['env.err.at'], { name: 'HOODY_X', why: pageStrings['create.error.envKeyReserved'] }));
    expect(save(d)).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: interpolate(strings['env.add.remove'], { n: 1 }) }));
    await addRow(d, 1, 'API_KEY', 'v');
    expect(d).toHaveTextContent(interpolate(strings['env.err.listed'], { name: 'API_KEY' }));
    expect(save(d)).toBeDisabled();
    expect(api.sends).toEqual([]);
  }, 40000);

  it('an expired computer refuses the first send: the rest is not sent, the report says so, the form keeps what was typed', async () => {
    api.mode = { API_KEY: 'expired' };
    const d = await start();
    await askRemove(d, 'DB_URL');
    await askNewValue(d, 'API_KEY');
    await userEvent.type(newValue(d, 'API_KEY'), 'v2');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['env.rep.refused'], { name: 'API_KEY' })));
    expect(d).toHaveTextContent(interpolate(strings['env.rep.notSent'], { names: 'DB_URL' }));
    expect(d).toHaveTextContent(strings['env.why.expired']);
    expect(sent()).toEqual(['PUT API_KEY']);
    expect(newValue(d, 'API_KEY')).toHaveValue('v2');
    expect(d).toHaveTextContent(strings['env.willRemove']);
  }, 40000);

  it('a 403 on a change says the server is no longer the owner’s', async () => {
    api.mode = { DB_URL: 'forbidden' };
    const d = await start();
    await askRemove(d, 'DB_URL');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(d).toHaveTextContent(strings['env.why.lostServer']));
    expect(sent()).toEqual(['DELETE DB_URL']);
  }, 40000);

  it('a lost answer mid-way: what was saved, what is not known and what was not sent are named; nothing is sent again; Check again only reads', async () => {
    api.vars = { A_ONE: 'sekret-a', B_TWO: 'sekret-b', C_THREE: 'sekret-c' };
    api.mode = { B_TWO: 'lost' };
    const d = await start();
    await askRemove(d, 'B_TWO');
    await askRemove(d, 'C_THREE');
    await askNewValue(d, 'A_ONE');
    await userEvent.type(newValue(d, 'A_ONE'), 'v2');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    const unknown = interpolate(strings['env.wait.remove'], { name: 'B_TWO' });
    await waitFor(() => expect(d).toHaveTextContent(unknown), { timeout: 8000 });
    expect(d).toHaveTextContent(interpolate(strings['env.rep.saved'], { names: 'A_ONE' }));
    expect(d).toHaveTextContent(interpolate(strings['env.rep.notSent'], { names: 'C_THREE' }));
    expect(sent()).toEqual(['PUT A_ONE', 'DELETE B_TWO']);
    expect(save(d)).toBeDisabled();
    // A read that still lists the name frees nothing.
    await userEvent.click(within(d).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(within(d).getByRole('button', { name: 'Check again' })).toBeEnabled());
    expect(d).toHaveTextContent(unknown);
    // The removal did land: a read made after it shows the name gone, and the form comes back with what was not sent.
    delete api.vars.B_TWO;
    api.mode = {};
    await waitFor(
      async () => {
        const again = within(d).queryByRole('button', { name: 'Check again' });
        if (again) await userEvent.click(again);
        expect(d).not.toHaveTextContent(unknown);
      },
      { timeout: 12000 },
    );
    expect(sent()).toEqual(['PUT A_ONE', 'DELETE B_TWO']);
    await waitFor(() => expect(d).toHaveTextContent(strings['env.willRemove']));
    expect(d).not.toHaveTextContent('B_TWO');
    await waitFor(() => expect(save(d)).toBeEnabled());
  }, 60000);

  it('closing the form drops a typed value: opened again, it is not there', async () => {
    const d = await start();
    await askNewValue(d, 'API_KEY');
    await userEvent.type(newValue(d, 'API_KEY'), 'typed-secret');
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const again = await openForm();
    expect(within(again).queryByLabelText(interpolate(strings['env.newValue'], { name: 'API_KEY' }))).toBeNull();
    expect([...document.querySelectorAll('input, textarea')].some((x) => (x as HTMLInputElement).value.includes('typed-secret'))).toBe(false);
    expect(api.sends).toEqual([]);
  }, 40000);
});
