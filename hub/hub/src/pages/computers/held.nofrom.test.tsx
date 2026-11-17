// A hold another page sent that names no page (core's heldBy 'other', from null): no link and no Dismiss here,
// but Check again, which only reads, so even that hold has a way out on this page.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@app/testing';
import { Held } from './parts/Held';
import strings from './strings.en.json';

describe('computers: a held change from an unnamed page', () => {
  it('offers Check again (reads only) and no Dismiss', async () => {
    const onCheck = vi.fn();
    const onDismiss = vi.fn();
    render(<Held kind="ssh" name="atlas" elsewhere={{ from: null }} onCheck={onCheck} onDismiss={onDismiss} />);
    expect(screen.getByText(strings['held.elsewhere'].replace('{{page}}', strings['held.from.other']))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
