// WizardPage variant="flow" with questions (New realm, New script): the Faq is the flow main column's last block, after
// the footer's buttons, as on every other page, and the gap between whole Sections sits above it, so the QUESTIONS bar
// never touches the footer's line. The rule's selector is checked against the drawn DOM (the Faq is the footer's next
// sibling in .flowMain).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WizardFooter, WizardPage } from './Layouts';
import s from './Layouts.module.css';

const css = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

describe('wizard flow: questions gap', () => {
  it('the questions follow the footer in the flow main column, last', async () => {
    const el = () => (
      <WizardPage
        variant="flow"
        header={{ title: 'New realm' }}
        steps={[{ id: 'a', label: 'Name' }]}
        current={0}
        faq={{ items: [{ id: 'what', q: 'What is a realm?', a: 'A space.' }] }}
        footer={<WizardFooter primary={<button type="button">Create</button>} />}
      >
        <p>body</p>
      </WizardPage>
    );
    const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    const foot = document.querySelector(`.${s.flowMain} > .${s.flowFooter}`);
    expect(foot).not.toBeNull();
    expect(foot!.nextElementSibling?.classList.contains(s.faq!)).toBe(true);
    expect(foot!.parentElement!.lastElementChild).toBe(foot!.nextElementSibling);
  });

  it('CSS: the gap between whole Sections above them', () => {
    expect(rule('.flowMain > .faq')).toMatch(/margin-block-start: var\(--gap-between-sections\);/);
  });

  // New realm draws no footer while it creates (footer={started ? undefined : …}): the questions then follow the step,
  // and the gap rule must still reach them. The rule's selector is read from the stylesheet and matched on the drawn
  // element, so a selector that needs the footer before the questions fails here.
  it('a step with no footer keeps the gap: the gap rule matches the questions without a footer before them', async () => {
    const el = () => (
      <WizardPage variant="flow" header={{ title: 'New realm' }} steps={[{ id: 'a', label: 'Name' }]} current={0} faq={{ items: [{ id: 'what', q: 'What is a realm?', a: 'A space.' }] }}>
        <p>body</p>
      </WizardPage>
    );
    const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    const faq = document.querySelector(`.${s.flowMain} > .${s.faq}`);
    expect(faq).not.toBeNull();
    expect(document.querySelector(`.${s.flowMain} > .${s.flowFooter}`)).toBeNull();
    expect(faq!.parentElement!.lastElementChild).toBe(faq);
    const gapRules = [...css.matchAll(/\n(\.flowMain[^{}]*\.faq) \{[^}]*margin-block-start: var\(--gap-between-sections\);/g)].map((m) => m[1]!);
    expect(gapRules.length).toBeGreaterThan(0);
    const drawn = (sel: string) => sel.replace(/\.([A-Za-z][\w-]*)/g, (_, name: string) => `.${(s as Record<string, string>)[name] ?? name}`);
    expect(gapRules.some((sel) => faq!.matches(drawn(sel))), `no gap rule reaches the questions without a footer: ${gapRules.join(' | ')}`).toBe(true);
  });
});
