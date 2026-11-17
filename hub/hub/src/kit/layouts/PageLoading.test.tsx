// The loading page keeps its header: the title is the page's h1, the subtitle and the tab strip stay when given, and
// the loading lines stand in the content's place.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageLoading } from './Layouts';

afterEach(cleanup);

describe('PageLoading: the header stays while the page loads', () => {
  it('draws the title as the h1 the route focus lands on, above the loading lines', () => {
    const { container } = render(<PageLoading title="Files" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Files' });
    expect(h1.hasAttribute('data-hub-title')).toBe(true);
    const lines = container.querySelector('[data-page-loading]')!;
    expect(lines).not.toBeNull();
    expect(h1.compareDocumentPosition(lines) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('header [data-page-loading]')).toBeNull();
  });

  it('keeps a subtitle and a tab strip that are known before the page is', () => {
    const { container } = render(<PageLoading title="Files" subtitle="The folders on your computers." tabs={<div data-testid="strip" />} />);
    expect(screen.getByText('The folders on your computers.')).toBeTruthy();
    const strip = screen.getByTestId('strip');
    const header = container.querySelector('header')!;
    const lines = container.querySelector('[data-page-loading]')!;
    expect(header.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(lines) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws no subtitle and no strip when none is given', () => {
    const { container } = render(<PageLoading title="Logs" />);
    expect(container.querySelector('header p')).toBeNull();
    expect(container.querySelectorAll('h1').length).toBe(1);
  });
});
