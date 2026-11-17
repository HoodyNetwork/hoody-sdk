// Settings → Rules & hooks: when a control cannot be shown, the page says why and what to do. With no computer
// the notice is a size="sm" EmptyState, which shows its body (a compact one would drop it, kit/states/States.compact.test);
// under All realms with a computer in several realms the one realm picker at the top says it; under All
// realms with a computer in one realm, or none, the page shows that realm, or Global (aiRealm.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { act, waitFor } from '@testing-library/react';
import { fixtureWorld, realmsView } from '@core';
import { setRealm as coreSetRealm } from '@core/ctx';
import { computerRealms } from './realmRules.testing';
import page from './page';
import strings from './strings.en.json';
import hookStrings from './settings/rules/Hooks.strings.en.json';
import rulesStrings from './settings/rules/Rules.strings.en.json';
import featureStrings from './settings/rules/strings.en.json';
import pauseStrings from '@kit/agent/Pause.strings.en.json';
import stopStrings from '@kit/agent/StopAll.strings.en.json';

const SLOW = { timeout: 5000 };
// The computer the fixture world boots with (atlas, in one realm), and two of the world's realms: under All realms a
// computer in several realms leaves no one realm to tell (the page asks); one in none shows Global.
const ATLAS = (fixtureWorld.computers[0] as { id: string }).id;
const [R1, R2] = fixtureWorld.realms.map((r) => r.id) as [string, string];
const SEVERAL = { rules: [computerRealms(ATLAS, [R1, R2])] };
const NONE = { rules: [computerRealms(ATLAS, [])] };

// The page's own chunk (its load(), import('./tab')) loads once per file before the first visit: renderPage does not
// wait for it, and its cold transform on a busy machine outlives SLOW, which is about the page, not the import.
beforeAll(async () => {
  await import('./tab');
  await import('./safety');
}, 120_000);

describe('Rules & safety says why a control is missing', () => {
  it('with no computer: "pick a computer" with its reason', async () => {
    await renderPage(page, { path: '/ai/rules', computer: false });
    const body = await screen.findByText(strings['rules.noComputer'], {}, SLOW);
    expect(body).toBeInTheDocument();
    // Drawn by the page's own state (notHere), under the page header, with nothing else on the page
    expect(screen.getAllByRole('heading', { name: strings['rules.title'] }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('heading', { name: strings['rules.emergency.title'] })).toBeNull();
    expect(document.querySelectorAll('section[data-hub-section]')).toHaveLength(0);
  });

  it('with All realms, a computer in several realms: the checked rules ask for one realm, say why, and read nothing', async () => {
    await renderPage(page, { path: '/ai/rules', realm: 'all', ...SEVERAL });
    expect(await screen.findByText(strings['rules.checked.allRealms.title'], {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText(strings['rules.checked.allRealms.body'])).toBeInTheDocument();
  });

  it('with All realms, a computer in one realm: its rules, hooks and stop are shown in that realm, no question', async () => {
    await renderPage(page, { path: '/ai/rules', realm: 'all' });
    await screen.findByRole('heading', { name: hookStrings.title }, SLOW);
    expect(screen.queryByText(strings['rules.checked.allRealms.title'])).toBeNull();
    // The stop names one realm (atlas's), and is on.
    const stopHead = await screen.findByRole('heading', { name: ss('rules.emergency.title') }, SLOW);
    const section = stopHead.closest('section')!;
    expect(within(section).getByText(/^Stop everything in realm /)).toBeInTheDocument();
    expect(within(section).queryByText(ss('rules.stop.rowAll'))).toBeNull();
    expect(within(section).queryByText(ss('rules.stop.row').replace('{{realm}}', ss('rules.global')))).toBeNull();
    expect(within(section).getByRole('button', { name: ss('rules.stop.open') })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('with All realms, a computer in no realm: its rules, hooks and stop are Global\'s, no question', async () => {
    await renderPage(page, { path: '/ai/rules', realm: 'all', ...NONE });
    await screen.findByRole('heading', { name: hookStrings.title }, SLOW);
    expect(screen.queryByText(strings['rules.checked.allRealms.title'])).toBeNull();
    const stopHead = await screen.findByRole('heading', { name: ss('rules.emergency.title') }, SLOW);
    const section = stopHead.closest('section')!;
    expect(within(section).getByText(ss('rules.stop.row').replace('{{realm}}', ss('rules.global')))).toBeInTheDocument();
    expect(within(section).queryByText(ss('rules.stop.rowAll'))).toBeNull();
    expect(within(section).getByRole('button', { name: ss('rules.stop.open') })).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// The page reads top to bottom as
// the place it shows, the standing settings (rules, hooks, agent features), then the emergency controls; one scope bar
// above every section drives the rules and the hooks together; under All realms one realm picker, at the top.
const ss = (k: string): string => {
  const v = (strings as Record<string, string>)[k];
  if (v === undefined) throw new Error(`missing string ${k}`);
  return v;
};
const headingNames = (): string[] => screen.getAllByRole('heading').map((h) => (h.textContent ?? '').trim());

describe('the page order and one scope bar', () => {
  it('reads Rules, Hooks, Agent features, then Emergency controls (Pause all and Stop everything) at the bottom', async () => {
    await renderPage(page, { path: '/ai/rules' });
    await screen.findByRole('heading', { name: hookStrings.title }, SLOW);
    await screen.findByRole('heading', { name: featureStrings['features.title'] }, SLOW);
    const names = headingNames();
    const at = (n: string) => {
      const i = names.indexOf(n);
      expect(i, `heading ${n} in ${names.join(' | ')}`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const order = [rulesStrings.title, hookStrings.title, featureStrings['features.title'], ss('rules.emergency.title')].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('one bar named "Showing" (This realm | One folder), its label shown, sits above the rules, outside every section', async () => {
    await renderPage(page, { path: '/ai/rules' });
    const rules = await screen.findByRole('heading', { name: rulesStrings.title }, SLOW);
    expect(rulesStrings.place).toBe('Showing');
    const bars = screen.getAllByRole('radiogroup', { name: rulesStrings.place });
    expect(bars).toHaveLength(1);
    const bar = bars[0]!;
    expect(within(bar).getAllByRole('radio')).toHaveLength(2);
    expect(within(bar).getByRole('radio', { name: 'This realm' })).toBeChecked();
    expect(within(bar).getByRole('radio', { name: 'One folder' })).not.toBeChecked();
    expect(bar.compareDocumentPosition(rules) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.closest('section')).toBeNull();
    // Its label shows (a SegmentedControl field label), so the bar reads as what the page is showing.
    expect(screen.getAllByText(rulesStrings.place).filter((el) => el.closest('section') === null).length).toBeGreaterThan(0);
  });

  // A guard, not a red: the place was already shared (one PlaceProvider); this keeps it so with the bar out of the rules.
  it('One folder in the bar moves the rules and the hooks together, and neither section holds a picker of its own', async () => {
    await renderPage(page, { path: '/ai/rules' });
    await screen.findByRole('heading', { name: hookStrings.title }, SLOW);
    const rulesSection = screen.getByRole('heading', { name: rulesStrings.title }).closest('section')!;
    const hooksSection = screen.getByRole('heading', { name: hookStrings.title }).closest('section')!;
    // The rules show their place by what they hold (their settings-chat words sit behind About): a folder
    // lists the counts of each place it holds; the realm does not.
    const folderPlaces = () => within(rulesSection).queryByText(rulesStrings['scope.project']);
    await within(rulesSection).findByText(rulesStrings.description, {}, SLOW);
    expect(folderPlaces()).toBeNull();
    // The hooks show their place by what they hold too (their settings-chat words are not on the card): the folder
    // fixture adds its project hook (settings/rules/fixtures.ts hooksListFor), the realm does not.
    const folderHook = () => within(hooksSection).queryByText('npm run lint -- --quiet');
    expect(await within(hooksSection).findByText('prettier --write "$HOODY_TOOL_FILE"', {}, SLOW)).toBeInTheDocument();
    expect(folderHook()).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: rulesStrings['place.folder'] }));
    expect(await within(rulesSection).findByText(rulesStrings['scope.project'], {}, SLOW)).toBeInTheDocument();
    expect(await within(hooksSection).findByText('npm run lint -- --quiet', {}, SLOW)).toBeInTheDocument();
    expect(within(hooksSection).queryByRole('radiogroup')).toBeNull();
    expect(within(rulesSection).queryByRole('radiogroup')).toBeNull();
  });
});

describe('under All realms: one realm picker at the top', () => {
  it('says "pick a realm" once, above everything else, and the stop is shown off with "Pick a realm above"', async () => {
    await renderPage(page, { path: '/ai/rules', realm: 'all', ...SEVERAL });
    const pick = await screen.findByText(ss('rules.checked.allRealms.title'), {}, SLOW);
    expect(screen.getAllByText(/pick a realm/i).filter((el) => el.closest('[role="tooltip"]') === null && !el.hidden)).toHaveLength(1);
    const stopHead = await screen.findByRole('heading', { name: ss('rules.emergency.title') }, SLOW);
    expect(pick.compareDocumentPosition(stopHead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const stop = within(stopHead.closest('section')!).getByRole('button', { name: ss('rules.stop.open') });
    expect(stop).toHaveAttribute('aria-disabled', 'true');
    expect(stop).toHaveAccessibleDescription(ss('rules.stop.pickAbove'));
    expect(ss('rules.stop.pickAbove')).toBe('Pick a realm above');
    const features = await screen.findByRole('heading', { name: featureStrings['features.title'] }, SLOW);
    expect(pick.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the realm words say that rules, hooks and the stop each belong to one realm', () => {
    for (const k of ['rules.checked.allRealms.body', 'rules.checked.allRealms.bodyPick']) {
      expect(ss(k)).toMatch(/\brules\b/i);
      expect(ss(k)).toMatch(/\bhooks\b/);
      expect(ss(k)).toMatch(/\bstop/i);
    }
  });
});

// The switches (Files, folders & accounts) render from two places, inside
// the one place provider with one realm (Settings.tsx) or alone under All realms (safety.tsx). Either way they render once, in
// the same place in the order; Folder path rules (its own section, the place's folder) shows only with one realm; trusting the
// agent's own hook edits is on the Hooks card when there is one, else with the switches.
const headings = (name: string) => screen.queryAllByRole('heading', { name });
const sectionOf = (name: string) => screen.getByRole('heading', { name }).closest('section')!;
const selfTrust = featureStrings['f.hooks_agent_self_trust'];

describe('the switches and the folder path rules: once each, in order, where stated', () => {
  it('one realm: Rules, Hooks, Files folders & accounts, Folder path rules, Emergency controls; each once', async () => {
    await renderPage(page, { path: '/ai/rules' });
    await screen.findByRole('heading', { name: featureStrings['where.title'] }, SLOW);
    await screen.findByRole('heading', { name: featureStrings['features.title'] }, SLOW);
    expect(headings(featureStrings['features.title'])).toHaveLength(1);
    expect(headings(featureStrings['where.title'])).toHaveLength(1);
    const names = headingNames();
    const at = (n: string) => {
      const i = names.indexOf(n);
      expect(i, `heading ${n} in ${names.join(' | ')}`).toBeGreaterThanOrEqual(0);
      expect(names.lastIndexOf(n), `heading ${n} once`).toBe(i);
      return i;
    };
    const order = [rulesStrings.title, hookStrings.title, featureStrings['features.title'], featureStrings['where.title'], ss('rules.emergency.title')].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('one realm: This realm says to choose a folder for the folder path rules; One folder in the bar shows its two lists', async () => {
    await renderPage(page, { path: '/ai/rules' });
    const where = (await screen.findByRole('heading', { name: featureStrings['where.title'] }, SLOW)).closest('section')!;
    expect(await within(where).findByText(featureStrings['where.noFolder.body'], {}, SLOW)).toBeInTheDocument();
    expect(within(where).queryByText('/srv/shared')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: rulesStrings['place.folder'] }));
    // the page fixture's answer (fixtures.ts): one allowed place, two paths never touched
    expect(await within(where).findByText('/srv/shared', {}, SLOW)).toBeInTheDocument();
    expect(within(where).getByText('/home/ada/.ssh')).toBeInTheDocument();
    expect(within(where).getByText('/home/ada/.aws')).toBeInTheDocument();
    expect(within(where).queryByText(featureStrings['where.noFolder.body'])).toBeNull();
  });

  it('one realm: trusting the agent\'s own hook edits is a value on the Hooks card, not among the switches', async () => {
    await renderPage(page, { path: '/ai/rules' });
    const hooks = (await screen.findByRole('heading', { name: hookStrings.title }, SLOW)).closest('section')!;
    expect(await within(hooks).findByText(selfTrust, {}, SLOW)).toBeInTheDocument();
    await screen.findByRole('heading', { name: featureStrings['features.title'] }, SLOW);
    const features = sectionOf(featureStrings['features.title']);
    await within(features).findByText(featureStrings['f.account_rotation'], {}, SLOW);
    expect(within(features).queryByText(selfTrust)).toBeNull();
    expect(screen.getAllByText(selfTrust)).toHaveLength(1);
  });

  it('one realm, then All realms, then back: the switches once each time; folder path rules only in a realm', async () => {
    // The computer is in several realms: under All realms no one realm is told, so the page asks (in one realm it would show it).
    await renderPage(page, { path: '/ai/rules', ...SEVERAL });
    const one = realmsView().selected;
    await screen.findByRole('heading', { name: featureStrings['where.title'] }, SLOW);
    expect(headings(featureStrings['features.title'])).toHaveLength(1);
    act(() => coreSetRealm('all'));
    await screen.findByText(ss('rules.checked.allRealms.title'), {}, SLOW);
    await screen.findByRole('heading', { name: featureStrings['features.title'] }, SLOW);
    expect(headings(featureStrings['features.title'])).toHaveLength(1);
    expect(headings(featureStrings['where.title'])).toHaveLength(0);
    act(() => coreSetRealm(one));
    await screen.findByRole('heading', { name: featureStrings['where.title'] }, SLOW);
    expect(screen.queryByText(ss('rules.checked.allRealms.title'))).toBeNull();
    expect(headings(featureStrings['features.title'])).toHaveLength(1);
    expect(headings(featureStrings['where.title'])).toHaveLength(1);
    // Wait for the features read (the headings come first), then exactly one self-trust row
    expect(await screen.findByText(selfTrust, {}, SLOW)).toBeInTheDocument();
    expect(screen.getAllByText(selfTrust)).toHaveLength(1);
  });

  it('All realms: the picker, then the switches once (with self-trust), then Emergency controls; no folder path rules, no Hooks card', async () => {
    await renderPage(page, { path: '/ai/rules', realm: 'all', ...SEVERAL });
    const pick = await screen.findByText(ss('rules.checked.allRealms.title'), {}, SLOW);
    const featHead = await screen.findByRole('heading', { name: featureStrings['features.title'] }, SLOW);
    await screen.findByRole('heading', { name: ss('rules.emergency.title') }, SLOW);
    expect(headings(featureStrings['features.title'])).toHaveLength(1);
    expect(headings(featureStrings['where.title'])).toHaveLength(0);
    expect(headings(hookStrings.title)).toHaveLength(0);
    expect(pick.compareDocumentPosition(featHead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const names = headingNames();
    const i = (n: string) => names.indexOf(n);
    expect(i(featureStrings['features.title'])).toBeLessThan(i(ss('rules.emergency.title')));
    const features = sectionOf(featureStrings['features.title']);
    expect(await within(features).findByText(selfTrust, {}, SLOW)).toBeInTheDocument();
    expect(screen.getAllByText(selfTrust)).toHaveLength(1);
  });
});

// Pause all and Stop everything together in one Emergency controls section at the foot,
// each a row of one group with its words in view (the pause's are the kit's one description, read as the button's).
const emergency = () => sectionOf(ss('rules.emergency.title'));
const rowLabel = (re: RegExp) => within(emergency()).getByText(re);

describe('Emergency controls: Pause all and Stop everything, their words in view', () => {
  it('one realm: the last section, its body shown; one group of two rows, the pause described by its visible words (read once), the stop on with its words', async () => {
    await renderPage(page, { path: '/ai/rules' });
    const head = await screen.findByRole('heading', { name: ss('rules.emergency.title') }, SLOW);
    await screen.findByRole('heading', { name: featureStrings['where.title'] }, SLOW);
    const names = headingNames();
    expect(names.filter((n) => n === ss('rules.emergency.title'))).toHaveLength(1);
    const sections = [...document.querySelectorAll('section[data-hub-section]')];
    expect(sections.at(-1)).toBe(head.closest('section'));
    expect(within(emergency()).getByText(ss('rules.emergency.body'))).toBeInTheDocument();
    const group = within(emergency()).getByRole('group', { name: ss('rules.emergency.title') });
    expect(group.querySelectorAll('[data-sg-row]')).toHaveLength(2); // two rows, no more
    // Pause all agents on <computer>: the kit's description, in view and read as the Pause button's description, once.
    // The test shell names no computer (the top bar's name is ''), so the row and its words say "this computer", never "on ,".
    const where = ss('rules.pause.thisComputer');
    const pauseLabel = rowLabel(/^Pause all agents on /);
    expect(pauseLabel.textContent).toBe(ss('rules.pause.row').replace('{{computer}}', where));
    const desc = pauseStrings['pause.description'].replace('{{computer}}', where);
    expect(desc).not.toMatch(/ on ,/);
    const pause = await within(group).findByRole('button', { name: /pause agents/i }, SLOW);
    expect(within(group).getByText(desc)).toBeVisible();
    expect(screen.getAllByText(desc)).toHaveLength(1);
    expect(pause).toHaveAccessibleDescription(desc);
    // Stop everything in realm <name>: its words in view, the button on
    const stopLabel = rowLabel(/^Stop everything in realm /);
    expect(group.contains(stopLabel)).toBe(true);
    expect(within(group).getByText(ss('rules.stop.help'))).toBeVisible();
    const stop = within(group).getByRole('button', { name: ss('rules.stop.open') });
    expect(stop).not.toHaveAttribute('aria-disabled', 'true');
    expect(pauseLabel.compareDocumentPosition(stopLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No section of the old two remains
    expect(headings('Pause all')).toHaveLength(0);
    expect(headings('Stop everything')).toHaveLength(0);
  });

  it('All realms: the stop row says one realm and its button is off with "Pick a realm above"; the pause row stays on', async () => {
    await renderPage(page, { path: '/ai/rules', realm: 'all', ...SEVERAL });
    await screen.findByRole('heading', { name: ss('rules.emergency.title') }, SLOW);
    const group = within(emergency()).getByRole('group', { name: ss('rules.emergency.title') });
    expect(within(group).getByText(ss('rules.stop.rowAll'))).toBeInTheDocument();
    expect(within(group).queryByText(/^Stop everything in realm /)).toBeNull();
    const stop = within(group).getByRole('button', { name: ss('rules.stop.open') });
    expect(stop).toHaveAttribute('aria-disabled', 'true');
    expect(stop).toHaveAccessibleDescription(ss('rules.stop.pickAbove'));
    expect(await within(group).findByRole('button', { name: /pause agents/i }, SLOW)).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('a stop\'s report in one realm is not shown in the next, and a confirm opened in one realm closes when the realm changes', async () => {
    await renderPage(page, { path: '/ai/rules' });
    await screen.findByRole('heading', { name: ss('rules.emergency.title') }, SLOW);
    const one = realmsView().selected;
    const next = one === 'global' ? realmsView().rows?.find((r) => r.id !== one)?.id : 'global';
    expect(next).toBeTruthy();
    const group = () => within(emergency()).getByRole('group', { name: ss('rules.emergency.title') });
    const nameIn = () => (rowLabel(/^Stop everything in realm /).textContent ?? '').replace(/^Stop everything in realm /, '');
    const first = nameIn();
    // A stop in the first realm: its report shows in the section
    await userEvent.click(within(group()).getByRole('button', { name: ss('rules.stop.open') }));
    const d = await screen.findByRole('alertdialog', {}, SLOW);
    expect(d).toHaveTextContent(stopStrings['stop.title'].replace('{{realm}}', first));
    await userEvent.click(within(d).getByRole('button', { name: stopStrings['stop.confirm'] }));
    // The report's reach line (all reached, or not) comes with its headline once the call has answered
    const reachLines = [stopStrings['stop.reached'], stopStrings['stop.partial']];
    await waitFor(() => expect(reachLines.some((w) => within(emergency()).queryByText(w, { exact: false }))).toBe(true), SLOW);
    const reach = reachLines.find((w) => within(emergency()).queryByText(w, { exact: false }))!;
    const words = within(emergency()).getByRole('status').textContent ?? '';
    expect(words.length).toBeGreaterThan(0);
    // The next realm: the first realm's report, its words and its reach line are gone
    act(() => coreSetRealm(next!));
    await waitFor(() => expect(nameIn()).not.toBe(first), SLOW);
    const second = nameIn();
    expect(within(emergency()).queryByRole('status')).toBeNull();
    expect(within(emergency()).queryByText(words)).toBeNull();
    expect(within(emergency()).queryByText(reach, { exact: false })).toBeNull();
    expect(within(emergency()).queryByLabelText(first)).toBeNull();
    // A confirm opened in the next realm, then a direct change back: the confirm is gone and nothing was confirmed
    await userEvent.click(within(group()).getByRole('button', { name: ss('rules.stop.open') }));
    expect(await screen.findByRole('alertdialog', {}, SLOW)).toHaveTextContent(stopStrings['stop.title'].replace('{{realm}}', second));
    act(() => coreSetRealm(one));
    await waitFor(() => expect(nameIn()).toBe(first), SLOW);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(emergency()).queryByRole('status')).toBeNull();
  });

  it('the stop row\'s words, in one short line, say what ends, that loops are paused and not deleted, and that other realms are untouched (the confirm says the rest)', () => {
    const h = ss('rules.stop.help');
    expect(h.length).toBeLessThanOrEqual(150);
    for (const re of [/conversations mid-turn/, /background tasks/, /agent shell jobs/, /Loops are paused, not deleted/, /Other realms are untouched/]) expect(h).toMatch(re);
  });
});

