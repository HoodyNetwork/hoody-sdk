// The provider rows of the model chooser: All providers (ProviderDirectory) and the search results' Providers group
// (ModelBrowser) are ListItemButtons. Each All providers row draws the provider's mark in the leading box, the name as
// the cards write it and its facts at the end; its name for readers stays "OpenAI · 88 models · API key", and a press
// still opens the drill-in (or setup without one).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { providers } from '@core';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import li from '../controls/ListItemButton.module.css';
import { evidence7k } from './fixtures/evidence7k';
import { PAGE } from './modelPaging';
import { dirControlId, ProviderDirectory } from './ProviderDirectory';
import { providerLogo } from './providerLogos';
import strings from './ModelChooser.strings.en.json';

const ev = evidence7k('freeOnly');
const all = providers.directory(ev, { purpose: 'bot', verb: 'choose' }).all;
const rowsOf = () => [...document.querySelectorAll<HTMLLIElement>('#mc-dir-rows-all > li')];

describe('All providers rows', () => {
  it('the fixture has a full first page to read', () => {
    expect(all.length).toBeGreaterThan(PAGE.all);
  });

  it('each row is one ListItemButton: the mark in the leading box, the name as written, the facts; named name · facts', () => {
    render(<ProviderDirectory evidence={ev} purpose="bot" verb="choose" onSetup={() => undefined} onOpen={() => undefined} onOtherWay={() => undefined} />);
    const rows = rowsOf();
    expect(rows).toHaveLength(PAGE.all);
    rows.forEach((row, i) => {
      const p = all[i]!;
      expect(row.dataset.provider).toBe(p.id);
      const buttons = row.querySelectorAll('button');
      expect(buttons).toHaveLength(1);
      const button = buttons[0]!;
      expect(button).toHaveClass(li.item!);
      expect(button.id).toBe(dirControlId('mc-dir', 'row', p.id));
      const lead = button.querySelector(`.${li.lead}`)!;
      expect(lead).toHaveAttribute('aria-hidden', 'true');
      const label = button.querySelector(`.${li.label}`)!;
      expect(label.textContent).toBe(p.label || strings['mc.provider']);
      // The mark: Hoody AI's icon, the provider's own logo where providerLogos.ts has one (no letter), else its Monogram:
      // the first letter of the name shown, upper case.
      const drawn = p.id === providers.HOODY || providerLogo(p.id) !== undefined;
      expect([p.id, lead.querySelector('svg') !== null]).toEqual([p.id, drawn]);
      expect([p.id, lead.textContent]).toEqual([p.id, drawn ? '' : Array.from(label.textContent!.trim())[0]!.toUpperCase()]);
      const meta = button.querySelector(`.${li.meta}`)!;
      expect(meta.textContent).toMatch(/^[\d,.\s]+ models? · \S/);
      // Named by its own text (no aria-label, which axe's label-content-name-mismatch would hold against the drawn
      // Monogram letter): the label, the hidden " · ", the facts.
      expect(button).not.toHaveAttribute('aria-label');
      expect(button).toHaveAccessibleName(`${label.textContent} · ${meta.textContent}`);
    });
    expect(rows.some((r) => r.querySelector('[style]'))).toBe(false);
  });

  it('a press opens the drill-in with the row id; without onOpen it asks for setup', async () => {
    const onOpen = vi.fn();
    const { unmount } = render(<ProviderDirectory evidence={ev} purpose="bot" verb="choose" onSetup={() => undefined} onOpen={onOpen} onOtherWay={() => undefined} />);
    const first = all[0]!;
    await userEvent.click(rowsOf()[0]!.querySelector('button')!);
    expect(onOpen).toHaveBeenCalledWith(first.id, dirControlId('mc-dir', 'row', first.id));
    unmount();
    const onSetup = vi.fn();
    render(<ProviderDirectory evidence={ev} purpose="bot" verb="choose" onSetup={onSetup} onOtherWay={() => undefined} />);
    await userEvent.click(rowsOf()[0]!.querySelector('button')!);
    expect(onSetup).toHaveBeenCalledWith(first.id, dirControlId('mc-dir', 'row', first.id));
  });

  it('locked without onOpen: the rows are disabled and a click asks for nothing; with onOpen they still open', async () => {
    const onSetup = vi.fn();
    const { unmount } = render(<ProviderDirectory evidence={ev} purpose="bot" verb="choose" locked onSetup={onSetup} onOtherWay={() => undefined} />);
    expect(rowsOf()).toHaveLength(PAGE.all);
    expect(rowsOf().every((r) => r.querySelector('button')!.disabled)).toBe(true);
    await userEvent.click(rowsOf()[0]!.querySelector('button')!);
    expect(onSetup).not.toHaveBeenCalled();
    unmount();
    const onOpen = vi.fn();
    render(<ProviderDirectory evidence={ev} purpose="bot" verb="choose" locked onSetup={onSetup} onOpen={onOpen} onOtherWay={() => undefined} />);
    expect(rowsOf()).toHaveLength(PAGE.all);
    expect(rowsOf().every((r) => !r.querySelector('button')!.disabled)).toBe(true);
    const first = all[0]!;
    await userEvent.click(rowsOf()[0]!.querySelector('button')!);
    expect(onOpen).toHaveBeenCalledWith(first.id, dirControlId('mc-dir', 'row', first.id));
    expect(onSetup).not.toHaveBeenCalled();
  });
});

describe('the search results\' provider rows (source)', () => {
  const src = readFileSync(path.join(__dirname, 'ModelBrowser.tsx'), 'utf8');
  it('are ListItemButtons with the provider mark, and the chooser keeps no row-button style', () => {
    expect(src).toContain('<ListItemButton id={bid} leading={<ProviderMark id={pid} name={name} />}');
    expect(src).not.toMatch(/variant="row"/);
    expect(readFileSync(path.join(__dirname, 'ModelChooser.module.css'), 'utf8')).not.toMatch(/\.rowButton\b/);
  });
});
