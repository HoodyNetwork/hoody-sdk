// A Switch's description is its accessible description, so a screen reader on the switch hears its help
// (the description is drawn beside the switch's own element, not inside it).
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Switch } from './fields';

beforeEach(() => {
  boot();
});

describe('Switch description', () => {
  it('is the switch\'s accessible description', () => {
    render(<Switch label="Also make a public link" description="Anyone with the link can open it." isSelected={false} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Also make a public link' })).toHaveAccessibleDescription('Anyone with the link can open it.');
  });

  it('keeps a description the caller names too', () => {
    render(
      <>
        <p id="row-help">Takes effect at once.</p>
        <Switch label="Paused" description="Nothing runs while paused." aria-describedby="row-help" isSelected={false} onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Paused' })).toHaveAccessibleDescription('Takes effect at once. Nothing runs while paused.');
  });

  it('has none without a description', () => {
    render(<Switch label="Paused" isSelected={false} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Paused' })).not.toHaveAttribute('aria-describedby');
  });
});
