// Vitest: the Work tab is a kit Section (its title and its one
// description in the section's head, not a loose heading and paragraph) and "Message" is a task's inline row action, the same
// message form the Details panel opens (?msg=<session>); Stop stays in the row menu behind its confirmation (work.test.tsx).
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = () => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work` });

describe('the Work tab', () => {
  it('is a section with its title and description in the head, the task table following it', async () => {
    await open();
    const region = await screen.findByRole('region', { name: strings['work.title'] });
    expect(region.hasAttribute('data-hub-section')).toBe(true);
    expect(within(region).getByText(strings['work.desc'])).toBeInTheDocument();
    // The table follows the head as its own frame (a table inside the section would draw a frame in a frame).
    const table = await screen.findByRole('table', { name: strings['work.title'] });
    expect(region.contains(table)).toBe(false);
    expect(region.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, 30000);

  it('Message is on the task row itself and opens the message form for that task', async () => {
    const { router } = await open();
    const t = within(await screen.findByRole('table', { name: strings['work.title'] }));
    const row = (await t.findByText('Read deploy log')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: new RegExp(`^${strings['task.message']}`) }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).msg).toBe('sess-a1');
    await waitFor(() => expect(screen.queryByText(strings['work.stopTitle'])).toBeNull());
  }, 30000);
});
