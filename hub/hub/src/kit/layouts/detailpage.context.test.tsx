// Vitest + tsc: DetailPage refuses PageHeader's
// `context` line at the type level. Its pane branch draws a DetailHeader, which has no context row, so a context
// passed here would show on the full page and silently vanish in a ListDetail pane. tsc checks the expect-error below:
// if DetailPage ever accepts `context` again, the directive is unused and the type check fails.
import { describe, expect, it } from 'vitest';
import type { DetailPageProps } from './Layouts';
import type { PageHeaderProps } from './PageHeader';

type Header = DetailPageProps['header'];

describe('DetailPage header: no context line', () => {
  it('types: a context line is refused; the rest of PageHeader is accepted', () => {
    const ok: Header = { title: 'Billing', subtitle: 'Plans and invoices', meta: 'Active' };
    // @ts-expect-error DetailPage's pane header has no context row, so DetailPage takes no `context`
    const bad: Header = { title: 'Billing', context: 'Realm: home' };
    const full: PageHeaderProps = { title: 'Billing', context: 'Realm: home' };
    // A PageHeader's props with a context line do not pass as DetailPage's header either.
    // @ts-expect-error a PageHeaderProps value may carry `context`
    const passed: Header = full;
    expect([ok, bad, passed].length).toBe(3);
  });
});
