// Vitest: on the web each link of the header's summary line is one unbreakable part that starts with a no-break space, and
// no line may break before a no-break space, so a wrapped line starts with the dot and never ends on one (the terminal twin
// packs its lines the same way). The dot stays outside the part: a page writes no words into a raw element (anatomy
// layout.text).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SummaryLine } from './SummaryLine';

it('each dot is glued to its link, each link is one part; the words read as before', () => {
  const { container } = render(
    <p>
      <SummaryLine lead="15 schedules on atlas · 4 failed today" after={[{ key: 'c', node: <a href="#/computers">Computers</a>, text: 'Computers' }, { key: 'p', node: '9 programs running', text: '9 programs running' }]} />
    </p>,
  );
  const text = container.textContent ?? '';
  expect(text.replaceAll('\u00a0', ' ')).toBe('15 schedules on atlas · 4 failed today · Computers · 9 programs running');
  // A break may come before a dot (the plain space), never after it.
  expect(text).toContain('today ·\u00a0Computers');
  expect(text).toContain('Computers ·\u00a09 programs running');
  const parts = [...container.querySelectorAll('span.part')];
  expect(parts.map((p) => p.textContent)).toEqual(['\u00a0Computers', '\u00a09 programs running']);
  const css = readFileSync(path.join(__dirname, 'SummaryLine.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(css).toMatch(/\.part\s*\{\s*white-space:\s*nowrap;\s*\}/);
});
