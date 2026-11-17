// The `faq` prop of the six archetypes. The FAQ is the last region of the body, at
// the heading levels the archetype gives it (2/3 on a page root, 3/4 in a ListDetail list pane or inspector); the
// settings rail gets a "Questions" entry only when `faq` is given; a page without `faq` renders as before. These run
// against the real Faq; placement and levels are the archetype's, everything inside the section is Faq's.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ReactElement, useState } from 'react';
import { describe, expect, it } from 'vitest';
import kitStrings from '../strings.en.json';
import { DashboardPage, DetailPage, SettingsPage, TablePage, WizardPage } from './Layouts';
import { ListDetailPage } from './ListDetailPage';
import { DetailPaneContext } from './pane';
import type { FaqSpec } from './Faq';

const FAQ: FaqSpec = {
  items: [
    { id: 'hold', q: 'When can I use my credit?', a: 'After 60 days.' },
    { id: 'rate', q: 'How much do I earn?', a: 'Five percent.' },
  ],
};
const TITLE = kitStrings['faq.title'];

async function mount(el: () => ReactElement, path = '/') {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: [path] }) });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<RouterProvider router={router} />);
    await router.load();
  });
  return Object.assign(router, { container: view.container });
}

/** The FAQ section: the nearest section around its title. */
const faqTitle = (level: number) => screen.getByRole('heading', { level, name: TITLE });
const faqRoot = (level: number) => faqTitle(level).closest('section') as HTMLElement;
/** Whether `a` comes before `b` in the document. */
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const css = (file: string) => readFileSync(join(__dirname, file), 'utf8');

describe('the kit string', () => {
  it('names the section "Questions"', () => {
    expect(TITLE).toBe('Questions');
  });
});

describe('TablePage faq', () => {
  it('is the last region after the table, titled at level 2 with its questions at 3', async () => {
    await mount(() => (
      <TablePage header={{ title: 'Referrals' }} faq={FAQ}>
        <p>the table</p>
      </TablePage>
    ));
    const root = faqRoot(2);
    expect(within(root).getByRole('heading', { level: 3, name: 'When can I use my credit?' })).toBeInTheDocument();
    expect(within(root).getByRole('heading', { level: 3, name: 'How much do I earn?' })).toBeInTheDocument();
    expect(before(screen.getByText('the table'), root)).toBe(true);
    // The page's last child: nothing of the body follows it.
    expect(root.parentElement?.lastElementChild).toBe(root);
    expect(root.parentElement).toBe(screen.getByText('the table').closest('[class*="page"]'));
  });

  it('lets the page scroll as one document (the table grows instead of scrolling in a box the questions squeeze)', async () => {
    await mount(() => (
      <TablePage header={{ title: 'Referrals' }} faq={FAQ}>
        <p>the table</p>
      </TablePage>
    ));
    const page = faqRoot(2).parentElement as HTMLElement;
    expect(page.className).toMatch(/fillFaq/);
    const rules = css('Layouts.module.css');
    expect(rules).toMatch(/\.fillFaq \{\s*height: auto;/);
    expect(rules).toMatch(/\.fillFaq \.tableBody \{\s*flex: none;\s*min-height: auto;/);
  });
});

describe('DetailPage faq', () => {
  it('is the last region of the main column, before the facts rail, at levels 2 and 3', async () => {
    await mount(() => (
      <DetailPage header={{ title: 'web-prod-1' }} aside={<p>facts</p>} faq={FAQ}>
        <p>the body</p>
      </DetailPage>
    ));
    const root = faqRoot(2);
    expect(within(root).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    const main = screen.getByText('the body').parentElement as HTMLElement;
    expect(main.lastElementChild).toBe(root);
    expect(main.contains(screen.getByText('facts'))).toBe(false);
  });

  it('shows the same questions under every tab, once', async () => {
    await mount(() => (
      <DetailPage
        header={{ title: 'web-prod-1' }}
        tabs={[
          { id: 'one', label: 'One', content: <p>first body</p> },
          { id: 'two', label: 'Two', content: <p>second body</p> },
        ]}
        faq={FAQ}
      />
    ));
    expect(screen.getAllByRole('heading', { level: 2, name: TITLE })).toHaveLength(1);
    expect(before(screen.getByText('first body'), faqRoot(2))).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'Two' })));
    expect(screen.getAllByRole('heading', { level: 2, name: TITLE })).toHaveLength(1);
    expect(before(screen.getByText('second body'), faqRoot(2))).toBe(true);
    expect(document.querySelectorAll('[id="faq-hold"]').length).toBeLessThanOrEqual(1);
  });

  it('inside a ListDetail pane the levels are 3 and 4', async () => {
    const pane = { mode: 'fill' as const, listHidden: false, toggleList: () => undefined, close: () => undefined };
    await mount(() => (
      <DetailPaneContext.Provider value={pane}>
        <DetailPage header={{ title: 'web-prod-1' }} faq={FAQ}>
          <p>the body</p>
        </DetailPage>
      </DetailPaneContext.Provider>
    ));
    const root = faqRoot(3);
    expect(within(root).getAllByRole('heading', { level: 4 })).toHaveLength(2);
    expect(screen.queryByRole('heading', { level: 2, name: TITLE })).toBeNull();
  });
});

describe('SettingsPage faq', () => {
  const sections = [
    { id: 'profile', title: 'Profile', content: <p>p</p> },
    { id: 'password', title: 'Password', content: <p>pw</p> },
  ];

  it('closes the form part after the last section, ahead of the save bar and the summary', async () => {
    await mount(() => <SettingsPage header={{ title: 'Account' }} sections={sections} summary={<p>the summary</p>} footer={<button type="button">Save</button>} faq={FAQ} />);
    const root = faqRoot(2);
    expect(within(root).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    const last = screen.getByText('pw').closest('section') as HTMLElement;
    expect(before(last, root)).toBe(true);
    expect(before(root, screen.getByRole('button', { name: 'Save' }))).toBe(true);
    expect(before(root, screen.getByText('the summary'))).toBe(true);
    // The FAQ is a section of the page for the rail and the spy.
    expect((root.closest('[data-section]') as HTMLElement).dataset.section).toBe('faq');
  });

  it('puts the FAQ at the end of the wide part, ahead of its save bar', async () => {
    await mount(() => (
      <SettingsPage
        header={{ title: 'Account' }}
        sections={[...sections, { id: 'sessions', title: 'Sessions', wide: true, content: <p>the sessions</p> }]}
        summary={<p>the summary</p>}
        footer={<button type="button">Save</button>}
        faq={FAQ}
      />
    ));
    const root = faqRoot(2);
    const wide = screen.getByText('the sessions').closest('[data-hub-wide-part]') as HTMLElement;
    expect(wide.contains(root)).toBe(true);
    expect(before(screen.getByText('the sessions'), root)).toBe(true);
    expect(before(root, screen.getByRole('button', { name: 'Save' }))).toBe(true);
  });

  it('the rail gets "Questions" as its last entry, and only when faq is given', async () => {
    await mount(() => <SettingsPage header={{ title: 'Account' }} sections={sections} faq={FAQ} />);
    const nav = screen.getByRole('navigation', { name: kitStrings['settings.sections'] });
    const entries = within(nav).getAllByRole('button');
    expect(entries.map((b) => b.textContent)).toEqual(['Profile', 'Password', TITLE]);
    expect(entries[2]).toHaveAttribute('data-nav', 'faq');
  });

  it('has no "Questions" entry and no FAQ without faq', async () => {
    await mount(() => <SettingsPage header={{ title: 'Account' }} sections={sections} />);
    const nav = screen.getByRole('navigation', { name: kitStrings['settings.sections'] });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Profile', 'Password']);
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    expect(document.querySelector('[data-section="faq"]')).toBeNull();
  });

  it('a page of one section gets a rail once it has questions', async () => {
    await mount(() => <SettingsPage header={{ title: 'Account' }} sections={[sections[0]!]} faq={FAQ} />);
    const nav = screen.getByRole('navigation', { name: kitStrings['settings.sections'] });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Profile', TITLE]);
  });

  it('the Questions entry jumps like the others: writes ?section=faq (replace), marks it current and focuses the title', async () => {
    const router = await mount(() => <SettingsPage header={{ title: 'Account' }} sections={sections} faq={FAQ} />);
    const entry = screen.getByRole('button', { name: TITLE });
    await act(async () => fireEvent.click(entry));
    expect(router.state.location.search).toMatchObject({ section: 'faq' });
    expect(entry).toHaveAttribute('aria-current', 'true');
    expect(document.activeElement).toBe(faqTitle(2));
  });

  it('a deep link ?section=faq makes Questions the current entry', async () => {
    await mount(() => <SettingsPage header={{ title: 'Account' }} sections={sections} faq={FAQ} />, '/?section=faq');
    expect(screen.getByRole('button', { name: TITLE })).toHaveAttribute('aria-current', 'true');
  });

  it('j walks on from the last section into Questions', async () => {
    await mount(() => <SettingsPage header={{ title: 'Account' }} sections={sections} faq={FAQ} />, '/?section=password');
    const password = screen.getByRole('button', { name: 'Password' });
    password.focus();
    await act(async () => fireEvent.keyDown(password, { key: 'j' }));
    expect(screen.getByRole('button', { name: TITLE })).toHaveAttribute('aria-current', 'true');
  });
});

describe('DashboardPage faq', () => {
  it('is full width after the widgets', async () => {
    await mount(() => (
      <DashboardPage header={{ title: 'Home' }} faq={FAQ}>
        <section>widget one</section>
        <section>widget two</section>
      </DashboardPage>
    ));
    const root = faqRoot(2);
    expect(within(root).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(before(screen.getByText('widget two'), root)).toBe(true);
    // Not inside the widget grid: it spans the page.
    expect(root.contains(screen.getByText('widget one'))).toBe(false);
    expect(root.parentElement?.lastElementChild).toBe(root);
    expect(root.parentElement).toBe((screen.getByText('widget one').closest('[data-flow]') as HTMLElement).parentElement);
  });
});

describe('WizardPage faq', () => {
  const steps = [
    { id: 'a', label: 'One' },
    { id: 'b', label: 'Two' },
  ];

  // Under the whole wizard, full block width (after the steps grid: stepper, body and summary), so the two-column FAQ has
  // the width; and the page's last block, after the footer's buttons, as on every other page.
  it('sits under the whole wizard: after the step body and the summary, outside the steps grid, after the footer', async () => {
    await mount(() => (
      <WizardPage header={{ title: 'New script' }} steps={steps} current={0} summary={<p>the summary</p>} footer={<button type="button">Next</button>} faq={FAQ}>
        <input aria-label="Name" />
      </WizardPage>
    ));
    const root = faqRoot(2);
    expect(within(root).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(before(screen.getByRole('textbox', { name: 'Name' }), root)).toBe(true);
    expect(before(screen.getByText('the summary'), root)).toBe(true);
    expect(before(screen.getByRole('button', { name: 'Next' }), root)).toBe(true);
    const grid = screen.getByRole('list', { name: kitStrings['wizard.steps'] }).parentElement as HTMLElement;
    expect(grid.contains(screen.getByText('the summary'))).toBe(true);
    expect(grid.contains(root)).toBe(false);
  });

  it('a step change never moves focus into the FAQ (a step with no field or heading falls back to the page title)', async () => {
    let setStep: (n: number) => void = () => undefined;
    const Page = () => {
      const [current, set] = useState(0);
      setStep = set;
      return (
        <WizardPage header={{ title: 'New script' }} steps={steps} current={current} faq={FAQ}>
          <p>step text</p>
        </WizardPage>
      );
    };
    await mount(() => <Page />);
    await act(async () => setStep(1));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'New script' }));
    expect(faqRoot(2).contains(document.activeElement)).toBe(false);
  });
});

describe('ListDetailPage faq', () => {
  const page = (detail: ReactElement | null, mode: 'fill' | 'side' = 'fill') => (
    <ListDetailPage mode={mode} header={{ title: 'Bots' }} list={<p>the list</p>} faq={FAQ} detail={detail} />
  );

  it('ends the list pane with no selection, at levels 3 and 4', async () => {
    await mount(() => page(null));
    const root = faqRoot(3);
    expect(within(root).getAllByRole('heading', { level: 4 })).toHaveLength(2);
    const list = screen.getByText('the list').closest('section') as HTMLElement;
    expect(list.contains(root)).toBe(true);
    expect(before(screen.getByText('the list'), root)).toBe(true);
    expect(screen.queryByRole('heading', { level: 2, name: TITLE })).toBeNull();
  });

  it('beside a detail in fill mode the rail holds no questions until the address targets one; side mode keeps them with the list', async () => {
    await mount(() => page(<p>the detail</p>), '/?sel=atlas');
    expect(screen.queryByRole('heading', { level: 3, name: TITLE })).toBeNull();
    cleanup();

    await mount(() => page(<p>the detail</p>), '/?sel=atlas#faq-rate');
    const rail = screen.getByText('the list').closest('section') as HTMLElement;
    expect(rail.contains(faqRoot(3))).toBe(true);
    expect(screen.getByText('the detail').closest('section')?.contains(faqRoot(3))).toBe(false);
    cleanup();

    await mount(() => page(<p>the detail</p>, 'side'), '/?sel=atlas');
    const list = screen.getByText('the list').closest('section') as HTMLElement;
    expect(list.contains(faqRoot(3))).toBe(true);
    cleanup();
    // `.list` is what the CSS hides (a selection at narrow width, `?list=0`); the FAQ is inside it.
    expect(css('ListDetailPage.module.css')).toMatch(/\.fill\.listHidden \.list \{\s*display: none;/);
  });

  it('is gone with no faq (nothing added to the list pane)', async () => {
    await mount(() => <ListDetailPage header={{ title: 'Bots' }} list={<p>the list</p>} detail={null} />);
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    const body = screen.getByText('the list').parentElement as HTMLElement;
    expect(body.children).toHaveLength(1);
  });
});

describe('no faq, no change', () => {
  const steps = [{ id: 'a', label: 'One' }];
  const pages: Record<string, () => ReactElement> = {
    table: () => (
      <TablePage header={{ title: 'T' }}>
        <p>x</p>
      </TablePage>
    ),
    detail: () => <DetailPage header={{ title: 'D' }} tabs={[{ id: 'one', label: 'One', content: <p>x</p> }]} />,
    settings: () => (
      <SettingsPage
        header={{ title: 'S' }}
        sections={[
          { id: 'a', title: 'A', content: <p>x</p> },
          { id: 'b', title: 'B', content: <p>y</p> },
        ]}
      />
    ),
    dashboard: () => (
      <DashboardPage header={{ title: 'B' }}>
        <p>x</p>
      </DashboardPage>
    ),
    wizard: () => (
      <WizardPage header={{ title: 'W' }} steps={steps} current={0}>
        <p>x</p>
      </WizardPage>
    ),
    listDetail: () => <ListDetailPage header={{ title: 'L' }} list={<p>x</p>} detail={null} />,
  };

  for (const [name, page] of Object.entries(pages)) {
    it(`${name}: no FAQ markup, class, id or rail entry without the prop`, async () => {
      const { container } = await mount(page);
      expect(container.innerHTML).not.toMatch(/faq/i);
      expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    });
  }

  it('`faq={undefined}` is the same DOM as leaving the prop out', async () => {
    const html = async (el: () => ReactElement) => {
      const { container } = await mount(el);
      const out = container.innerHTML;
      cleanup();
      return out;
    };
    const bare = await html(pages.table!);
    const undef = await html(() => (
      <TablePage header={{ title: 'T' }} faq={undefined}>
        <p>x</p>
      </TablePage>
    ));
    expect(undef).toBe(bare);
  });
});
