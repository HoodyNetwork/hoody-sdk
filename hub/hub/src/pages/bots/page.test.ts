// Vitest: the bots page in its fixture states, by keyboard and role.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { localSetting } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import ipStrings from '@kit/forms/IpAllowlistField.strings.en.json';
import K from '@kit/agent/Conversation.strings.en.json';

// The page loads lazily: load it once so no test pays for the first import.
// The page opens on cards; List (the remembered choice) is the dense table. Set once the page is up: a render starts with
// clean storage.
const asTable = () => act(async () => void localSetting('hub.v3.table.present.bots').set('list'));
afterEach(() => void localSetting('hub.v3.table.present.bots').set(null));
beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state?: string, extra = '') => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(CHIEF)}${extra}` });

describe('bots list', () => {
  it('lists the Bot that needs you first and opens a Bot with Enter', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', { name: strings.title });
    await within(table).findByRole('row', { name: /Chief/ });
    const rows = within(table).getAllByRole('row');
    const botRows = rows.filter((r) => /Chief|Support|Digest|Scout/.test(r.textContent ?? ''));
    expect(botRows[0]?.textContent).toContain('Chief');
    const first = rows.find((r) => r.getAttribute('tabindex') === '0');
    if (!first) throw new Error('no keyboard row');
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(String((router.state.location.search as Record<string, unknown>).sel)).toContain('~');
  });

  it('offers "Use with your agent" in the header (AgentHint)', async () => {
    await renderPage(page);
    expect(await screen.findByRole('button', { name: 'Use with your agent' }, { timeout: 6000 })).toBeInTheDocument();
  });

  it('names the chat apps each Bot has set up; a card without any says the Hub is the only way in, a table cell shows a dash', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings.title });
    const chief = await within(table).findByRole('row', { name: /Chief/ });
    expect(within(chief).getByText(strings['chan.kind.telegram'])).toBeInTheDocument();
    expect(within(chief).getByText(strings['chan.kind.slack'])).toBeInTheDocument();
    expect(within(chief).getByText(strings['chan.kind.discord'])).toBeInTheDocument();
    const support = within(table).getByRole('row', { name: /Support/ });
    expect(within(support).getByText(strings['chan.kind.discord'])).toBeInTheDocument();
    expect(within(support).queryByText(strings['chan.kind.telegram'])).not.toBeInTheDocument();
    expect(within(support).queryByText(strings['chan.kind.slack'])).not.toBeInTheDocument();
    const bare = within(table).getAllByRole('row').find((r) => /Digest|Scout/.test(r.textContent ?? '') && !/Telegram|Slack|Discord/.test(r.textContent ?? ''));
    expect(bare).toBeDefined();
    expect(bare?.textContent).toContain(strings['reach.hubOnly']);
    expect(bare?.textContent).not.toContain('—');
  });

  // The table's Chat apps cell of a Bot without any shows a dash, never a blank cell; a rail leaves that dash out
  // (railgrid.spec).
  it('the table shows a dash in the Chat apps cell of a Bot without any', async () => {
    await renderPage(page);
    await asTable();
    const table = await screen.findByRole('table', { name: strings.title });
    const digest = await within(table).findByRole('row', { name: /Digest/ });
    expect(digest.textContent).toContain('—');
    expect(digest.textContent).not.toContain(strings['reach.hubOnly']);
  });

  it('says Bots run on a computer when there is none', async () => {
    await renderPage(page, { state: 'noComputer' });
    expect(await screen.findByText(strings['list.noComputer.title'])).toBeInTheDocument();
  });

  it('offers to start a stopped computer when none runs', async () => {
    await renderPage(page, { state: 'noRunning' });
    expect(await screen.findByText(strings['list.noRunning.title'])).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Start / }).length).toBeGreaterThan(0);
  });

  it('names a stopped computer in ?computer= instead of an empty list under a raw id', async () => {
    await renderPage(page, { path: '/bots?computer=c-boreal' });
    expect(await screen.findByText(strings['list.noMatchStopped'].replace('{{name}}', 'boreal'))).toBeInTheDocument();
    expect(screen.queryByText('c-boreal')).toBeNull();
    // Six facets stay behind the Filters button (kit rule, more than 3 chip facets): the picked chip is in its panel.
    // The assertions hold for the chip inside the Filters panel.
    await userEvent.click(document.querySelector<HTMLElement>('[data-filters-trigger]')!);
    expect(screen.getAllByText('boreal').length).toBeGreaterThan(0);
    expect(screen.queryByText('c-boreal')).toBeNull();
  });

  it('names a stopped computer in ?computer= when none runs, offers to start that one, and shows no raw id', async () => {
    await renderPage(page, { state: 'noRunning', path: '/bots?computer=c-boreal' });
    expect(await screen.findByText(strings['list.stoppedComputer.title'].replace('{{name}}', 'boreal'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['list.stoppedComputer.start'] })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: strings['list.start'].replace('{{name}}', 'cinder') })).toBeNull();
    expect(screen.queryByText(/c-boreal/)).toBeNull();
  });

  it('the Start of the named stopped computer starts that one (a lost answer is held under its name, never another computer\'s)', async () => {
    await renderPage(page, { state: 'startUnknown', path: '/bots?computer=c-boreal' });
    await userEvent.click(await screen.findByRole('button', { name: strings['list.stoppedComputer.start'] }));
    expect(await screen.findByText(strings['start.heldTitle'].replace('{{name}}', 'boreal'))).toBeInTheDocument();
    expect(screen.queryByText(strings['start.heldTitle'].replace('{{name}}', 'cinder'))).toBeNull();
    expect(screen.queryByText(strings['start.heldTitle'].replace('{{name}}', 'atlas'))).toBeNull();
  });

  it('says a ?computer= that names no computer here is not one of yours when nothing runs either, offers to show every computer, and never prints the raw id', async () => {
    await renderPage(page, { state: 'noRunning', path: '/bots?computer=c-nope' });
    expect(await screen.findByText(strings['list.noMatchUnknown'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['list.stoppedComputer.all'] })).toBeInTheDocument();
    expect(screen.queryByText(/c-nope/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['list.stoppedComputer.all'] }));
    expect(await screen.findByText(strings['list.noRunning.title'])).toBeInTheDocument();
  });

  it('says a ?computer= that names no computer here is not one of yours, and never prints the raw id', async () => {
    await renderPage(page, { path: '/bots?computer=c-nope' });
    expect(await screen.findByText(strings['list.noMatchUnknown'])).toBeInTheDocument();
    expect(screen.queryByText(/c-nope/)).toBeNull();
  });

  it('shows the error with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('a Bot waiting for you', () => {
  it('pins the card above the tabs, on every tab', async () => {
    await open('waitingApprove', '&tab=work');
    expect(await screen.findByRole('region', { name: K['agent.needsApproval'] })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: new RegExp(strings['tab.work']) })).toHaveAttribute('aria-selected', 'true');
  });

  it('approves once and says the decision was used', async () => {
    await open('waitingApprove');
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }));
    expect(await screen.findByText(K['agent.d.once'])).toBeInTheDocument();
  });

  it('after a lost answer offers only a check, never a second send', async () => {
    await open('gateRecovery');
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }));
    expect((await screen.findAllByText(K['agent.decisionUnknown'])).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) })).toBeNull();
    expect(screen.getAllByRole('button', { name: K['agent.checkAgain'] }).length).toBeGreaterThan(0);
  });

  it('asks a question and sends the typed answer', async () => {
    await open('waitingAnswer');
    const send = await screen.findByRole('button', { name: new RegExp(`^${K['agent.sendAnswer']}`) });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText(K['agent.somethingElseField']), 'main');
    expect(send).toBeEnabled();
  });
});

describe('the Bot page', () => {
  it('insets the tab strip like the header and the body, not flush against the list', async () => {
    await open('idle');
    const tab = (await screen.findAllByRole('tab', { name: strings['tab.activity'] }))[0]!;
    const root = tab.closest('.tabsInset');
    expect(root).not.toBeNull();
    expect(root?.firstElementChild?.contains(tab)).toBe(true);
  });

  it('shows nothing pinned when nothing waits', async () => {
    await open('idle');
    await screen.findByRole('tab', { name: strings['tab.activity'] });
    expect(screen.queryByRole('region', { name: K['agent.needsApproval'] })).toBeNull();
  });

  it('opens Settings at a section from the URL and from the model chip', async () => {
    await open('idle', '&settings=behaviour');
    const dialog = await screen.findByRole('dialog', { name: /Settings for Chief/ });
    expect(within(dialog).getByLabelText(strings['behaviour.name'])).toBeInTheDocument();
  });

  it('saves a model on choice, without a Save button', async () => {
    await open('idle', '&settings=model');
    const dialog = await screen.findByRole('dialog', { name: /Settings for Chief/ });
    // The kit chooser: a ready model saves on the press, once the computer's models are read.
    await within(dialog).findByRole('option', { name: /Hoody Free/ }, { timeout: 8000 });
    await userEvent.click(within(dialog).getByRole('option', { name: /Hoody Fast/ }));
    expect(await within(dialog).findByText(strings['model.saved'])).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['ui.save'] })).toBeNull();
  });

  it('lists every model once', async () => {
    await open('idle', '&settings=model');
    const dialog = await screen.findByRole('dialog', { name: /Settings for Chief/ });
    await within(dialog).findByRole('option', { name: /Hoody Free/ }, { timeout: 8000 });
    const names = within(dialog)
      .getAllByRole('option')
      .map((r) => r.getAttribute('data-spec'));
    expect(names.length).toBeGreaterThan(2);
    expect(new Set(names).size).toBe(names.length);
  });

  it('says a Bot that is gone is gone', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent('c-atlas~a1b2c3d4e5f60718293a4b5c~nobody')}` });
    expect(await screen.findByText(strings['bot.gone'])).toBeInTheDocument();
  });

  it('asks before it resets and names the Bot to delete', async () => {
    await open('idle', '&do=delete');
    const dialog = await screen.findByRole('alertdialog', { name: /Delete Chief/ });
    expect(within(dialog).getByRole('button', { name: strings['danger.deleteGo'] })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Chief');
    expect(within(dialog).getByRole('button', { name: strings['danger.deleteGo'] })).toBeEnabled();
  });
});

describe('link and keys', () => {
  it('offers a link with a preview of the address when there is none', async () => {
    await open('noLink', '&tab=link');
    expect(await screen.findByText(strings['link.none'])).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: strings['link.give'] })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: strings['giveLink.title'] });
    expect(within(dialog).getByText('https://quiet-amber-heron-bot.hoody.bot')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(strings['giveLink.labelField']), 'Bad Name');
    expect(await within(dialog).findByText(strings['label.err.bad_char'])).toBeInTheDocument();
  });

  it('lists keys by state', async () => {
    await open('idle', '&tab=link');
    const keys = await screen.findByRole('table', { name: /keys/ });
    expect(within(keys).getByText('website widget')).toBeInTheDocument();
    expect(within(keys).getByText(strings['keys.state.paused'])).toBeInTheDocument();
    expect(within(keys).getByText(strings['keys.state.expired'])).toBeInTheDocument();
  });

  it('refuses a bad allowed address and keeps Make key off', async () => {
    await open('idle', '&tab=link&drawer=key');
    const dialog = await screen.findByRole('dialog', { name: strings['keyForm.newTitle'] });
    await userEvent.type(within(dialog).getByLabelText(new RegExp(strings['ip.label'])), '10.0.0.1/24');
    expect(await within(dialog).findByText(/host|whole range/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['keyForm.create'] })).toBeDisabled();
  });

  it('Add my IP (the kit field) adds the address and shows where it is, with details on a press', async () => {
    await open('idle', '&tab=link&drawer=key');
    const dialog = await screen.findByRole('dialog', { name: strings['keyForm.newTitle'] });
    await userEvent.click(within(dialog).getByRole('button', { name: ipStrings['ipf.add'] }));
    const note = (await within(dialog).findByText(ipStrings['ipf.added'])).closest('[role="status"]') as HTMLElement;
    expect(within(note).getByText('203.0.113.57')).toBeInTheDocument();
    expect(within(note).getByRole('img', { name: 'Portugal' })).toBeInTheDocument();
    expect((within(dialog).getByLabelText(new RegExp(strings['ip.label'])) as HTMLTextAreaElement).value).toContain('203.0.113.57');
    await userEvent.click(within(note).getByRole('button', { name: 'Details for 203.0.113.57' }));
    expect(await screen.findByText('Europe/Lisbon')).toBeInTheDocument();
  });

  it('an IPv6 address is shown with its place but never added', async () => {
    await open('myIpV6', '&tab=link&drawer=key');
    const dialog = await screen.findByRole('dialog', { name: strings['keyForm.newTitle'] });
    await userEvent.click(within(dialog).getByRole('button', { name: ipStrings['ipf.add'] }));
    expect(await within(dialog).findByText(ipStrings['ipf.v6'])).toBeInTheDocument();
    expect(within(dialog).getByText('2001:db8::7')).toBeInTheDocument();
    expect((within(dialog).getByLabelText(new RegExp(strings['ip.label'])) as HTMLTextAreaElement).value).not.toContain('2001:db8::7');
  });

  it('shows a fresh secret hidden, and drops it when the drawer closes', async () => {
    await open('idle', '&tab=link&drawer=key');
    const dialog = await screen.findByRole('dialog', { name: strings['keyForm.newTitle'] });
    await userEvent.click(within(dialog).getByRole('button', { name: strings['keyForm.create'] }));
    const secret = await screen.findByRole('dialog', { name: /Copy the key/ });
    expect(secret.textContent).not.toContain('hk_live');
    await userEvent.click(within(secret).getByRole('button', { name: strings['secret.done'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain('hk_live');
  });

  it('puts Panic behind a confirmation that says what stops', async () => {
    await open('idle', '&tab=link');
    // Panic sits last in the Addresses head menu, never a loose red button.
    const head = (await screen.findByRole('heading', { name: strings['addr.title'] })).closest('header') as HTMLElement;
    await userEvent.click(within(head).getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['panic.button']}`) }));
    const dialog = await screen.findByRole('alertdialog', { name: strings['panic.confirmTitle'] });
    expect(within(dialog).getByRole('button', { name: strings['panic.confirm'] })).toBeInTheDocument();
  });
});

describe('new Bot', () => {
  it('suggests a name you can re-roll', async () => {
    await renderPage(page, { path: '/bots?drawer=new' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    const name = within(dialog).getByLabelText(strings['newBot.name']) as HTMLInputElement;
    expect(name.value).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.reroll'] }));
    expect(name.value).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  });

  it('without a computer, asks for one before any model', async () => {
    await renderPage(page, { path: '/bots?drawer=new' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    expect(within(dialog).queryByRole('option')).toBeNull();
  });

  it('starts on the Hoody model, selected', async () => {
    // The model list belongs to a computer: nothing is read until one is chosen.
    await renderPage(page, { path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    // The form says it in one row: the model's name, and that it is included once the computer's models are read.
    const included = await within(dialog).findByText(strings['newBot.model.included'], undefined, { timeout: 8000 });
    expect(included.parentElement).toHaveTextContent('Hoody Free');
    // Change shows the chooser, with that model selected.
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.model.changeName'] }));
    const hoody = await within(dialog).findByRole('option', { name: /Hoody Free/ }, { timeout: 8000 });
    expect(hoody).toHaveAttribute('aria-selected', 'true');
  });

  it('on a computer whose agent lists no provider, Hoody Free is gone: Create says so and makes no Bot', async () => {
    await renderPage(page, { state: 'noModels', path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.model.changeName'] }));
    await within(dialog).findByText(/No models on this computer/, undefined, { timeout: 8000 });
    expect(within(dialog).queryByRole('option', { name: /Hoody Free/ })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.model.back'] }));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.create'] }));
    expect(await within(dialog).findByText('Hoody Free is no longer on atlas. Choose another model.')).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['newBot.done'])).toBeNull();
  });

  it('shows what the link will look like, with the domain of the links that exist', async () => {
    await renderPage(page, { state: 'zoneFromLink', path: '/bots?drawer=new' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('switch', { name: strings['newBot.link'] }));
    expect(await within(dialog).findByText('https://quiet-amber-heron-bot.hoody.bot')).toBeInTheDocument();
  });

  it('takes the domain from whatever link exists, not from one the page knows', async () => {
    await renderPage(page, { state: 'zoneOtherDomain', path: '/bots?drawer=new' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('switch', { name: strings['newBot.link'] }));
    expect(await within(dialog).findByText('https://quiet-amber-heron-bot.pals.example.test')).toBeInTheDocument();
  });

  it('says a refused model was refused, with where to pick another', async () => {
    await renderPage(page, { state: 'newBotModelRefused', path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.create'] }));
    expect(await within(dialog).findByText(strings['newBot.model.refused'])).toBeInTheDocument();
  });

  it('before any link exists it shows the name it will start with, not a made-up domain', async () => {
    await renderPage(page, { state: 'zoneUnknown', path: '/bots?drawer=new' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('switch', { name: strings['newBot.link'] }));
    expect(await within(dialog).findByText(strings['link.nameOnly'].replace('{{name}}', 'quiet-amber-heron-bot'))).toBeInTheDocument();
    expect(within(dialog).queryByText(/https:\/\//)).not.toBeInTheDocument();
  });

  it('creates the Bot and says where each step stands', async () => {
    await renderPage(page, { path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.create'] }));
    expect(await within(dialog).findByText(strings['newBot.done'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['newBot.open'] })).toBeEnabled();
  });
});

// In the Details panel (it opens from the header, ?details=1).
describe('the status with no link', () => {
  it('is a button that opens Give it a link', async () => {
    await open('noLink', '&details=1');
    const rail = await screen.findByRole('button', { name: strings['rail.linkGive'] });
    await userEvent.click(rail);
    expect(await screen.findByRole('dialog', { name: strings['giveLink.title'] })).toBeInTheDocument();
  });

  it('is plain text once the Bot has a link', async () => {
    await open('idle', '&details=1');
    expect((await screen.findAllByText(strings['link.status.active'])).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: strings['rail.linkGive'] })).not.toBeInTheDocument();
  });
});

describe('chat apps and tasks', () => {
  it('shows chat apps as table rows by state', async () => {
    await open('idle', '&tab=apps');
    const table = await screen.findByRole('table', { name: strings['apps.table'].replace('{{name}}', 'Chief') });
    expect(within(table).getByRole('row', { name: /Support chat/ })).toBeInTheDocument();
    expect(screen.getByText(strings['chan.state.needs_owner'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['chan.add'] })).toBeInTheDocument();
  });

  it('shows the task that waits for approval', async () => {
    await open('working', '&tab=work');
    expect(await screen.findByText('Read deploy log')).toBeInTheDocument();
  });
});

describe('the activity log', () => {
  it('Load older adds the earlier messages and hides itself when none remain', async () => {
    await open();
    const older = await screen.findByRole('button', { name: strings['activity.older'] });
    const list = screen.getByRole('list', { name: strings['activity.title'] });
    const before = within(list).getAllByRole('listitem').length;
    await userEvent.click(older);
    await waitFor(() => expect(within(screen.getByRole('list', { name: strings['activity.title'] })).getAllByRole('listitem').length).toBeGreaterThan(before));
    expect(screen.queryByRole('button', { name: strings['activity.older'] })).toBeNull();
  });
});
