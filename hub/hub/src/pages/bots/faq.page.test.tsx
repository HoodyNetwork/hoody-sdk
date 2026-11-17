// Vitest: where the Bots questions show up. The list pane lists all nine under "Questions", on the empty list and beside a Bot; the
// empty list opens its question in the list; the link drawers (an address's How to use it among them), the chat-app setup and
// Settings open single answers over the drawer (an overlay, so they peek).
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const IDS = ['whatIsBot', 'defaultBot', 'linkKeys', 'corsLimits', 'autoApprove', 'chatOwner', 'telegramPrivacy', 'models'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];
const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (extra: string) => `/bots?sel=${encodeURIComponent(CHIEF)}${extra}`;
const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};
const listed = async () => {
  await screen.findByRole('heading', { name: kitStrings['faq.title'] });
  for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
};

describe('bots questions in the list pane', () => {
  it('the empty list lists the nine questions, and its line opens what a Bot is', async () => {
    await renderPage(page, { state: 'empty' });
    await listed();
    await userEvent.click(screen.getByRole('link', { name: strings['empty.more'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: q('whatIsBot') })).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('button', { name: q('linkKeys') })).toHaveAttribute('aria-expanded', 'false');
  });

  it('beside a Bot the rail holds no questions until a link targets them; the Link tab\'s address drawer peeks the links question', async () => {
    await renderPage(page, { path: at('&tab=link') });
    const head = await screen.findByRole('heading', { name: strings['addr.title'] });
    expect(screen.queryByRole('heading', { name: 'Questions' })).toBeNull();
    const row = within(head.closest('section') as HTMLElement).getByRole('row', { name: new RegExp(strings['addr.kind.mcp']) });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['addr.howName'].replace('{{kind}}', strings['addr.kind.mcp'])}`) }));
    const d = await screen.findByRole('dialog', { name: `${strings['addr.kind.mcp']} address` });
    await userEvent.click(within(d).getByRole('button', { name: strings['door.why'] })); // the drawer's one closed Why
    await userEvent.click(within(d).getByRole('link', { name: strings['link.any.more'] }));
    expect(within(await peekOf()).getByText(a('linkKeys'))).toBeInTheDocument();
  });
});

describe('bots questions over a drawer (a peek)', () => {
  it('Give it a link: the CORS line peeks the CORS and limits answer', async () => {
    await renderPage(page, { state: 'noKeys', path: at('&drawer=link') });
    const dlg = await screen.findByRole('dialog', { name: strings['giveLink.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['giveLink.corsWhy'] })); // the drawer's one closed Why
    await userEvent.click(within(dlg).getByRole('link', { name: strings['limits.more'] }));
    expect(within(await peekOf()).getByText(a('corsLimits'))).toBeInTheDocument();
  });

  it('Limits and websites: the CORS line peeks the CORS and limits answer', async () => {
    await renderPage(page, { path: at('&tab=link&drawer=linkset') });
    const dlg = await screen.findByRole('dialog', { name: strings['linkSet.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['linkSet.why'] })); // the drawer's one closed Why
    await userEvent.click(within(dlg).getByRole('link', { name: strings['limits.more'] }));
    expect(within(await peekOf()).getByText(a('corsLimits'))).toBeInTheDocument();
  });

  it("chat-app setup: the owner step's why peeks who becomes the owner", async () => {
    await renderPage(page, { state: 'channelOwnerless', path: at('&tab=apps&app=ch-tg') });
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['setup.owner.why']) }));
    await userEvent.click(within(dlg).getByRole('link', { name: strings['flow.owner.more'] }));
    expect(within(await peekOf()).getByText(a('chatOwner'))).toBeInTheDocument();
  });

  it("chat-app setup with Telegram privacy on: the privacy step's why peeks why groups need privacy off", async () => {
    await renderPage(page, { state: 'channelGroupAsks', path: at('&tab=apps&app=ch-tg') });
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['setup.privacy.why']) }));
    await userEvent.click(within(dlg).getByRole('link', { name: strings['flow.privacy.more'] }));
    expect(within(await peekOf()).getByText(a('telegramPrivacy'))).toBeInTheDocument();
  });

  it('Settings > Model: the line peeks which model does what', async () => {
    await renderPage(page, { path: at('&settings=model') });
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(await within(dlg).findByRole('button', { name: strings['model.whyQ'] }));
    await userEvent.click(within(dlg).getByRole('link', { name: strings['model.more'] }));
    expect(within(await peekOf()).getByText(a('models'))).toBeInTheDocument();
  });
});
