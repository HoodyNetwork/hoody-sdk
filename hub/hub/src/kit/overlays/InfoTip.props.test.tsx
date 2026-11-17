// The kit pieces that take an explanation: Tag `tip` (term form), StatTile and WidgetStat
// `tip` (icon form after the label or caption), SettingRow `info` alone and in a SettingGroup, Tabs `badgeUnit`. Without
// the prop each renders exactly the markup it rendered before the prop existed.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import ts from '../controls/Tabs.module.css';
import { Tabs } from '../controls/Tabs';
import ds from '../data/Display.module.css';
import { StatTile, Tag } from '../data/Display';
import gs from '../forms/SettingGroup.module.css';
import { SettingGroup } from '../forms/SettingGroup';
import rs from '../forms/SettingRow.module.css';
import { SettingRow } from '../forms/SettingRow';
import ws from '../widgets/Widgets.module.css';
import { WidgetStat } from '../widgets/Widgets';
import strings from './InfoTip.strings.en.json';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(() => {
  boot();
});

const about = (subject: string) => strings['info.about'].replace('{{subject}}', subject);
const noIds = (html: string) => html.replace(/ id="[^"]*"/g, '');

describe('Tag tip', () => {
  it('without a tip the tag is the same span with its words', () => {
    const { container } = render(<Tag>System</Tag>);
    expect(container.innerHTML).toBe(`<span class="${ds.tag} ${ds.tag_neutral}">System</span>`);
  });

  it('with a tip the tag words are the InfoTip term, named by those words', () => {
    render(<Tag tip="A system workflow comes with the Hub.">System</Tag>);
    const b = screen.getByRole('button', { name: 'System' });
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.closest(`.${ds.tag}`)).not.toBeNull();
  });

  it('with a tip and onRemove the term wraps the label and the remove button stays outside it', () => {
    render(
      <Tag tip="Your own label on this key." onRemove={() => undefined}>
        staging
      </Tag>,
    );
    const term = screen.getByRole('button', { name: 'staging' });
    const remove = screen.getAllByRole('button').find((b) => b !== term);
    expect(remove).toBeDefined();
    expect(term.contains(remove ?? null)).toBe(false);
    expect(remove?.contains(term)).toBe(false);
  });
});

describe('StatTile tip', () => {
  it('without a tip the head holds only the label', () => {
    const { container } = render(<StatTile label="Computers" value="12" />);
    expect(container.querySelector(`.${ds.statHead}`)?.outerHTML).toBe(`<div class="${ds.statHead}"><span class="${ds.statLabel}">Computers</span></div>`);
  });

  it('with a tip an icon-form InfoTip follows the label and the number stays plain', () => {
    const { container } = render(<StatTile label="Computers" value="12" tip="Computers in this realm, running or stopped." />);
    const head = container.querySelector(`.${ds.statHead}`) as HTMLElement;
    const b = within(head).getByRole('button', { name: about('Computers') });
    expect(head.lastElementChild).toBe(b);
    expect(container.querySelector(`.${ds.statValue}`)?.innerHTML).toBe('12');
  });
});

describe('WidgetStat tip', () => {
  it('without a tip the caption sits directly beside the number', () => {
    const { container } = render(<WidgetStat value="12" caption="failed in the last hour" />);
    expect(container.querySelector(`.${ws.statText}`)?.outerHTML).toBe(
      `<div class="${ws.statText}"><span class="${ws.value} ${ws.t_neutral}">12</span><span class="${ws.caption}">failed in the last hour</span></div>`,
    );
  });

  it('with a tip an icon-form InfoTip follows the caption, named by it', () => {
    render(<WidgetStat value="12" caption="failed in the last hour" tip="Requests that got an error answer." />);
    const b = screen.getByRole('button', { name: about('failed in the last hour') });
    expect(b.previousElementSibling?.textContent).toBe('failed in the last hour');
    expect(screen.getByText('12').closest('button')).toBeNull();
  });
});

describe('SettingRow info', () => {
  it('without info a lone row renders its label as before', () => {
    const { container } = render(
      <SettingRow label="Realm" help="Where it lives">
        x
      </SettingRow>,
    );
    expect(container.querySelector(`.${rs.label}`)?.outerHTML).toBe(`<div class="${rs.label}"><span class="${rs.name}">Realm</span><span class="${rs.help}">Where it lives</span></div>`);
  });

  it('with info a lone row has an InfoTip after its label; a native control keeps its own name', () => {
    render(
      <SettingRow label="Realm" info="A realm is a separate space." htmlFor="realm-in">
        <input id="realm-in" />
      </SettingRow>,
    );
    const b = screen.getByRole('button', { name: about('Realm') });
    expect(b.previousElementSibling?.textContent).toBe('Realm');
    expect(screen.getByRole('textbox', { name: 'Realm' })).toBeTruthy();
  });

  it('without info a grouped row renders its label as before', () => {
    const { container } = render(
      <SettingGroup>
        <SettingRow label="Region" help="Closest to you">
          Singapore
        </SettingRow>
      </SettingGroup>,
    );
    expect(noIds(container.querySelector(`.${gs.label}`)?.outerHTML ?? '')).toBe(`<div class="${gs.label}"><span class="${gs.name}">Region</span><span class="${gs.help}">Closest to you</span></div>`);
  });

  it('with info a grouped row (GroupRow) has an InfoTip after its label', () => {
    render(
      <SettingGroup>
        <SettingRow label="Region" info="Where your computers run.">
          Singapore
        </SettingRow>
      </SettingGroup>,
    );
    const b = screen.getByRole('button', { name: about('Region') });
    expect(b.previousElementSibling?.textContent).toBe('Region');
    expect(b.closest(`.${gs.label}`)).not.toBeNull();
  });
});

describe('Tabs badgeUnit', () => {
  const unit = (n: number) => (n === 1 ? 'program' : 'programs');

  it('without a unit a number badge renders as before, and nothing is refused', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { container } = render(<Tabs label="Computer" items={[{ id: 'a', label: 'Programs', badge: 9 }]} />);
    expect(container.querySelector(`.${ts.badge}`)?.outerHTML).toBe(`<span class="${ts.badge}">9</span>`);
    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('with a unit the badge reads "9 programs", and those words are the badge part of the tab name', () => {
    render(<Tabs label="Computer" items={[{ id: 'a', label: 'Programs', badge: 9, badgeUnit: unit }]} />);
    expect(screen.getByRole('tab', { name: 'Programs 9 programs' })).toBeTruthy();
    expect(screen.getByText('9 programs').className).toBe(ts.badge);
  });

  it('a count string takes the unit too; a word badge keeps its words', () => {
    render(
      <Tabs
        label="Inbox"
        items={[
          { id: 'a', label: 'Pending', badge: '99+', badgeUnit: () => 'pending' },
          { id: 'b', label: 'Updates', badge: 'new', badgeUnit: () => 'updates' },
          { id: 'c', label: 'One', badge: 1, badgeUnit: unit },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Pending 99+ pending' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Updates new' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'One 1 program' })).toBeTruthy();
  });
});
