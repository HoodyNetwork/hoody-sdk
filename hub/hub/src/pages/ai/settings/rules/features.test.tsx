// Rules & safety → Agent features on real core (fixture transport). One process-wide read (no realm sent) shows each
// feature; a writable one is a switch whose change is ONE PATCH of that feature alone, sent once: a lost answer locks the switch
// until a fresh read shows the value sent, a refusal brings it back. CLAUDE.md / AGENTS.md switch only in the Global realm (the
// agent's value is Global's); trusting the agent's own hooks is never a switch; a failed or malformed read shows no value.
import { answers, bootFixtureCore, fixtureWorld, heldChanges, queryClient, reply, useCurrentComputer, useRealms, type FixtureAnswer, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the view, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FEATURES_LOCK, featuresSource, featuresTable, type SetFeature } from './features.data';
import AgentFeatures from './Features';
import { Toaster } from '@kit';
import { featureRoutes } from './features.routes';
import strings from './strings.en.json';
import stateStrings from '@kit/states/strings.en.json';

type Row = { name: string; value: boolean; default: boolean; set: boolean; writable: boolean };
const rows = (over: Partial<Record<string, boolean>> = {}, extra: Row[] = []): Row[] => [
  { name: 'read_agents_md', value: over.read_agents_md ?? true, default: true, set: false, writable: true },
  { name: 'read_claude_md', value: over.read_claude_md ?? true, default: true, set: false, writable: true },
  { name: 'account_rotation', value: over.account_rotation ?? true, default: true, set: false, writable: true },
  { name: 'hooks_agent_self_trust', value: over.hooks_agent_self_trust ?? false, default: false, set: false, writable: over.selfTrustWritable ?? false },
  ...extra,
];

let gets: FixtureRequest[] = [];
let patches: FixtureRequest[] = [];
let state: Record<string, boolean> = {};

let withSelfTrust = true;
function Harness() {
  const target = useCurrentComputer();
  const realm = useRealms().selected;
  return target ? <AgentFeatures target={target} realm={realm} selfTrust={withSelfTrust} /> : null;
}

async function show(o: { realm?: string; get?: (r: FixtureRequest) => FixtureAnswer; patch?: (r: FixtureRequest) => FixtureAnswer; extra?: Row[]; selfTrust?: boolean } = {}) {
  withSelfTrust = o.selfTrust ?? true;
  gets = [];
  patches = [];
  state = {};
  const okGet = () => answers.ok({ features: rows(state, o.extra) });
  const okPatch = (r: FixtureRequest) => {
    Object.assign(state, (r.body as { features: Record<string, boolean> }).features);
    return answers.ok({ features: rows(state) });
  };
  bootFixtureCore({
    rules: [
      reply(featureRoutes.features, (r) => (gets.push(r), (o.get ?? okGet)(r))),
      reply(featureRoutes.setFeatures, (r) => (patches.push(r), (o.patch ?? okPatch)(r))),
    ],
    ...(o.realm !== undefined ? { realm: o.realm } : {}),
  });
  const router = createRouter({ routeTree: createRootRoute({ component: Harness }), history: createMemoryHistory({ initialEntries: ['/ai/rules'] }) });
  let page!: ReturnType<typeof render>;
  await act(async () => {
    page = render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  return page;
}
const sw = (k: 'read_agents_md' | 'read_claude_md' | 'account_rotation') => screen.getByRole('switch', { name: strings[`f.${k}`] });
const rowOf = (k: string) => screen.getByText(strings[`f.${k}` as keyof typeof strings]).closest('[class*="row"]') as HTMLElement;
/** An unknown change's banner (Check again, Stop tracking) shows in the slot under the group, not in the row. */
const pend = () => document.querySelector('[data-features-pending]') as HTMLElement;

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('agent features: the read', () => {
  it('Global: one read, three switches showing the values, self-trust shown as a value only', async () => {
    await show({ realm: 'global', get: () => answers.ok({ features: rows({ read_claude_md: false }) }) });
    expect(await screen.findByRole('switch', { name: strings['f.read_claude_md'] })).not.toBeChecked();
    expect(sw('read_agents_md')).toBeChecked();
    expect(sw('account_rotation')).toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(within(rowOf('hooks_agent_self_trust')).getByText(strings.off)).toBeInTheDocument();
    expect(within(rowOf('hooks_agent_self_trust')).getByText(strings['readOnly.help'], { exact: false })).toBeInTheDocument();
    expect(gets).toHaveLength(1);
    expect(patches).toHaveLength(0);
  });

  it('self-trust is never a switch, even when the agent says it is writable; an unknown feature is not shown', async () => {
    await show({ realm: 'global', get: () => answers.ok({ features: rows({ selfTrustWritable: true }, [{ name: 'show_thinking', value: true, default: false, set: true, writable: true }]) }) });
    await screen.findAllByRole('switch');
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(screen.queryByText(/show_thinking/)).toBeNull();
  });

  it('in another realm CLAUDE.md and AGENTS.md show no value and no switch, and name the realm; account rotation stays a switch', async () => {
    const work = fixtureWorld.realms[0]!;
    await show({ realm: work.id });
    expect(await screen.findByRole('switch', { name: strings['f.account_rotation'] })).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    for (const k of ['read_agents_md', 'read_claude_md']) {
      const r = rowOf(k);
      expect(within(r).getByText(strings['perRealm.pill'])).toBeInTheDocument();
      expect(within(r).getByText(new RegExp(`Chats in ${work.name} use ${work.name}'s own setting`))).toBeInTheDocument();
      expect(within(r).queryByText(strings.on)).toBeNull();
      expect(within(r).queryByText(strings.off)).toBeNull();
    }
  });

  it('All realms: the two rows say each realm has its own setting', async () => {
    await show({ realm: 'all' });
    await screen.findByRole('switch', { name: strings['f.account_rotation'] });
    expect(within(rowOf('read_claude_md')).getByText(strings.perRealmAll, { exact: false })).toBeInTheDocument();
  });

  it.each([
    ['a failed read (500 store_failed)', () => answers.refused(500, 'store_failed')],
    ['an answer of the wrong shape', () => answers.ok({ features: [{ name: 'read_claude_md', value: 'yes', writable: true }] })],
    ['an answer with no list', () => answers.ok({})],
  ])('%s shows the error and no value, no switch', async (_n, get) => {
    await show({ realm: 'global', get });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByText(strings.on)).toBeNull();
    expect(screen.queryByText(strings.off)).toBeNull();
  });
});

describe('agent features: a change', () => {
  it('a switch sends ONE PATCH of that feature alone, and shows the new value (no realm: the route declares none, where.test)', async () => {
    await show({ realm: 'global' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.read_claude_md'] }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.method).toBe('PATCH');
    expect(patches[0]!.body).toEqual({ features: { read_claude_md: false } });
    await waitFor(() => expect(sw('read_claude_md')).not.toBeChecked());
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2)); // the read after the change
    expect(sw('read_claude_md')).not.toBeChecked();
    expect(sw('read_agents_md')).toBeChecked();
  });

  it('a lost answer is unknown: the switch locks and nothing is resent; while the read-back fails it stays locked, a plain read keeps it locked, Check again frees it once a read-back shows the value', async () => {
    let readFails = false;
    await show({
      realm: 'global',
      get: () => (readFails ? answers.refused(500, 'store_failed') : answers.ok({ features: rows(state) })),
      patch: (r) => {
        Object.assign(state, (r.body as { features: Record<string, boolean> }).features); // it did save
        readFails = true;
        return answers.lost(10);
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.account_rotation'] }));
    // The read-back failed: no value is shown (the read is unknown too), and nothing was sent again.
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(patches).toHaveLength(1);
    readFails = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    // A plain read shows the row again, still locked: only a read-back proves the change.
    const check = await within(pend()).findByRole('button', { name: /check again/i });
    expect(sw('account_rotation')).toBeDisabled();
    await user.click(sw('account_rotation')).catch(() => undefined);
    expect(patches).toHaveLength(1);
    await user.click(check);
    await waitFor(() => expect(sw('account_rotation')).toBeEnabled());
    expect(sw('account_rotation')).not.toBeChecked();
    expect(patches).toHaveLength(1);
  });

  it('a lost answer whose read-back still shows the old value stays unknown (the write may be waiting on the settings lock): no second PATCH, and the late save is proved by Check again', async () => {
    let saved = false;
    await show({ realm: 'global', get: () => answers.ok({ features: rows(saved ? { read_agents_md: false } : {}) }), patch: () => answers.lost(10) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.read_agents_md'] }));
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2)); // the read-back, showing the old value
    const check = await within(pend()).findByRole('button', { name: /check again/i });
    expect(sw('read_agents_md')).toBeChecked();
    expect(sw('read_agents_md')).toBeDisabled();
    await user.click(sw('read_agents_md')).catch(() => undefined);
    await user.click(check); // still the old value: nothing proved
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(3));
    expect(sw('read_agents_md')).toBeDisabled();
    expect(patches).toHaveLength(1);
    saved = true; // the agent's write got the lock and saved
    await user.click(within(pend()).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(sw('read_agents_md')).toBeEnabled());
    expect(sw('read_agents_md')).not.toBeChecked();
    expect(patches).toHaveLength(1);
  });

  it('Stop tracking warns first, then frees the switch at the value read; only a new press sends again', async () => {
    await show({ realm: 'global', patch: () => answers.lost(10) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.account_rotation'] }));
    const stop = await within(pend()).findByRole('button', { name: /stop tracking/i });
    await user.click(stop);
    const dialog = await screen.findByRole('alertdialog');
    expect(sw('account_rotation')).toBeDisabled(); // nothing freed before the person confirms
    await user.click(within(dialog).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(sw('account_rotation')).toBeEnabled());
    expect(sw('account_rotation')).toBeChecked();
    expect(patches).toHaveLength(1);
    await user.click(sw('account_rotation'));
    await waitFor(() => expect(patches).toHaveLength(2));
  });

  it.each([
    ['admin_unauthorized', strings['set.admin']],
    ['settings_key_protected', strings['set.protected']],
  ])('a 403 %s is a refusal: its sentence and Details on the row, the switch back at the old value and usable', async (code, words) => {
    await show({ realm: 'global', patch: () => answers.refused(403, code) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.read_claude_md'] }));
    const row = rowOf('read_claude_md');
    expect(await within(row).findByText(words, { exact: false })).toBeInTheDocument();
    // the page's own sentence takes the mapped words' place, and the
    // rejection's Details still show its code.
    await user.click(within(row).getByRole('button', { name: stateStrings['err.details'] }));
    expect(await screen.findByText(stateStrings['err.detailsTitle'])).toBeInTheDocument();
    expect(screen.getByText(code)).toBeInTheDocument();
    expect(sw('read_claude_md')).toBeChecked();
    expect(sw('read_claude_md')).toBeEnabled();
  });

  // any other refusal rides the row as error=, so it shows the kit's words for its
  // code and Details; the two the page words itself show their own sentence with Details (above).
  it.each(['bad_request', 'constructor'])('a refused change (%s) shows the kit words for its code and Details on the row, the switch back and usable', async (code) => {
    await show({ realm: 'global', patch: () => answers.refused(400, code) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.read_claude_md'] }));
    const row = rowOf('read_claude_md');
    expect(await within(row).findByText(stateStrings['err.invalid'], { exact: false })).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: stateStrings['err.details'] }));
    expect(await screen.findByText(stateStrings['err.detailsTitle'])).toBeInTheDocument();
    if (code === 'bad_request') expect(screen.getByText('bad_request')).toBeInTheDocument();
    expect(sw('read_claude_md')).toBeChecked();
    expect(sw('read_claude_md')).toBeEnabled();
  });

  it('a 500 store_failed on the change is unknown (may have saved), never a plain failure', async () => {
    let readFails = false;
    await show({ realm: 'global', get: () => (readFails ? answers.lost(10) : answers.ok({ features: rows(state) })), patch: () => ((readFails = true), answers.refused(500, 'store_failed')) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.read_claude_md'] }));
    expect(await within(pend()).findByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(sw('read_claude_md')).toBeDisabled();
  });

  it('the CLAUDE.md / AGENTS.md help says a folder may still override it, account rotation\'s does not', async () => {
    await show({ realm: 'global' });
    await screen.findAllByRole('switch');
    expect(within(rowOf('read_claude_md')).getByText(strings.folderMayOverride, { exact: false })).toBeInTheDocument();
    expect(within(rowOf('account_rotation')).queryByText(strings.folderMayOverride, { exact: false })).toBeNull();
  });

  const titlesRow = (v: boolean): Row => ({ name: 'session_titles', value: v, default: true, set: !v, writable: true });
  const titlesRead = () => answers.ok({ features: rows(state, [titlesRow(state.session_titles ?? true)]) });
  const titlesPatch = (r: FixtureRequest) => {
    Object.assign(state, (r.body as { features: Record<string, boolean> }).features);
    return titlesRead();
  };
  it('chat titles: a switch whose help names no folder override; a change is ONE PATCH of that feature alone', async () => {
    await show({ realm: 'global', get: titlesRead, patch: titlesPatch });
    const titles = await screen.findByRole('switch', { name: strings['f.session_titles'] });
    expect(titles).toBeChecked();
    expect(within(rowOf('session_titles')).getByText(strings['f.session_titles.help'], { exact: false })).toBeInTheDocument();
    expect(within(rowOf('session_titles')).queryByText(strings.folderMayOverride, { exact: false })).toBeNull();
    await userEvent.setup().click(titles);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.body).toEqual({ features: { session_titles: false } });
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['f.session_titles'] })).not.toBeChecked());
  });

  it('chat titles: still a switch in another realm (the agent has one value for every chat)', async () => {
    await show({ realm: fixtureWorld.realms[0]!.id, get: titlesRead, patch: titlesPatch });
    expect(await screen.findByRole('switch', { name: strings['f.session_titles'] })).toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });
});

describe('agent features: Check again after the page closed', () => {
  it('a row that goes away while its change is unknown leaves the Check again toast', async () => {
    render(<Toaster />);
    const page = await show({ realm: 'global', patch: () => answers.lost(10) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.read_claude_md'] }));
    await within(pend()).findByRole('button', { name: /check again/i });
    page.unmount();
    expect(await screen.findByRole('button', { name: /check again/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(patches).toHaveLength(1);
  });

  it('core reads the features of the computer the change went to, with no page params, and the read proves it; nothing is resent', async () => {
    let readFails = false;
    await show({
      realm: 'global',
      get: () => (readFails ? answers.refused(500, 'store_failed') : answers.ok({ features: rows(state) })),
      patch: (r) => {
        Object.assign(state, (r.body as { features: Record<string, boolean> }).features);
        readFails = true;
        return answers.lost(10);
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.account_rotation'] }));
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    const sentTo = patches[0]!.target!;
    expect(heldChanges(FEATURES_LOCK)).toHaveLength(1);
    // The page closes and the cache lets its read go.
    cleanup();
    const ours = (q: { queryKey: readonly unknown[] }) => JSON.stringify(q.queryKey).includes('"ai-features"');
    expect(queryClient.getQueryCache().findAll({ predicate: ours }).length).toBeGreaterThan(0);
    queryClient.removeQueries({ predicate: ours });
    expect(queryClient.getQueryCache().findAll({ predicate: ours })).toHaveLength(0);
    readFails = false;
    gets = [];
    let m!: ReturnType<typeof featuresSource.useMutation<unknown, SetFeature>>;
    function Probe() {
      m = featuresSource.useMutation<unknown, SetFeature>('setFeature');
      return null;
    }
    render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
    let ok = false;
    await act(async () => {
      ok = await m.readBack();
    });
    expect(gets.length).toBeGreaterThanOrEqual(1);
    expect(gets[0]!.target?.container.id).toBe(sentTo.container.id);
    expect(gets[0]!.target?.project.id).toBe(sentTo.project.id);
    expect(ok).toBe(true);
    expect(heldChanges(FEATURES_LOCK)).toHaveLength(0);
    expect(patches).toHaveLength(1);
  });

  it('the features read takes no params (core builds the off-page read without them)', () => {
    const input = featuresTable.reads!.features!.input as (p?: unknown) => unknown;
    expect(() => input(undefined)).not.toThrow();
    expect(input(undefined)).toEqual({});
  });
});

describe('agent features: the switches in one group, an unknown change under it', () => {
  it('the three rows are one group named for the section; a lost answer\'s banner is under that group, names the setting, and is not in the row', async () => {
    await show({ realm: 'global', patch: () => answers.lost(10) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.account_rotation'] }));
    const group = screen.getByRole('group', { name: strings['features.title'] });
    expect(within(group).getAllByRole('switch')).toHaveLength(3);
    const check = await within(pend()).findByRole('button', { name: /check again/i });
    expect(group.contains(check)).toBe(false);
    expect(group.compareDocumentPosition(pend()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(pend()).getByText(strings['pending.known'].replace('{{name}}', strings['f.account_rotation']))).toBeInTheDocument();
    expect(within(pend()).getByText(strings['pending.stop'])).toBeInTheDocument();
    expect(within(rowOf('account_rotation')).queryByRole('button', { name: /check again/i })).toBeNull();
    expect(sw('account_rotation')).toBeDisabled();
  });

  it('two unknown changes at once: two banners, each naming its own setting; Check again on one proves only that one', async () => {
    // Neither change saved at first (a read showing the old value proves nothing); both land late.
    await show({ realm: 'global', patch: () => answers.lost(10) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: strings['f.account_rotation'] }));
    await within(pend()).findByRole('button', { name: /check again/i });
    await user.click(sw('read_claude_md'));
    await waitFor(() => expect(within(pend()).getAllByRole('button', { name: /check again/i })).toHaveLength(2));
    const known = (k: 'account_rotation' | 'read_claude_md') => strings['pending.known'].replace('{{name}}', strings[`f.${k}`]);
    const bannerOf = (k: 'account_rotation' | 'read_claude_md') => {
      let el: HTMLElement | null = within(pend()).getByText(known(k));
      while (el && el !== pend() && !within(el).queryByRole('button', { name: /check again/i })) el = el.parentElement;
      return el as HTMLElement;
    };
    const rot = bannerOf('account_rotation');
    const md = bannerOf('read_claude_md');
    expect(rot).not.toBe(pend());
    expect(md).not.toBe(pend());
    expect(rot.contains(md) || md.contains(rot)).toBe(false);
    expect(within(rot).getAllByRole('button', { name: /check again/i })).toHaveLength(1);
    expect(sw('account_rotation')).toBeDisabled();
    expect(sw('read_claude_md')).toBeDisabled();
    // both late saves land, so a read-back would prove either; only the pressed banner's own hold is checked
    state.account_rotation = false;
    state.read_claude_md = false;
    await user.click(within(rot).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(sw('account_rotation')).toBeEnabled());
    expect(within(pend()).queryByText(known('account_rotation'))).toBeNull();
    expect(within(pend()).getByText(known('read_claude_md'))).toBeInTheDocument();
    expect(sw('read_claude_md')).toBeDisabled();
    expect(patches).toHaveLength(2);
  });

  it('nothing is under the group while no change is unknown', async () => {
    await show({ realm: 'global' });
    await screen.findAllByRole('switch');
    expect(pend()).toBeEmptyDOMElement();
  });

  it('with selfTrust off (the Hooks card shows it) the self-trust row is not among the switches; the read is the same one', async () => {
    await show({ realm: 'global', selfTrust: false });
    await screen.findAllByRole('switch');
    expect(screen.queryByText(strings['f.hooks_agent_self_trust'])).toBeNull();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(gets).toHaveLength(1);
  });
});
