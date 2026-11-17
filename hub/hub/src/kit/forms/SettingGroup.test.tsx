// SettingGroup, SettingRow in group mode, SettingSwitch, the Switch labelledBy prop and the Facts diagnostic.
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Facts, factControls } from '../data/Display';
import { Button } from '../controls/Button';
import { Switch } from './fields';
import { SettingGroup, SettingSwitch, fieldTrackShort, labelTrackShort } from './SettingGroup';
import os from './Outcome.module.css';
import { SettingRow } from './SettingRow';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(() => {
  boot();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rowOf = (name: string) => screen.getByText(name).closest('[data-sg-row]') as HTMLElement;

describe('SettingGroup', () => {
  it('is a named group only when it has a name', () => {
    const { rerender } = render(
      <SettingGroup>
        <SettingRow label="Region">Singapore</SettingRow>
      </SettingGroup>,
    );
    expect(screen.queryByRole('group')).toBeNull();
    rerender(
      <SettingGroup label="Limits">
        <SettingRow label="Region">Singapore</SettingRow>
      </SettingGroup>,
    );
    expect(screen.getByRole('group', { name: 'Limits' })).toBeTruthy();
  });

  it('marks its variant for the page guards and keeps field groups apart', () => {
    const { container } = render(
      <SettingGroup variant="field">
        <SettingRow label="Port">80</SettingRow>
      </SettingGroup>,
    );
    expect(container.querySelector('[data-setting-group="field"]')).toBeTruthy();
  });
});

describe('SettingRow in a group', () => {
  it('renders label, help, value and action in DOM order, with the help id handed to the control', () => {
    render(
      <SettingGroup>
        <SettingRow label="Allowed websites" help="Pages that may call the link" actions={<Button size="sm">Edit</Button>}>
          {(ids) => <input aria-labelledby={ids.nameId} aria-describedby={ids.helpId} defaultValue="any" />}
        </SettingRow>
      </SettingGroup>,
    );
    const input = screen.getByRole('textbox', { name: 'Allowed websites' });
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Pages that may call the link');
    const row = rowOf('Allowed websites');
    const order = [...row.querySelectorAll('span, input, button')].map((el) => el.textContent || el.tagName);
    expect(order.indexOf('Allowed websites')).toBeLessThan(order.indexOf('Pages that may call the link'));
    expect(order.indexOf('INPUT')).toBeLessThan(order.indexOf('Edit'));
  });

  it('keeps a native label for htmlFor', () => {
    render(
      <SettingGroup variant="field">
        <SettingRow label="Name" htmlFor="sg-name">
          <input id="sg-name" />
        </SettingRow>
      </SettingGroup>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
  });

  it('ignores wide inside a group and keeps it outside', () => {
    const { container, rerender } = render(
      <SettingRow label="Accounts" wide>
        x
      </SettingRow>,
    );
    expect(container.querySelector('[data-sg-row]')).toBeNull();
    rerender(
      <SettingGroup>
        <SettingRow label="Accounts" wide>
          x
        </SettingRow>
      </SettingGroup>,
    );
    expect(container.querySelector('[data-sg-row]')).toBeTruthy();
  });

  it('marks a row without a value as no-value, never from :empty', () => {
    render(
      <SettingGroup>
        <SettingRow label="Delete" actions={<Button size="sm">Delete…</Button>} />
        <SettingRow label="Region">Singapore</SettingRow>
      </SettingGroup>,
    );
    expect(rowOf('Delete').className).toMatch(/noValue/);
    expect(rowOf('Region').className).not.toMatch(/noValue/);
  });

  it('hides the actions and locks the value while the outcome is pending, and draws the outcome in its own area', () => {
    render(
      <SettingGroup variant="field">
        <SettingRow label="Port" outcome="pending" onCheck={() => undefined} actions={<Button size="sm">Reset</Button>}>
          <Switch label="Expose" isSelected onChange={() => undefined} />
        </SettingRow>
      </SettingGroup>,
    );
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Expose' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /check/i })).toBeTruthy();
  });

  it('leaves the legacy row unchanged outside a group (no ids, no group markup)', () => {
    const { container } = render(
      <SettingRow label="Password" help="Last changed in May" actions={<button type="button">Change…</button>}>
        set
      </SettingRow>,
    );
    expect(container.querySelector('[id]')).toBeNull();
    expect(container.querySelector('[data-setting-group]')).toBeNull();
  });
});

describe('SettingSwitch', () => {
  it('is named by the row and described by the help, with no visible label of its own', () => {
    render(
      <SettingGroup>
        <SettingSwitch label="Link is on" help="Anyone with the address can reach the Bot" isSelected onChange={() => undefined} />
      </SettingGroup>,
    );
    const sw = screen.getByRole('switch', { name: 'Link is on' });
    expect(document.getElementById(sw.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Anyone with the address can reach the Bot');
    expect(screen.getAllByText('Link is on')).toHaveLength(1);
  });

  it('puts the switch first in the action cluster, then the actions', () => {
    render(
      <SettingGroup>
        <SettingSwitch label="Notes" isSelected={false} onChange={() => undefined} actions={<Button size="sm">Reset</Button>} />
      </SettingGroup>,
    );
    const cell = rowOf('Notes').querySelector('[data-sg-action]') as HTMLElement;
    expect(cell.firstElementChild?.hasAttribute('data-sg-control')).toBe(true);
    expect(cell.lastElementChild?.textContent).toBe('Reset');
  });

  it('stays visible and disabled while pending; only its actions hide', async () => {
    const onChange = vi.fn();
    render(
      <SettingGroup>
        <SettingSwitch label="Link is on" isSelected onChange={onChange} outcome="pending" onCheck={() => undefined} actions={<Button size="sm">Reset</Button>} />
      </SettingGroup>,
    );
    const sw = screen.getByRole('switch', { name: 'Link is on' });
    expect(sw.hasAttribute('disabled')).toBe(true);
    expect((sw as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    await userEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles when settled', async () => {
    const onChange = vi.fn();
    render(<SettingSwitch label="Link is on" isSelected={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Link is on' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is a one-row group on its own', () => {
    const { container } = render(<SettingSwitch label="Link is on" isSelected onChange={() => undefined} />);
    expect(container.querySelector('[data-setting-group="value"] [data-sg-row]')).toBeTruthy();
  });
});

describe('Switch labelledBy', () => {
  it('takes its name from the element and draws no label', () => {
    render(
      <>
        <span id="sw-name">Public</span>
        <Switch labelledBy="sw-name" isSelected onChange={() => undefined} />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Public' })).toBeTruthy();
  });

  it('keeps its own label without one', () => {
    render(<Switch label="Public" isSelected onChange={() => undefined} />);
    expect(screen.getByRole('switch', { name: 'Public' })).toBeTruthy();
    expect(screen.getByText('Public')).toBeTruthy();
  });
});

describe('label floor', () => {
  const m = { content: 700, padStart: 20, padEnd: 20, value: 360, action: 28, gap: 24 };
  it('stacks when the label track would fall under 200 px', () => {
    // 700 - 40 - 360 - 28 - 48 = 224: room.
    expect(labelTrackShort(m)).toBe(false);
    // A text Reset (80) leaves 172: stack.
    expect(labelTrackShort({ ...m, action: 80 })).toBe(true);
    // Exactly 200 is room.
    expect(labelTrackShort({ ...m, content: 676 })).toBe(false);
    expect(labelTrackShort({ ...m, content: 675 })).toBe(true);
  });

  it('drops the actions of a stacked field row under the field when it would fall under 200 px', () => {
    const f = { content: 478, padStart: 20, padEnd: 20, action: 230, gap: 16 };
    // 478 - 40 - 230 - 16 = 192: drop.
    expect(fieldTrackShort(f)).toBe(true);
    // Exactly 200 is room.
    expect(fieldTrackShort({ ...f, content: 486 })).toBe(false);
    // A row without actions never drops.
    expect(fieldTrackShort({ ...f, content: 100, action: 0 })).toBe(false);
  });

  it('is judged again when the text of an action changes in place', () => {
    class RO {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO);
    const seen: MutationObserverInit[] = [];
    const real = MutationObserver.prototype.observe;
    vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (this: MutationObserver, t, o) {
      if (o) seen.push(o);
      real.call(this, t, o);
    });
    render(
      <SettingGroup variant="field">
        <SettingRow label="Hook" actions={<Button size="sm">New secret</Button>}>
          x
        </SettingRow>
      </SettingGroup>,
    );
    vi.unstubAllGlobals();
    expect(seen.some((o) => o.characterData && o.childList && o.subtree)).toBe(true);
  });
});

describe('pending outcome in a group', () => {
  it('wraps, so it never runs past its row', () => {
    render(
      <SettingGroup>
        <SettingRow label="Port" outcome="pending" onCheck={() => undefined}>
          8080
        </SettingRow>
      </SettingGroup>,
    );
    const line = document.querySelector('[data-outcome="pending"]') as HTMLElement;
    expect(line.className).toContain(os.wrap);
  });
});

describe('Facts diagnostic', () => {
  it('finds controls in a value or one level under it, and allows text, links and chips', () => {
    const found = factControls([
      { label: 'Plain', value: 'on' },
      { label: 'Toggle', value: <Switch label="x" isSelected onChange={() => undefined} /> },
      {
        label: 'Wrapped',
        value: (
          <span>
            on <Button size="sm">Edit</Button>
          </span>
        ),
      },
      { label: 'Native', value: <button type="button">Go</button> },
      // Built without JSX: the lint rightly refuses a click-only anchor in markup, which is what this finds.
      { label: 'Click link', value: createElement('a', { onClick: () => undefined }, 'go') },
      { label: 'Href link', value: <a href="/x">go</a> },
      { label: 'Host', value: 'a.example', copy: 'a.example', href: '/hosts' },
    ]);
    expect(found).toEqual([
      { label: 'Toggle', control: 'Switch' },
      { label: 'Wrapped', control: 'Button' },
      { label: 'Native', control: 'button' },
      { label: 'Click link', control: 'a[onclick]' },
    ]);
  });

  it('warns once in dev and throws nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const items = [{ label: 'Startup', value: <Switch label="Startup" isSelected onChange={() => undefined} /> }];
    const { rerender } = render(<Facts items={items} />);
    rerender(<Facts items={[...items]} />);
    const hits = warn.mock.calls.filter((c) => String(c[0]).includes('hub Facts'));
    expect(hits).toHaveLength(1);
    expect(String(hits[0]?.[0])).toContain('"Startup" holds a Switch');
  });
});
