// Get a computer, mounted through the real page: a random preset colour is preselected
// (and is not counted as a change; picking another one is), the image is fixed and shown disabled, and Cache / cache
// image are gone. The colour sits in More options.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

async function openCreate() {
  await renderPage(page, { path: '/computers' });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
}

describe('Get a computer: image, colour and SSH key', () => {
  it('opens with one preset colour picked, and that is not a change', async () => {
    const d = await openCreate();
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
    const group = within(d).getByRole('radiogroup', { name: strings['create.color'] });
    const picked = within(group).getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked);
    expect(picked).toHaveLength(1);
    expect(within(d).queryByText(/options? changed/)).toBeNull();
  });

  it('shows the image as Debian 13, a fact, and offers no cache switches', async () => {
    const d = await openCreate();
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
    // A fact, not a disabled field (nothing to type).
    expect(within(d).queryByRole('textbox', { name: strings['create.image'] })).toBeNull();
    expect(within(d).getByText(strings['create.imageFixed'])).toBeInTheDocument();
    expect(within(d).getByText(strings['create.image'])).toBeInTheDocument();
    expect(within(d).queryByRole('switch', { name: /cache/i })).toBeNull();
    expect(within(d).getByRole('switch', { name: strings['create.kvm'] })).toBeInTheDocument();
    expect(within(d).getByText(strings['create.kvmHelp'])).toBeInTheDocument();
  });

  it('a colour change is counted under More options, where it sits', async () => {
    const d = await openCreate();
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
    const group = within(d).getByRole('radiogroup', { name: strings['create.color'] });
    const free = within(group).getAllByRole('radio').find((r) => !(r as HTMLInputElement).checked)!;
    await userEvent.click(free);
    expect(within(d).getByText(/^1 options? changed/)).toBeInTheDocument();
  });
});
