// Vitest: the attachment chips of the composer (with remove) and of a sent message (without).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttachChip, AttachList } from './AttachChips';
import strings from './Conversation.strings.en.json';

describe('AttachChip', () => {
  it('an image with a thumbnail shows it; without one and a text file show a glyph, never an img', () => {
    const { container } = render(
      <AttachList label="Files">
        <AttachChip kind="image" url="blob:x" name="a.png" meta="12 KB" />
        <AttachChip kind="image" name="b.png" />
        <AttachChip kind="text" url="blob:ignored" name="c.log" meta="2 lines" />
      </AttachList>,
    );
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Files' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('12 KB')).toBeTruthy();
    expect(screen.getByText('2 lines')).toBeTruthy();
  });

  it('an image with a thumbnail opens larger from it, in a dialog named by the file with the file name as its alt text; Close closes it', async () => {
    render(
      <AttachList label="Files">
        <AttachChip kind="image" url="blob:x" name="a.png" meta="12 KB" />
        <AttachChip kind="image" name="b.png" />
        <AttachChip kind="text" name="c.log" />
      </AttachList>,
    );
    // Only the image that has a picture offers it.
    const opens = screen.getAllByRole('button');
    expect(opens).toHaveLength(1);
    expect(opens[0]).toHaveAccessibleName(strings['agent.attOpen'].replace('{{name}}', 'a.png'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { fireEvent.click(opens[0]!); });
    const dialog = screen.getByRole('dialog', { name: 'a.png' });
    const img = within(dialog).getByRole('img', { name: 'a.png' }) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('blob:x');
    const close = dialog.querySelector('[data-dialog-cancel]') as HTMLElement;
    expect(close.textContent).toBe(strings['agent.attClose']);
    await act(async () => { fireEvent.click(close); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the larger view shows the picture fitted; Actual size shows its own pixels in a region that scrolls, Fit to window goes back', async () => {
    render(<AttachList label="Files"><AttachChip kind="image" url="blob:x" name="wide.png" /></AttachList>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['agent.attOpen'].replace('{{name}}', 'wide.png') })); });
    const dialog = screen.getByRole('dialog', { name: 'wide.png' });
    expect(within(dialog).queryByRole('region')).toBeNull();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: strings['agent.attActual'] })); });
    const region = within(dialog).getByRole('region', { name: 'wide.png' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('img', { name: 'wide.png' })).toHaveAttribute('src', 'blob:x');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: strings['agent.attFit'] })); });
    expect(within(dialog).queryByRole('region')).toBeNull();
    expect(within(dialog).getByRole('img', { name: 'wide.png' })).toBeTruthy();
  });

  it("a sent message's or a step's list draws its thumbnails larger (data-big); the composer's does not", () => {
    render(<><AttachList label="Sent" big><AttachChip kind="image" url="blob:a" name="a.png" /></AttachList><AttachList label="Draft"><AttachChip kind="image" url="blob:b" name="b.png" /></AttachList></>);
    expect(screen.getByRole('list', { name: 'Sent' })).toHaveAttribute('data-big');
    expect(screen.getByRole('list', { name: 'Draft' })).not.toHaveAttribute('data-big');
  });
});
