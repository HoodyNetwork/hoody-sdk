// New project: Make project is off while the name is empty or the colour is no hex code, and the footer now says which.
// Before this the drawer opened with an empty Name and a button that was simply off; emptying the hex box turned it off
// with no word either (the colour field flags only bad text, and only once it loses focus).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import cp from '@kit/forms/ColorPicker.strings.en.json';
import { projectSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';

async function openNew(): Promise<HTMLElement> {
  projectSends.length = 0;
  await renderPage(page, { path: '/computers/projects' });
  await userEvent.click(await screen.findByRole('button', { name: strings['proj.new'] }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: strings['projd.newTitle'] });
}
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['projd.create'] });

describe('computers: New project says what is missing', () => {
  it('an empty name: the footer asks for it; typed, the line goes and the button is on', async () => {
    const d = await openNew();
    expect(go(d)).toBeDisabled();
    expect(within(d).getByText(strings['projd.needName'])).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), 'Night jobs');
    await waitFor(() => expect(go(d)).toBeEnabled());
    expect(within(d).queryByText(strings['projd.needName'])).toBeNull();
    expect(within(d).queryByText(strings['projd.needColor'])).toBeNull();
    expect(projectSends).toHaveLength(0);
  }, 40000);

  it('a name but no hex code: the footer asks for the colour', async () => {
    const d = await openNew();
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), 'Night jobs');
    await waitFor(() => expect(go(d)).toBeEnabled());
    await userEvent.clear(within(d).getByRole('textbox', { name: cp['cp.hex'] }));
    await waitFor(() => expect(go(d)).toBeDisabled());
    expect(within(d).getByText(strings['projd.needColor'])).toBeInTheDocument();
    expect(projectSends).toHaveLength(0);
  }, 40000);
});
