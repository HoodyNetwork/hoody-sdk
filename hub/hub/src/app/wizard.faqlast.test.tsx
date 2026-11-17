// Every wizard page ends with its questions: the FAQ comes after the wizard's buttons (the WizardFooter: Cancel, Back,
// Next / Create), as on every other page, never between the step and its buttons. Each page that draws a WizardPage is
// listed (the source scan fails on a new one that is not), rendered, and its FAQ checked to follow the footer's primary
// button in the document.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import realmsPage from '../pages/realms/page';
import realmStrings from '../pages/realms/strings.en.json';
import scriptsPage from '../pages/scripts/page';
import scriptStrings from '../pages/scripts/strings.en.json';
import { clearDrafts } from '../pages/scripts/new/draft';
import { mintDraft } from '../pages/scripts/new/Flow';
import * as fx from '../pages/scripts/new/flowfix';

const SRC = join(import.meta.dirname, '..');
const WAIT = { timeout: 14000 };

/** The page files that draw a kit WizardPage. */
const WIZARD_FILES = ['pages/realms/view.tsx', 'pages/scripts/new/Flow.tsx'];

const after = (a: Element, b: Element) => (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const faqOf = () => document.querySelector('[data-faq-title]')?.closest('section') ?? null;

beforeEach(() => {
  clearDrafts();
  mintDraft('bbbbbbbbbb');
  fx.shown.id = fx.ATLAS;
});

describe('wizard pages: the questions come last, after the buttons', () => {
  it('every page that draws a WizardPage is checked here', () => {
    const found = readdirSync(join(SRC, 'pages'), { recursive: true, encoding: 'utf8' })
      .map((f) => `pages/${f.split(sep).join('/')}`)
      .filter((f) => /\.tsx$/.test(f) && !/\.(test|spec)\.tsx$/.test(f))
      .filter((f) => /<WizardPage\b/.test(readFileSync(join(SRC, f), 'utf8')))
      .sort();
    expect(found).toEqual([...WIZARD_FILES].sort());
    // Each passes its questions and its buttons to the WizardPage (the kit orders them), never a Faq of its own.
    for (const f of WIZARD_FILES) {
      const src = readFileSync(join(SRC, f), 'utf8');
      expect(src, f).toMatch(/\bfaq=\{/);
      expect(src, f).toMatch(/\bfooter=\{/);
      expect(src, f).not.toMatch(/<Faq\b/);
    }
  });

  it('New realm: the FAQ follows Next', async () => {
    await renderPage(realmsPage, { path: '/realms/new' });
    const next = await screen.findByRole('button', { name: realmStrings.next }, WAIT);
    const faq = faqOf();
    expect(faq, 'New realm has questions').not.toBeNull();
    expect(after(faq as Element, next), 'the questions come after the buttons').toBe(true);
  });

  it('New script: the FAQ follows Continue', async () => {
    await renderPage(scriptsPage, { state: 'many', path: '/scripts/new/bbbbbbbbbb' });
    const next = await screen.findByRole('button', { name: scriptStrings['flow.continue'] }, WAIT);
    const faq = faqOf();
    expect(faq, 'New script has questions').not.toBeNull();
    expect(after(faq as Element, next), 'the questions come after the buttons').toBe(true);
  });
});
