// Vitest: a fresh key's block shows the Bot's address
// in a kit CopyField (label, value, a named Copy that copies it; a secret-shaped address stays masked) and its one line over
// the codes as a kit Notice: warn with an address, calm without one, never a live alert (a fresh key is not announced).
// An address's "How to use it" drawer says who can use it in one closed Why that ends with the links question: a page
// that opens (the chat page) opens for anyone and using the Bot needs a key; an address a program calls needs a key.
import { render, renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import page from './page';
import { KeyShare } from './parts/KeyShare';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const SECRET = 'hbk_live_0123456789abcdefghijklmnopqrstuv';
const URL_ = 'https://shop-bot.example.net/';
const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const notice = (c: HTMLElement, level: 'warn' | 'calm') => c.querySelector(`[data-notice="${level}"]`);

describe('KeyShare', () => {
  it('the address is a CopyField: its label, the address and the named Copy sit in one field, and Copy copies the address', async () => {
    render(<KeyShare secret={SECRET} url={URL_} />);
    const copy = screen.getByRole('button', { name: strings['keyShare.copyAddress'] });
    // the kit field: its box (value + Copy) inside the field that also holds the label
    const field = copy.closest('[class*="fieldBox"]')?.parentElement ?? null;
    expect(field).not.toBeNull();
    expect(within(field as HTMLElement).getByText(strings['keyShare.address'])).toBeInTheDocument();
    expect(within(field as HTMLElement).getByText(URL_)).toBeInTheDocument();
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    await userEvent.click(copy);
    expect(write).toHaveBeenLastCalledWith(URL_);
  });

  it('a secret-shaped address is masked in the field, and Copy still gives it whole', async () => {
    const secretUrl = 'https://a1b2c3d4e5f60718293a4b5c.example.net/';
    const { container } = render(<KeyShare secret={SECRET} url={secretUrl} />);
    const field = screen.getByRole('button', { name: strings['keyShare.copyAddress'] }).closest('[class*="fieldBox"]') as HTMLElement;
    expect(field.textContent).not.toContain('a1b2c3d4e5f60718293a4b5c');
    expect(container.textContent).not.toContain(SECRET);
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    await userEvent.click(screen.getByRole('button', { name: strings['keyShare.copyAddress'] }));
    expect(write).toHaveBeenLastCalledWith(secretUrl);
  });

  it('the warning over the codes is one warn Notice, not a live alert', () => {
    const { container } = render(<KeyShare secret={SECRET} url={URL_} />);
    expect(notice(container, 'warn')).toHaveTextContent(strings['keyShare.qrWarn']);
    expect(screen.getAllByText(strings['keyShare.qrWarn'])).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('with no address, a calm Notice says there is no code', () => {
    const { container } = render(<KeyShare secret={SECRET} />);
    expect(notice(container, 'warn')).toBeNull();
    expect(notice(container, 'calm')).toHaveTextContent(strings['keyShare.qrNoUrl']);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

const drawerOf = async (kind: 'mcp' | 'chat') => {
  await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
  const head = await screen.findByRole('heading', { name: strings['addr.title'] });
  const row = within(head.closest('section') as HTMLElement).getByRole('row', { name: new RegExp(strings[`addr.kind.${kind}`]) });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['addr.howName'].replace('{{kind}}', strings[`addr.kind.${kind}`])}`) }));
  return screen.findByRole('dialog', { name: `${strings[`addr.kind.${kind}`]} address` });
};

describe('an address drawer', () => {
  it('who can call a program address is one closed Why: a key, while the link is on, then the links question', async () => {
    const d = await drawerOf('mcp');
    const why = within(d).getByRole('button', { name: strings['door.why'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(within(d).queryByRole('link', { name: strings['link.any.more'] })).toBeNull();
    await userEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    // the facts, written here and not read from the strings the page uses
    const answer = within(d).getByText(/one of the link's keys/);
    expect(answer.textContent).toMatch(/while the link is on/);
    expect(answer.textContent).not.toMatch(/open it/);
    expect(within(d).getByRole('link', { name: strings['link.any.more'] })).toBeInTheDocument();
  }, 30000);

  it('the chat page opens for anyone, and using the Bot needs a key while the link is on', async () => {
    const d = await drawerOf('chat');
    await userEvent.click(within(d).getByRole('button', { name: strings['door.why'] }));
    const answer = within(d).getByText(/Anyone can open it/);
    expect(answer.textContent).toMatch(/needs a key, with the link on/);
  }, 30000);
});
