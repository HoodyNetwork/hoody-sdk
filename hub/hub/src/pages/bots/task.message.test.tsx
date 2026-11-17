// Vitest: the Details panel (open: ?details=1) lists the Bot's running tasks, each with a Message button; the form says the words go to the Bot, which passes
// them on, and sends nothing until there are words.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (extra = '') => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&details=1${extra}` });
const btn = (title: string) => strings['task.messageOne'].replace('{{title}}', title);

describe('the tasks in the Details panel', () => {
  it('lists the running tasks, not the finished ones', async () => {
    await open();
    expect((await screen.findAllByText('Read deploy log')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Draft reply to a reader').length).toBeGreaterThan(0);
    expect(screen.queryByText('Check dependencies')).toBeNull();
  });

  it('each running task has a Message button that opens the form for it', async () => {
    const { router } = await open();
    await userEvent.click((await screen.findAllByRole('button', { name: btn('Read deploy log') }))[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(strings['task.msgTitle'].replace('{{title}}', 'Read deploy log'))).toBeInTheDocument();
    expect(within(dialog).getByText(strings['task.msgDesc'])).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).msg).toBe('sess-a1');
  });

  it('closing the form steps back over the entry the button pushed, so Back does not reopen it', async () => {
    const { router } = await open();
    await userEvent.click((await screen.findAllByRole('button', { name: btn('Read deploy log') }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['ui.cancel'] }));
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).msg).toBeUndefined());
    expect(router.history.canGoBack()).toBe(false);
  });

  it('sends nothing until there are words, then says it went to the Bot', async () => {
    await open('&msg=sess-a1');
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', { name: strings['task.msgSend'] });
    expect(send).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: strings['task.msgLabel'] }), 'raise the limit');
    expect(send).toBeEnabled();
    await userEvent.click(send);
    await waitFor(() => expect(within(dialog).getByText(strings['task.msgSent'])).toBeInTheDocument());
  });

  it('a task that is not listed opens no form', async () => {
    await open('&msg=sess-nothing');
    await screen.findAllByText('Read deploy log');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
