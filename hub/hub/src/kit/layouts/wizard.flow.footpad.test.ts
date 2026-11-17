// WizardPage variant="flow": the footer is a tinted band as wide as the step's card, so its line and buttons start
// and end where the card's content does (the card's line plus its padding), never on the band's own edges.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

describe('wizard flow: the footer band is padded as the step card', () => {
  it('pads the band inline by the card line plus the card padding', () => {
    const foot = rule('.wizardFooter.flowFooter');
    expect(foot).toMatch(/padding-inline: calc\(var\(--pad-card\) \+ var\(--bw\)\);/);
    expect(foot).not.toMatch(/padding-inline: 0;/);
  });

  it('the band stays in the main column (no bleed into the page padding)', () => {
    expect(rule('.wizardFooter.flowFooter')).toMatch(/margin-inline: 0;/);
  });

  it('the card it matches is padded by the same token behind a line of the same width', () => {
    expect(rule('.panelHead')).toMatch(/padding: [^;]*var\(--pad-card\);/);
  });
});
