import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Combobox, type Option } from './more';

// The kit Combobox with a picked value and grouped options (the Files storage drawer's shape): typing narrows the list,
// keeps taking keys after a match, Backspace widens it again, and Escape or a click outside closes it with the picked
// label back in the box.
beforeEach(() => {
  boot();
});

const OPTIONS: Option[] = [
  { value: 'mega', label: 'MEGA' },
  { value: 'drive', label: 'Google Drive' },
  { value: 'webdav', label: 'WebDAV' },
  { value: 's3', label: 'Amazon S3 or compatible', group: 'S3-compatible services' },
  { value: 'r2', label: 'Cloudflare R2', group: 'S3-compatible services' },
];

function Host({ initial = 's3', onPick }: { initial?: string; onPick?: (v: string) => void }) {
  const [v, setV] = useState<string | undefined>(initial);
  return (
    <div>
      <p>Outside</p>
      <Combobox
        label="Storage"
        options={OPTIONS}
        value={v}
        onChange={(x) => {
          setV(x);
          onPick?.(x);
        }}
      />
    </div>
  );
}

const box = () => screen.getByRole('combobox', { name: 'Storage' }) as HTMLInputElement;
const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('Combobox typing with a picked value and groups', () => {
  it('shows every option when it opens on the picked label', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(box().value).toBe('Amazon S3 or compatible');
    await user.click(box());
    expect(optionNames()).toHaveLength(OPTIONS.length);
  });

  it('keeps taking keys after a match, and Backspace widens the list again', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}');
    await user.keyboard('mega');
    expect(box().value).toBe('mega');
    // The picked row stays in the list beside the matches.
    expect(optionNames()).toEqual(['MEGA', 'Amazon S3 or compatible']);
    await user.keyboard('xyz');
    expect(box().value).toBe('megaxyz');
    expect(optionNames()).toEqual(['Amazon S3 or compatible']);
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(box().value).toBe('mega');
    expect(optionNames()).toEqual(['MEGA', 'Amazon S3 or compatible']);
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(box().value).toBe('m');
    expect(optionNames()).toEqual(expect.arrayContaining(['MEGA', 'Amazon S3 or compatible']));
  });

  it('finds an option by its group name while a value is picked', async () => {
    const user = userEvent.setup();
    render(<Host initial="mega" />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}s3-compat');
    expect(optionNames()).toEqual(['MEGA', 'Amazon S3 or compatible', 'Cloudflare R2']);
  });

  it('Escape closes the list and puts the picked label back', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}xyz');
    await user.keyboard('{Escape}');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(box().value).toBe('Amazon S3 or compatible');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a click outside closes the list and puts the picked label back', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}meg');
    expect(optionNames()).toEqual(['MEGA', 'Amazon S3 or compatible']);
    await user.click(screen.getByText('Outside'));
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box().value).toBe('Amazon S3 or compatible');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('with nothing picked, no match keeps the list open and says so', async () => {
    const user = userEvent.setup();
    render(<Combobox label="Storage" options={OPTIONS} value={undefined} onChange={() => undefined} emptyText="Nothing like that" />);
    await user.click(box());
    await user.keyboard('xyz');
    expect(box().value).toBe('xyz');
    expect(screen.getByRole('listbox')).toHaveTextContent('Nothing like that');
    await user.keyboard('{Escape}');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(box().value).toBe('');
  });

  it('picking a match commits it and shows its label; reopening shows every option', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}mega');
    await user.click(screen.getByRole('option', { name: 'MEGA' }));
    expect(onPick).toHaveBeenCalledWith('mega');
    expect(box().value).toBe('MEGA');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByText('Outside'));
    await user.click(box());
    expect(optionNames()).toHaveLength(OPTIONS.length);
  });

  it('the chevron closes the list over typed text; leaving the box then puts the picked label back', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}meg');
    // While the list is open react-aria hides the chevron from the accessibility tree, so it is found by its label.
    await user.click(box().parentElement?.querySelector('button[aria-label="Show options"]') as HTMLElement);
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(box().value).toBe('meg');
    await user.click(screen.getByText('Outside'));
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(box().value).toBe('Amazon S3 or compatible');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Escape on the closed box, then opening it again, shows every option', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(box());
    await user.keyboard('{Escape}');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Escape}');
    expect(box().value).toBe('Amazon S3 or compatible');
    await user.click(screen.getByRole('button', { name: /show/i }));
    expect(optionNames()).toHaveLength(OPTIONS.length);
  });

  it('the picked label typed out, then Escape or a click outside, leaves every option for the next opening', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(box());
    await user.clear(box());
    await user.keyboard('Amazon S3 or compatible');
    await user.keyboard('{Escape}');
    await user.click(screen.getByText('Outside'));
    await user.click(box());
    expect(optionNames()).toHaveLength(OPTIONS.length);
  });

  it('picking the picked option again from a filtered list changes nothing and leaves every option for the next opening', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}meg');
    await user.click(screen.getByRole('option', { name: 'Amazon S3 or compatible' }));
    expect(onPick).not.toHaveBeenCalled();
    expect(box().value).toBe('Amazon S3 or compatible');
    await user.click(screen.getByText('Outside'));
    await user.click(box());
    expect(optionNames()).toHaveLength(OPTIONS.length);
  });

  it('a value the parent changes while the box has focus replaces typed text, and a closed list stays closed', async () => {
    let setOuter: (v: string) => void = () => undefined;
    function Outer() {
      const [v, setV] = useState('s3');
      setOuter = setV;
      return <Combobox label="Storage" options={OPTIONS} value={v} onChange={setV} />;
    }
    const user = userEvent.setup();
    render(<Outer />);
    await user.click(box());
    await user.keyboard('{Control>}a{/Control}meg');
    act(() => setOuter('r2'));
    expect(box().value).toBe('Cloudflare R2');
    await user.keyboard('{Escape}');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    act(() => setOuter('drive'));
    expect(box().value).toBe('Google Drive');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(box()).toHaveFocus();
  });

  it('a value the parent changes shows in the box', async () => {
    function Outer() {
      const [v, setV] = useState('s3');
      return (
        <div>
          <button type="button" onClick={() => setV('r2')}>
            Use R2
          </button>
          <Combobox label="Storage" options={OPTIONS} value={v} onChange={setV} />
        </div>
      );
    }
    const user = userEvent.setup();
    render(<Outer />);
    await user.click(screen.getByRole('button', { name: 'Use R2' }));
    expect(box().value).toBe('Cloudflare R2');
  });
});
