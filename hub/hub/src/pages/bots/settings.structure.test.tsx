// Vitest: the Bot settings drawer keeps its form and its section menu, and each section is a kit Section (a title, one description),
// a "needs an update" line is a notice (a Band), Helpers is two sections (Who does the work, Routing; Routing only while Hoody-model
// helpers are allowed) and Advanced is a Facts list. Inside a section every field is a row of a kit setting group: no hand-made
// heading, landmark or loose paragraph; a long explanation is a Why and the voice check is a Verdict.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, settle } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, SavedSettings, SettingsPatch } from './data';
import { registerTargets } from './data';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const botWith = (extra: Partial<BotView> = {}): BotView =>
  ({
    key: KEY, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
    provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
    pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
    guardrailRevision: 1, checkerOk: true, routing: 'suggest', async: true, waitSeconds: 30, realtimeMaxItems: 40,
    speech: { enabled: false, ready: null, why: null, config: null }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' },
    caps: { botExpect: true, botGateHttp: true },
    ...extra,
  }) as BotView;

const idle = {
  run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
} as unknown as Change<SavedSettings, { patch: SettingsPatch }>;

const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
let went: string[] = [];
async function show(section: string, bot: BotView): Promise<void> {
  went = [];
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <SettingsDrawer section={section as never} onSection={(x) => went.push(String(x))} onClose={() => undefined} bot={bot} models={[]} computers={[]} save={idle as never} saveRules={idle as never} /> }),
    history: createMemoryHistory({ initialEntries: ['/bots'] }),
  });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await flush();
}

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});
afterEach(() => cleanup());

/** The kit Section with this anchor: its head holds the title and the one description. */
const sectionOf = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  expect(el, `section #${id}`).not.toBeNull();
  expect((el as HTMLElement).hasAttribute('data-hub-section')).toBe(true);
  return el as HTMLElement;
};

describe('each settings section is a kit Section with a title and one description', () => {
  const rows: Array<[string, string, string, string]> = [
    ['model', 'bot-set-model', 'model.title', 'model.desc'],
    ['behaviour', 'bot-set-behaviour', 'behaviour.title', 'behaviour.desc'],
    ['workers', 'bot-set-workers', 'workers.who.title', 'workers.desc'],
    ['guardrails', 'bot-set-guard', 'guard.title', 'guard.desc'],
    ['voice', 'bot-set-voice', 'voice.title', 'voice.desc'],
    ['advanced', 'bot-set-advanced', 'advanced.title', 'advanced.desc'],
  ];
  it.each(rows)('%s', async (section, id, title, desc) => {
    await show(section, botWith());
    const el = sectionOf(id);
    expect(within(el).getByRole('heading', { name: strings[title as keyof typeof strings] })).toBeInTheDocument();
    expect(within(el).getByText(strings[desc as keyof typeof strings])).toBeInTheDocument();
  }, 30_000);
});

describe('"this computer\'s agent is too old" is a notice, not a loose line', () => {
  it.each([
    ['workers', 'workers.needsUpdate', { workers: { known: false, backend: 'llm', allowed: ['llm'], agent: '', model: '' } }],
    ['guardrails', 'guard.needsUpdate', { caps: { botExpect: false, botGateHttp: false } }],
    ['voice', 'voice.needsUpdate', { caps: { botExpect: false, botGateHttp: false } }],
  ])('%s', async (section, key, extra) => {
    await show(section, botWith(extra as Partial<BotView>));
    const line = screen.getByText(strings[key as keyof typeof strings]);
    expect(line.closest('[role="status"]'), 'inside a Band').not.toBeNull();
    expect(line.closest('p')).toBeNull();
  }, 30_000);
});

describe('Helpers is two sections', () => {
  it('Who does the work and Routing: Routing holds the routing choice, Who does the work does not', async () => {
    await show('workers', botWith());
    const who = sectionOf('bot-set-workers');
    const routing = sectionOf('bot-set-routing');
    expect(within(routing).getByRole('heading', { name: strings['workers.routing.title'] })).toBeInTheDocument();
    expect(within(routing).getByText(strings['workers.routing.desc'])).toBeInTheDocument();
    expect(within(routing).getByRole('radiogroup', { name: strings['routing.mode'] })).toBeInTheDocument();
    expect(within(who).queryByRole('radiogroup', { name: strings['routing.mode'] })).toBeNull();
    // Who does the work comes first.
    expect(who.compareDocumentPosition(routing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, 30_000);

  it('Routing is not offered while Hoody-model helpers are not allowed', async () => {
    await show('workers', botWith({ workers: { known: true, backend: 'acp', allowed: ['acp'], agent: 'claude', model: '' } }));
    sectionOf('bot-set-workers');
    expect(document.getElementById('bot-set-routing')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: strings['routing.mode'] })).toBeNull();
  }, 30_000);
});

describe('Advanced is a Facts list', () => {
  it('shows the four read-only values as terms and values; the way to Helpers is the section\'s action, not inside a fact', async () => {
    await show('advanced', botWith());
    const el = sectionOf('bot-set-advanced');
    const dl = el.querySelector('dl') as HTMLElement | null;
    expect(dl, 'a definition list').not.toBeNull();
    const terms = Array.from((dl as HTMLElement).querySelectorAll('dt')).map((x) => x.textContent);
    expect(terms).toEqual([strings['advanced.routing'], strings['advanced.async'], strings['advanced.wait'], strings['advanced.items']]);
    const values = Array.from((dl as HTMLElement).querySelectorAll('dd')).map((x) => x.textContent);
    expect(values).toEqual([strings['advanced.routing.suggest'], strings['ui.on'], strings['advanced.seconds_other'].replace('{{count}}', '30'), '40']);
    // Facts hold no controls: the button is outside the list, and it still goes to Helpers.
    const go = within(el).getByRole('button', { name: strings['advanced.routing.seeHelpers'] });
    expect((dl as HTMLElement).contains(go)).toBe(false);
    await userEvent.click(go);
    expect(went).toEqual(['workers']);
  }, 30_000);
});

describe('the notices are only there when the agent is too old', () => {
  it.each([
    ['workers', 'workers.needsUpdate'],
    ['guardrails', 'guard.needsUpdate'],
    ['voice', 'voice.needsUpdate'],
  ])('%s: none when the agent supports it', async (section, key) => {
    await show(section, botWith());
    expect(screen.queryByText(strings[key as keyof typeof strings])).toBeNull();
  }, 30_000);
});

describe('Model keeps its two links', () => {
  it('the Helpers link goes to Helpers and the FAQ link is still offered, at the end of a Why', async () => {
    await show('model', botWith());
    const el = sectionOf('bot-set-model');
    await userEvent.click(within(el).getByRole('button', { name: strings['model.helpersLink'] }));
    expect(went).toEqual(['workers']);
    const more = within(el).getByText(strings['model.more']);
    expect(more).toBeInTheDocument();
    // The FAQ link is never loose in the body: it ends the Why whose label is the question.
    const why = within(el).getByRole('button', { name: strings['model.whyQ'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(more.closest('p')).toBeNull();
  }, 30_000);
});

/** The setting groups (kit SettingGroup) inside a section. */
const groupsIn = (el: HTMLElement): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>('[data-setting-group]'));
/** Nothing hand-made in a section body: no landmark of the page's own inside the section, no loose help paragraph. */
const noLooseParts = (el: HTMLElement): void => {
  expect(el.querySelectorAll('section').length, 'hand-made landmarks').toBe(0);
  expect(Array.from(el.querySelectorAll('p[class*="help"]')).map((p) => p.textContent), 'loose help paragraphs').toEqual([]);
};

describe('every field is a row of a setting group', () => {
  it('Behaviour: the three text fields and the switches are rows of one group', async () => {
    await show('behaviour', botWith({ mcpHints: true } as Partial<BotView>));
    const el = sectionOf('bot-set-behaviour');
    const [group] = groupsIn(el);
    expect(groupsIn(el)).toHaveLength(1);
    for (const k of ['behaviour.name', 'behaviour.role', 'behaviour.instructions'] as const) expect((group as HTMLElement).contains(within(el).getByRole('textbox', { name: strings[k] }))).toBe(true);
    for (const k of ['behaviour.yolo', 'behaviour.mcpHints'] as const) expect((group as HTMLElement).contains(within(el).getByRole('switch', { name: strings[k] }))).toBe(true);
    noLooseParts(el);
  }, 30_000);

  it('Helpers: who may work, Hoody models and Claude Code are three titled groups; the long story is one Why', async () => {
    await show('workers', botWith({ workers: { known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: '', model: '' } }));
    const el = sectionOf('bot-set-workers');
    for (const k of ['workers.allow', 'workers.llm.title', 'workers.acp.title'] as const) {
      const g = within(el).getByRole('group', { name: strings[k] });
      expect(g.closest('[data-setting-group]'), k).not.toBeNull();
    }
    const who = within(el).getByRole('group', { name: strings['workers.allow'] });
    expect(within(who).getByRole('switch', { name: strings['workers.allow.llm'] })).toBeChecked();
    expect(within(who).getByRole('switch', { name: strings['workers.allow.acp'] })).toBeChecked();
    expect(within(who).getByRole('radiogroup', { name: strings['workers.default'] })).toBeInTheDocument();
    // What they run on is one short line; the rest is behind the section's one Why.
    const line = within(el).getByText(/run on the AI helper's model/);
    expect((line.textContent ?? '').length).toBeLessThanOrEqual(150);
    expect(within(el).getByRole('button', { name: strings['workers.why.q'] })).toHaveAttribute('aria-expanded', 'false');
    expect(within(el).getByText(strings['workers.why.a'])).toBeInTheDocument();
    // When a saved change applies is shown, not behind the Why: new helpers only, helpers already working keep theirs, and
    // the Bot hears of it with its next message. It is the help of "New helpers run on", in the who-may-work group.
    expect(within(who).getByText(strings['workers.applies'])).toBeInTheDocument();
    expect(strings['workers.applies']).toMatch(/new helpers after you save/);
    expect(strings['workers.applies']).toMatch(/at work keep theirs/);
    expect(strings['workers.applies']).toMatch(/next message/);
    noLooseParts(el);
    noLooseParts(sectionOf('bot-set-routing'));
    expect(groupsIn(sectionOf('bot-set-routing'))).toHaveLength(1);
  }, 30_000);

  it('Helpers: a kind that is not allowed keeps its group and says how to set it', async () => {
    await show('workers', botWith());
    const acp = within(sectionOf('bot-set-workers')).getByRole('group', { name: strings['workers.acp.title'] });
    expect(within(acp).getByText(strings['workers.acp.off'])).toBeInTheDocument();
  }, 30_000);

  it('Guardrails: rules, the check and the computers are rows of one group; "pick one" is the help of the list it is about', async () => {
    await show('guardrails', botWith({ allowedComputers: ['c9'] }));
    const el = sectionOf('bot-set-guard');
    expect(groupsIn(el)).toHaveLength(1);
    expect(within(el).getByRole('textbox', { name: strings['guard.rules'] })).toBeInTheDocument();
    expect(within(el).getByRole('radiogroup', { name: strings['guard.mode'] })).toBeInTheDocument();
    // The help under the check says what the chosen check does.
    expect(within(el).getByText(strings['guard.mode.off.help'])).toBeInTheDocument();
    await userEvent.click(within(within(el).getByRole('group', { name: strings['guard.computersLabel'] })).getAllByRole('checkbox')[0] as HTMLElement);
    const note = within(el).getByText(strings['guard.pickOne']);
    expect(note.closest('[data-sg-row]'), 'in the list\'s row').not.toBeNull();
    expect(note.closest('[data-sg-row]')?.contains(within(el).getByRole('group', { name: strings['guard.computersLabel'] }))).toBe(true);
    // The note is a warn band attached to the list: the list is described by it, and it is a polite status.
    const list = within(el).getByRole('group', { name: strings['guard.computersLabel'] });
    const said = (list.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id));
    expect(said.find((n) => n?.textContent?.includes(strings['guard.pickOne']))).toHaveAttribute('role', 'status');
    noLooseParts(el);
  }, 30_000);

  it('Voice: the check is a verdict; the Bot\'s own settings are three groups, Listening, Speaking and Read aloud', async () => {
    const config = { sttModel: 'p/stt', ttsModel: 'p/tts', voice: '', language: '', speed: null, sttPrompt: '', speakWakes: true, speakGates: true, raw: {} };
    await show('voice', botWith({ speech: { enabled: true, ready: null, why: null, config } } as unknown as Partial<BotView>));
    const el = sectionOf('bot-set-voice');
    const plate = within(el).getByRole('group', { name: strings['voice.checkLabel'] });
    expect(within(plate).getByText(strings['voice.unchecked'])).toBeInTheDocument();
    expect(within(el).getByRole('button', { name: strings['voice.check'] })).toBeEnabled();
    for (const k of ['voice.stageListen', 'voice.stageSpeak', 'voice.readAloud'] as const) {
      expect(within(el).getByRole('group', { name: strings[k] }).closest('[data-setting-group]'), k).not.toBeNull();
    }
    expect(within(within(el).getByRole('group', { name: strings['voice.readAloud'] })).getAllByRole('switch')).toHaveLength(2);
    noLooseParts(el);
  }, 30_000);
});
