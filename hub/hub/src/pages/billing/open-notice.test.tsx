// Vitest: the announcement band. Shown with its one sentence while its switch is on, absent when off; on the page it is
// the first band of the Plans view, a status (never an alert), with no button in it.
import { render, renderPage, screen, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import { LISTINGS_OPEN_NOTICE } from './open-notice';
import { OpenNotice } from './parts/OpenNotice';
import strings from './strings.en.json';

const t = ((k: keyof typeof strings) => strings[k]) as never;
const SENTENCE = 'Server plans and bare-metal servers open for orders on Wednesday 18 November at 20:00 UTC.';

describe('the listings announcement', () => {
  it('says the one sentence', () => {
    expect(strings['band.listingsOpen']).toBe(SENTENCE);
  });

  it('on: the sentence in a status band, no alert, no button', () => {
    render(<OpenNotice t={t} show />);
    const band = screen.getByRole('status');
    expect(band).toHaveTextContent(SENTENCE);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(band).queryByRole('button')).toBeNull();
    expect(within(band).queryByRole('link')).toBeNull();
  });

  it('off: nothing is drawn', () => {
    const { container } = render(<OpenNotice t={t} show={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('the page shows it once, first in the banner, while the switch is on, and not at all while it is off', async () => {
    await renderPage(page, { path: '/billing' });
    await screen.findByRole('heading', { name: strings.title }, { timeout: 20000 });
    const all = () => document.querySelectorAll('[data-band="listings-open"]');
    if (!LISTINGS_OPEN_NOTICE) {
      expect(all()).toHaveLength(0);
      return;
    }
    await waitFor(() => expect(all()).toHaveLength(1), { timeout: 20000 });
    expect(all()[0]).toHaveTextContent(SENTENCE);
    expect(all()[0]!.previousElementSibling).toBeNull();
  });
});
