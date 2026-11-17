// Vitest: the checkout consent says "Terms of Service" and "Privacy Policy" once each, inside its own sentence: as links
// when the page knows the addresses, as words when it does not. The sentence reads as before; a press on a link follows
// the link and leaves the box as it was, so the consent is never ticked by it.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

const BUY = '/billing?checkout=buy&plan=fam-plus';
const TERMS = 'https://hoody.com/terms';
const PRIVACY = 'https://hoody.com/privacy';
const SENTENCE = strings['co.agree']
  .replace('{{terms}}', strings['market.legalTerms'])
  .replace('{{privacy}}', strings['market.legalPrivacy']);

async function openConsent() {
  resetUnknownCheckouts();
  await renderPage(page, { path: BUY });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  const box = await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
  return { dialog, box, field: box.closest('label') as HTMLElement };
}

afterEach(() => {
  document.documentElement.removeAttribute('data-terms-url');
  document.documentElement.removeAttribute('data-privacy-url');
});

describe('checkout consent: Terms and Privacy said once, in the sentence', () => {
  it('with addresses: the two words are links in the sentence, each once, and the sentence reads as before', async () => {
    document.documentElement.setAttribute('data-terms-url', TERMS);
    document.documentElement.setAttribute('data-privacy-url', PRIVACY);
    const { dialog, field } = await openConsent();
    expect(strings['co.agree']).toMatch(/\{\{terms\}\}.*\{\{privacy\}\}/);
    expect(field.textContent).toBe(SENTENCE);
    const terms = within(field).getByRole('link', { name: strings['market.legalTerms'] });
    const privacy = within(field).getByRole('link', { name: strings['market.legalPrivacy'] });
    expect(terms).toHaveAttribute('href', TERMS);
    expect(privacy).toHaveAttribute('href', PRIVACY);
    // Once each in the whole drawer, not again under the sentence.
    expect((dialog.textContent ?? '').split(strings['market.legalTerms'])).toHaveLength(2);
    expect((dialog.textContent ?? '').split(strings['market.legalPrivacy'])).toHaveLength(2);
  });

  it('a press on the Terms link leaves the box unticked', async () => {
    document.documentElement.setAttribute('data-terms-url', TERMS);
    document.documentElement.setAttribute('data-privacy-url', PRIVACY);
    const { box, field } = await openConsent();
    const link = within(field).getByRole('link', { name: strings['market.legalTerms'] });
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(box).not.toBeChecked();
  });

  it('without addresses: the same sentence as words, no links', async () => {
    const { field } = await openConsent();
    expect(field.textContent).toBe(SENTENCE);
    expect(within(field).queryAllByRole('link')).toHaveLength(0);
  });
});
