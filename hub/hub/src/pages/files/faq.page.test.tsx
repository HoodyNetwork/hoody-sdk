// Vitest: where the Files questions show up. Every tab of the page (Browse, Storage, Transfers, Use from your PC) lists all
// eight under the kit "Questions" heading, each closed, and an opened question shows its answer.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';
import pcStrings from './pc/pc.strings.en.json';
import transfersStrings from './transfers/transfers.strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 120_000);

const IDS = ['mountDevice', 'mountLinux', 'mountCli', 'pcNeeds', 'pcShare', 'storageConnect', 'storageUploadWait', 'limits'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];

describe('files questions', () => {
  it.each([
    [transfersStrings['tab.browse'], '/files?a=atlas.00a1'],
    [transfersStrings['tab.storage'], '/files?a=atlas.00a1&tab=storage'],
    [transfersStrings['tab.transfers'], '/files?a=atlas.00a1&tab=transfers'],
    [pcStrings['tab.pc'], '/files?a=atlas.00a1&tab=pc'],
  ])('the %s tab, selected, lists the eight questions, each closed, under the kit "Questions" heading', async (name, path) => {
    await renderPage(page, { path });
    expect(await screen.findByRole('tab', { name, selected: true }, { timeout: 20_000 })).toBeInTheDocument();
    await screen.findByRole('heading', { name: kitStrings['faq.title'] }, { timeout: 20_000 });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  }, 60_000);

  it('opening a question shows its answer', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1' });
    const btn = await screen.findByRole('button', { name: q('limits') }, { timeout: 20_000 });
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(strings['faq.limits.a'])).toBeVisible();
  }, 60_000);
});
