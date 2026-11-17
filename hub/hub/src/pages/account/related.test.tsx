// Vitest: the Related section lists only the pages that are served; a page that is not served has no row at all.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RelatedSection } from './parts/RelatedSection';
import strings from './strings.en.json';

const served = vi.hoisted(() => ({ pages: new Set<string>() }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, useGo: () => () => undefined, usePageLink: (id: string) => (served.pages.has(id) ? { kind: 'hub', id } : null) };
});

describe('Related section', () => {
  it('shows a row for each served page and none for a page that is not served', () => {
    served.pages = new Set(['keys', 'notifications']);
    render(<RelatedSection />);
    // The row names the place; its action says Open (it does not repeat the row's label) and is named for its row.
    const named = (label: string) => strings['rel.openNamed'].replace('{{name}}', label);
    expect(screen.getByRole('button', { name: named(strings['rel.keys']) })).toHaveTextContent(strings['rel.open']);
    expect(screen.getByRole('button', { name: named(strings['rel.notifications']) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: named(strings['rel.billing']) })).toBeNull();
    expect(screen.queryByText(strings['rel.billingHelp'])).toBeNull();
  });

  it('shows Referrals after Billing when the Referrals page is served', () => {
    served.pages = new Set(['billing', 'referrals']);
    render(<RelatedSection />);
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual([strings['rel.billing'], strings['rel.referrals']].map((l) => strings['rel.openNamed'].replace('{{name}}', l)));
    expect(screen.getByText(strings['rel.referralsHelp'])).toBeInTheDocument();
  });

  it('shows nothing when no page is served', () => {
    served.pages = new Set();
    const { container } = render(<RelatedSection />);
    expect(container.textContent).toBe('');
  });
});
