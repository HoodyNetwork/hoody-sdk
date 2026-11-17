// Pending on a kit Button is `busy`, and only `busy`. The Button sets
// RAC's isPending from `busy` after spreading the caller's props, so a caller's own isPending was thrown away (no
// spinner, presses taken). The prop is now out of ButtonProps, so tsc refuses it; these lines are the type pin.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, type ButtonProps, type LinkButtonProps } from './Button';

describe('kit Button: busy is the one pending prop', () => {
  it('isPending is not a Button or LinkButton prop (tsc)', () => {
    // @ts-expect-error isPending is not a kit Button prop: use busy
    const b: ButtonProps = { isPending: true };
    // @ts-expect-error isPending is not a kit LinkButton prop either
    const l: LinkButtonProps = { href: '#/x', isPending: true };
    expect([b, l]).toHaveLength(2);
  });

  it.each([
    ['plain', { chip: false as const }],
    ['glyph', {}],
  ])('a %s busy Button is RAC pending: data-pending, refused presses, label kept', async (_what, extra) => {
    const onPress = vi.fn();
    render(
      <Button variant="primary" busy onPress={onPress} {...extra}>
        Load more
      </Button>,
    );
    const b = screen.getByRole('button', { name: /Load more/ });
    expect(b).toHaveAttribute('data-pending', 'true');
    await userEvent.click(b);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('busy wins over isDisabled: the button shows its wait, not the disabled look', () => {
    render(
      <Button busy isDisabled>
        Send
      </Button>,
    );
    const b = screen.getByRole('button', { name: /Send/ });
    expect(b).toHaveAttribute('data-pending', 'true');
    expect(b).not.toHaveAttribute('data-disabled');
  });
});
