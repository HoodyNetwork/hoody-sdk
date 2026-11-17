// Wizard rule: every multi-step create page is a WizardPage `flow`: the step strip over the page (a
// navigation landmark named Steps, the current step marked), the summary beside the step as a named aside, and the
// footer (Back, Next / Create) under the step, never a Cancel in the header.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { realmSends, resetRealmsWorld } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const T = 8000;

beforeEach(() => resetRealmsWorld());

describe('New realm is a flow wizard', () => {
  it('draws the step strip, the summary aside and the footer, and no header action', async () => {
    await renderPage(page, { path: '/realms/new' });
    const strip = await screen.findByRole('navigation', { name: kitStrings['wizard.steps'] }, { timeout: T });
    const items = within(strip).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    const aside = screen.getByRole('complementary', { name: strings['summary.title'] });
    expect(within(aside).getByText(strings['summary.name'])).toBeInTheDocument();
    // The page header holds the title and subtitle only: no Cancel (or any action) there.
    const header = screen.getByRole('heading', { level: 1, name: strings.title }).closest('header') as HTMLElement;
    expect(within(header).queryAllByRole('button')).toHaveLength(0);
  });

  it('each step sits in a titled section, and Your choices shows its rows in the spec layout', async () => {
    await renderPage(page, { path: '/realms/new' });
    const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    const step = field.closest<HTMLElement>('[data-hub-section]');
    expect(step, 'the name field is inside a kit section').not.toBeNull();
    expect(within(step as HTMLElement).getByRole('heading', { name: strings['name.title'] })).toBeInTheDocument();
    const aside = screen.getByRole('complementary', { name: strings['summary.title'] });
    // The framed card, an AnatomySection as New script's "Your script so far".
    const title = within(aside).getByRole('heading', { name: strings['summary.title'] });
    expect(title.closest('[data-hub-section]'), 'Your choices is a kit section card').not.toBeNull();
    expect(title.closest('[data-hub-section]')?.id).toBe('new-realm-summary');
    const facts = within(aside).getByText(strings['summary.name']).closest('dl')?.parentElement as HTMLElement;
    expect(facts.className, 'the spec layout: values at the end, a line under each row').toMatch(/\bspec\b|_spec_/);
  });

  it('Cancel sits in the footer and leaves for Home; nothing was sent', async () => {
    const { router } = await renderPage(page, { path: '/realms/new' });
    await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    const header = screen.getByRole('heading', { level: 1, name: strings.title }).closest('header') as HTMLElement;
    expect(within(header).queryByRole('button', { name: strings.cancel })).toBeNull();
    const next = screen.getByRole('button', { name: strings.next });
    const cancel = screen.getByRole('button', { name: strings.cancel });
    // The footer's end group: Cancel just before the primary.
    expect(cancel.parentElement?.contains(next)).toBe(true);
    expect(next.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    await userEvent.click(cancel);
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'), { timeout: T });
    expect(realmSends.filter((x) => x.method !== 'GET')).toHaveLength(0);
  });

  it('a done step in the strip is a button back to it', async () => {
    await renderPage(page, { path: '/realms/new' });
    const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    await waitFor(() => expect(screen.getByRole('button', { name: strings.next })).toBeEnabled(), { timeout: T });
    await userEvent.type(field, 'Studio');
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    const strip = screen.getByRole('navigation', { name: kitStrings['wizard.steps'] });
    await waitFor(() => expect(within(strip).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step'), { timeout: T });
    await userEvent.click(within(strip).getByRole('button'));
    expect(await screen.findByLabelText(strings['name.label'], undefined, { timeout: T })).toHaveValue('Studio');
  });

  it('a link that opens on a later step starts at the name: the URL drops the step, and typing a name does not jump ahead', async () => {
    const { router } = await renderPage(page, { path: '/realms/new?step=review' });
    const strip = await screen.findByRole('navigation', { name: kitStrings['wizard.steps'] }, { timeout: T });
    const current = () => within(strip).getAllByRole('listitem').findIndex((li) => li.getAttribute('aria-current') === 'step');
    expect(current()).toBe(0);
    await waitFor(() => expect(router.state.location.href).not.toContain('step='), { timeout: T });
    await userEvent.type(await screen.findByLabelText(strings['name.label'], undefined, { timeout: T }), 'lab');
    expect(current()).toBe(0);
    expect(screen.getByLabelText(strings['name.label'])).toHaveValue('lab');
  });
});
