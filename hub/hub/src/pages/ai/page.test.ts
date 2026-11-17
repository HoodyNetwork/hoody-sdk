// Vitest: the ai page rendered in every fixture state (the pure rules and the flows are in
// logic.test.ts and flows.test.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import fixtures from './fixtures';
import page from './page';
import { parseHolds } from './parts/EndpointStep';
import strings from './strings.en.json';
import kitStrings from '@kit/pickers/ProviderSetup.strings.en.json';
import chooserStrings from '@kit/pickers/ModelChooser.strings.en.json';

const SLOW = { timeout: 5000 };

// The page's own chunk (its load(), import('./tab')) loads once per file before the first visit: renderPage does not
// wait for it, and its cold transform on a busy machine outlives SLOW, which is about the page, not the import.
beforeAll(async () => {
  await import('./tab');
}, 120_000);

describe('the page in each state', () => {
  it('shows the default model and the accounts by default', async () => {
    await renderPage(page, { path: '/ai/models' });
    expect(await screen.findByText(strings['def.helper'], undefined, SLOW)).toBeInTheDocument();
    expect((await screen.findAllByText('OpenAI', undefined, SLOW)).length).toBeGreaterThan(0);
  });

  it('offers Add AI credit once, as the allowance row says it is planned: the spending section has no live way to buy it', async () => {
    await renderPage(page, { path: '/ai/models?section=spending' });
    await screen.findByRole('table', { name: strings['spend.title'] }, SLOW);
    await waitFor(() => expect(screen.getAllByText(strings['spend.p.d7']).length).toBeGreaterThan(0), SLOW);
    const live = screen.queryAllByRole('button', { name: /Add AI credit/ }).filter((b) => b.getAttribute('aria-disabled') !== 'true' && !(b as HTMLButtonElement).disabled);
    expect(live).toEqual([]);
  });

  it('links the computer crumb to that computer on the Computers page', async () => {
    await renderPage(page, { path: '/ai/models' });
    await screen.findByText(strings['def.helper'], undefined, SLOW);
    await waitFor(() => {
      const link = screen.getAllByRole('link').find((l) => /\/computers\?sel=/.test(l.getAttribute('href') ?? ''));
      expect(link).toBeTruthy();
    }, SLOW);
  });

  it('offers Use Hoody Free next to a default that needs a key, and it goes through the impact confirm', async () => {
    await renderPage(page, { path: '/ai/models', state: 'needsKey' });
    await userEvent.click(await screen.findByRole('button', { name: strings['now.useFree'] }, SLOW));
    const dialog = await screen.findByRole('alertdialog', undefined, SLOW);
    expect(within(dialog).getByText(/Hoody Free/)).toBeInTheDocument();
  });

  // The pick chooser offers Your own endpoint under its list itself (kit ModelPickBody); no directory step before it.
  it("has Your own endpoint in the model chooser, which opens the Connect drawer at the endpoint form", async () => {
    await renderPage(page, { path: '/ai/models' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['def.change'] }, SLOW))[0] as HTMLElement);
    expect(screen.queryByRole('button', { name: chooserStrings['dir.title'] })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: chooserStrings['dir.endpoint'] }, SLOW));
    expect(await screen.findByLabelText(new RegExp(`^${strings['ep.name']}`), undefined, SLOW)).toBeInTheDocument();
  });

  it('asks for a realm instead of waiting forever when the computer has several and none is chosen', async () => {
    await renderPage(page, { path: '/ai/models', state: 'noRealm' });
    // The Default and the Claude Code sections both ask.
    await waitFor(() => expect(screen.getAllByText(strings['def.chooseRealm'])).toHaveLength(2), SLOW);
  });

  it('tells a computer with only Hoody AI that Hoody Free needs no key', async () => {
    await renderPage(page, { path: '/ai/models', state: 'empty' });
    expect(await screen.findByText(strings['acc.lonely'], undefined, SLOW)).toBeInTheDocument();
  });

  it('offers the fix next to a default model that needs a key', async () => {
    await renderPage(page, { path: '/ai/models', state: 'needsKey' });
    expect(await screen.findByRole('button', { name: /Connect Anthropic/ }, SLOW)).toBeInTheDocument();
  });

  it('keeps the other sections when one read fails', async () => {
    await renderPage(page, { path: '/ai/models', state: 'partial' });
    expect((await screen.findAllByText('OpenAI', undefined, SLOW)).length).toBeGreaterThan(0);
  });

  it('shows a retry when everything fails to load', async () => {
    await renderPage(page, { path: '/ai/models', state: 'error' });
    expect((await screen.findAllByRole('button', { name: /Try again/ }, SLOW)).length).toBeGreaterThan(0);
  });

  it('when everything fails it shows one page error: no section repeats it, no summary, and the header offers no connect', async () => {
    await renderPage(page, { path: '/ai/models', state: 'error' });
    expect(await screen.findByText(strings['page.loadFailed'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Try again/ })).toHaveLength(1);
    expect(screen.queryByText(strings['def.loadFailed'])).toBeNull();
    expect(screen.queryByText(strings['acc.loadFailed'])).toBeNull();
    expect(screen.queryByText(strings['now.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['connect.open'] })).toBeNull();
  });

  it('shows no "Now using" card while nothing needs fixing: the subtitle and the Default model section already say it', async () => {
    await renderPage(page, { path: '/ai/models' });
    expect(await screen.findByText(strings['def.helper'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(strings['now.title'])).toBeNull();
  });

  it('opens the connect drawer on the shared provider directory: Connected providers stay listed, no fixed tiles', async () => {
    await renderPage(page, { path: '/ai/models' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['connect.open'] }, SLOW))[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    // Connected lists the providers already set up (to add another method or replace a key).
    const connected = await within(dialog).findByRole('region', { name: chooserStrings['dir.connected'] }, SLOW);
    expect(within(connected).getByRole('button', { name: chooserStrings['dir.setupFor'].replace('{{provider}}', 'OpenAI') })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: chooserStrings['dir.suggested'] })).toBeInTheDocument();
    // The old PREFERRED tiles and the "More providers" search are gone; Other ways are the directory's.
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    const other = within(dialog).getByRole('region', { name: chooserStrings['dir.other'] });
    expect(within(other).getByRole('button', { name: chooserStrings['dir.endpoint'] })).toBeInTheDocument();
    // Claude Code is Anthropic's second way now ("Use your Claude plan"), no longer an Other way of its own.
    expect(within(other).queryByRole('button', { name: chooserStrings['dir.claude'] })).toBeNull();
    await userEvent.click(within(other).getByRole('button', { name: chooserStrings['dir.endpoint'] }));
    expect(await within(dialog).findByLabelText(new RegExp(`^${strings['ep.name']}`), undefined, SLOW)).toBeInTheDocument();
  });

  it("lists Hoody AI in the directory; it needs nothing set up (Included, View), so its card closes the drawer for the accounts", async () => {
    await renderPage(page, { path: '/ai/models' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['connect.open'] }, SLOW))[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    const view = await within(dialog).findByRole('button', { name: chooserStrings['dir.viewFor'].replace('{{provider}}', 'Hoody AI') }, SLOW);
    expect(view).toHaveTextContent(chooserStrings['dir.view']);
    expect(view.closest('[data-provider]')).toHaveTextContent(chooserStrings['dir.included']);
    expect(view.closest('[data-provider]')).not.toHaveTextContent(chooserStrings['dir.how.ai']);
    await userEvent.click(view);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
  });

  it('offers OpenRouter by name in the directory, and its Set up opens the OpenRouter key step', async () => {
    // The agent here does not list a sign-in for OpenRouter: Set up goes straight to the key.
    await renderPage(page, { path: '/ai/models', state: 'many' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['connect.open'] }, SLOW))[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    await userEvent.click(within(dialog).getByRole('button', { name: chooserStrings['dir.setupFor'].replace('{{provider}}', 'OpenRouter') })); // its directory card
    const field = (await within(dialog).findByLabelText(/OpenRouter API key/, undefined, SLOW)) as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(field.value).toBe('');
    expect(within(dialog).queryByRole('radio', { name: new RegExp(strings['connect.openrouter']) })).toBeNull();
    expect(within(dialog).queryByRole('radiogroup'), 'no way to choose: the key alone').toBeNull();
  });

  it('offers Sign in with OpenRouter next to the key when the agent lists the sign-in, and both lead to their step', async () => {
    // The way is the kit RadioGroup (as ProviderSetup's), above the step it chose; nothing is picked at first.
    await renderPage(page, { path: '/ai/models' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['connect.open'] }, SLOW))[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    await userEvent.click(within(dialog).getByRole('button', { name: chooserStrings['dir.setupFor'].replace('{{provider}}', 'OpenRouter') })); // its directory card
    expect(await within(dialog).findByText('Connect OpenRouter', undefined, SLOW)).toBeInTheDocument();
    const way = within(dialog).getByRole('radiogroup', { name: strings['connect.how'].replace('{{provider}}', 'OpenRouter') });
    expect(within(way).getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked), 'nothing picked: no sign-in starts unasked').toBe(true);
    expect(within(dialog).queryByLabelText(/OpenRouter API key/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('radio', { name: new RegExp(strings['connect.apikey']) }));
    expect((await within(dialog).findByLabelText(/OpenRouter API key/, undefined, SLOW)) as HTMLInputElement).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: new RegExp(strings['connect.apikey']) }), 'the way stays above its step').toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: new RegExp(strings['connect.openrouter']) }));
    expect(within(dialog).queryByLabelText(/OpenRouter API key/)).toBeNull();
    expect(await within(dialog).findByText(kitStrings['or.step3'], undefined, SLOW)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: kitStrings['or.open'] })).toBeInTheDocument();
    expect((within(dialog).getByLabelText(kitStrings['or.paste']) as HTMLInputElement).type).toBe('password');
  });

  it('reopening the endpoint drawer after an unknown create reuses the held plan and offers Check again', async () => {
    await renderPage(page, { path: '/ai/models', state: 'pending' });
    const open = async () => {
      await userEvent.click((await screen.findAllByRole('button', { name: strings['connect.open'] }, SLOW))[0] as HTMLElement);
      await userEvent.click(await screen.findByRole('button', { name: chooserStrings['dir.endpoint'] }, SLOW)); // the directory's Other ways
    };
    await open();
    await userEvent.type(await screen.findByLabelText(new RegExp(`^${strings['ep.name']}`)), 'My endpoint');
    await userEvent.type(screen.getByLabelText(new RegExp(`^${strings['ep.address']}`)), 'https://api.example.com/v1');
    await userEvent.type(screen.getByLabelText(new RegExp(`^${strings['ep.models']}`)), 'gpt-x');
    await userEvent.click(screen.getByRole('button', { name: strings['ep.add'] }));
    await screen.findByText(strings['ep.notConfirmed'], undefined, SLOW);
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await open();
    expect(await screen.findByText(strings['ep.notConfirmed'], undefined, SLOW)).toBeInTheDocument();
    expect((screen.getByLabelText(new RegExp(`^${strings['ep.name']}`)) as HTMLInputElement).value).toBe('My endpoint');
    // Not locked for good: send again (same plan) or, only by the person's own press, allow creating again.
    expect(screen.getByRole('button', { name: strings['ep.sendAgain'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['ep.allowAgainShort'] })); // its dialog is titled ep.allowAgain
    await userEvent.click(await screen.findByRole('button', { name: strings['ep.allowAgainConfirm'] }));
    await waitFor(() => expect(screen.queryByText(strings['ep.notConfirmed'])).toBeNull());
    expect(screen.queryByRole('button', { name: strings['ep.allowAgainShort'] })).toBeNull();
  });

  it('the disconnect confirm says what stops in one sentence and lists what uses the account as its consequences', async () => {
    await renderPage(page, { path: '/ai/models' });
    const row = (await screen.findAllByRole('row', { name: /OpenAI/ }, SLOW))[0] as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['acc.act.disconnect'] }, SLOW));
    const dialog = await screen.findByRole('alertdialog', undefined, SLOW);
    // The consequences are the dialog's own list (it describes the dialog); the lead sentences are not rows of it.
    const list = within(dialog).getByRole('list');
    expect(list.id).not.toBe('');
    expect(dialog.getAttribute('aria-describedby') ?? '').toContain(list.id);
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(list).queryByText(strings['dis.stops'])).toBeNull();
    expect(within(list).queryByText(strings['dis.nothingSwitches'])).toBeNull();
    expect(within(dialog).getByText(new RegExp(strings['dis.nothingSwitches']))).toBeInTheDocument();
  });

  it('never prefills the key field and keeps it a password field', async () => {
    await renderPage(page, { path: '/ai/models?connect=google' });
    const field = (await screen.findByLabelText(/API key/, undefined, SLOW)) as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(field.value).toBe('');
  });
});

describe('parseHolds', () => {
  const good = { plan: { id: 'a', idem: 'k', replay: false, body: { id: 'a', model_prefix: 'a', display_name: 'A', wire_format: 'chat_completions', base_url: 'https://x.example/v1', models: [{ model: 'm' }] } }, form: { name: 'A', address: 'https://x.example/v1', models: 'm', wire: 'chat_completions' } };
  it('keeps a well-formed hold and drops one whose body is hand-corrupted (models not a list, a number as a name)', () => {
    expect(Object.keys(parseHolds({ c1: good }))).toEqual(['c1']);
    expect(Object.keys(parseHolds({ c1: { ...good, plan: { ...good.plan, body: { ...good.plan.body, models: 'm' } } } }))).toEqual([]);
    expect(Object.keys(parseHolds({ c1: { ...good, plan: { ...good.plan, body: { ...good.plan.body, display_name: 7 } } } }))).toEqual([]);
    expect(Object.keys(parseHolds({ c1: { ...good, plan: { ...good.plan, body: { ...good.plan.body, models: [{ model: 3 }] } } } }))).toEqual([]);
  });
});

describe('fixtures', () => {
  it('use the Hoody Free default and never an Anthropic default', () => {
    const agents = (fixtures.states.default.agents as { data: { agents: Array<{ model: string }> } }).data.agents;
    expect(agents.every((a) => !a.model.startsWith('anthropic/'))).toBe(true);
  });
});
