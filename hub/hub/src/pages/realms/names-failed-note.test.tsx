// New realm, names not read: Next is closed, and the footer says why beside it, so a short screen that shows the
// footer and not the field's warning still says what Next waits for and where Try again is.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { resetRealmsWorld } from './fixtures';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => resetRealmsWorld());

describe('realms: names not read', () => {
  it('the footer says why Next is closed, above Next', async () => {
    await renderPage(page, { path: '/realms/new', state: 'namesFailed' });
    const note = await screen.findByText(strings['names.waitNext'], undefined, { timeout: 8000 });
    const next = screen.getByRole('button', { name: new RegExp(`^${strings.next}`) });
    expect(note.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The full reason (under the field, and as Next's reason) and Try again stay.
    expect(screen.getAllByText(strings['names.failed']).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: strings['names.retry'] })).toBeInTheDocument();
  });
});
