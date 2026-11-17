// The Bot page: talking to the Bot happens on the Activity tab, under its log. The Bot's own waiting approval is ONE card,
// pinned above the tabs (the log draws none), and while it waits the composer says that sending declines it. Stop names the turn the
// confirm first read; with no turn known it sends nothing.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import S from './strings.en.json';
import K from '@kit/agent/Conversation.strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (extra = '') => `/bots?sel=${encodeURIComponent(CHIEF)}${extra}`;

describe('bots: talking to the Bot on the Activity tab', () => {
  it('one pinned card while the Bot waits, and the composer says sending declines it', async () => {
    await renderPage(page, { state: 'waitingApprove', path: at() });
    expect(await screen.findAllByRole('region', { name: K['agent.needsApproval'] })).toHaveLength(1);
    const box = await screen.findByRole('textbox', { name: S['say.label'] });
    expect(box).toHaveAccessibleDescription(S['say.declines']);
  });

  it('a waiting question is not called an approval: the composer says sending skips the question', async () => {
    await renderPage(page, { state: 'waitingAnswer', path: at() });
    const box = await screen.findByRole('textbox', { name: S['say.label'] });
    expect(box).toHaveAccessibleDescription(S['say.skipsQuestion']);
    expect(screen.queryByText(S['say.declines'])).toBeNull();
  });

  it('with nothing waiting there is no card and no decline warning; Send posts and says so', async () => {
    await renderPage(page, { state: 'idle', path: at() });
    const box = await screen.findByRole('textbox', { name: S['say.label'] });
    expect(screen.queryByRole('region', { name: K['agent.needsApproval'] })).toBeNull();
    expect(screen.queryByText(S['say.declines'])).toBeNull();
    const sendBtn = screen.getByRole('button', { name: S['say.send'] });
    expect(sendBtn).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(box, 'deploy staging');
    await userEvent.click(screen.getByRole('button', { name: S['say.send'] }));
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('Stop opened on a running turn can be confirmed', async () => {
    await renderPage(page, { state: 'working', path: at() });
    await userEvent.click(await screen.findByRole('button', { name: S['bot.stop'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('button', { name: S['bot.stopGo'] })).toBeEnabled();
    expect(dlg).not.toHaveTextContent(S['bot.stopLater']);
  });

  // Stop opened by link (?do=stop, the list's row menu) before the Bot was read: the confirm waits for the first read, then takes that
  // turn and says when it was read, so the person confirms knowing which turn stops. (A confirm that froze no turn
  // and stayed off would make the list's Stop a dead end.)
  it('Stop opened by link before the Bot was read takes the turn of the first read and names when it was read', async () => {
    await renderPage(page, { state: 'working', path: at('&do=stop') });
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('button', { name: S['bot.stopGo'] })).toBeEnabled();
    expect(dlg).not.toHaveTextContent(S['bot.stopLater']);
    expect(dlg).toHaveTextContent(S['bot.stopAt'].slice(0, S['bot.stopAt'].indexOf('{{time}}')));
  });

  it('Stop with no turn known sends nothing: its confirm is off', async () => {
    await renderPage(page, { state: 'idle', path: at('&do=stop') });
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('button', { name: S['bot.stopGo'] })).toBeDisabled();
  });
});
