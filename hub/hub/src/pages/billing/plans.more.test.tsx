// The lower sections of the Plans view (All plans, Free has useful limits, Hoody runs the hardware, Who runs your
// computers): the website's pricing words as facts in the Hub's sections. Plan names, prices and the free server's
// computers are the page's reads; no limit or price is copied from the website. The sections buy and send nothing:
// their only controls are folds, copy buttons and links to hoody.com pages.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const TITLES = [strings['plans.more.all.title'], strings['plans.more.free.title'], strings['plans.more.infra.title'], strings['plans.more.trust.title']];
const IDS = ['all-plans', 'free-limits', 'infrastructure', 'trust'];
const region = (name: string) => screen.findByRole('region', { name }, { timeout: 15_000 });
const lower = () => IDS.map((id) => document.getElementById(id) as HTMLElement);
const lowerText = () => lower().map((el) => el.textContent ?? '').join(' ');
/** A fact's value by its label, inside one section. */
const fact = (el: HTMLElement, label: string) => within(el).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('the lower Plans sections', () => {
  it('four sections under the Compare plans table, in order', async () => {
    await renderPage(page, { path: '/billing' });
    const cmp = await region(strings['plans.cmp.title']);
    const els: HTMLElement[] = [];
    for (const title of TITLES) els.push(await region(title));
    let before: HTMLElement = cmp;
    for (const el of els) {
      expect(before.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      before = el;
    }
    // The page's own Questions stay under them.
    expect(lower().every((el) => el !== null)).toBe(true);
  });

  it('each is one kit section card: a framed block with its title in the card head, its facts inside', async () => {
    await renderPage(page, { path: '/billing' });
    await region(TITLES[3] as string);
    for (const [i, el] of lower().entries()) {
      expect(el).toHaveAttribute('data-hub-section');
      expect(within(el).getByRole('heading', { name: TITLES[i] })).toBeVisible();
      expect(el.querySelector('dl')).not.toBeNull();
    }
  });

  it('All plans: the one line of what every plan includes, shown once on the page, and the live plan names', async () => {
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const all = await region(strings['plans.more.all.title']);
    expect(screen.getAllByText(strings['plans.includes'])).toHaveLength(1);
    expect(within(all).getByText(strings['plans.includes'])).toBeVisible();
    // Every fact of the line the Plans view showed before.
    for (const part of ['Hoody AI (free)', 'the Hoody Kit', 'Bots and agents', 'the API, SDK and CLI', 'link permissions', 'disk encryption', 'full SSH access']) expect(strings['plans.includes']).toContain(part);
    expect(fact(all, strings['plans.more.all.plans'])).toHaveTextContent('Free · Plus · Pro · Bare metal');
    expect(fact(all, strings['plans.more.all.vms'])).toHaveTextContent(strings['plans.more.all.vmsBody']);
  });

  it('plan names are the catalogue names, never the website names', async () => {
    await renderPage(page, { path: '/billing' });
    const all = await region(strings['plans.more.all.title']);
    await within(all).findByText('Free · Small · Medium · Large · Bare metal', {}, { timeout: 15_000 });
    expect(lowerText()).not.toMatch(/\bPlus\b|\bPro\b/);
  });

  it('the two explanations are folds, closed until opened: Bot URLs and Full SSH access', async () => {
    await renderPage(page, { path: '/billing' });
    const all = await region(strings['plans.more.all.title']);
    expect(within(all).getByText(strings['plans.more.bot.whyBody'])).not.toBeVisible();
    await userEvent.click(within(all).getByRole('button', { name: new RegExp(`^${strings['plans.more.bot.title']}`) }));
    expect(await within(all).findByText(strings['plans.more.bot.whyBody'])).toBeVisible();
    expect(within(all).getByText(strings['plans.more.bot.agentsBody'])).toBeVisible();
    expect(within(all).getByText(strings['plans.more.ssh.keyBody'])).not.toBeVisible();
    await userEvent.click(within(all).getByRole('button', { name: new RegExp(`^${strings['plans.more.ssh.title']}`) }));
    expect(await within(all).findByText(strings['plans.more.ssh.keyBody'])).toBeVisible();
    expect(within(all).getByText(strings['plans.more.ssh.noneBody'])).toBeVisible();
  });

  it('Free: the free server computers from the read, the catalogue prices, and no limit copied from the website', async () => {
    await renderPage(page, { path: '/billing' });
    const free = await region(strings['plans.more.free.title']);
    expect(fact(free, strings['plans.free'])).toHaveTextContent(strings['plans.more.free.lede']);
    expect(within(free).getByText('3 computers', { selector: 'dt' })).toBeVisible();
    expect(fact(free, strings['col.price'])).toHaveTextContent('$0 · no card · no trial period');
    const grow = fact(free, strings['plans.more.free.grow']).textContent ?? '';
    expect(grow).toMatch(/^Small is \$\d+(\.\d\d)? a month; Medium is \$\d+(\.\d\d)? a month; Large is \$\d+(\.\d\d)? a month\. /);
    expect(grow).toContain(strings['plans.more.free.growAi']);
    await userEvent.click(within(free).getByRole('button', { name: new RegExp(`^${strings['plans.more.free.how']}`) }));
    expect(await within(free).findByText(strings['plans.more.free.backupsBody'])).toBeVisible();
    // The website's Free numbers (2 cores, 3 GB, 20 GB, 10 Mbit/s, 2 snapshots, 3 aliases, 5 Bot URLs, 4,096 processes, +5%) are not live values.
    expect(free.textContent).not.toMatch(/\d+ cores|\d+ GB|\d+ Mbit|\d+ saved versions|\d+ snapshots|\d+ aliases|\d+ Bot URLs|4,096|\+ ?5 ?%/);
  });

  it('Free with no free server read: the computers row has no number', async () => {
    await renderPage(page, { state: 'empty', path: '/billing' });
    const free = await region(strings['plans.more.free.title']);
    expect(fact(free, strings['buy.resComputers'])).toHaveTextContent(strings['plans.more.free.computersBody']);
    expect(within(free).queryByText(/\d+ computers?/)).toBeNull();
  });

  it('a catalogue with nothing on sale: no plan is named and no price shows', async () => {
    await renderPage(page, { state: 'plans-none', path: '/billing' });
    const free = await region(strings['plans.more.free.title']);
    expect(fact(free, strings['plans.more.free.grow'])).toHaveTextContent(new RegExp(`^${strings['plans.more.free.growAi'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect(fact(await region(strings['plans.more.all.title']), strings['plans.more.all.plans'])).toHaveTextContent(/^Free · Bare metal$/);
  });

  it('the hardware and trust sections say who runs it, and give the addresses as text to copy', async () => {
    await renderPage(page, { path: '/billing' });
    const infra = await region(strings['plans.more.infra.title']);
    expect(fact(infra, strings['plans.hardware'])).toHaveTextContent(strings['plans.more.infra.lede']);
    expect(fact(infra, strings['plans.more.infra.payment'])).toHaveTextContent(strings['plans.more.infra.paymentBody']);
    const trust = await region(strings['plans.more.trust.title']);
    expect(fact(trust, strings['plans.more.trust.encryption'])).toHaveTextContent(strings['plans.more.trust.encryptionBody']);
    expect(fact(trust, strings['plans.more.trust.support'])).toHaveTextContent('support@hoody.com');
    expect(fact(trust, strings['plans.more.trust.billing'])).toHaveTextContent('billing@hoody.com');
    expect(trust.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('every link goes to a hoody.com page over https in a new tab: no story page, no sign-up link, no in-Hub buy link', async () => {
    await renderPage(page, { path: '/billing' });
    await region(strings['plans.more.trust.title']);
    await userEvent.click(within(await region(strings['plans.more.free.title'])).getByRole('button', { name: new RegExp(`^${strings['plans.more.free.how']}`) }));
    const links = lower().flatMap((el) => [...el.querySelectorAll('a')]);
    expect(links.length).toBeGreaterThanOrEqual(12);
    for (const a of links) {
      const href = a.getAttribute('href') ?? '';
      expect(href).toMatch(/^https:\/\/(?:docs\.)?hoody\.com\//);
      expect(href).not.toMatch(/story|signup|os\.hoody\.com|api\.hoody\.com/);
      expect(a.getAttribute('target')).toBe('_blank');
    }
    const hrefs = links.map((a) => a.getAttribute('href'));
    for (const want of ['https://hoody.com/infrastructure/', 'https://hoody.com/terms-of-service/', 'https://hoody.com/privacy-policy/', 'https://hoody.com/aup/', 'https://hoody.com/subprocessors/']) expect(hrefs).toContain(want);
  });

  it('nothing here buys or sends: the only buttons are the folds and the two copy buttons', async () => {
    await renderPage(page, { path: '/billing' });
    await region(strings['plans.more.trust.title']);
    const names = lower().flatMap((el) => within(el).queryAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? ''));
    expect(names).toHaveLength(5);
    for (const n of names) expect(n).not.toMatch(/^(Get|Choose|Buy|Upgrade|Pay|Rent|Reserve|Add funds|Browse|Start)/);
  });

  it('public words: no developer examples, no internal terms', async () => {
    await renderPage(page, { path: '/billing' });
    await region(strings['plans.more.trust.title']);
    const text = lowerText();
    expect(text).not.toMatch(/containers?|promo|curl|npm install|HOODY_TOKEN|Bearer|\{p\}|\{c\}|api\/v1/i);
    expect(lower().flatMap((el) => [...el.querySelectorAll('pre, code')])).toEqual([]);
  });
});
