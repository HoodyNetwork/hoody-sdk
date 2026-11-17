// Vitest: buying or upgrading a plan, the Checkout drawer recaps what is bought before paying: a "What you
// get" list of the chosen plan's specs, the same rows and labels the Plans comparison shows (logic.ts planRows over
// core's planFacts), each next to its value. Paying for a server you already have recaps nothing new.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { formatStorage } from '@kit/format';
import page from './page';
import strings from './strings.en.json';

const open = async (path: string, confirm: string) => {
  await renderPage(page, { path: `/billing${path}` });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('button', { name: confirm }, { timeout: 20000 });
  return dialog;
};

// One label/value pair of the recap, as the kit's Facts lays it out (dt + dd in one row).
const valueOf = (facts: HTMLElement, label: string) => {
  const dt = within(facts).getByText(label);
  return dt.parentElement?.querySelector('dd')?.textContent ?? null;
};

describe('What you get, in the plan checkout', () => {
  it('Buy a plan lists the plan specs with their values before paying', async () => {
    const dialog = await open('?checkout=buy&plan=fam-plus', strings['buy.confirm']);
    // Buy a plan's recap is its calm Verdict plate; the upgrade keeps the section.
    const facts = within(dialog).getByRole('group', { name: strings['co.whatYouGet'] });
    expect(valueOf(facts, strings['buy.resCpu'])).toBe('2');
    expect(valueOf(facts, strings['buy.resRam'])).toBe(formatStorage(4));
    expect(valueOf(facts, strings['buy.resDisk'])).toBe(formatStorage(60));
    expect(valueOf(facts, strings['buy.resComputers'])).toBe('3');
    expect(valueOf(facts, strings['buy.resDiskIo'])).toBe('400 MiB/s read, 200 MiB/s write');
    expect(valueOf(facts, strings['buy.resNetwork'])).toBe('500 Mbps');
    expect(valueOf(facts, strings['buy.resSnapshots'])).toBe('3');
    expect(valueOf(facts, strings['buy.resAliases'])).toBe('6');
    expect(valueOf(facts, strings['buy.resBotUrls'])).toBe('3');
    expect(valueOf(facts, strings['buy.resAi'])).toBe('×4');
    // The recap sits above the money lines: what you get, then what you pay.
    const summary = within(dialog).getByLabelText(strings['co.summary']);
    expect(facts.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an upgrade lists the plan it moves to', async () => {
    const dialog = await open('?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', strings['up.confirm']);
    const facts = within(dialog).getByRole('region', { name: strings['co.whatYouGet'] });
    expect(valueOf(facts, strings['buy.resCpu'])).toBe('4');
    expect(valueOf(facts, strings['buy.resRam'])).toBe(formatStorage(8));
    expect(valueOf(facts, strings['buy.resComputers'])).toBe('8');
    expect(valueOf(facts, strings['buy.resAi'])).toBe('×10');
  });

  it('paying for a server you have recaps nothing new', async () => {
    const dialog = await open('?checkout=pay&sub=a1b2c3d4e5f60718293a4b02', strings['subs.payConfirm']);
    expect(within(dialog).queryByRole('region', { name: strings['co.whatYouGet'] })).toBeNull();
  });
});
