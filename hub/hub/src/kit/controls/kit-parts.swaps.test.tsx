// Vitest:
// the component swaps after the kit recipe.
// - An IconButton takes a tooltip body (the name stays `label`), so the IpInfo details button is a kit IconButton, its
//   own ring and box gone.
// - A busy Button draws the States Spinner, the kit's one busy mark.
// - The drawn toggles, swatches, the Tabs chevron and a model option are sized by tokens (the same pixels).
// - The Settings phone strip's items reach the touch minimum.
// - A button that turns soft-disabled while it holds keyboard focus says why at once.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Button, IconButton } from './Button';
import { IpInfo, ipDetailsFrom } from '../data/IpInfo';
import s from './Button.module.css';
import st from '../states/Spinner.module.css';

const KIT = join(__dirname, '..');
const css = (f: string) => readFileSync(join(KIT, f), 'utf8');
/** The declarations of the first rule whose selector is exactly `sel`, outside any at-rule unless `inside` names one. */
function decls(file: string, sel: string, inside?: string): string {
  let text = css(file);
  if (inside) {
    const at = text.indexOf(inside);
    if (at < 0) throw new Error(`${file}: no ${inside}`);
    text = text.slice(at);
  }
  const re = new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = re.exec(text);
  if (!m) throw new Error(`${file}: no ${sel}`);
  return m[2]!;
}
const token = (name: string) => new RegExp(`\\n\\s*${name}:\\s*([^;]+);`).exec(css('tokens.css'))?.[1]?.trim();

describe('IconButton tooltip slot', () => {
  it('shows the tooltip body on keyboard focus; the accessible name stays the label', async () => {
    const user = userEvent.setup();
    render(<IconButton icon="info" label="Address details" tooltip={<span>Paris, France</span>} />);
    const b = screen.getByRole('button', { name: 'Address details' });
    await user.tab();
    expect(b).toHaveFocus();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Paris, France');
    expect(tip).not.toHaveTextContent('Address details');
  });

  it('a disabled reason follows the body, stacked under it in one column', async () => {
    const user = userEvent.setup();
    render(<IconButton icon="info" label="Address details" tooltip={<span>Paris, France</span>} isDisabled disabledReason="Signed out" />);
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    const stack = tip.querySelector(`.${s.tipStack}`)!;
    expect(stack, 'one column holds both').not.toBeNull();
    expect([...stack.children].map((c) => c.textContent)).toEqual(['Paris, France', 'Signed out']);
  });
});

describe('IpInfo details button', () => {
  const details = ipDetailsFrom({ data: { ip: '203.0.113.58', ip_info: { city: 'Paris', country: 'FR', timezone: 'Europe/Paris' } } })!;

  it('is a kit IconButton (its look, its ring), not a button of its own', () => {
    render(<IpInfo details={details} flags="code" />);
    const info = screen.getAllByRole('button').at(-1)!; // the details button follows the copy button
    expect(info.className).toContain(s.iconOnly);
    expect(css('data/IpInfo.module.css'), 'the own button rules are gone').not.toMatch(/\.more\b/);
  });

  it('keyboard focus shows every detail in a tooltip; a press opens them in a popover', async () => {
    const user = userEvent.setup();
    render(<IpInfo details={details} flags="code" />);
    const info = screen.getAllByRole('button').at(-1)!;
    await user.tab(); // the copy button
    await user.tab();
    expect(info).toHaveFocus();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Europe/Paris');
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Europe/Paris')).toBeInTheDocument();
  });
});

describe('a busy Button draws the States Spinner', () => {
  it('Button, IconButton: the three Spinner dots, hidden from assistive tech, in the old 16 px box', () => {
    render(
      <>
        <Button busy>Save</Button>
        <IconButton icon="copy" label="Copy" busy />
      </>,
    );
    for (const b of screen.getAllByRole('button')) {
      const spin = b.querySelector(`.${st.spinner}`);
      expect(spin, 'the States Spinner').not.toBeNull();
      expect(spin!.querySelectorAll(`.${st.spinnerDot}`).length).toBe(3);
      expect(spin!.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(css('controls/Button.module.css'), 'the button keeps no dots of its own').not.toMatch(/\.spinnerDot|@keyframes pulse/);
  });
});

describe('size tokens (the same pixels)', () => {
  it('the tokens hold today\'s sizes', () => {
    expect(token('--switch-h')).toBe('20px');
    expect(token('--switch-thumb')).toBe('14px');
    expect(token('--toggle-box')).toBe('16px');
    expect(token('--swatch')).toBe('24px');
    expect(token('--strip-more-w')).toBe('24px');
    expect(token('--option-row-h')).toBe('36px');
  });

  it('each drawn part reads its token', () => {
    expect(decls('forms/fields.module.css', '.track')).toMatch(/height:\s*var\(--switch-h\)/);
    expect(decls('forms/fields.module.css', '.thumb')).toMatch(/width:\s*var\(--switch-thumb\);\s*height:\s*var\(--switch-thumb\)/);
    expect(decls('forms/fields.module.css', '.box')).toMatch(/width:\s*var\(--toggle-box\);\s*height:\s*var\(--toggle-box\)/);
    expect(decls('forms/more.module.css', '.radioDot')).toMatch(/width:\s*var\(--toggle-box\);\s*height:\s*var\(--toggle-box\)/);
    expect(decls('forms/ColorPicker.module.css', '.dot')).toMatch(/width:\s*var\(--swatch\);\s*height:\s*var\(--swatch\)/);
    expect(decls('forms/ColorPicker.module.css', '.any')).toMatch(/width:\s*var\(--swatch\);\s*height:\s*var\(--swatch\)/);
    expect(decls('controls/Tabs.module.css', '.more')).toMatch(/width:\s*var\(--strip-more-w\)/);
    expect(decls('pickers/ModelChooser.module.css', '.option')).toMatch(/min-height:\s*var\(--option-row-h\)/);
  });
});

describe('the Settings phone strip', () => {
  it('its items are 32 px with a mouse and at least the touch minimum on a coarse pointer', () => {
    expect(decls('layouts/Layouts.module.css', '.settingsNav', '/* The strip keeps its own look')).toMatch(/--section-menu-row:\s*max\(32px,\s*var\(--touch-min\)\)/);
  });
});

describe('soft-disabled while focused', () => {
  function Lockable({ icon }: { icon?: boolean }) {
    const [locked, setLocked] = useState(false);
    return (
      <>
        {icon ? (
          <IconButton icon="trash" label="Delete" isDisabled={locked} disabledReason="Stop the run first" />
        ) : (
          <Button isDisabled={locked} disabledReason="Stop the run first">
            Delete
          </Button>
        )}
        <button type="button" onClick={() => setLocked(true)} tabIndex={-1}>
          lock
        </button>
      </>
    );
  }

  for (const icon of [false, true])
    it(`${icon ? 'IconButton' : 'Button'}: the reason shows as soon as the focused button turns soft-disabled`, async () => {
      const user = userEvent.setup();
      render(<Lockable icon={icon} />);
      await user.tab();
      const b = screen.getByRole('button', { name: 'Delete' });
      expect(b).toHaveFocus();
      expect(screen.queryByRole('tooltip')?.textContent ?? '').not.toContain('Stop the run first');
      act(() => screen.getByText('lock').click());
      expect(b).toHaveFocus();
      const tip = await screen.findByRole('tooltip');
      expect(tip).toHaveTextContent('Stop the run first');
    });
});
